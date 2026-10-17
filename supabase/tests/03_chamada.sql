\set ON_ERROR_STOP on
\pset footer off
-- Testes da chamada dos cultos. Rodar depois de 00, das três migrações, de 01 e de 02.
reset role;
reset session authorization;

-- Base limpa para a chamada: todo mundo anterior fica inativo; montamos uma rede pequena.
update public.jovens set ativo = false;
insert into auth.users values
  ('30000000-0000-0000-0000-0000000000a1', 'ch.lider@rede.org'),
  ('30000000-0000-0000-0000-0000000000d1', 'ch.disc1@rede.org'),
  ('30000000-0000-0000-0000-0000000000d2', 'ch.disc2@rede.org'),
  ('30000000-0000-0000-0000-0000000000b1', 'ch.jovem1@rede.org');
insert into public.jovens (id, user_id, email, nome, telefone, data_nascimento, papel, origem) values
  ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'ch.lider@rede.org', 'Lia Lider Chamada',  '31991000001', '1990-01-01', 'lideranca', 'autocadastro'),
  ('40000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000d1', 'ch.disc1@rede.org', 'Dora Disc Chamada',  '31991000002', '1995-01-01', 'discipulador', 'autocadastro'),
  ('40000000-0000-0000-0000-0000000000d2', '30000000-0000-0000-0000-0000000000d2', 'ch.disc2@rede.org', 'Dino Disc Chamada',  '31991000003', '1995-02-02', 'discipulador', 'autocadastro'),
  ('40000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 'ch.jovem1@rede.org','Bia Jovem Chamada',  '31991000004', '2008-01-01', 'jovem', 'autocadastro'),
  ('40000000-0000-0000-0000-0000000000b2', null, null,                                                   'Beto Jovem Chamada', '31991000005', '2009-01-01', 'jovem', 'autocadastro'),
  ('40000000-0000-0000-0000-0000000000b3', null, null,                                                   'Caio Jovem Chamada', '31991000006', '2010-01-01', 'jovem', 'autocadastro'),
  ('40000000-0000-0000-0000-0000000000b4', null, null,                                                   'Sami Sem Disc',      '31991000007', '2007-01-01', 'jovem', 'autocadastro'),
  ('40000000-0000-0000-0000-0000000000b5', null, null,                                                   'Ivo Inativo',        '31991000008', '2006-01-01', 'jovem', 'autocadastro');
update public.jovens set discipulado_por = '40000000-0000-0000-0000-0000000000a1' where id in ('40000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000d2');
update public.jovens set discipulado_por = '40000000-0000-0000-0000-0000000000d1' where id in ('40000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000b2', '40000000-0000-0000-0000-0000000000b5');
update public.jovens set discipulado_por = '40000000-0000-0000-0000-0000000000d2' where id = '40000000-0000-0000-0000-0000000000b3';
update public.jovens set ativo = false where id = '40000000-0000-0000-0000-0000000000b5';
-- Três sábados passados: 05/09 (normal), 12/09 (cancelado), 19/09 (normal), e 26/09 para a sequência.
insert into public.cultos (id, data) values
  ('50000000-0000-0000-0000-000000000001', '2026-09-05'),
  ('50000000-0000-0000-0000-000000000002', '2026-09-12'),
  ('50000000-0000-0000-0000-000000000003', '2026-09-19'),
  ('50000000-0000-0000-0000-000000000004', '2026-09-26');

set session authorization authenticator;
set role authenticated;
create or replace function pg_temp.entrar(p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email), 'email', p_email, 'role', 'authenticated')::text, false);
$$;
\echo 'Fixture pronta'

-- 1) Jovem e discipulador não fazem chamada
select pg_temp.entrar('ch.disc1@rede.org');
do $$ begin
  begin perform public.fechar_chamada('50000000-0000-0000-0000-000000000001'); raise exception 'discipulador fechou chamada';
  exception when raise_exception then if sqlerrm not like 'Apenas%' then raise; end if; end;
  begin insert into public.presencas (culto_id, jovem_id, estado) values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b1', 'presente');
        raise exception 'inseriu presença direto';
  exception when insufficient_privilege then null; end;
end $$;
\echo 'OK só admin faz chamada'

-- 2) Culto 05/09: Bia presente, Caio justificado; fechar
select pg_temp.entrar('lider@sedentos.org');
do $$
declare r jsonb; n int;
begin
  perform public.abrir_chamada('50000000-0000-0000-0000-000000000001');
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b1', 'presente');
  -- toque duplo: marca e desmarca, depois marca de novo
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b2', 'presente');
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b2', null);
  begin perform public.marcar_presenca('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b3', 'justificada', '');
        raise exception 'justificou sem motivo';
  exception when raise_exception then if sqlerrm not like 'Informe o motivo%' then raise; end if; end;
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000b3', 'justificada', 'Viagem com a família');
  r := public.fechar_chamada('50000000-0000-0000-0000-000000000001');
  -- ativos: Lia, Dora, Dino, Bia, Beto, Caio, Sami = 7; Ivo (inativo) fora
  assert (r ->> 'presentes')::int = 1 and (r ->> 'justificadas')::int = 1 and (r ->> 'faltas')::int = 5, 'resumo: ' || r::text;
  assert not exists (select 1 from public.presencas where jovem_id = '40000000-0000-0000-0000-0000000000b5'), 'inativo entrou';
  -- avisos: Beto→Dora; Dora→Lia; Dino→Lia; Sami→resumo admins; Lia (liderança)→ninguém
  assert (r ->> 'avisos_enviados')::int = 3, 'avisos novos: ' || r::text;
  assert exists (select 1 from public.notificacoes where jovem_id = '40000000-0000-0000-0000-0000000000b2' and destinatario_id = '40000000-0000-0000-0000-0000000000d1' and tipo = 'falta'), 'Beto→Dora';
  assert exists (select 1 from public.notificacoes where jovem_id = '40000000-0000-0000-0000-0000000000d1' and destinatario_id = '40000000-0000-0000-0000-0000000000a1'), 'Dora→Lia';
  assert not exists (select 1 from public.notificacoes where jovem_id = '40000000-0000-0000-0000-0000000000a1'), 'liderança não gera aviso';
  select count(*) into n from public.notificacoes where para_admins and culto_id = '50000000-0000-0000-0000-000000000001';
  assert n = 1, 'um resumo para admins: ' || n;
  assert (select dados -> 'jovens' -> 0 ->> 'nome' from public.notificacoes where para_admins and culto_id = '50000000-0000-0000-0000-000000000001') = 'Sami Sem Disc';
  -- fechar de novo não duplica nada
  r := public.fechar_chamada('50000000-0000-0000-0000-000000000001');
  assert (r ->> 'avisos_enviados')::int = 0, 'duplicou avisos';
  assert (select count(*) from public.presencas where culto_id = '50000000-0000-0000-0000-000000000001') = 7, 'duplicou presenças';
  assert (select count(*) from public.notificacoes where culto_id = '50000000-0000-0000-0000-000000000001') = 4, 'total de avisos';
end $$;
\echo 'OK fechamento e avisos'

-- 3) Cancelado não quebra a sequência; 2 faltas seguidas avisam a liderança
do $$
declare r jsonb;
begin
  perform public.cancelar_culto('50000000-0000-0000-0000-000000000002', 'Retiro');
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-0000000000b1', 'presente');
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-0000000000b3', 'presente');
  r := public.fechar_chamada('50000000-0000-0000-0000-000000000003');
  assert exists (select 1 from public.notificacoes where tipo = 'faltas_seguidas' and jovem_id = '40000000-0000-0000-0000-0000000000b2'
                 and destinatario_id = '40000000-0000-0000-0000-0000000000a1' and culto_id = '50000000-0000-0000-0000-000000000003'), 'liderança não avisada';
  assert (select dados ->> 'sequencia' from public.notificacoes where tipo = 'falta' and jovem_id = '40000000-0000-0000-0000-0000000000b2'
          and culto_id = '50000000-0000-0000-0000-000000000003') = '2', 'sequência deveria ser 2';
  assert not exists (select 1 from public.notificacoes where tipo = 'faltas_seguidas' and jovem_id = '40000000-0000-0000-0000-0000000000b3'), 'Caio justificou e veio';
end $$;
\echo 'OK faltas seguidas e culto cancelado'

-- 4) Correção depois de fechar cancela o aviso; justificada zera a sequência
do $$
declare r jsonb;
begin
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-0000000000b2', 'justificada', 'Estava doente');
  assert not exists (select 1 from public.notificacoes where jovem_id = '40000000-0000-0000-0000-0000000000b2'
                     and culto_id = '50000000-0000-0000-0000-000000000003' and cancelada_em is null), 'aviso não cancelado';
  assert exists (select 1 from public.jovens_historico where jovem_id = '40000000-0000-0000-0000-0000000000b2' and acao = 'presenca'), 'histórico da correção';
  begin perform public.marcar_presenca('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-0000000000b2', null);
        raise exception 'desmarcou com chamada fechada';
  exception when raise_exception then if sqlerrm not like 'Chamada fechada%' then raise; end if; end;
  -- Sami corrigido para presente: o resumo dos admins é cancelado
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-0000000000b4', 'presente');
  assert exists (select 1 from public.notificacoes where para_admins and culto_id = '50000000-0000-0000-0000-000000000003' and cancelada_em is not null), 'resumo não cancelado';
  -- 26/09: Beto falta de novo, mas a justificada zerou: sequência 1, sem aviso à liderança
  r := public.fechar_chamada('50000000-0000-0000-0000-000000000004');
  assert (select dados ->> 'sequencia' from public.notificacoes where tipo = 'falta' and jovem_id = '40000000-0000-0000-0000-0000000000b2'
          and culto_id = '50000000-0000-0000-0000-000000000004') = '1', 'justificada deveria zerar';
  assert not exists (select 1 from public.notificacoes where tipo = 'faltas_seguidas' and culto_id = '50000000-0000-0000-0000-000000000004'
                     and jovem_id = '40000000-0000-0000-0000-0000000000b2'), 'avisou liderança indevidamente';
  -- volta a falta: o aviso reaparece (reativado, sem duplicar)
  perform public.marcar_presenca('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-0000000000b2', 'falta');
  assert (select count(*) from public.notificacoes where jovem_id = '40000000-0000-0000-0000-0000000000b2'
          and culto_id = '50000000-0000-0000-0000-000000000003' and tipo = 'falta' and cancelada_em is null) = 1, 'aviso não reativado';
end $$;
\echo 'OK correções'

-- 5) Quem vê o quê
select pg_temp.entrar('ch.disc1@rede.org');   -- Dora: Bia, Beto (Ivo é inativo)
do $$
declare n int;
begin
  select count(distinct jovem_id) into n from public.presencas; assert n = 2, 'Dora vê presenças de ' || n;
  assert not exists (select 1 from public.presencas where jovem_id = '40000000-0000-0000-0000-0000000000b3'), 'Dora viu Caio';
  select count(*) into n from public.notificacoes; assert n >= 1, 'Dora não vê os próprios avisos';
  assert not exists (select 1 from public.notificacoes where destinatario_id <> '40000000-0000-0000-0000-0000000000d1'), 'Dora viu avisos de outros';
  -- marca contato; não consegue mudar o texto
  update public.notificacoes set contato_feito_em = now(), lida_em = now(), mensagem = 'hack';
  assert not exists (select 1 from public.notificacoes where mensagem = 'hack'), 'alterou a mensagem';
  assert not exists (select 1 from public.notificacoes where contato_feito_em is null), 'não marcou contato';
  select count(*) into n from public.cultos; assert n >= 4, 'discipulador deveria ver os cultos';
end $$;
select pg_temp.entrar('ch.disc2@rede.org');   -- Dino: só Caio
do $$ begin
  assert (select count(distinct jovem_id) from public.presencas) = 1, 'Dino vê mais do que Caio';
  assert not exists (select 1 from public.notificacoes where jovem_id = '40000000-0000-0000-0000-0000000000b2'), 'Dino viu aviso do Beto';
end $$;
select pg_temp.entrar('ch.jovem1@rede.org');  -- Bia: nada
do $$ begin
  assert (select count(*) from public.presencas) = 0, 'jovem vê a própria frequência';
  assert (select count(*) from public.notificacoes) = 0, 'jovem vê avisos';
  update public.jovens set ativo = false, consentimento_em = now(), apelido = 'Bia', sexo = 'feminino';
  assert (select ativo from public.jovens) = true, 'jovem se marcou inativo';
end $$;
select pg_temp.entrar('ch.lider@rede.org');   -- Lia: a rede toda
do $$ begin
  assert (select count(distinct jovem_id) from public.presencas) = 5, 'Lia deveria ver Dora, Dino, Bia, Beto, Caio';
  assert exists (select 1 from public.cuidado_da_rede() where nome = 'Dora Disc Chamada' and respondidos >= 1), 'cuidado da rede';
end $$;
\echo 'OK permissões'

-- 6) Geração dos sábados
select pg_temp.entrar('lider@sedentos.org');
do $$
declare n int; m int;
begin
  n := public.garantir_cultos();
  m := public.garantir_cultos();
  assert n = 8 and m = 0, format('gerou %s e depois %s', n, m);
  assert not exists (select 1 from public.cultos where data > public.hoje_sp() and extract(dow from data) <> 6), 'só sábados';
  assert not exists (select 1 from public.cultos where data = public.hoje_sp()), 'não gera o culto de hoje';
end $$;
\echo 'OK geração dos sábados'
\echo 'TODOS OS TESTES DA CHAMADA PASSARAM'
