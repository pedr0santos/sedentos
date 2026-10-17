-- =====================================================================
-- Sedentos · Rede de discipulado (v2)
-- Papel na rede, vínculo "discipulado por", áreas do discipulador e da
-- liderança, anotações confidenciais e vinculação automática por e-mail.
-- Complementa 20261017000000_sedentos.sql (que não é alterada).
-- =====================================================================

-- ---------- Tipos e colunas ------------------------------------------
create type public.papel_rede as enum ('lideranca', 'discipulador', 'jovem');
create type public.tipo_anotacao as enum ('acompanhamento', 'pedido_oracao', 'conquista', 'alerta', 'correcao_cadastro');

alter table public.jovens
  add column papel public.papel_rede not null default 'jovem',
  add column cargo_lideranca text,
  add column discipulado_por uuid references public.jovens (id) on delete set null;
create index jovens_discipulado_por_idx on public.jovens (discipulado_por);
create index jovens_papel_idx on public.jovens (papel);

-- Configuração da rede (uma linha só). Limite de discípulos antes do alerta de sobrecarga.
create table public.config_rede (
  id                 boolean primary key default true check (id),
  limite_discipulos  int not null default 12 check (limite_discipulos between 1 and 200),
  atualizado_em      timestamptz not null default now(),
  atualizado_por     text
);
insert into public.config_rede default values;

create table public.anotacoes_discipulado (
  id           uuid primary key default gen_random_uuid(),
  jovem_id     uuid not null references public.jovens (id) on delete cascade,
  autor_id     uuid references public.jovens (id) on delete set null,
  autor_email  text not null,
  autor_nome   text,
  tipo         public.tipo_anotacao not null default 'acompanhamento',
  texto        text not null check (char_length(btrim(texto)) between 1 and 2000),
  criado_em    timestamptz not null default now(),
  editado_em   timestamptz
);
create index anotacoes_jovem_idx on public.anotacoes_discipulado (jovem_id, criado_em desc);

-- ---------- Quem é o usuário logado na rede --------------------------
create or replace function public.meu_jovem_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.jovens where user_id = auth.uid();
$$;

create or replace function public.meu_papel()
returns public.papel_rede language sql stable security definer set search_path = public as $$
  select papel from public.jovens where user_id = auth.uid();
$$;

create or replace function public.eh_discipulador()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = 'discipulador', false);
$$;

create or replace function public.eh_lideranca()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = 'lideranca', false);
$$;

-- p_id é discípulo direto do discipulador logado?
create or replace function public.eh_meu_discipulo(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_discipulador() and exists (
    select 1 from public.jovens j
     where j.id = p_id and j.papel = 'jovem' and j.discipulado_por = public.meu_jovem_id());
$$;

-- p_id está na rede da liderança logada? (discipulador dela, ou discípulo de um discipulador dela)
create or replace function public.esta_na_minha_rede(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_lideranca() and exists (
    select 1 from public.jovens j
      left join public.jovens d on d.id = j.discipulado_por
     where j.id = p_id
       and (j.discipulado_por = public.meu_jovem_id() or d.discipulado_por = public.meu_jovem_id()));
$$;

create or replace function public.pode_ver_jovem(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
      or coalesce(p_id = public.meu_jovem_id(), false)
      or public.eh_meu_discipulo(p_id)
      or public.esta_na_minha_rede(p_id);
$$;

-- ---------- Gatilho BEFORE da rede: trava, valida, limpa --------------
-- Roda depois de "jovens_before" (os gatilhos disparam em ordem alfabética).
create or replace function public.jovens_rede_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_alvo   public.papel_rede;
  v_qtd    int;
  v_valido boolean;
begin
  -- O próprio jovem não mexe no papel nem no vínculo.
  if not public.privilegiado() then
    if tg_op = 'INSERT' then
      new.papel := 'jovem';
      new.cargo_lideranca := null;
      new.discipulado_por := null;
    else
      new.papel := old.papel;
      new.cargo_lideranca := old.cargo_lideranca;
      new.discipulado_por := old.discipulado_por;
    end if;
  end if;

  new.cargo_lideranca := case when new.papel = 'lideranca'
                              then nullif(btrim(coalesce(new.cargo_lideranca, '')), '') end;

  -- Quem tem pessoas ligadas não muda de papel antes de transferi-las.
  if tg_op = 'UPDATE' and new.papel is distinct from old.papel and old.papel in ('discipulador', 'lideranca') then
    select count(*) into v_qtd from public.jovens where discipulado_por = old.id;
    if v_qtd > 0 then
      raise exception '% tem % % ligado(s). Transfira antes de mudar o papel.',
        old.nome, v_qtd, case old.papel when 'discipulador' then 'discípulo(s)' else 'discipulador(es)' end
        using errcode = 'P0001', hint = 'TRANSFERIR_ANTES';
    end if;
  end if;

  if new.discipulado_por is not null then
    if new.discipulado_por = new.id then
      raise exception 'Uma pessoa não pode ser discipulada por ela mesma.';
    end if;
    select papel into v_alvo from public.jovens where id = new.discipulado_por;
    v_valido := case new.papel
                  when 'lideranca' then false
                  when 'discipulador' then v_alvo = 'lideranca'
                  else v_alvo = 'discipulador'
                end;
    if not coalesce(v_valido, false) then
      -- Mudou o papel e o vínculo antigo deixou de valer: limpa sem reclamar.
      if tg_op = 'UPDATE' and new.papel is distinct from old.papel
         and new.discipulado_por is not distinct from old.discipulado_por then
        new.discipulado_por := null;
      elsif new.papel = 'lideranca' then
        raise exception 'A Liderança não tem ninguém acima dela na rede.';
      elsif new.papel = 'discipulador' then
        raise exception 'Um discipulador só pode ser ligado a alguém da Liderança.';
      else
        raise exception 'Um jovem só pode ser ligado a um discipulador.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger jovens_rede_before before insert or update on public.jovens
  for each row execute function public.jovens_rede_before();

-- ---------- Histórico: inclui papel, cargo e vínculo ------------------
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
                                   'status','observacoes_admin','responsavel_nome','responsavel_telefone',
                                   'papel','cargo_lideranca','discipulado_por'] loop
        if (to_jsonb(old) -> v_col) is distinct from (to_jsonb(new) -> v_col) then
          v_diff := v_diff || jsonb_build_object(v_col,
                     jsonb_build_object('de', to_jsonb(old) -> v_col, 'para', to_jsonb(new) -> v_col));
        end if;
      end loop;
      -- Mostra o nome de quem discipula, não só o id.
      if v_diff ? 'discipulado_por' then
        v_diff := jsonb_set(v_diff, '{discipulado_por}', jsonb_build_object(
          'de', (select nome from public.jovens where id = old.discipulado_por),
          'para', (select nome from public.jovens where id = new.discipulado_por)));
      end if;
      if v_diff <> '{}' then
        insert into public.jovens_historico (jovem_id, alterado_por, acao, campos)
        values (new.id, public.quem(), 'edicao', v_diff);
      end if;
    end if;
    v_id := new.id;
    v_tels := array[new.telefone, old.telefone];
    v_nomes := array[lower(new.nome), lower(old.nome)];
    if new.telefone is not distinct from old.telefone and new.nome is not distinct from old.nome then
      return null;
    end if;
  else
    v_id := old.id; v_tels := array[old.telefone]; v_nomes := array[lower(old.nome)];
  end if;

  if pg_trigger_depth() = 1 then
    perform set_config('app.sistema', 'on', true);
    update public.jovens set inconsistencias = '{}'
     where id <> v_id and (telefone = any (v_tels) or lower(nome) = any (v_nomes));
    perform set_config('app.sistema', case when v_sis then 'on' else 'off' end, true);
  end if;
  return null;
end;
$$;

-- ---------- Login: liga automaticamente o cadastro pelo e-mail --------
-- Quando um admin preenche o e-mail de alguém (ex.: um discipulador), essa pessoa
-- entra com o código e o cadastro já é dela, sem passar pela busca.
create or replace function public.vincular_por_email()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_id    uuid;
begin
  if auth.uid() is null or v_email is null then return false; end if;
  if exists (select 1 from public.jovens where user_id = auth.uid()) then return true; end if;
  perform set_config('app.sistema', 'on', true);
  update public.jovens set user_id = auth.uid()
   where email = v_email and user_id is null
  returning id into v_id;
  perform set_config('app.sistema', 'off', true);
  if v_id is null then return false; end if;
  insert into public.jovens_historico (jovem_id, alterado_por, acao, campos)
  values (v_id, v_email, 'vinculacao', jsonb_build_object('login', jsonb_build_object('de', null, 'para', v_email)));
  return true;
end;
$$;

-- ---------- Leitura para discipulador e liderança --------------------
-- Só os campos permitidos. A tabela "jovens" continua fechada (admin e o próprio).
create or replace function public.minha_rede()
returns table (
  id uuid, nome text, foto_url text, telefone text, data_nascimento date, idade int,
  papel public.papel_rede, cargo_lideranca text, discipulado_por uuid, discipulador_nome text,
  responsavel_nome text, responsavel_telefone text, nivel int, discipulos int
)
language sql stable security definer set search_path = public as $$
  with eu as (select * from public.jovens where user_id = auth.uid()),
  rede as (
    select j.*, 0 as nivel from eu j
    union all
    select j.*, 1 from public.jovens j, eu
     where j.discipulado_por = eu.id and eu.papel in ('discipulador', 'lideranca')
    union all
    select j.*, 2 from public.jovens j
      join public.jovens d on d.id = j.discipulado_por, eu
     where d.discipulado_por = eu.id and eu.papel = 'lideranca'
  )
  select r.id, r.nome, r.foto_url, r.telefone, r.data_nascimento,
         case when r.data_nascimento <= current_date then public.idade(r.data_nascimento) end,
         r.papel, r.cargo_lideranca, r.discipulado_por,
         (select s.nome from public.jovens s where s.id = r.discipulado_por),
         case when public.idade(r.data_nascimento) < 18 then r.responsavel_nome end,
         case when public.idade(r.data_nascimento) < 18 then r.responsavel_telefone end,
         r.nivel,
         (select count(*)::int from public.jovens c where c.discipulado_por = r.id)
    from rede r
   order by r.nivel, r.nome;
$$;

-- ---------- Ações da administração -----------------------------------
create or replace function public.transferir_discipulos(p_de uuid, p_para uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_qtd int;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  if p_de = p_para then raise exception 'Escolha outra pessoa para receber.'; end if;
  update public.jovens set discipulado_por = p_para where discipulado_por = p_de;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- Ações em massa: aplica em cada pessoa e devolve só as que falharam (com o motivo).
create or replace function public.rede_definir_papel(p_ids uuid[], p_papel public.papel_rede, p_cargo text default null)
returns table (jovem_id uuid, jovem_nome text, erro text)
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  foreach v in array p_ids loop
    begin
      update public.jovens
         set papel = p_papel,
             cargo_lideranca = case when p_papel = 'lideranca' then coalesce(nullif(p_cargo, ''), cargo_lideranca) end
       where id = v;
    exception when others then
      jovem_id := v; jovem_nome := (select nome from public.jovens where id = v); erro := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

create or replace function public.rede_atribuir(p_ids uuid[], p_discipulado_por uuid)
returns table (jovem_id uuid, jovem_nome text, erro text)
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  foreach v in array p_ids loop
    begin
      update public.jovens set discipulado_por = p_discipulado_por where id = v;
    exception when others then
      jovem_id := v; jovem_nome := (select nome from public.jovens where id = v); erro := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

-- ---------- Mesclagem: preserva papel, vínculo e discípulos ----------
create or replace function public.mesclar_jovens(p_manter uuid, p_remover uuid, p_dados jsonb)
returns public.jovens language plpgsql security definer set search_path = public as $$
declare
  a public.jovens;
  b public.jovens;
  v_papel public.papel_rede;
  v_link  uuid;
  v_cargo text;
  nivel   constant jsonb := '{"jovem":1,"discipulador":2,"lideranca":3}';
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  if p_manter = p_remover then raise exception 'Escolha dois registros diferentes.'; end if;
  select * into a from public.jovens where id = p_manter for update;
  select * into b from public.jovens where id = p_remover for update;
  if a.id is null or b.id is null then raise exception 'Registro não encontrado.'; end if;
  if a.user_id is not null and b.user_id is not null then
    raise exception 'Os dois registros já estão ligados a e-mails diferentes. Não dá para mesclar.';
  end if;

  -- 1) Papel mais alto e o vínculo que combina com ele.
  if (nivel ->> b.papel::text)::int > (nivel ->> a.papel::text)::int then
    v_papel := b.papel; v_link := b.discipulado_por; v_cargo := coalesce(b.cargo_lideranca, a.cargo_lideranca);
  else
    v_papel := a.papel;
    v_link := case when a.papel = b.papel then coalesce(a.discipulado_por, b.discipulado_por) else a.discipulado_por end;
    v_cargo := coalesce(a.cargo_lideranca, b.cargo_lideranca);
  end if;
  if v_link in (a.id, b.id) then v_link := null; end if;
  update public.jovens set papel = v_papel, cargo_lideranca = v_cargo, discipulado_por = v_link where id = a.id;

  -- 2) Quem era cuidado pelo registro removido passa para o mantido; anotações também.
  update public.jovens set discipulado_por = a.id where discipulado_por = b.id and id <> a.id;
  perform set_config('app.sistema', 'on', true);
  update public.anotacoes_discipulado set jovem_id = a.id where jovem_id = b.id;
  update public.anotacoes_discipulado set autor_id = a.id where autor_id = b.id;
  perform set_config('app.sistema', 'off', true);

  -- 3) Remove o duplicado e grava os dados escolhidos.
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

-- ---------- Anotações: autoria e prazo de edição ----------------------
create or replace function public.anotacoes_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := public.meu_jovem_id();
    new.autor_email := coalesce(lower(nullif(auth.jwt() ->> 'email', '')), 'sistema');
    new.autor_nome := coalesce((select nome from public.jovens where id = new.autor_id), new.autor_email);
    new.criado_em := now();
    new.editado_em := null;
  elsif pg_trigger_depth() > 1 or coalesce(current_setting('app.sistema', true), '') = 'on' then
    null;  -- ajustes internos (mesclagem, exclusão de um autor): deixa passar
  else
    new.id := old.id;
    new.jovem_id := old.jovem_id;
    new.autor_id := old.autor_id;
    new.autor_email := old.autor_email;
    new.autor_nome := old.autor_nome;
    new.criado_em := old.criado_em;
    new.editado_em := now();
  end if;
  new.texto := btrim(new.texto);
  return new;
end;
$$;
create trigger anotacoes_before before insert or update on public.anotacoes_discipulado
  for each row execute function public.anotacoes_before();

-- Quem pode escrever sobre p_id: admin, a liderança da rede, o discipulador atual.
create or replace function public.pode_anotar(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_id <> public.meu_jovem_id(), true)
     and (public.eh_admin() or public.esta_na_minha_rede(p_id) or public.eh_meu_discipulo(p_id));
$$;

create or replace function public.sou_autor(p_email text)
returns boolean language sql stable as $$
  select p_email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- ---------- RLS --------------------------------------------------------
alter table public.anotacoes_discipulado enable row level security;
alter table public.config_rede enable row level security;

-- Ver: admin tudo; liderança toda a rede; discipulador só o que ele escreveu sobre os discípulos atuais.
-- O próprio jovem nunca vê anotações sobre ele (não há regra para isso).
create policy "anotacoes: ver" on public.anotacoes_discipulado for select to authenticated
  using (public.eh_admin()
      or public.esta_na_minha_rede(jovem_id)
      or (public.sou_autor(autor_email) and public.eh_meu_discipulo(jovem_id)));
create policy "anotacoes: escrever" on public.anotacoes_discipulado for insert to authenticated
  with check (public.pode_anotar(jovem_id));
create policy "anotacoes: editar (24h)" on public.anotacoes_discipulado for update to authenticated
  using (public.sou_autor(autor_email) and criado_em > now() - interval '24 hours' and public.pode_anotar(jovem_id))
  with check (public.pode_anotar(jovem_id));
create policy "anotacoes: apagar" on public.anotacoes_discipulado for delete to authenticated
  using (public.eh_admin()
      or (public.sou_autor(autor_email) and criado_em > now() - interval '24 hours' and public.pode_anotar(jovem_id)));

create policy "config: ver" on public.config_rede for select to authenticated using (public.eh_admin());
create policy "config: editar" on public.config_rede for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Fotos: quem pode ver a pessoa pode ver a foto (URL assinada).
create or replace function public.pode_ver_foto(p_caminho text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jovens j where j.foto_url = p_caminho and public.pode_ver_jovem(j.id));
$$;
create policy "fotos: rede ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.pode_ver_foto(name));

revoke all on public.anotacoes_discipulado, public.config_rede from anon;

revoke execute on function public.jovens_rede_before() from public, anon, authenticated;
revoke execute on function public.anotacoes_before() from public, anon, authenticated;
revoke execute on function public.transferir_discipulos(uuid, uuid) from public, anon;
revoke execute on function public.rede_definir_papel(uuid[], public.papel_rede, text) from public, anon;
revoke execute on function public.rede_atribuir(uuid[], uuid) from public, anon;
revoke execute on function public.minha_rede() from public, anon;
revoke execute on function public.vincular_por_email() from public, anon;
grant execute on function public.meu_jovem_id(), public.meu_papel(), public.eh_discipulador(), public.eh_lideranca(),
  public.eh_meu_discipulo(uuid), public.esta_na_minha_rede(uuid), public.pode_ver_jovem(uuid),
  public.pode_anotar(uuid), public.sou_autor(text), public.pode_ver_foto(text), public.minha_rede(), public.vincular_por_email(),
  public.transferir_discipulos(uuid, uuid), public.rede_definir_papel(uuid[], public.papel_rede, text),
  public.rede_atribuir(uuid[], uuid) to authenticated;
