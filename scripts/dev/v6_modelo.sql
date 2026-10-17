-- =====================================================================
-- Sedentos · v6 · Acessos (secretários da chamada) + faixas etárias
-- Complementa as migrações anteriores. Não recria nada.
--
-- REGRA DE OURO: o secretário só faz a chamada. Ele não ganha nenhuma policy em
-- jovens, presencas, notificacoes, anotacoes, historico ou config. A única porta
-- de dados dele é a RPC lista_chamada (7 colunas) e a lista de cultos.
-- =====================================================================

-- ---------- Tabelas -------------------------------------------------------
-- Secretário entra com USUÁRIO e SENHA. A conta de login (auth.users) é criada pela
-- Edge Function "gerenciar-secretarios", que usa a chave de serviço no servidor.
-- O e-mail de login é técnico: "<usuario>@<domínio dos secretários>".
create table public.secretarios (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users (id) on delete cascade,
  usuario           text not null unique check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  email             text not null unique check (email = lower(email)),
  nome              text not null check (char_length(btrim(nome)) between 2 and 80),
  ativo             boolean not null default true,
  criado_por        text,
  criado_em         timestamptz not null default now(),
  ultimo_acesso_em  timestamptz
);

create table public.acessos_log (
  id         bigserial primary key,
  feito_por  text not null,
  acao       text not null,      -- secretario_criado | secretario_desativado | secretario_reativado | secretario_renomeado
                                 -- secretario_senha | secretario_removido | admin_adicionado | admin_removido
  alvo       text not null,      -- usuário do secretário ou e-mail do admin
  detalhes   jsonb,
  criado_em  timestamptz not null default now()
);
create index acessos_log_data_idx on public.acessos_log (criado_em desc);

alter table public.secretarios enable row level security;
alter table public.acessos_log enable row level security;
-- Só admin lê. Ninguém grava direto pela API: só pelas funções abaixo.
create policy "secretarios: admin ver" on public.secretarios for select to authenticated using (public.eh_admin());
create policy "acessos_log: admin ver" on public.acessos_log for select to authenticated using (public.eh_admin());
revoke all on public.secretarios, public.acessos_log from anon;
revoke insert, update, delete on public.secretarios, public.acessos_log from authenticated;

-- ---------- Quem é quem ---------------------------------------------------
create or replace function public.eh_secretario()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.secretarios s where s.user_id = auth.uid() and s.ativo);
$$;

create or replace function public.pode_fazer_chamada()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin() or public.eh_secretario();
$$;

-- O que o front usa para decidir para onde a pessoa vai depois do login.
create or replace function public.meus_acessos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sec public.secretarios;
  v_jov public.jovens;
begin
  if auth.uid() is null then return null; end if;
  select * into v_sec from public.secretarios where user_id = auth.uid();
  if v_sec.id is not null and v_sec.ativo then
    update public.secretarios set ultimo_acesso_em = now() where id = v_sec.id;
  end if;
  select * into v_jov from public.jovens where user_id = auth.uid();
  return jsonb_build_object(
    'admin', public.eh_admin(),
    'secretario', coalesce(v_sec.ativo, false),
    'secretario_inativo', v_sec.id is not null and not v_sec.ativo,
    'nome_secretario', case when v_sec.ativo then v_sec.nome end,
    'discipulador', coalesce(v_jov.papel = 'discipulador', false),
    'lideranca', coalesce(v_jov.papel = 'lideranca', false),
    'jovem', v_jov.id is not null);
end;
$$;

-- Conta de secretário não vira cadastro de jovem (nem por autocadastro, nem vinculando).
create or replace function public.jovens_secretario_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.eh_secretario() and not public.eh_admin() and session_user::text = 'authenticator' then
    raise exception 'Contas de secretário não têm cadastro de jovem.';
  end if;
  return new;
end;
$$;
create trigger jovens_secretario_before before insert or update on public.jovens
  for each row execute function public.jovens_secretario_before();

-- @@BUSCAR@@

-- ---------- Chamada: contagens para o secretário -------------------------
-- O resumo completo (avisos, contatos, discipuladores avisados) fica só para admin.
create or replace function public.resumo_culto_secretario(p_culto uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_fazer_chamada() then raise exception 'Apenas administradores e secretários da chamada.'; end if;
  return (select jsonb_build_object(
      'presentes', count(*) filter (where p.estado = 'presente'),
      'faltas', count(*) filter (where p.estado = 'falta'),
      'justificadas', count(*) filter (where p.estado = 'justificada'))
    from public.presencas p where p.culto_id = p_culto);
end;
$$;

create or replace function public.resumo_culto(p_culto uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() and session_user::text = 'authenticator' then
    raise exception 'Apenas administradores.';
  end if;
  return (select jsonb_build_object(
    'presentes', count(*) filter (where p.estado = 'presente'),
    'faltas', count(*) filter (where p.estado = 'falta'),
    'justificadas', count(*) filter (where p.estado = 'justificada'),
    'avisos', (select count(*) from public.notificacoes n where n.culto_id = p_culto and n.cancelada_em is null and not n.para_admins),
    'contatos_feitos', (select count(*) from public.notificacoes n where n.culto_id = p_culto and n.cancelada_em is null
                          and not n.para_admins and n.contato_feito_em is not null),
    'discipuladores_avisados', (select count(distinct destinatario_id) from public.notificacoes n
                                 where n.culto_id = p_culto and n.cancelada_em is null and n.tipo = 'falta'))
  from public.presencas p where p.culto_id = p_culto);
end;
$$;

-- Lista de cultos com as contagens (sem tocar em presencas pela API).
create or replace function public.lista_cultos_chamada()
returns table (id uuid, data date, titulo text, status public.status_culto, extra boolean, observacao text,
               presentes int, faltas int, justificadas int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.pode_fazer_chamada() then raise exception 'Apenas administradores e secretários da chamada.'; end if;
  return query
    select c.id, c.data, c.titulo, c.status, c.extra, c.observacao,
           (count(p.*) filter (where p.estado = 'presente'))::int,
           (count(p.*) filter (where p.estado = 'falta'))::int,
           (count(p.*) filter (where p.estado = 'justificada'))::int
      from public.cultos c
      left join public.presencas p on p.culto_id = c.id
     group by c.id
     order by c.data;
end;
$$;

-- A ÚNICA porta de dados de jovens para o secretário: exatamente 7 colunas.
-- Inclui os ativos e quem já tem presença registrada neste culto.
-- O motivo de uma justificada só aparece para admin ou para quem registrou.
create or replace function public.lista_chamada(p_culto uuid)
returns table (jovem_id uuid, nome text, apelido text, foto_url text,
               estado public.estado_presenca, motivo text, marcado_por_mim boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_eu    text := public.quem();
  v_admin boolean := public.eh_admin();
begin
  if not public.pode_fazer_chamada() then raise exception 'Apenas administradores e secretários da chamada.'; end if;
  if not exists (select 1 from public.cultos c where c.id = p_culto) then raise exception 'Culto não encontrado.'; end if;
  return query
    select j.id, j.nome, j.apelido, j.foto_url, p.estado,
           case when v_admin or p.marcado_por = v_eu then p.motivo end,
           coalesce(p.marcado_por = v_eu, false)
      from public.jovens j
      left join public.presencas p on p.culto_id = p_culto and p.jovem_id = j.id
     where j.ativo or p.jovem_id is not null
     order by lower(coalesce(j.apelido, j.nome)), j.nome;
end;
$$;

-- Versão do admin: a mesma lista + rede e inativos (para o filtro por discipulador).
create or replace function public.lista_chamada_admin(p_culto uuid)
returns table (jovem_id uuid, nome text, apelido text, foto_url text,
               estado public.estado_presenca, motivo text, marcado_por_mim boolean,
               ativo boolean, papel public.papel_rede, discipulado_por uuid, discipulador_nome text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_eu text := public.quem();
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  if not exists (select 1 from public.cultos c where c.id = p_culto) then raise exception 'Culto não encontrado.'; end if;
  return query
    select j.id, j.nome, j.apelido, j.foto_url, p.estado, p.motivo, coalesce(p.marcado_por = v_eu, false),
           j.ativo, j.papel, j.discipulado_por, d.nome
      from public.jovens j
      left join public.presencas p on p.culto_id = p_culto and p.jovem_id = j.id
      left join public.jovens d on d.id = j.discipulado_por
     order by lower(coalesce(j.apelido, j.nome)), j.nome;
end;
$$;

-- ---------- Funções da chamada: admin OU secretário ----------------------
-- (cópias das versões atuais com a checagem trocada; criar_culto_extra continua só admin)
-- @@FUNCOES_CHAMADA@@

-- "Cuidado da rede" passa a dar erro para quem não é admin nem liderança.
create or replace function public.cuidado_da_rede(p_dias int default 90)
returns table (discipulador_id uuid, nome text, avisos int, respondidos int, pendentes_3_dias int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (public.eh_admin() or public.eh_lideranca()) then raise exception 'Apenas administradores e liderança.'; end if;
  return query
  select d.id, d.nome,
         count(n.id)::int,
         count(n.id) filter (where n.contato_feito_em is not null)::int,
         count(n.id) filter (where n.contato_feito_em is null and n.criado_em < now() - interval '3 days')::int
    from public.jovens d
    left join public.notificacoes n
      on n.destinatario_id = d.id and n.tipo = 'falta' and n.cancelada_em is null
     and n.criado_em > now() - make_interval(days => p_dias)
   where d.papel = 'discipulador'
     and (public.eh_admin() or (public.eh_lideranca() and d.discipulado_por = public.meu_jovem_id()))
   group by d.id, d.nome
   order by d.nome;
end;
$$;

-- ---------- RLS: cultos e fotos -------------------------------------------
drop policy "cultos: ver" on public.cultos;
create policy "cultos: ver" on public.cultos for select to authenticated
  using (public.eh_admin() or public.eh_discipulador() or public.eh_lideranca() or public.eh_secretario());
-- presencas: NADA novo. O secretário lê só por lista_chamada.

create or replace function public.foto_da_chamada(p_caminho text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_secretario()
     and exists (select 1 from public.jovens j where j.foto_url = p_caminho and j.ativo);
$$;
create policy "fotos: secretario ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.foto_da_chamada(name));

-- ---------- Gestão de secretários (só admin) ------------------------------
create or replace function public.registrar_acesso(p_acao text, p_alvo text, p_detalhes jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.acessos_log (feito_por, acao, alvo, detalhes) values (public.quem(), p_acao, p_alvo, p_detalhes);
$$;

-- Chamada pela Edge Function logo depois de criar a conta de login (com o JWT do admin).
create or replace function public.secretario_registrar(p_user_id uuid, p_usuario text, p_nome text)
returns public.secretarios language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  r public.secretarios;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  p_usuario := lower(btrim(p_usuario));
  select lower(email) into v_email from auth.users where id = p_user_id;
  if v_email is null or split_part(v_email, '@', 1) <> p_usuario then
    raise exception 'Conta de login não confere com o usuário.';
  end if;
  if exists (select 1 from public.jovens where user_id = p_user_id) or exists (select 1 from public.admins where email = v_email) then
    raise exception 'Esta conta já é usada por um jovem ou admin.';
  end if;
  insert into public.secretarios (user_id, usuario, email, nome, criado_por)
  values (p_user_id, p_usuario, v_email, regexp_replace(btrim(p_nome), '\s+', ' ', 'g'), public.quem())
  returning * into r;
  perform public.registrar_acesso('secretario_criado', r.usuario, jsonb_build_object('nome', r.nome));
  return r;
end;
$$;

create or replace function public.secretario_atualizar(p_id uuid, p_nome text default null, p_ativo boolean default null)
returns public.secretarios language plpgsql security definer set search_path = public as $$
declare
  a public.secretarios;
  r public.secretarios;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  select * into a from public.secretarios where id = p_id;
  if a.id is null then raise exception 'Secretário não encontrado.'; end if;
  update public.secretarios
     set nome = coalesce(regexp_replace(btrim(p_nome), '\s+', ' ', 'g'), nome),
         ativo = coalesce(p_ativo, ativo)
   where id = p_id returning * into r;
  if r.ativo is distinct from a.ativo then
    perform public.registrar_acesso(case when r.ativo then 'secretario_reativado' else 'secretario_desativado' end, r.usuario);
  end if;
  if r.nome is distinct from a.nome then
    perform public.registrar_acesso('secretario_renomeado', r.usuario, jsonb_build_object('de', a.nome, 'para', r.nome));
  end if;
  return r;
end;
$$;

-- Remove o cadastro do secretário e devolve o user_id para a Edge Function apagar o login.
create or replace function public.secretario_remover(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.secretarios;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  delete from public.secretarios where id = p_id returning * into a;
  if a.id is null then raise exception 'Secretário não encontrado.'; end if;
  perform public.registrar_acesso('secretario_removido', a.usuario, jsonb_build_object('nome', a.nome));
  return a.user_id;
end;
$$;

-- Usado pela Edge Function antes de trocar a senha (confere admin e registra).
create or replace function public.secretario_senha_trocada(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.secretarios;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  select * into a from public.secretarios where id = p_id;
  if a.id is null then raise exception 'Secretário não encontrado.'; end if;
  perform public.registrar_acesso('secretario_senha', a.usuario);
  return a.user_id;
end;
$$;

-- ---------- Administradores pela tela -------------------------------------
create or replace function public.admins_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.email := lower(btrim(new.email));
    if new.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'E-mail inválido.'; end if;
    if exists (select 1 from public.secretarios where email = new.email) then
      raise exception 'Este e-mail é de uma conta de secretário.';
    end if;
    return new;
  end if;
  if (select count(*) from public.admins) <= 1 then
    raise exception 'Não é possível remover o último administrador.';
  end if;
  if session_user::text = 'authenticator' and old.email = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Você não pode remover a si mesmo.';
  end if;
  return old;
end;
$$;
create trigger admins_guarda before insert or delete on public.admins
  for each row execute function public.admins_guarda();

create or replace function public.admins_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform public.registrar_acesso('admin_adicionado', new.email);
  else perform public.registrar_acesso('admin_removido', old.email); end if;
  return null;
end;
$$;
create trigger admins_log after insert or delete on public.admins
  for each row execute function public.admins_log();

create or replace function public.lista_admins()
returns table (email text, criado_em timestamptz, ultimo_acesso_em timestamptz, sou_eu boolean)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  return query
    select a.email, a.criado_em, u.last_sign_in_at, a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      from public.admins a left join auth.users u on lower(u.email) = a.email
     order by a.email;
end;
$$;

-- Aba "Rede" (somente leitura): quem entra por ser Liderança ou Discipulador.
create or replace function public.acessos_rede()
returns table (jovem_id uuid, nome text, apelido text, foto_url text, papel public.papel_rede, cargo_lideranca text,
               email text, vinculado boolean, ultimo_acesso_em timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  return query
    select j.id, j.nome, j.apelido, j.foto_url, j.papel, j.cargo_lideranca, j.email, j.user_id is not null, u.last_sign_in_at
      from public.jovens j left join auth.users u on u.id = j.user_id
     where j.papel in ('discipulador', 'lideranca')
     order by j.papel desc, j.nome;
end;
$$;

-- ---------- Faixas etárias (um lugar só; o front espelha em src/lib/formato.js) --
create or replace function public.faixa_etaria(p_idade int)
returns text language sql immutable as $$
  select case
    when p_idade is null or p_idade < 0 then 'Sem data válida'
    when p_idade < 12 then 'Abaixo de 12'
    when p_idade <= 14 then '12 a 14'
    when p_idade <= 17 then '15 a 17'
    when p_idade <= 19 then '18 e 19'
    when p_idade <= 21 then '20 e 21'
    when p_idade <= 23 then '22 e 23'
    when p_idade <= 25 then '24 e 25'
    when p_idade <= 27 then '26 e 27'
    when p_idade <= 29 then '28 e 29'
    else '30+' end;
$$;
-- Para um cadastro: data vazia, no futuro ou com menos de 5 anos conta como "Sem data válida".
create or replace function public.faixa_etaria_de(p_nascimento date)
returns text language sql stable as $$
  select case when p_nascimento is null or p_nascimento > current_date or public.idade(p_nascimento) < 5
              then 'Sem data válida' else public.faixa_etaria(public.idade(p_nascimento)) end;
$$;

-- ---------- Permissões das funções ----------------------------------------
revoke execute on function public.eh_secretario(), public.pode_fazer_chamada(), public.meus_acessos(),
  public.resumo_culto_secretario(uuid), public.resumo_culto(uuid), public.lista_cultos_chamada(),
  public.lista_chamada(uuid), public.lista_chamada_admin(uuid), public.foto_da_chamada(text),
  public.secretario_registrar(uuid, text, text), public.secretario_atualizar(uuid, text, boolean),
  public.secretario_remover(uuid), public.secretario_senha_trocada(uuid), public.lista_admins(),
  public.acessos_rede(), public.cuidado_da_rede(int) from public, anon;
revoke execute on function public.registrar_acesso(text, text, jsonb), public.jovens_secretario_before(),
  public.admins_guarda(), public.admins_log() from public, anon, authenticated;
grant execute on function public.eh_secretario(), public.pode_fazer_chamada(), public.meus_acessos(),
  public.resumo_culto_secretario(uuid), public.resumo_culto(uuid), public.lista_cultos_chamada(),
  public.lista_chamada(uuid), public.lista_chamada_admin(uuid), public.foto_da_chamada(text),
  public.secretario_registrar(uuid, text, text), public.secretario_atualizar(uuid, text, boolean),
  public.secretario_remover(uuid), public.secretario_senha_trocada(uuid), public.lista_admins(),
  public.acessos_rede(), public.cuidado_da_rede(int), public.faixa_etaria(int), public.faixa_etaria_de(date)
  to authenticated;
