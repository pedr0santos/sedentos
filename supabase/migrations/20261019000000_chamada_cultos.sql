-- =====================================================================
-- Sedentos · Chamada dos cultos de jovens + avisos de falta (v3)
-- Cultos de sábado, presenças, fechamento da chamada com avisos ao
-- discipulador/liderança, inativos, inscrições de push.
-- Complementa as migrações anteriores (que não são alteradas).
-- Datas sempre no fuso America/Sao_Paulo.
-- =====================================================================

-- ---------- Tipos ------------------------------------------------------
create type public.status_culto as enum ('agendado', 'aberto', 'fechado', 'cancelado');
create type public.estado_presenca as enum ('presente', 'falta', 'justificada');
create type public.tipo_notificacao as enum ('falta', 'faltas_seguidas', 'falta_sem_discipulador');

-- ---------- Colunas novas ---------------------------------------------
alter table public.jovens add column ativo boolean not null default true;
alter table public.config_rede add column faltas_seguidas_alerta int not null default 2
  check (faltas_seguidas_alerta between 2 and 10);

-- ---------- Tabelas ----------------------------------------------------
create table public.cultos (
  id           uuid primary key default gen_random_uuid(),
  data         date not null unique,
  titulo       text not null default 'Culto de Jovens',
  status       public.status_culto not null default 'agendado',
  extra        boolean not null default false,
  aberto_em    timestamptz,
  fechado_em   timestamptz,
  fechado_por  text,
  observacao   text,
  criado_em    timestamptz not null default now()
);

create table public.presencas (
  culto_id    uuid not null references public.cultos (id) on delete cascade,
  jovem_id    uuid not null references public.jovens (id) on delete cascade,
  estado      public.estado_presenca not null,
  motivo      text,
  marcado_por text,
  marcado_em  timestamptz not null default now(),
  primary key (culto_id, jovem_id)
);
create index presencas_jovem_idx on public.presencas (jovem_id);

create table public.notificacoes (
  id                uuid primary key default gen_random_uuid(),
  destinatario_id   uuid references public.jovens (id) on delete cascade,  -- discipulador ou liderança
  para_admins       boolean not null default false,                       -- resumo "sem discipulador"
  tipo              public.tipo_notificacao not null,
  jovem_id          uuid references public.jovens (id) on delete cascade,  -- quem faltou (nulo no resumo)
  culto_id          uuid not null references public.cultos (id) on delete cascade,
  mensagem          text not null,
  dados             jsonb not null default '{}',
  criado_em         timestamptz not null default now(),
  lida_em           timestamptz,
  contato_feito_em  timestamptz,
  cancelada_em      timestamptz,
  email_enviado_em  timestamptz,
  push_enviado_em   timestamptz,
  check (destinatario_id is not null or para_admins)
);
-- Nunca duplica o mesmo aviso (fechar a chamada duas vezes não gera nada novo).
create unique index notificacoes_unica on public.notificacoes (
  coalesce(destinatario_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo,
  coalesce(jovem_id, '00000000-0000-0000-0000-000000000000'::uuid), culto_id);
create index notificacoes_destinatario_idx on public.notificacoes (destinatario_id, criado_em desc);

create table public.push_inscricoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  criado_em  timestamptz not null default now()
);

-- ---------- Auxiliares ------------------------------------------------
create or replace function public.hoje_sp()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.data_br(d date)
returns text language sql immutable as $$
  select to_char(d, 'DD/MM');
$$;

create or replace function public.primeiro_nome(n text)
returns text language sql immutable as $$
  select initcap(split_part(btrim(n), ' ', 1));
$$;

-- O jovem não marca a si mesmo como inativo.
create or replace function public.jovens_ativo_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.privilegiado() then
    new.ativo := case when tg_op = 'INSERT' then true else old.ativo end;
  end if;
  return new;
end;
$$;
create trigger jovens_ativo_before before insert or update on public.jovens
  for each row execute function public.jovens_ativo_before();

-- Histórico: inclui "ativo" (mesma função da v2, com a coluna nova).
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
                                   'papel','cargo_lideranca','discipulado_por','ativo'] loop
        if (to_jsonb(old) -> v_col) is distinct from (to_jsonb(new) -> v_col) then
          v_diff := v_diff || jsonb_build_object(v_col,
                     jsonb_build_object('de', to_jsonb(old) -> v_col, 'para', to_jsonb(new) -> v_col));
        end if;
      end loop;
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

-- Notificações: o destinatário só pode marcar "lida" e "contato feito".
create or replace function public.notificacoes_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.sistema', true), '') <> 'on' and pg_trigger_depth() = 1 then
    new.id := old.id; new.destinatario_id := old.destinatario_id; new.para_admins := old.para_admins;
    new.tipo := old.tipo; new.jovem_id := old.jovem_id; new.culto_id := old.culto_id;
    new.mensagem := old.mensagem; new.dados := old.dados; new.criado_em := old.criado_em;
    new.cancelada_em := old.cancelada_em; new.email_enviado_em := old.email_enviado_em;
    new.push_enviado_em := old.push_enviado_em;
  end if;
  return new;
end;
$$;
create trigger notificacoes_before before update on public.notificacoes
  for each row execute function public.notificacoes_before();

-- ---------- Cultos ----------------------------------------------------
-- Gera os sábados das próximas 8 semanas (a partir do próximo sábado; nunca "hoje" na primeira geração).
create or replace function public.garantir_cultos()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_hoje  date := public.hoje_sp();
  v_prox  date := v_hoje + ((6 - extract(dow from v_hoje)::int + 7) % 7);
  v_qtd   int;
begin
  if not public.eh_admin() and session_user::text = 'authenticator' then
    raise exception 'Apenas administradores.';
  end if;
  if v_prox = v_hoje then v_prox := v_hoje + 7; end if;
  insert into public.cultos (data)
  select d::date from generate_series(v_prox, v_prox + 49, interval '7 days') d
  on conflict (data) do nothing;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

create or replace function public.criar_culto_extra(p_data date, p_titulo text default null)
returns public.cultos language plpgsql security definer set search_path = public as $$
declare r public.cultos;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  if exists (select 1 from public.cultos where data = p_data and status <> 'cancelado') then
    raise exception 'Já existe um culto em %.', to_char(p_data, 'DD/MM/YYYY');
  end if;
  insert into public.cultos (data, titulo, extra)
  values (p_data, coalesce(nullif(btrim(p_titulo), ''), 'Culto de Jovens'), extract(dow from p_data) <> 6)
  on conflict (data) do update set status = 'agendado', titulo = excluded.titulo, observacao = null
  returning * into r;
  return r;
end;
$$;

create or replace function public.cancelar_culto(p_culto uuid, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  if exists (select 1 from public.cultos where id = p_culto and status = 'fechado') then
    raise exception 'Esta chamada já foi fechada. Corrija as presenças em vez de cancelar.';
  end if;
  delete from public.presencas where culto_id = p_culto;
  update public.cultos set status = 'cancelado', observacao = nullif(btrim(coalesce(p_observacao, '')), '')
   where id = p_culto;
end;
$$;

create or replace function public.reativar_culto(p_culto uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  update public.cultos set status = 'agendado' where id = p_culto and status = 'cancelado';
end;
$$;

create or replace function public.abrir_chamada(p_culto uuid)
returns public.cultos language plpgsql security definer set search_path = public as $$
declare r public.cultos;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  update public.cultos set status = 'aberto', aberto_em = coalesce(aberto_em, now())
   where id = p_culto and status in ('agendado', 'aberto')
  returning * into r;
  if r.id is null then
    select * into r from public.cultos where id = p_culto;
    if r.id is null then raise exception 'Culto não encontrado.'; end if;
    if r.status = 'cancelado' then raise exception 'Este culto foi cancelado.'; end if;
  end if;
  return r;
end;
$$;

-- ---------- Sequência de faltas e avisos -------------------------------
-- Faltas seguidas até o culto informado (cultos cancelados e não fechados não contam;
-- presença ou falta justificada zeram a sequência).
create or replace function public.sequencia_faltas(p_jovem uuid, p_culto uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_data date := (select data from public.cultos where id = p_culto);
  c record;
  n int := 0;
begin
  for c in
    select cu.id, p.estado from public.cultos cu
      left join public.presencas p on p.culto_id = cu.id and p.jovem_id = p_jovem
     where cu.data <= v_data and (cu.status = 'fechado' or cu.id = p_culto)
     order by cu.data desc
  loop
    exit when c.estado is distinct from 'falta';
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Resumo para os admins: quem faltou e não tem discipulador (um aviso por culto).
create or replace function public.atualizar_resumo_admins(p_culto uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lista jsonb;
  v_qtd   int;
  v_culto public.cultos;
begin
  select * into v_culto from public.cultos where id = p_culto;
  select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'nome', j.nome) order by j.nome), '[]'), count(*)
    into v_lista, v_qtd
    from public.presencas p join public.jovens j on j.id = p.jovem_id
   where p.culto_id = p_culto and p.estado = 'falta'
     and j.discipulado_por is null and j.papel <> 'lideranca';
  perform set_config('app.sistema', 'on', true);
  if v_qtd = 0 then
    update public.notificacoes set cancelada_em = now()
     where culto_id = p_culto and para_admins and tipo = 'falta_sem_discipulador' and cancelada_em is null;
  else
    insert into public.notificacoes (para_admins, tipo, culto_id, mensagem, dados)
    values (true, 'falta_sem_discipulador', p_culto,
            format('%s %s sem discipulador %s no culto de %s.', v_qtd,
                   case when v_qtd = 1 then 'pessoa' else 'pessoas' end,
                   case when v_qtd = 1 then 'faltou' else 'faltaram' end, public.data_br(v_culto.data)),
            jsonb_build_object('jovens', v_lista, 'total', v_qtd))
    on conflict (coalesce(destinatario_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo,
                 coalesce(jovem_id, '00000000-0000-0000-0000-000000000000'::uuid), culto_id)
    do update set dados = excluded.dados, mensagem = excluded.mensagem, cancelada_em = null;
  end if;
  perform set_config('app.sistema', 'off', true);
end;
$$;

-- Cria (ou reativa) os avisos de uma falta. Devolve quantos avisos novos foram criados.
create or replace function public.notificar_falta(p_culto uuid, p_jovem uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  j       public.jovens;
  v_culto public.cultos;
  v_seq   int;
  v_lim   int := coalesce((select faltas_seguidas_alerta from public.config_rede limit 1), 2);
  v_lider uuid;
  v_novos int := 0;
  v_txt   text;
begin
  select * into j from public.jovens where id = p_jovem;
  select * into v_culto from public.cultos where id = p_culto;
  if not j.ativo or j.papel = 'lideranca' then return 0; end if;   -- liderança: ninguém acima
  if j.discipulado_por is null then return 0; end if;              -- vai no resumo dos admins

  v_seq := public.sequencia_faltas(p_jovem, p_culto);
  v_txt := format('%s faltou ao %s de sábado, %s.', public.primeiro_nome(j.nome), v_culto.titulo, public.data_br(v_culto.data));

  perform set_config('app.sistema', 'on', true);
  -- Falta: vai para quem está logo acima (discipulador do jovem, ou liderança do discipulador).
  update public.notificacoes set cancelada_em = null, destinatario_id = j.discipulado_por,
         dados = jsonb_build_object('sequencia', v_seq), mensagem = v_txt
   where culto_id = p_culto and jovem_id = p_jovem and tipo = 'falta';
  if not found then
    insert into public.notificacoes (destinatario_id, tipo, jovem_id, culto_id, mensagem, dados)
    values (j.discipulado_por, 'falta', p_jovem, p_culto, v_txt, jsonb_build_object('sequencia', v_seq));
    v_novos := v_novos + 1;
  end if;

  -- Faltas seguidas de um jovem: avisa também a liderança acima do discipulador.
  if v_seq >= v_lim and j.papel = 'jovem' then
    select discipulado_por into v_lider from public.jovens where id = j.discipulado_por;
    if v_lider is not null then
      v_txt := format('%s faltou %s cultos seguidos (último: %s).', public.primeiro_nome(j.nome), v_seq, public.data_br(v_culto.data));
      update public.notificacoes set cancelada_em = null, destinatario_id = v_lider,
             dados = jsonb_build_object('sequencia', v_seq, 'discipulador_id', j.discipulado_por), mensagem = v_txt
       where culto_id = p_culto and jovem_id = p_jovem and tipo = 'faltas_seguidas';
      if not found then
        insert into public.notificacoes (destinatario_id, tipo, jovem_id, culto_id, mensagem, dados)
        values (v_lider, 'faltas_seguidas', p_jovem, p_culto, v_txt,
                jsonb_build_object('sequencia', v_seq, 'discipulador_id', j.discipulado_por));
        v_novos := v_novos + 1;
      end if;
    end if;
  end if;
  perform set_config('app.sistema', 'off', true);
  return v_novos;
end;
$$;

-- ---------- Marcar presença (durante a chamada e correções depois) ------
-- p_estado nulo = desmarcar (só com a chamada aberta).
create or replace function public.marcar_presenca(p_culto uuid, p_jovem uuid, p_estado public.estado_presenca, p_motivo text default null)
returns public.presencas language plpgsql security definer set search_path = public as $$
declare
  v_culto public.cultos;
  v_antes public.estado_presenca;
  r       public.presencas;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  select * into v_culto from public.cultos where id = p_culto for update;
  if v_culto.id is null then raise exception 'Culto não encontrado.'; end if;
  if v_culto.status = 'cancelado' then raise exception 'Este culto foi cancelado.'; end if;
  if v_culto.status = 'agendado' then
    update public.cultos set status = 'aberto', aberto_em = now() where id = p_culto;
    v_culto.status := 'aberto';
  end if;
  select estado into v_antes from public.presencas where culto_id = p_culto and jovem_id = p_jovem;

  if p_estado is null then
    if v_culto.status = 'fechado' then raise exception 'Chamada fechada: escolha presente, falta ou justificada.'; end if;
    delete from public.presencas where culto_id = p_culto and jovem_id = p_jovem;
    return null;
  end if;
  if p_estado = 'justificada' and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Informe o motivo da falta justificada.';
  end if;

  insert into public.presencas (culto_id, jovem_id, estado, motivo, marcado_por, marcado_em)
  values (p_culto, p_jovem, p_estado, case when p_estado = 'justificada' then btrim(p_motivo) end, public.quem(), now())
  on conflict (culto_id, jovem_id) do update
    set estado = excluded.estado, motivo = excluded.motivo, marcado_por = excluded.marcado_por, marcado_em = now()
  returning * into r;

  -- Correção depois de fechada: ajusta os avisos e registra no histórico.
  if v_culto.status = 'fechado' and v_antes is distinct from p_estado then
    if p_estado = 'falta' then
      perform public.notificar_falta(p_culto, p_jovem);
    else
      perform set_config('app.sistema', 'on', true);
      update public.notificacoes set cancelada_em = now()
       where culto_id = p_culto and jovem_id = p_jovem and cancelada_em is null;
      perform set_config('app.sistema', 'off', true);
    end if;
    perform public.atualizar_resumo_admins(p_culto);
    insert into public.jovens_historico (jovem_id, alterado_por, acao, campos)
    values (p_jovem, public.quem(), 'presenca', jsonb_build_object('culto', public.data_br(v_culto.data),
            'de', v_antes, 'para', p_estado, 'motivo', r.motivo));
  end if;
  return r;
end;
$$;

-- ---------- Fechar a chamada -----------------------------------------
create or replace function public.fechar_chamada(p_culto uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_culto  public.cultos;
  v_avisos int := 0;
  f        record;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;
  select * into v_culto from public.cultos where id = p_culto for update;
  if v_culto.id is null then raise exception 'Culto não encontrado.'; end if;
  if v_culto.status = 'cancelado' then raise exception 'Este culto foi cancelado.'; end if;

  if v_culto.status <> 'fechado' then
    -- 1) Falta para todo ativo não marcado.
    insert into public.presencas (culto_id, jovem_id, estado, marcado_por)
    select p_culto, j.id, 'falta', 'fechamento'
      from public.jovens j
     where j.ativo
       and not exists (select 1 from public.presencas p where p.culto_id = p_culto and p.jovem_id = j.id);
    -- 2/3/4) Avisos.
    for f in select jovem_id from public.presencas where culto_id = p_culto and estado = 'falta' loop
      v_avisos := v_avisos + public.notificar_falta(p_culto, f.jovem_id);
    end loop;
    perform public.atualizar_resumo_admins(p_culto);
    -- 5) Fecha.
    update public.cultos set status = 'fechado', fechado_em = now(), fechado_por = public.quem() where id = p_culto;
  end if;

  return public.resumo_culto(p_culto) || jsonb_build_object('avisos_enviados', v_avisos);
end;
$$;

create or replace function public.resumo_culto(p_culto uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'presentes', count(*) filter (where p.estado = 'presente'),
    'faltas', count(*) filter (where p.estado = 'falta'),
    'justificadas', count(*) filter (where p.estado = 'justificada'),
    'avisos', (select count(*) from public.notificacoes n where n.culto_id = p_culto and n.cancelada_em is null and not n.para_admins),
    'contatos_feitos', (select count(*) from public.notificacoes n where n.culto_id = p_culto and n.cancelada_em is null
                          and not n.para_admins and n.contato_feito_em is not null),
    'discipuladores_avisados', (select count(distinct destinatario_id) from public.notificacoes n
                                 where n.culto_id = p_culto and n.cancelada_em is null and n.tipo = 'falta'))
  from public.presencas p where p.culto_id = p_culto;
$$;

-- ---------- "Cuidado da rede": avisos recebidos x respondidos por discipulador --
create or replace function public.cuidado_da_rede(p_dias int default 90)
returns table (discipulador_id uuid, nome text, avisos int, respondidos int, pendentes_3_dias int)
language sql stable security definer set search_path = public as $$
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
$$;

-- ---------- RLS -----------------------------------------------------------
alter table public.cultos enable row level security;
alter table public.presencas enable row level security;
alter table public.notificacoes enable row level security;
alter table public.push_inscricoes enable row level security;

create policy "cultos: ver" on public.cultos for select to authenticated
  using (public.eh_admin() or public.eh_discipulador() or public.eh_lideranca());

-- Presenças: admin tudo; discipulador só dos discípulos; liderança só da rede. O jovem não vê.
create policy "presencas: ver" on public.presencas for select to authenticated
  using (public.eh_admin() or public.eh_meu_discipulo(jovem_id) or public.esta_na_minha_rede(jovem_id));

-- Notificações: cada um as suas; admins, todas. Ninguém cria pela API (só as funções).
create policy "notificacoes: ver" on public.notificacoes for select to authenticated
  using (public.eh_admin() or destinatario_id = public.meu_jovem_id());
create policy "notificacoes: marcar" on public.notificacoes for update to authenticated
  using (destinatario_id = public.meu_jovem_id() or (para_admins and public.eh_admin()))
  with check (destinatario_id = public.meu_jovem_id() or (para_admins and public.eh_admin()));

create policy "push: próprias" on public.push_inscricoes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.cultos, public.presencas, public.notificacoes, public.push_inscricoes from anon;
-- Escrita em cultos/presenças só pelas funções (que avisam e registram histórico).
revoke insert, update, delete on public.cultos, public.presencas from authenticated;
revoke insert, delete on public.notificacoes from authenticated;

revoke execute on function public.jovens_ativo_before(), public.notificacoes_before(),
  public.notificar_falta(uuid, uuid), public.atualizar_resumo_admins(uuid) from public, anon, authenticated;
revoke execute on function public.garantir_cultos(), public.criar_culto_extra(date, text), public.cancelar_culto(uuid, text),
  public.reativar_culto(uuid), public.abrir_chamada(uuid), public.marcar_presenca(uuid, uuid, public.estado_presenca, text),
  public.fechar_chamada(uuid), public.resumo_culto(uuid), public.cuidado_da_rede(int), public.sequencia_faltas(uuid, uuid)
  from public, anon;
grant execute on function public.garantir_cultos(), public.criar_culto_extra(date, text), public.cancelar_culto(uuid, text),
  public.reativar_culto(uuid), public.abrir_chamada(uuid), public.marcar_presenca(uuid, uuid, public.estado_presenca, text),
  public.fechar_chamada(uuid), public.resumo_culto(uuid), public.cuidado_da_rede(int),
  public.hoje_sp() to authenticated;
revoke execute on function public.sequencia_faltas(uuid, uuid) from authenticated;

-- ---------- Tempo real (Supabase Realtime) --------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.presencas, public.notificacoes, public.cultos;
  end if;
end $$;

-- ---------- Opcional: gerar os sábados toda segunda às 6h (Brasília) ------
-- Ative a extensão pg_cron no Supabase (Database › Extensions) e rode:
--   select cron.schedule('gerar-cultos', '0 9 * * 1', $$ select public.garantir_cultos(); $$);
-- (09:00 UTC = 06:00 em Brasília). Sem isso, os sábados são gerados ao abrir a tela "Chamada".
