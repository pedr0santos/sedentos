\set ON_ERROR_STOP on
\pset footer off
-- Testes da v6 (acessos e secretários). Rodar depois de 00, de todas as migrações e de 01 a 04.
-- O principal: provar que o secretário NÃO vê nada além do permitido.
reset role;
reset session authorization;

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000001', 'maria.chamada@chamada.sedentos.app'),
  ('70000000-0000-0000-0000-000000000002', 'joao.porta@chamada.sedentos.app'),
  ('70000000-0000-0000-0000-000000000003', 'outro.nome@chamada.sedentos.app');
insert into public.secretarios (id, user_id, usuario, email, nome, criado_por) values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'maria.chamada',
   'maria.chamada@chamada.sedentos.app', 'Maria da Chamada', 'lider@sedentos.org');
insert into public.cultos (id, data) values
  ('72000000-0000-0000-0000-000000000001', '2026-08-01'),
  ('72000000-0000-0000-0000-000000000002', '2026-08-08'),
  ('72000000-0000-0000-0000-000000000003', '2026-08-15');
-- Fotos: Bia (ativa) e Ivo (inativo, do teste 03).
update public.jovens set foto_url = 'admin/b1/foto.jpg' where id = '40000000-0000-0000-0000-0000000000b1';
update public.jovens set foto_url = 'admin/b5/foto.jpg' where id = '40000000-0000-0000-0000-0000000000b5';
insert into storage.objects (bucket_id, name) values ('fotos', 'admin/b1/foto.jpg'), ('fotos', 'admin/b5/foto.jpg');
-- Uma anotação e um aviso existentes, para provar que o secretário não os vê.
insert into public.anotacoes_discipulado (jovem_id, autor_id, autor_email, tipo, texto)
values ('40000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000d1', 'ch.disc1@rede.org', 'acompanhamento', 'Texto sigiloso');

set session authorization authenticator;
set role authenticated;
create or replace function pg_temp.entrar(p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email), 'email', p_email, 'role', 'authenticated')::text, false);
$$;
\echo 'Fixture pronta'

-- 0) Faixas etárias
do $$ begin
  assert public.faixa_etaria(11) = 'Abaixo de 12';
  assert public.faixa_etaria(12) = '12 a 14' and public.faixa_etaria(14) = '12 a 14';
  assert public.faixa_etaria(15) = '15 a 17' and public.faixa_etaria(17) = '15 a 17';
  assert public.faixa_etaria(18) = '18 e 19' and public.faixa_etaria(19) = '18 e 19';
  assert public.faixa_etaria(20) = '20 e 21' and public.faixa_etaria(29) = '28 e 29';
  assert public.faixa_etaria(30) = '30+' and public.faixa_etaria(80) = '30+';
  assert public.faixa_etaria(null) = 'Sem data válida';
  assert public.faixa_etaria_de(current_date + 1) = 'Sem data válida';
  assert public.faixa_etaria_de((current_date - interval '3 years')::date) = 'Sem data válida';
end $$;
\echo 'OK faixas etárias'

-- 1) Admin justifica a falta da Sami no culto 2 (o motivo NÃO pode aparecer para o secretário)
select pg_temp.entrar('lider@sedentos.org');
do $$ begin
  perform public.marcar_presenca('72000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000b4', 'justificada', 'Doente');
end $$;

-- 2) Secretário: não vê NADA por consulta direta
select pg_temp.entrar('maria.chamada@chamada.sedentos.app');
do $$
declare a jsonb;
begin
  a := public.meus_acessos();
  assert (a->>'secretario')::boolean and not (a->>'admin')::boolean and not (a->>'jovem')::boolean
     and not (a->>'discipulador')::boolean and not (a->>'lideranca')::boolean, 'meus_acessos: ' || a::text;
  assert (select count(*) from public.jovens) = 0, 'secretário viu jovens';
  assert (select count(*) from public.presencas) = 0, 'secretário viu presencas';
  assert (select count(*) from public.notificacoes) = 0, 'secretário viu notificacoes';
  assert (select count(*) from public.anotacoes_discipulado) = 0, 'secretário viu anotações';
  assert (select count(*) from public.jovens_historico) = 0, 'secretário viu histórico';
  assert (select count(*) from public.secretarios) = 0, 'secretário viu secretarios';
  assert (select count(*) from public.admins) = 0, 'secretário viu admins';
  assert (select count(*) from public.acessos_log) = 0, 'secretário viu o log';
  assert (select count(*) from public.config_rede) = 0, 'secretário viu config_rede';
  assert (select count(*) from public.duplicados_ignorados) = 0, 'secretário viu duplicados';
  assert (select count(*) from public.minha_rede()) = 0, 'minha_rede devolveu algo';
  assert (select count(*) from public.buscar_cadastro_antigo('31991000005', '2009-01-01')) = 0, 'buscou cadastro antigo';
  assert (select count(*) from public.cultos) > 0, 'secretário precisa ver os cultos';
end $$;
\echo 'OK secretário não vê tabelas'

-- 3) Secretário: dá erro no que não é dele
do $$
declare f text;
begin
  foreach f in array array[
    'select public.criar_culto_extra(''2026-08-22'')',
    'select * from public.listar_duplicados()',
    'select * from public.rede_atribuir(array[''40000000-0000-0000-0000-0000000000b3''::uuid], null)',
    'select * from public.cuidado_da_rede()',
    'select * from public.lista_chamada_admin(''72000000-0000-0000-0000-000000000001'')',
    'select public.resumo_culto(''72000000-0000-0000-0000-000000000001'')',
    'select public.sequencia_faltas(''40000000-0000-0000-0000-0000000000b1'', ''72000000-0000-0000-0000-000000000001'')',
    'select public.secretario_atualizar(''71000000-0000-0000-0000-000000000001'', ''X'', true)',
    'select public.secretario_remover(''71000000-0000-0000-0000-000000000001'')',
    'select * from public.lista_admins()',
    'select * from public.acessos_rede()',
    'select public.mesclar_jovens(''40000000-0000-0000-0000-0000000000b2'', ''40000000-0000-0000-0000-0000000000b3'', ''{}'')'
  ] loop
    begin
      execute f;
      raise exception 'secretário conseguiu: %', f;
    exception
      when raise_exception then if sqlerrm like 'secretário conseguiu%' then raise; end if;
      when insufficient_privilege then null;
    end;
  end loop;
  -- não cria cadastro de jovem nem grava direto
  begin
    insert into public.jovens (user_id, nome, telefone, data_nascimento, consentimento_em, apelido, sexo)
    values (auth.uid(), 'Maria Secretaria', '31990000001', '2000-01-01', now(), 'Maria', 'feminino');
    raise exception 'secretário criou cadastro de jovem';
  exception when raise_exception then if sqlerrm not like 'Contas de secretário%' then raise; end if; end;
  begin
    insert into public.presencas (culto_id, jovem_id, estado) values ('72000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b1', 'presente');
    raise exception 'inseriu presença direto';
  exception when insufficient_privilege then null; end;
  begin
    update public.cultos set titulo = 'x';
    if found then raise exception 'editou culto direto'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into public.secretarios (user_id, usuario, email, nome) values (auth.uid(), 'eu.mesma', 'a@b.cc', 'Eu');
    raise exception 'criou secretário';
  exception when insufficient_privilege then null; end;
end $$;
\echo 'OK secretário recebe erro no que não é dele'

-- 4) Secretário faz a chamada: abrir, marcar, justificar, fechar, corrigir, cancelar, reativar
do $$
declare
  r jsonb;
  cols text[];
begin
  select proargnames into cols from pg_proc where proname = 'lista_chamada' and pronamespace = 'public'::regnamespace;
  assert cols = array['p_culto','jovem_id','nome','apelido','foto_url','estado','motivo','marcado_por_mim'], 'colunas: ' || cols::text;

  perform public.garantir_cultos();
  perform public.abrir_chamada('72000000-0000-0000-0000-000000000001');
  perform public.marcar_presenca('72000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b1', 'presente');
  perform public.marcar_presenca('72000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b2', 'justificada', 'Viagem');
  perform public.marcar_presenca('72000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b4', 'presente');
  perform public.marcar_presenca('72000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b4', null); -- desmarcar
  -- a lista: só ativos + quem tem presença; o inativo Ivo não aparece
  assert not exists (select 1 from public.lista_chamada('72000000-0000-0000-0000-000000000001') where jovem_id = '40000000-0000-0000-0000-0000000000b5'), 'inativo na lista';
  assert (select motivo from public.lista_chamada('72000000-0000-0000-0000-000000000001') where jovem_id = '40000000-0000-0000-0000-0000000000b2') = 'Viagem', 'motivo próprio';
  assert (select marcado_por_mim from public.lista_chamada('72000000-0000-0000-0000-000000000001') where jovem_id = '40000000-0000-0000-0000-0000000000b2'), 'marcado_por_mim';

  r := public.fechar_chamada('72000000-0000-0000-0000-000000000001');
  assert r ?& array['presentes','faltas','justificadas'], 'contagens: ' || r::text;
  assert not (r ? 'avisos' or r ? 'avisos_enviados' or r ? 'discipuladores_avisados' or r ? 'contatos_feitos'), 'fechamento vazou avisos: ' || r::text;
  assert (r->>'presentes')::int = 1 and (r->>'justificadas')::int = 1, r::text;
  -- corrigir depois de fechada: falta → presente
  perform public.marcar_presenca('72000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b4', 'presente');
  assert (select estado from public.lista_chamada('72000000-0000-0000-0000-000000000001') where jovem_id = '40000000-0000-0000-0000-0000000000b4') = 'presente';
  r := public.resumo_culto_secretario('72000000-0000-0000-0000-000000000001');
  assert (r->>'presentes')::int = 2, r::text;
  assert exists (select 1 from public.lista_cultos_chamada() where id = '72000000-0000-0000-0000-000000000001' and presentes = 2);

  -- motivo de justificada feita pelo admin: null para o secretário
  assert (select motivo is null and estado = 'justificada' and not marcado_por_mim
            from public.lista_chamada('72000000-0000-0000-0000-000000000002') where jovem_id = '40000000-0000-0000-0000-0000000000b4'), 'motivo do admin vazou';

  perform public.cancelar_culto('72000000-0000-0000-0000-000000000003', 'Não houve culto');
  assert (select status from public.cultos where id = '72000000-0000-0000-0000-000000000003') = 'cancelado';
  perform public.reativar_culto('72000000-0000-0000-0000-000000000003');
  assert (select status from public.cultos where id = '72000000-0000-0000-0000-000000000003') = 'agendado';
end $$;
\echo 'OK secretário faz a chamada'

-- 5) Fotos: só de jovens ativos
do $$ begin
  assert exists (select 1 from storage.objects where name = 'admin/b1/foto.jpg'), 'foto de ativo';
  assert not exists (select 1 from storage.objects where name = 'admin/b5/foto.jpg'), 'foto de inativo';
end $$;
\echo 'OK fotos'

-- 6) O fechamento feito pelo secretário gerou os avisos normalmente (visto pelo admin)
select pg_temp.entrar('lider@sedentos.org');
do $$ begin
  assert exists (select 1 from public.notificacoes where culto_id = '72000000-0000-0000-0000-000000000001' and not para_admins), 'avisos não gerados';
  assert (select motivo from public.lista_chamada('72000000-0000-0000-0000-000000000001') where jovem_id = '40000000-0000-0000-0000-0000000000b2') = 'Viagem', 'admin vê motivo';
  assert exists (select 1 from public.lista_chamada_admin('72000000-0000-0000-0000-000000000001') where discipulador_nome is not null);
end $$;
\echo 'OK avisos gerados'

-- 7) Discipulador e jovem não usam a chamada
select pg_temp.entrar('ch.disc1@rede.org');
do $$ begin
  begin perform * from public.lista_chamada('72000000-0000-0000-0000-000000000001'); raise exception 'discipulador leu a chamada';
  exception when raise_exception then if sqlerrm not like 'Apenas%' then raise; end if; end;
end $$;
\echo 'OK discipulador fora da chamada'

-- 8) Gestão de secretários (admin) e desativação imediata
select pg_temp.entrar('lider@sedentos.org');
do $$
declare s public.secretarios; u uuid;
begin
  begin perform public.secretario_registrar('70000000-0000-0000-0000-000000000003', 'joao.porta', 'João'); raise exception 'aceitou usuário diferente do login';
  exception when raise_exception then if sqlerrm not like 'Conta de login não confere%' then raise; end if; end;
  s := public.secretario_registrar('70000000-0000-0000-0000-000000000002', 'Joao.Porta', '  João   da Porta ');
  assert s.usuario = 'joao.porta' and s.nome = 'João da Porta' and s.criado_por = 'lider@sedentos.org';
  perform public.secretario_atualizar(s.id, 'João Porteiro', null);
  u := public.secretario_remover(s.id);
  assert u = '70000000-0000-0000-0000-000000000002';
  assert (select array_agg(acao order by id) from public.acessos_log where alvo = 'joao.porta')
         = array['secretario_criado', 'secretario_renomeado', 'secretario_removido'], 'log';
  perform public.secretario_atualizar('71000000-0000-0000-0000-000000000001', null, false);
end $$;
select pg_temp.entrar('maria.chamada@chamada.sedentos.app');
do $$
declare f text;
begin
  assert not (public.meus_acessos()->>'secretario')::boolean and (public.meus_acessos()->>'secretario_inativo')::boolean;
  assert (select count(*) from public.cultos) = 0, 'desativado ainda vê cultos';
  assert not exists (select 1 from storage.objects where name = 'admin/b1/foto.jpg'), 'desativado ainda vê foto';
  foreach f in array array[
    'select public.garantir_cultos()',
    'select public.abrir_chamada(''72000000-0000-0000-0000-000000000002'')',
    'select public.marcar_presenca(''72000000-0000-0000-0000-000000000002'', ''40000000-0000-0000-0000-0000000000b1'', ''presente'')',
    'select public.fechar_chamada(''72000000-0000-0000-0000-000000000002'')',
    'select public.cancelar_culto(''72000000-0000-0000-0000-000000000003'')',
    'select public.reativar_culto(''72000000-0000-0000-0000-000000000003'')',
    'select * from public.lista_chamada(''72000000-0000-0000-0000-000000000002'')',
    'select * from public.lista_cultos_chamada()',
    'select public.resumo_culto_secretario(''72000000-0000-0000-0000-000000000002'')'
  ] loop
    begin
      execute f;
      raise exception 'desativado conseguiu: %', f;
    exception when raise_exception then if sqlerrm not like 'Apenas%' then raise; end if;
    end;
  end loop;
end $$;
\echo 'OK desativado perde tudo na hora'

-- 9) Administradores pela tela
select pg_temp.entrar('lider@sedentos.org');
do $$ begin
  insert into public.admins (email) values ('  Nova.Admin@Sedentos.org ');
  assert exists (select 1 from public.admins where email = 'nova.admin@sedentos.org'), 'e-mail normalizado';
  assert exists (select 1 from public.lista_admins() where email = 'lider@sedentos.org' and sou_eu);
  begin insert into public.admins (email) values ('maria.chamada@chamada.sedentos.app'); raise exception 'secretário virou admin';
  exception when raise_exception then if sqlerrm not like 'Este e-mail é de uma conta de secretário%' then raise; end if; end;
  begin delete from public.admins where email = 'lider@sedentos.org'; raise exception 'removeu a si mesmo';
  exception when raise_exception then if sqlerrm <> 'Você não pode remover a si mesmo.' then raise; end if; end;
  delete from public.admins where email = 'nova.admin@sedentos.org';
  assert (select array_agg(acao order by id) from public.acessos_log where alvo = 'nova.admin@sedentos.org') = array['admin_adicionado', 'admin_removido'];
end $$;
reset role;
reset session authorization;
do $$ begin
  begin
    delete from public.admins where email <> 'lider@sedentos.org';
    delete from public.admins;
    raise exception 'apagou o último admin';
  exception when raise_exception then if sqlerrm <> 'Não é possível remover o último administrador.' then raise; end if; end;
end $$;
\echo 'OK administradores'
\echo 'TODOS OS TESTES DE ACESSOS PASSARAM'
