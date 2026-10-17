\set ON_ERROR_STOP on
\pset footer off
-- Testes de apelido, sexo e responsável (< 14 anos). Rodar depois de 00, das quatro migrações e de 01 a 03.
reset role;
reset session authorization;
insert into auth.users values
  ('60000000-0000-0000-0000-000000000001', 'v4.treze@email.com'),
  ('60000000-0000-0000-0000-000000000002', 'v4.quatorze@email.com'),
  ('60000000-0000-0000-0000-000000000003', 'v4.semapelido@email.com');
set session authorization authenticator;
set role authenticated;
create or replace function pg_temp.entrar(p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email), 'email', p_email, 'role', 'authenticated')::text, false);
$$;

-- 1) Base importada: inconsistências novas; validados continuam validados
select pg_temp.entrar('lider@sedentos.org');
do $$
declare n int; m int;
begin
  select count(*) into n from public.jovens where origem = 'importacao_planilha' and apelido is null and sexo is null;
  select count(*) into m from public.jovens where origem = 'importacao_planilha' and 'APELIDO_AUSENTE' = any(inconsistencias) and 'SEXO_AUSENTE' = any(inconsistencias);
  assert n > 190 and n = m, format('importados sem apelido/sexo %s, com as duas inconsistências %s', n, m);
  assert not exists (select 1 from public.jovens where apelido is not null and 'APELIDO_AUSENTE' = any(inconsistencias)), 'código indevido';
  assert (select status from public.jovens where nome = 'Arthur Souza') = 'validado', 'validado voltou a pendente';
  assert exists (select 1 from public.jovens where origem = 'importacao_planilha' and 'RESPONSAVEL_AUSENTE' = any(inconsistencias)), 'menores de 14 importados sem responsável';
  assert not exists (select 1 from public.jovens where 'RESPONSAVEL_AUSENTE' = any(inconsistencias)
                     and (data_nascimento is null or public.idade(data_nascimento) >= 14)), 'RESPONSAVEL_AUSENTE para 14+';
  assert not exists (select 1 from public.jovens where 'RESPONSAVEL_AUSENTE' = any(inconsistencias)
                     and 'NASCIMENTO_INVALIDO' = any(inconsistencias)), 'RESPONSAVEL_AUSENTE com nascimento inválido';
  -- admin completa e o código sai
  update public.jovens set apelido = 'Arthur', sexo = 'masculino' where nome = 'Arthur Souza';
  assert not exists (select 1 from public.jovens where nome = 'Arthur Souza' and ('APELIDO_AUSENTE' = any(inconsistencias) or 'SEXO_AUSENTE' = any(inconsistencias)));
  assert exists (select 1 from public.jovens_historico h join public.jovens j on j.id = h.jovem_id
                 where j.nome = 'Arthur Souza' and h.campos ? 'apelido' and h.campos ? 'sexo'), 'histórico de apelido/sexo';
  -- ação em massa "Definir sexo"
  update public.jovens set sexo = 'feminino' where nome in ('Alicia Ribeiro de Oliveira', 'Alissa Alves');
  assert (select count(*) from public.jovens where nome in ('Alicia Ribeiro de Oliveira', 'Alissa Alves') and sexo = 'feminino') = 2;
end $$;
\echo 'OK base importada'

-- 2) Autocadastro: apelido e sexo obrigatórios
select pg_temp.entrar('v4.semapelido@email.com');
do $$ begin
  begin
    insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, sexo)
    values (auth.uid(), 'Paulo Sem Apelido', '31992000001', '2000-01-01', now(), 'masculino');
    raise exception 'aceitou sem apelido';
  exception when raise_exception then if sqlerrm not like 'Informe como você gosta%' then raise; end if; end;
  begin
    insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, apelido)
    values (auth.uid(), 'Paulo Sem Sexo', '31992000001', '2000-01-01', now(), 'Paulinho');
    raise exception 'aceitou sem sexo';
  exception when raise_exception then if sqlerrm not like 'Informe o sexo%' then raise; end if; end;
  begin
    insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, apelido, sexo)
    values (auth.uid(), 'Paulo Apelido Curto', '31992000001', '2000-01-01', now(), 'P', 'masculino');
    raise exception 'aceitou apelido de 1 letra';
  exception when raise_exception then if sqlerrm not like 'Informe como você gosta%' then raise; end if; end;
  insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, apelido, sexo)
  values (auth.uid(), 'Paulo Com Tudo', '31992000001', '2000-01-01', now(), '  Paulinho   da  Vila ', 'masculino');
  assert (select apelido from public.jovens) = 'Paulinho da Vila', 'apelido normalizado';
  -- não consegue apagar depois
  begin update public.jovens set apelido = null; raise exception 'apagou o apelido';
  exception when raise_exception then if sqlerrm not like 'Informe como você gosta%' then raise; end if; end;
  begin update public.jovens set sexo = null; raise exception 'apagou o sexo';
  exception when raise_exception then if sqlerrm not like 'Informe o sexo%' then raise; end if; end;
  update public.jovens set apelido = 'Paulão';
  assert (select apelido from public.jovens) = 'Paulão', 'trocar por outro valor válido';
end $$;
\echo 'OK apelido e sexo'

-- 3) Responsável: obrigatório abaixo de 14; telefone igual ao do jovem não duplica
select pg_temp.entrar('v4.treze@email.com');
do $$ begin
  begin
    insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, apelido, sexo)
    values (auth.uid(), 'Clara Treze Anos', '31992000002', current_date - interval '13 years', now(), 'Clarinha', 'feminino');
    raise exception 'aceitou 13 anos sem responsável';
  exception when raise_exception then if sqlerrm <> 'Para menores de 14 anos, informe o nome e o telefone do responsável.' then raise; end if; end;
  insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, apelido, sexo, responsavel_nome, responsavel_telefone)
  values (auth.uid(), 'Clara Treze Anos', '(31) 99200-0002', current_date - interval '13 years', now(), 'Clarinha', 'feminino', 'Marta Mãe', '31992000002');
  assert (select inconsistencias from public.jovens) = '{FOTO_AUSENTE}', 'telefone do responsável igual gerou inconsistência: ' || (select inconsistencias::text from public.jovens);
end $$;
select pg_temp.entrar('v4.quatorze@email.com');
do $$ begin
  insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, apelido, sexo)
  values (auth.uid(), 'Davi Quatorze Anos', '31992000003', current_date - interval '14 years', now(), 'Davizinho', 'masculino');
  assert (select inconsistencias from public.jovens) = '{FOTO_AUSENTE}', '14 anos sem responsável: ' || (select inconsistencias::text from public.jovens);
end $$;
\echo 'OK responsável'

-- 4) Rede: responsável aparece sempre que preenchido; apelido disponível
select pg_temp.entrar('disc.elias@rede.org');
do $$ begin
  assert exists (select 1 from public.minha_rede() where nivel = 0), 'minha_rede com as colunas novas';
end $$;
\echo 'TODOS OS TESTES DO APELIDO/SEXO PASSARAM'
