\set ON_ERROR_STOP on
\pset footer off
-- Testes da Rede de discipulado. Rodar depois de 00, das duas migrações e de 01_testes.sql.
reset role;
reset session authorization;
grant select on auth.users to authenticated;  -- só para o atalho de login dos testes

insert into auth.users values
  ('10000000-0000-0000-0000-0000000000a1', 'lider.ana@rede.org'),
  ('10000000-0000-0000-0000-0000000000a2', 'lider.bruno@rede.org'),
  ('10000000-0000-0000-0000-0000000000d1', 'disc.carla@rede.org'),
  ('10000000-0000-0000-0000-0000000000d2', 'disc.davi@rede.org'),
  ('10000000-0000-0000-0000-0000000000d3', 'disc.elias@rede.org'),
  ('10000000-0000-0000-0000-0000000000f1', 'jovem.fabi@rede.org'),
  ('10000000-0000-0000-0000-0000000000c9', 'novo.lider@rede.org');

-- Fixture: L1 (Ana) → D1 (Carla), D2 (Davi); L2 (Bruno) → D3 (Elias)
-- D1 → J1 (Fabi), J2 (Gabi); D2 → J3 (Hugo); D3 → J4 (Iara)
set session authorization authenticator;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \gset
insert into public.jovens (id, user_id, email, nome, telefone, data_nascimento, papel, cargo_lideranca, foto_url, origem) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'lider.ana@rede.org',   'Ana Lider Rede',     '31990000001', '1990-01-01', 'lideranca', 'Líder de jovens', null, 'autocadastro'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a2', 'lider.bruno@rede.org', 'Bruno Lider Rede',   '31990000002', '1988-01-01', 'lideranca', null, null, 'autocadastro'),
  ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'disc.carla@rede.org',  'Carla Disc Rede',    '31990000003', '1998-01-01', 'discipulador', null, null, 'autocadastro'),
  ('20000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000d2', 'disc.davi@rede.org',   'Davi Disc Rede',     '31990000004', '1997-01-01', 'discipulador', null, null, 'autocadastro'),
  ('20000000-0000-0000-0000-0000000000d3', '10000000-0000-0000-0000-0000000000d3', 'disc.elias@rede.org',  'Elias Disc Rede',    '31990000005', '1996-01-01', 'discipulador', null, null, 'autocadastro'),
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'jovem.fabi@rede.org',  'Fabi Jovem Rede',    '31990000006', '2010-05-05', 'jovem', null, 'admin/f1/foto.jpg', 'autocadastro'),
  ('20000000-0000-0000-0000-0000000000f2', null, null,                                                      'Gabi Jovem Rede',    '31990000007', '2009-06-06', 'jovem', null, null, 'autocadastro'),
  ('20000000-0000-0000-0000-0000000000f3', null, null,                                                      'Hugo Jovem Rede',    '31990000008', '2008-07-07', 'jovem', null, null, 'autocadastro'),
  ('20000000-0000-0000-0000-0000000000f4', null, null,                                                      'Iara Jovem Rede',    '31990000009', '2007-08-08', 'jovem', null, 'admin/f4/foto.jpg', 'autocadastro');
update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000a1' where id in ('20000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d2');
update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000a2' where id = '20000000-0000-0000-0000-0000000000d3';
update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000d1' where id in ('20000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f2');
update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000d2' where id = '20000000-0000-0000-0000-0000000000f3';
update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000d3' where id = '20000000-0000-0000-0000-0000000000f4';
insert into storage.objects (bucket_id, name) values ('fotos', 'admin/f1/foto.jpg'), ('fotos', 'admin/f4/foto.jpg');

-- Atalhos de login para os testes
create or replace function pg_temp.entrar(p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email), 'email', p_email, 'role', 'authenticated')::text, false);
$$;
\echo 'Fixture pronta'

-- 1) Regras de vínculo (como admin)
set role authenticated;
select pg_temp.entrar('lider@sedentos.org');
do $$
begin
  assert not exists (select 1 from public.jovens where origem = 'importacao_planilha' and papel <> 'jovem'), 'importados ficam como jovem';
  assert (select count(*) from public.jovens where origem = 'importacao_planilha') >= 199, 'admin vê a base';
  begin update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000f2' where id = '20000000-0000-0000-0000-0000000000f1';
        raise exception 'jovem apontou para jovem';
  exception when raise_exception then if sqlerrm not like 'Um jovem só pode%' then raise; end if; end;
  begin update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000a2' where id = '20000000-0000-0000-0000-0000000000a1';
        raise exception 'liderança ganhou vínculo';
  exception when raise_exception then if sqlerrm not like 'A Liderança não tem%' then raise; end if; end;
  begin update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000d2' where id = '20000000-0000-0000-0000-0000000000d1';
        raise exception 'discipulador apontou para discipulador';
  exception when raise_exception then if sqlerrm not like 'Um discipulador só pode%' then raise; end if; end;
  begin update public.jovens set discipulado_por = id where id = '20000000-0000-0000-0000-0000000000d1';
        raise exception 'apontou para si';
  exception when raise_exception then if sqlerrm not like '%ela mesma%' then raise; end if; end;
  -- vínculo vazio é permitido (vira pendência) e não gera inconsistência
  update public.jovens set discipulado_por = null where id = '20000000-0000-0000-0000-0000000000f3';
  update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000d2' where id = '20000000-0000-0000-0000-0000000000f3';
  assert exists (select 1 from public.jovens_historico where jovem_id = '20000000-0000-0000-0000-0000000000f3'
                 and campos -> 'discipulado_por' ->> 'para' = 'Davi Disc Rede'), 'histórico do vínculo com nome';
end $$;
\echo 'OK regras de vínculo'

-- 2) Bloqueio de mudança de papel e transferência
do $$
declare n int;
begin
  begin update public.jovens set papel = 'jovem' where id = '20000000-0000-0000-0000-0000000000d1';
        raise exception 'mudou papel com discípulos';
  exception when raise_exception then if sqlerrm not like '%Transfira antes%' then raise; end if; end;
  n := public.transferir_discipulos('20000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d2');
  assert n = 2, 'transferiu ' || n;
  update public.jovens set papel = 'jovem' where id = '20000000-0000-0000-0000-0000000000d1';
  assert (select discipulado_por from public.jovens where id = '20000000-0000-0000-0000-0000000000d1') is null, 'vínculo antigo limpo';
  -- volta Carla a discipuladora, sem discípulos
  update public.jovens set papel = 'discipulador', discipulado_por = '20000000-0000-0000-0000-0000000000a1' where id = '20000000-0000-0000-0000-0000000000d1';
  -- liderança com discipuladores também é bloqueada
  begin update public.jovens set papel = 'discipulador' where id = '20000000-0000-0000-0000-0000000000a2';
        raise exception 'liderança mudou com discipuladores';
  exception when raise_exception then if sqlerrm not like '%Transfira antes%' then raise; end if; end;
  -- ações em massa devolvem as falhas sem parar
  select count(*) into n from public.rede_atribuir(array['20000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-0000000000a1']::uuid[], '20000000-0000-0000-0000-0000000000d2');
  assert n = 1, 'falhas na ação em massa: ' || n;
end $$;
\echo 'OK papel e transferência'

-- 3) Discipulador A não enxerga a rede do discipulador B
select pg_temp.entrar('disc.davi@rede.org');     -- Davi: Fabi, Gabi, Hugo
do $$
declare n int;
begin
  select count(*) into n from public.jovens; assert n = 1, 'tabela jovens deve mostrar só o próprio: ' || n;
  select count(*) into n from public.minha_rede() where nivel = 1; assert n = 3, 'Davi deveria ver 3: ' || n;
  assert not exists (select 1 from public.minha_rede() where nome like 'Iara%'), 'Davi viu Iara';
  assert (select discipulador_nome from public.minha_rede() where nivel = 0) = 'Ana Lider Rede', 'nome da liderança';
  assert (select responsavel_nome is null from public.minha_rede() where nome like 'Fabi%'), 'campos ok';
  select count(*) into n from storage.objects where name = 'admin/f1/foto.jpg'; assert n = 1, 'Davi não vê foto da Fabi';
  select count(*) into n from storage.objects where name = 'admin/f4/foto.jpg'; assert n = 0, 'Davi viu foto da Iara';
  insert into public.anotacoes_discipulado (jovem_id, tipo, texto) values ('20000000-0000-0000-0000-0000000000f1', 'acompanhamento', 'Conversamos sobre a escola.');
  begin insert into public.anotacoes_discipulado (jovem_id, texto) values ('20000000-0000-0000-0000-0000000000f4', 'x');
        raise exception 'Davi anotou sobre Iara';
  exception when insufficient_privilege then null; end;
  begin update public.jovens set nome = 'Hack' where id = '20000000-0000-0000-0000-0000000000f1';
  end;
  assert (select count(*) from public.jovens where nome = 'Hack') = 0, 'discipulador editou discípulo';
end $$;
select pg_temp.entrar('disc.elias@rede.org');    -- Elias: só Iara
do $$
declare n int;
begin
  select count(*) into n from public.minha_rede() where nivel = 1; assert n = 1, 'Elias deveria ver 1: ' || n;
  select count(*) into n from public.anotacoes_discipulado; assert n = 0, 'Elias viu anotação de outro';
  select count(*) into n from storage.objects where name = 'admin/f1/foto.jpg'; assert n = 0, 'Elias viu foto da Fabi';
end $$;
\echo 'OK isolamento entre discipuladores'

-- 4) O jovem não vê anotações nem muda papel/vínculo
select pg_temp.entrar('jovem.fabi@rede.org');
do $$
begin
  assert (select count(*) from public.anotacoes_discipulado) = 0, 'jovem viu anotação sobre ele';
  update public.jovens set papel = 'lideranca', discipulado_por = null, consentimento_em = now(), apelido = 'Fabi', sexo = 'feminino';
  assert (select papel from public.jovens) = 'jovem', 'jovem mudou o papel';
  assert (select discipulado_por from public.jovens) = '20000000-0000-0000-0000-0000000000d2', 'jovem mudou o vínculo';
  assert (select count(*) from public.minha_rede()) = 1, 'jovem só vê a si';
  begin insert into public.anotacoes_discipulado (jovem_id, texto) values ('20000000-0000-0000-0000-0000000000f2', 'x');
        raise exception 'jovem anotou';
  exception when insufficient_privilege then null; end;
end $$;
\echo 'OK jovem'

-- 5) Liderança vê toda a sua rede e nada da outra
select pg_temp.entrar('lider.ana@rede.org');     -- Ana: Carla, Davi (+ Fabi, Gabi, Hugo)
do $$
declare n int;
begin
  select count(*) into n from public.minha_rede() where nivel > 0; assert n = 5, 'Ana deveria ver 5: ' || n;
  assert not exists (select 1 from public.minha_rede() where nome like 'Iara%' or nome like 'Elias%'), 'Ana viu rede do Bruno';
  select count(*) into n from public.anotacoes_discipulado; assert n = 1, 'Ana deveria ver a anotação do Davi';
  insert into public.anotacoes_discipulado (jovem_id, tipo, texto) values ('20000000-0000-0000-0000-0000000000d2', 'conquista', 'Davi concluiu o curso.');
  select count(*) into n from storage.objects where name = 'admin/f1/foto.jpg'; assert n = 1, 'Ana não vê foto da rede';
end $$;
select pg_temp.entrar('lider.bruno@rede.org');
do $$ begin
  assert (select count(*) from public.anotacoes_discipulado) = 0, 'Bruno viu anotações da Ana';
  assert (select count(*) from public.minha_rede() where nivel > 0) = 2, 'Bruno: Elias e Iara';
end $$;
-- Davi (discipulado por Ana) não vê a anotação da Ana sobre ele
select pg_temp.entrar('disc.davi@rede.org');
do $$ begin
  assert (select count(*) from public.anotacoes_discipulado) = 1, 'Davi só vê a que ele escreveu';
end $$;
\echo 'OK liderança'

-- 6) Prazo de 24h para editar/apagar
reset role;
reset session authorization;
set session_replication_role = replica;  -- o gatilho protege criado_em; aqui simulamos o tempo passando
update public.anotacoes_discipulado set criado_em = now() - interval '2 days' where texto like 'Conversamos%';
set session_replication_role = origin;
set session authorization authenticator;
set role authenticated;
do $$
declare n int;
begin
  update public.anotacoes_discipulado set texto = 'editado' where texto like 'Conversamos%';
  get diagnostics n = row_count; assert n = 0, 'editou depois de 24h';
end $$;
select pg_temp.entrar('lider.ana@rede.org');
do $$
declare n int;
begin
  update public.anotacoes_discipulado set texto = 'Davi concluiu o curso de discipulado.' where tipo = 'conquista';
  get diagnostics n = row_count; assert n = 1, 'autora não editou dentro de 24h';
  assert (select editado_em is not null from public.anotacoes_discipulado where tipo = 'conquista');
end $$;
-- Discípulo transferido: o discipulador antigo perde acesso às anotações
select pg_temp.entrar('lider@sedentos.org');
update public.jovens set discipulado_por = '20000000-0000-0000-0000-0000000000d3' where id = '20000000-0000-0000-0000-0000000000f1';
select pg_temp.entrar('disc.davi@rede.org');
do $$ begin
  assert (select count(*) from public.anotacoes_discipulado) = 0, 'Davi manteve acesso após transferência';
end $$;
\echo 'OK anotações (24h e transferência)'

-- 7) Mesclagem preserva papel e redireciona discípulos
select pg_temp.entrar('lider@sedentos.org');
do $$
declare r public.jovens;
begin
  -- "Davi" duplicado como jovem simples, sem e-mail
  insert into public.jovens (id, nome, telefone, data_nascimento, discipulado_por, origem)
  values ('20000000-0000-0000-0000-0000000000e9', 'Davi Disc Rede', '31990000004', '1997-01-01', '20000000-0000-0000-0000-0000000000d3', 'importacao_planilha');
  -- mantém o registro "jovem" e remove o discipulador: o mantido sobe para discipulador
  r := public.mesclar_jovens('20000000-0000-0000-0000-0000000000e9', '20000000-0000-0000-0000-0000000000d2', '{}');
  assert r.papel = 'discipulador', 'papel mais alto: ' || r.papel;
  assert r.discipulado_por = '20000000-0000-0000-0000-0000000000a1', 'vínculo do discipulador';
  assert r.email = 'disc.davi@rede.org', 'login preservado';
  assert (select count(*) from public.jovens where discipulado_por = r.id) = 2, 'discípulos redirecionados';
  assert (select count(*) from public.anotacoes_discipulado where jovem_id = r.id) = 1, 'anotações redirecionadas';
end $$;
\echo 'OK mesclagem'

-- 8) Vinculação automática por e-mail preenchido pelo admin
do $$ begin
  insert into public.jovens (nome, telefone, data_nascimento, email, papel, origem)
  values ('Novo Lider Teste', '31990000010', '1985-01-01', 'novo.lider@rede.org', 'lideranca', 'importacao_planilha');
end $$;
select pg_temp.entrar('novo.lider@rede.org');
do $$ begin
  assert (select count(*) from public.jovens) = 0, 'ainda não ligado';
  assert public.vincular_por_email(), 'não vinculou';
  assert (select count(*) from public.jovens) = 1, 'não vê o próprio cadastro';
  assert public.eh_lideranca(), 'papel após vincular';
end $$;
\echo 'OK vinculação por e-mail'
\echo 'TODOS OS TESTES DA REDE PASSARAM'
