-- =====================================================================
-- Sedentos · Apelido, sexo e responsável para menores de 14 anos (v4)
-- Complementa as migrações anteriores (que não são alteradas): as funções
-- abaixo substituem as versões antigas com as regras novas.
-- =====================================================================

create type public.sexo_jovem as enum ('feminino', 'masculino');

alter table public.jovens
  add column apelido text check (apelido is null or char_length(apelido) <= 30),
  add column sexo public.sexo_jovem;
create index jovens_sexo_idx on public.jovens (sexo);

-- ---------- Inconsistências: + APELIDO_AUSENTE, SEXO_AUSENTE, RESPONSAVEL_AUSENTE ----
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

  -- v4: apelido, sexo e responsável (menores de 14)
  if nullif(btrim(coalesce(j.apelido, '')), '') is null then
    c := array_append(c, 'APELIDO_AUSENTE');
  end if;
  if j.sexo is null then
    c := array_append(c, 'SEXO_AUSENTE');
  end if;
  if j.data_nascimento is not null and j.data_nascimento <= current_date
     and public.idade(j.data_nascimento) between 5 and 13  -- abaixo de 5 já é NASCIMENTO_INVALIDO
     and (j.responsavel_nome is null or j.responsavel_telefone is null) then
    c := array_append(c, 'RESPONSAVEL_AUSENTE');
  end if;

  return c;
end;
$$;

-- ---------- Gatilho BEFORE: apelido/sexo obrigatórios; responsável abaixo de 14 anos ----
-- (substitui a regra antiga dos 12 anos; o telefone do responsável pode ser igual ao do jovem)
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
  new.apelido := nullif(public.normaliza_nome(new.apelido), '');
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
    if new.apelido is null or char_length(new.apelido) < 2 or char_length(new.apelido) > 30 then
      raise exception 'Informe como você gosta de ser chamado(a): o apelido precisa ter de 2 a 30 caracteres.';
    end if;
    if new.sexo is null then
      raise exception 'Informe o sexo.';
    end if;
    if v_idade < 14 and (new.responsavel_nome is null or new.responsavel_telefone is null) then
      raise exception 'Para menores de 14 anos, informe o nome e o telefone do responsável.';
    end if;
    if new.responsavel_telefone is not null and new.responsavel_telefone !~ '^[1-9]{2}9[0-9]{8}$' then
      raise exception 'Telefone do responsável inválido. Use DDD + número, por exemplo (31) 99999-9999.';
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

-- ---------- Histórico: inclui apelido e sexo ----------------------------
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
                                   'papel','cargo_lideranca','discipulado_por','ativo','apelido','sexo'] loop
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

-- ---------- Rede: apelido e sexo; responsável sempre que estiver preenchido ----
drop function public.minha_rede();
create or replace function public.minha_rede()
returns table (
  id uuid, nome text, apelido text, sexo public.sexo_jovem, foto_url text, telefone text, data_nascimento date, idade int,
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
  select r.id, r.nome, r.apelido, r.sexo, r.foto_url, r.telefone, r.data_nascimento,
         case when r.data_nascimento <= current_date then public.idade(r.data_nascimento) end,
         r.papel, r.cargo_lideranca, r.discipulado_por,
         (select s.nome from public.jovens s where s.id = r.discipulado_por),
         r.responsavel_nome,      -- v4: sempre que estiver preenchido
         r.responsavel_telefone,
         r.nivel,
         (select count(*)::int from public.jovens c where c.discipulado_por = r.id)
    from rede r
   order by r.nivel, r.nome;
$$;
revoke execute on function public.minha_rede() from public, anon;
grant execute on function public.minha_rede() to authenticated;

-- ---------- Recalcula as inconsistências de todos (status não muda) ------
select set_config('app.sistema', 'on', true);
update public.jovens set inconsistencias = '{}';
select set_config('app.sistema', 'off', true);
