\set ON_ERROR_STOP on
\pset footer off
-- Base real, inserida como a importação faz (chave de serviço via API).
create temp table stg (id uuid, nome text, telefone text, data_nascimento date, foto_origem text,
                       tipo_foto text, email text, status text, inconsistencias text);
\copy stg from 'dados/base_jovens_importacao.csv' csv header
grant select on stg to service_role, authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'lider@sedentos.org'),
  ('00000000-0000-0000-0000-0000000000b1', 'matheus@email.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'nova@email.com'),
  ('00000000-0000-0000-0000-0000000000b3', 'intruso@email.com');
insert into public.admins values ('lider@sedentos.org');

set session authorization authenticator;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
insert into public.jovens (id, nome, telefone, data_nascimento, foto_origem, origem, status)
select id, nome, telefone, data_nascimento, foto_origem, 'importacao_planilha', 'pendente_validacao' from stg;

-- 1) Contagens batem com o briefing (e com a coluna do CSV)
\echo '== contagens por código'
select code, count(*) from public.jovens, unnest(inconsistencias) code group by code order by 2 desc, 1;
do $$
declare
  esperado jsonb := '{"EMAIL_AUSENTE":200,"FOTO_AUSENTE":87,"FOTO_LINK_EXTERNO":68,"FOTO_ARQUIVO_NAO_ENVIADO":45,
    "TELEFONE_AUSENTE":22,"TELEFONE_DUPLICADO":6,"TELEFONE_FORMATO_INVALIDO":1,"NOME_INCOMPLETO":6,
    "NOME_CAIXA_BAIXA":6,"POSSIVEL_DUPLICADO":2,"NASCIMENTO_INVALIDO":3}';
  k text; n int;
begin
  for k in select jsonb_object_keys(esperado) loop
    select count(*) into n from public.jovens where k = any(inconsistencias);
    assert n = (esperado->>k)::int, format('%s: %s (esperado %s)', k, n, esperado->>k);
  end loop;
  select count(*) into n from public.jovens j join stg s using (id)
   where array_to_string(array(select x from unnest(j.inconsistencias) x
                               where x not in ('APELIDO_AUSENTE', 'SEXO_AUSENTE', 'RESPONSAVEL_AUSENTE')), ';') <> s.inconsistencias;
  assert n = 0, format('%s registros diferentes da coluna do CSV', n);
  assert (select count(*) from public.jovens_historico where acao = 'importacao') = 200;
  -- Telefone: o banco grava exatamente os dígitos do CSV (nada some, nada sobra).
  assert (select telefone from public.jovens where nome = 'Alicia Ribeiro de Oliveira') = '31972454210', 'telefone da Alicia';
  select count(*) into n from public.jovens j join stg s using (id)
   where j.telefone is distinct from nullif(regexp_replace(coalesce(s.telefone, ''), '\D', '', 'g'), '');
  assert n = 0, format('%s telefones diferentes do CSV', n);
end $$;
\echo 'OK contagens'

-- 2) Visitante sem login não vê nada
set role anon;
do $$ begin
  begin perform 1 from public.jovens; raise exception 'anon leu jovens';
  exception when insufficient_privilege then null; end;
end $$;
\echo 'OK anon bloqueado'

-- 3) Jovem logado: não vê ninguém, busca exige telefone + nascimento
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"matheus@email.com","role":"authenticated"}', false);
do $$
declare v_id uuid; v_nome text; n int;
begin
  select count(*) into n from public.jovens;  assert n = 0, 'jovem viu outros registros';
  select count(*) into n from public.buscar_cadastro_antigo('31999084403', '1999-01-01');
  assert n = 0, 'achou só pelo telefone';
  select id, primeiro_nome into v_id, v_nome from public.buscar_cadastro_antigo('(31) 99908-4403', '2000-10-08');
  assert v_nome = 'Matheus', 'primeiro nome: ' || coalesce(v_nome, 'null');
  perform public.vincular_cadastro(v_id, '31999084403', '2000-10-08');
  select count(*) into n from public.jovens;  assert n = 1, 'após vincular deve ver só o próprio';
  assert not exists (select 1 from public.jovens where 'EMAIL_AUSENTE' = any(inconsistencias)), 'EMAIL_AUSENTE não saiu';
  -- tenta se autovalidar e mudar e-mail: ignorado; e corrige o nome
  update public.jovens set status = 'validado', email = 'outro@x.com', observacoes_admin = 'hack',
         nome = 'Matheus Gabriel Ramires Machado', consentimento_em = now(), apelido = 'Matheus', sexo = 'masculino';
  assert (select status from public.jovens) = 'pendente_validacao', 'jovem se autovalidou';
  assert (select email from public.jovens) = 'matheus@email.com', 'jovem trocou e-mail';
  assert (select observacoes_admin from public.jovens) is null, 'jovem escreveu observação';
  -- validações do back
  begin update public.jovens set nome = 'Matheus'; raise exception 'aceitou nome incompleto';
  exception when raise_exception then if sqlerrm not like 'Informe seu nome%' then raise; end if; end;
  begin update public.jovens set telefone = '123'; raise exception 'aceitou telefone ruim';
  exception when raise_exception then if sqlerrm not like 'Telefone inválido%' then raise; end if; end;
  begin update public.jovens set foto_url = 'outra-pessoa/x.jpg'; raise exception 'aceitou foto alheia';
  exception when raise_exception then if sqlerrm not like 'Foto inválida%' then raise; end if; end;
  begin perform public.listar_duplicados(); raise exception 'jovem listou duplicados';
  exception when raise_exception then if sqlerrm not like 'Apenas%' then raise; end if; end;
end $$;
\echo 'OK vinculação e travas do jovem'

-- 4) Autocadastro novo + regra do responsável (< 12 anos)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","email":"nova@email.com","role":"authenticated"}', false);
do $$ begin
  begin
    insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, apelido, sexo)
    values (auth.uid(), 'Ana Nova Silva', '31988887777', current_date - interval '10 years', now(), 'Aninha', 'feminino');
    raise exception 'aceitou menor sem responsável';
  exception when raise_exception then if sqlerrm not like 'Para menores de 1%' then raise; end if; end;
  insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, responsavel_nome, responsavel_telefone,
                             foto_url, status, origem, apelido, sexo)
  values (auth.uid(), 'Ana  Nova   Silva ', '(31) 98888-7777', current_date - interval '10 years', now(), 'Mãe da Ana', '31977776666',
          auth.uid()::text || '/foto.jpg', 'validado', 'importacao_planilha', 'Aninha', 'feminino');
  assert (select status from public.jovens) = 'pendente_validacao';
  assert (select origem from public.jovens) = 'autocadastro';
  assert (select nome from public.jovens) = 'Ana Nova Silva';
  assert (select email from public.jovens) = 'nova@email.com';
  assert (select inconsistencias from public.jovens) = '{}', 'cadastro novo completo deveria estar limpo';
end $$;
\echo 'OK autocadastro'

-- 5) Intruso não vincula registro dos outros sem os dados certos
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","email":"intruso@email.com","role":"authenticated"}', false);
do $$ begin
  begin
    perform public.vincular_cadastro((select id from stg where nome = 'Arthur'), '31973550964', '2000-01-01');
    raise exception 'vinculou com nascimento errado';
  exception when raise_exception then if sqlerrm not like 'Não foi possível%' then raise; end if; end;
end $$;
\echo 'OK intruso'

-- 6) Admin: vê tudo, valida, histórico, duplicados, mesclagem
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"lider@sedentos.org","role":"authenticated"}', false);
do $$
declare v uuid; a uuid; b uuid; n int; r public.jovens;
begin
  select count(*) into n from public.jovens; assert n = 201, 'admin vê ' || n;
  select id into v from public.jovens where nome = 'Arthur';
  update public.jovens set status = 'validado' where id = v;
  select * into r from public.jovens where id = v;
  assert r.validado_por = 'lider@sedentos.org' and r.validado_em is not null, 'carimbo de validação';
  update public.jovens set nome = 'Arthur Souza' where id = v;
  assert not exists (select 1 from public.jovens where id = v and 'NOME_INCOMPLETO' = any(inconsistencias)), 'código não saiu';
  assert exists (select 1 from public.jovens_historico where jovem_id = v and acao = 'edicao' and campos ? 'nome'), 'histórico';

  select count(*) into n from public.listar_duplicados(); assert n = 3, 'duplicados: ' || n;

  -- Giovanna: mescla e o alerta some dos dois lados
  select a_id, b_id into a, b from public.listar_duplicados() where motivo = 'Mesmo nome e telefone';
  perform public.mesclar_jovens(a, b, jsonb_build_object('foto_origem',
          (select foto_origem from public.jovens where id in (a, b) and foto_origem is not null limit 1)));
  select * into r from public.jovens where id = a;
  assert not ('POSSIVEL_DUPLICADO' = any(r.inconsistencias) or 'TELEFONE_DUPLICADO' = any(r.inconsistencias)), 'alerta ficou: ' || r.inconsistencias::text;
  assert 'FOTO_LINK_EXTERNO' = any(r.inconsistencias), 'manteve a foto do Drive';

  -- Enzo/Ismael: pessoas diferentes
  select a_id, b_id into a, b from public.listar_duplicados() where not mesmo_nascimento;
  perform public.ignorar_duplicado(a, b);
  select count(*) into n from public.listar_duplicados(); assert n = 1, 'sobrou ' || n;

  -- Telefone repetido do Matheus some quando o telefone de um muda
  select id into a from public.jovens where nome = 'Matheus Gabriel Ramires Machado' and user_id is null;
  update public.jovens set telefone = '31911112222' where id = a;
  select count(*) into n from public.jovens where 'TELEFONE_DUPLICADO' = any(inconsistencias);
  assert n = 2, 'TELEFONE_DUPLICADO restante: ' || n;   -- só Enzo e Ismael
end $$;
\echo 'OK admin'

-- 7) Storage: jovem só na própria pasta
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","email":"nova@email.com","role":"authenticated"}', false);
insert into storage.objects (bucket_id, name) values ('fotos', '00000000-0000-0000-0000-0000000000b2/foto.jpg');
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('fotos', 'admin/x/foto.jpg'); raise exception 'subiu em pasta alheia';
  exception when insufficient_privilege then null; end;
end $$;
\echo 'OK storage'
\echo 'TODOS OS TESTES PASSARAM'
