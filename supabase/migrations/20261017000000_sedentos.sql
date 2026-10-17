-- =====================================================================
-- Sedentos · Sistema de cadastro de jovens
-- Migração inicial: tabelas, regras de inconsistência, segurança (RLS),
-- vinculação de cadastros antigos, mesclagem de duplicados e fotos.
-- Rode no SQL Editor do Supabase (ou `supabase db push`).
-- =====================================================================

-- ---------- Tipos ----------------------------------------------------
create type public.status_jovem as enum ('pendente_validacao', 'validado', 'inconsistente');
create type public.origem_jovem as enum ('importacao_planilha', 'autocadastro');

-- ---------- Tabelas --------------------------------------------------
create table public.admins (
  email      text primary key check (email = lower(email)),
  criado_em  timestamptz not null default now()
);

create table public.jovens (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid unique references auth.users (id) on delete set null,
  nome                  text not null,
  email                 text unique,
  telefone              text,                -- só dígitos
  data_nascimento       date,
  foto_url              text,                -- caminho no bucket privado "fotos"
  foto_origem           text,                -- referência antiga (link do Drive ou nome de arquivo)
  status                public.status_jovem not null default 'pendente_validacao',
  inconsistencias       text[] not null default '{}',
  origem                public.origem_jovem not null default 'autocadastro',
  observacoes_admin     text,
  responsavel_nome      text,
  responsavel_telefone  text,
  consentimento_em      timestamptz,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  validado_em           timestamptz,
  validado_por          text
);
create index jovens_telefone_idx on public.jovens (telefone);
create index jovens_nome_idx on public.jovens (lower(nome));
create index jovens_inconsistencias_idx on public.jovens using gin (inconsistencias);

create table public.jovens_historico (
  id            bigint generated always as identity primary key,
  jovem_id      uuid not null references public.jovens (id) on delete cascade,
  alterado_em   timestamptz not null default now(),
  alterado_por  text,
  acao          text not null,     -- importacao | cadastro | edicao | vinculacao | mesclagem
  campos        jsonb              -- {"campo": {"de": ..., "para": ...}}
);
create index jovens_historico_jovem_idx on public.jovens_historico (jovem_id, alterado_em desc);

create table public.duplicados_ignorados (
  a           uuid not null references public.jovens (id) on delete cascade,
  b           uuid not null references public.jovens (id) on delete cascade,
  criado_por  text,
  criado_em   timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

-- ---------- Funções auxiliares ---------------------------------------
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.so_digitos(t text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '');
$$;

create or replace function public.normaliza_nome(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'));
$$;

create or replace function public.idade(d date)
returns int language sql stable as $$
  select extract(year from age(current_date, d))::int;
$$;

create or replace function public.quem()
returns text language sql stable as $$
  select coalesce(
    lower(nullif(auth.jwt() ->> 'email', '')),
    case when auth.jwt() ->> 'role' = 'service_role' then 'sistema (importação)' else 'sistema' end
  );
$$;

-- Quem pode gravar sem as travas do autocadastro:
-- admins, a chave de serviço (importação), o SQL Editor e as rotinas internas.
create or replace function public.privilegiado()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(current_setting('app.sistema', true), '') = 'on'
      or public.eh_admin()
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or session_user::text <> 'authenticator';
$$;

-- ---------- Regras de inconsistência (seção 6 do briefing) -----------
create or replace function public.calcular_inconsistencias(j public.jovens)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  c text[] := '{}';
begin
  if j.email is null then c := array_append(c, 'EMAIL_AUSENTE'); end if;

  if j.foto_url is null then
    if nullif(btrim(coalesce(j.foto_origem, '')), '') is null then
      c := array_append(c, 'FOTO_AUSENTE');
    elsif j.foto_origem ~* '^https?://' then
      c := array_append(c, 'FOTO_LINK_EXTERNO');
    else
      c := array_append(c, 'FOTO_ARQUIVO_NAO_ENVIADO');
    end if;
  end if;

  if j.telefone is null then
    c := array_append(c, 'TELEFONE_AUSENTE');
  else
    if exists (select 1 from public.jovens o where o.telefone = j.telefone and o.id <> j.id) then
      c := array_append(c, 'TELEFONE_DUPLICADO');
    end if;
    if j.telefone !~ '^[1-9]{2}9[0-9]{8}$' then
      c := array_append(c, 'TELEFONE_FORMATO_INVALIDO');
    end if;
  end if;

  if array_length(regexp_split_to_array(j.nome, ' '), 1) < 2 then
    c := array_append(c, 'NOME_INCOMPLETO');
  end if;
  if j.nome = lower(j.nome) and j.nome <> upper(j.nome) then
    c := array_append(c, 'NOME_CAIXA_BAIXA');
  end if;
  if exists (select 1 from public.jovens o where lower(o.nome) = lower(j.nome) and o.id <> j.id) then
    c := array_append(c, 'POSSIVEL_DUPLICADO');
  end if;

  if j.data_nascimento is null
     or j.data_nascimento > current_date
     or public.idade(j.data_nascimento) < 5 then
    c := array_append(c, 'NASCIMENTO_INVALIDO');
  end if;

  return c;
end;
$$;

-- ---------- Gatilho BEFORE: normaliza, protege, valida, calcula -------
create or replace function public.jovens_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_priv  boolean := public.privilegiado();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_idade int;
begin
  -- Normalização (vale para todos). Nomes: só espaços; maiúsculas não são mexidas.
  new.nome := public.normaliza_nome(new.nome);
  new.telefone := public.so_digitos(new.telefone);
  new.responsavel_telefone := public.so_digitos(new.responsavel_telefone);
  new.responsavel_nome := nullif(public.normaliza_nome(new.responsavel_nome), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.foto_origem := nullif(btrim(coalesce(new.foto_origem, '')), '');
  new.atualizado_em := now();

  if not v_priv then
    -- Jovem só mexe nos próprios dados pessoais.
    if tg_op = 'INSERT' then
      if auth.uid() is null or new.user_id is distinct from auth.uid() or v_email is null then
        raise exception 'Faça login novamente para concluir o cadastro.';
      end if;
      new.email := v_email;
      new.origem := 'autocadastro';
      new.status := 'pendente_validacao';
      new.observacoes_admin := null;
      new.foto_origem := null;
      new.validado_em := null;
      new.validado_por := null;
      new.criado_em := now();
    else
      new.id := old.id;
      new.user_id := old.user_id;
      new.email := old.email;
      new.origem := old.origem;
      new.status := old.status;
      new.observacoes_admin := old.observacoes_admin;
      new.foto_origem := old.foto_origem;
      new.validado_em := old.validado_em;
      new.validado_por := old.validado_por;
      new.criado_em := old.criado_em;
      -- Cadastro validado que muda dados volta para revisão.
      if old.status = 'validado' and (
           new.nome is distinct from old.nome or new.telefone is distinct from old.telefone
        or new.data_nascimento is distinct from old.data_nascimento or new.foto_url is distinct from old.foto_url) then
        new.status := 'pendente_validacao';
      end if;
    end if;

    -- A foto precisa estar na pasta do próprio jovem.
    if new.foto_url is not null
       and (tg_op = 'INSERT' or new.foto_url is distinct from old.foto_url)
       and new.foto_url not like auth.uid()::text || '/%' then
      raise exception 'Foto inválida. Envie a foto novamente.';
    end if;

    -- Validações do back (as mesmas do formulário).
    if array_length(regexp_split_to_array(new.nome, ' '), 1) < 2 or length(new.nome) < 5 then
      raise exception 'Informe seu nome completo (nome e sobrenome).';
    end if;
    if new.telefone is null or new.telefone !~ '^[1-9]{2}9[0-9]{8}$' then
      raise exception 'Telefone inválido. Use DDD + número, por exemplo (31) 99999-9999.';
    end if;
    if new.data_nascimento is null or new.data_nascimento > current_date then
      raise exception 'Informe uma data de nascimento válida.';
    end if;
    v_idade := public.idade(new.data_nascimento);
    if v_idade < 5 or v_idade > 100 then
      raise exception 'Confira a data de nascimento.';
    end if;
    if new.consentimento_em is null then
      raise exception 'É preciso aceitar o termo de uso dos dados e da imagem.';
    end if;
    if v_idade < 12 and (new.responsavel_nome is null or new.responsavel_telefone is null) then
      raise exception 'Para menores de 12 anos, informe o nome e o telefone do responsável.';
    end if;
    if new.responsavel_telefone is not null and new.responsavel_telefone !~ '^[1-9]{2}9?[0-9]{8}$' then
      raise exception 'Telefone do responsável inválido.';
    end if;
  end if;

  -- Carimbo de validação.
  if (tg_op = 'INSERT' and new.status = 'validado')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    if new.status = 'validado' then
      new.validado_em := now();
      new.validado_por := public.quem();
    else
      new.validado_em := null;
      new.validado_por := null;
    end if;
  end if;

  new.inconsistencias := public.calcular_inconsistencias(new);
  return new;
end;
$$;

-- ---------- Gatilho AFTER: histórico e recálculo dos "vizinhos" -------
create or replace function public.jovens_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sis    boolean := coalesce(current_setting('app.sistema', true), '') = 'on';
  v_diff   jsonb := '{}';
  v_col    text;
  v_id     uuid;
  v_tels   text[];
  v_nomes  text[];
begin
  if tg_op = 'INSERT' then
    insert into public.jovens_historico (jovem_id, alterado_por, acao)
    values (new.id, public.quem(),
            case new.origem when 'importacao_planilha' then 'importacao' else 'cadastro' end);
    v_id := new.id; v_tels := array[new.telefone]; v_nomes := array[lower(new.nome)];
  elsif tg_op = 'UPDATE' then
    if not v_sis then
      foreach v_col in array array['nome','email','telefone','data_nascimento','foto_url','foto_origem',
                                   'status','observacoes_admin','responsavel_nome','responsavel_telefone'] loop
        if (to_jsonb(old) -> v_col) is distinct from (to_jsonb(new) -> v_col) then
          v_diff := v_diff || jsonb_build_object(v_col,
                     jsonb_build_object('de', to_jsonb(old) -> v_col, 'para', to_jsonb(new) -> v_col));
        end if;
      end loop;
      if v_diff <> '{}' then
        insert into public.jovens_historico (jovem_id, alterado_por, acao, campos)
        values (new.id, public.quem(), 'edicao', v_diff);
      end if;
    end if;
    v_id := new.id;
    v_tels := array[new.telefone, old.telefone];
    v_nomes := array[lower(new.nome), lower(old.nome)];
    if new.telefone is not distinct from old.telefone and new.nome is not distinct from old.nome then
      return null;  -- nada que afete outros registros
    end if;
  else -- DELETE
    v_id := old.id; v_tels := array[old.telefone]; v_nomes := array[lower(old.nome)];
  end if;

  -- Telefone/nome repetido depende dos outros registros: recalcula quem divide o mesmo valor.
  if pg_trigger_depth() = 1 then
    perform set_config('app.sistema', 'on', true);
    update public.jovens set inconsistencias = '{}'
     where id <> v_id and (telefone = any (v_tels) or lower(nome) = any (v_nomes));
    perform set_config('app.sistema', case when v_sis then 'on' else 'off' end, true);
  end if;
  return null;
end;
$$;

create trigger jovens_before before insert or update on public.jovens
  for each row execute function public.jovens_before();
create trigger jovens_after after insert or update or delete on public.jovens
  for each row execute function public.jovens_after();

-- ---------- Vincular cadastro antigo (item 4.3) -----------------------
-- Exige telefone E data de nascimento. Devolve só o primeiro nome.
create or replace function public.buscar_cadastro_antigo(p_telefone text, p_nascimento date)
returns table (id uuid, primeiro_nome text)
language sql stable security definer set search_path = public as $$
  select j.id, initcap(split_part(j.nome, ' ', 1))
    from public.jovens j
   where auth.uid() is not null
     and j.user_id is null and j.email is null
     and j.telefone = public.so_digitos(p_telefone)
     and j.data_nascimento = p_nascimento
     and not exists (select 1 from public.jovens m where m.user_id = auth.uid())
   order by j.criado_em, j.id
   limit 1;
$$;

create or replace function public.vincular_cadastro(p_id uuid, p_telefone text, p_nascimento date)
returns public.jovens language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  r       public.jovens;
begin
  if v_uid is null or v_email is null then
    raise exception 'Faça login novamente.';
  end if;
  if exists (select 1 from public.jovens where user_id = v_uid or email = v_email) then
    raise exception 'Você já tem um cadastro.';
  end if;

  perform set_config('app.sistema', 'on', true);
  update public.jovens
     set user_id = v_uid, email = v_email
   where id = p_id and user_id is null and email is null
     and telefone = public.so_digitos(p_telefone)
     and data_nascimento = p_nascimento
  returning * into r;
  perform set_config('app.sistema', 'off', true);

  if r.id is null then
    raise exception 'Não foi possível vincular este cadastro.';
  end if;
  insert into public.jovens_historico (jovem_id, alterado_por, acao, campos)
  values (r.id, v_email, 'vinculacao', jsonb_build_object('email', jsonb_build_object('de', null, 'para', v_email)));
  return r;
end;
$$;

-- ---------- Duplicados (item 5.5) -------------------------------------
create or replace function public.listar_duplicados()
returns table (a_id uuid, b_id uuid, motivo text, mesmo_nascimento boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  return query
  select a.id, b.id,
         case
           when a.telefone = b.telefone and lower(a.nome) = lower(b.nome) then 'Mesmo nome e telefone'
           when a.telefone = b.telefone then 'Mesmo telefone'
           else 'Mesmo nome e nascimento'
         end,
         a.data_nascimento is not distinct from b.data_nascimento
    from public.jovens a
    join public.jovens b
      on a.id < b.id
     and (a.telefone = b.telefone
          or (lower(a.nome) = lower(b.nome) and a.data_nascimento is not distinct from b.data_nascimento))
   where not exists (select 1 from public.duplicados_ignorados i where i.a = a.id and i.b = b.id)
   order by lower(a.nome);
end;
$$;

create or replace function public.ignorar_duplicado(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  insert into public.duplicados_ignorados (a, b, criado_por)
  values (least(p_a, p_b), greatest(p_a, p_b), public.quem())
  on conflict do nothing;
end;
$$;

-- p_dados: valores escolhidos pela liderança, ex.:
-- {"nome": "...", "telefone": "...", "data_nascimento": "2000-10-08", "foto_url": null, "foto_origem": "..."}
create or replace function public.mesclar_jovens(p_manter uuid, p_remover uuid, p_dados jsonb)
returns public.jovens language plpgsql security definer set search_path = public as $$
declare
  a public.jovens;
  b public.jovens;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  if p_manter = p_remover then raise exception 'Escolha dois registros diferentes.'; end if;
  select * into a from public.jovens where id = p_manter for update;
  select * into b from public.jovens where id = p_remover for update;
  if a.id is null or b.id is null then raise exception 'Registro não encontrado.'; end if;
  if a.user_id is not null and b.user_id is not null then
    raise exception 'Os dois registros já estão ligados a e-mails diferentes. Não dá para mesclar.';
  end if;

  delete from public.jovens where id = b.id;

  update public.jovens set
    nome                 = case when p_dados ? 'nome' then p_dados ->> 'nome' else nome end,
    telefone             = case when p_dados ? 'telefone' then p_dados ->> 'telefone' else telefone end,
    data_nascimento      = case when p_dados ? 'data_nascimento' then (p_dados ->> 'data_nascimento')::date else data_nascimento end,
    foto_url             = case when p_dados ? 'foto_url' then p_dados ->> 'foto_url' else coalesce(foto_url, b.foto_url) end,
    foto_origem          = case when p_dados ? 'foto_origem' then p_dados ->> 'foto_origem' else coalesce(foto_origem, b.foto_origem) end,
    email                = coalesce(email, b.email),
    user_id              = coalesce(user_id, b.user_id),
    responsavel_nome     = coalesce(responsavel_nome, b.responsavel_nome),
    responsavel_telefone = coalesce(responsavel_telefone, b.responsavel_telefone),
    consentimento_em     = coalesce(consentimento_em, b.consentimento_em),
    observacoes_admin    = nullif(concat_ws(E'\n', observacoes_admin, b.observacoes_admin), '')
  where id = a.id
  returning * into a;

  insert into public.jovens_historico (jovem_id, alterado_por, acao, campos)
  values (a.id, public.quem(), 'mesclagem', jsonb_build_object('registro_removido', to_jsonb(b)));
  return a;
end;
$$;

-- ---------- Segurança: RLS -------------------------------------------
alter table public.jovens enable row level security;
alter table public.admins enable row level security;
alter table public.jovens_historico enable row level security;
alter table public.duplicados_ignorados enable row level security;

create policy "jovens: ver" on public.jovens for select to authenticated
  using (public.eh_admin() or user_id = auth.uid());
create policy "jovens: criar" on public.jovens for insert to authenticated
  with check (public.eh_admin() or user_id = auth.uid());
create policy "jovens: editar" on public.jovens for update to authenticated
  using (public.eh_admin() or user_id = auth.uid())
  with check (public.eh_admin() or user_id = auth.uid());
create policy "jovens: apagar" on public.jovens for delete to authenticated
  using (public.eh_admin());

create policy "admins: ver" on public.admins for select to authenticated using (public.eh_admin());
create policy "admins: criar" on public.admins for insert to authenticated with check (public.eh_admin());
create policy "admins: remover" on public.admins for delete to authenticated using (public.eh_admin());

create policy "historico: ver" on public.jovens_historico for select to authenticated using (public.eh_admin());
create policy "ignorados: admin" on public.duplicados_ignorados for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Visitantes sem login não acessam nada.
revoke all on public.jovens, public.admins, public.jovens_historico, public.duplicados_ignorados from anon;

-- Funções: só usuários logados; as internas ficam fechadas.
revoke execute on function public.calcular_inconsistencias(public.jovens) from public, anon, authenticated;
revoke execute on function public.jovens_before() from public, anon, authenticated;
revoke execute on function public.jovens_after() from public, anon, authenticated;
revoke execute on function public.privilegiado() from public, anon, authenticated;
revoke execute on function public.buscar_cadastro_antigo(text, date) from public, anon;
revoke execute on function public.vincular_cadastro(uuid, text, date) from public, anon;
revoke execute on function public.listar_duplicados() from public, anon;
revoke execute on function public.ignorar_duplicado(uuid, uuid) from public, anon;
revoke execute on function public.mesclar_jovens(uuid, uuid, jsonb) from public, anon;
grant execute on function public.eh_admin(), public.buscar_cadastro_antigo(text, date),
  public.vincular_cadastro(uuid, text, date), public.listar_duplicados(),
  public.ignorar_duplicado(uuid, uuid), public.mesclar_jovens(uuid, uuid, jsonb) to authenticated;

-- ---------- Fotos: bucket privado ------------------------------------
-- Pastas: "<user_id>/..." para o próprio jovem; "admin/<jovem_id>/..." para a liderança.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "fotos: admin" on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and public.eh_admin())
  with check (bucket_id = 'fotos' and public.eh_admin());
create policy "fotos: jovem ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or name = (select j.foto_url from public.jovens j where j.user_id = auth.uid())));
create policy "fotos: jovem enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos: jovem trocar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos: jovem apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
