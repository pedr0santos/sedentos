# Gera a migração v6 a partir das definições atuais das funções (nunca edita migrações antigas).
import re, pathlib
M = pathlib.Path(__file__).resolve().parents[2] / 'supabase' / 'migrations'
fontes = sorted(M.glob('2026*.sql'))
fontes = [f for f in fontes if '20261021' not in f.name]

def funcao(nome):
    txt = None
    for f in fontes:  # a última definição vence
        s = f.read_text()
        for m in re.finditer(r'create or replace function public\.' + nome + r'\(.*?\n\$\$;', s, re.S):
            txt = m.group(0)
    assert txt, nome
    return txt

ADM = "if not public.eh_admin() then raise exception 'Apenas administradores.'; end if;"
NOVO = "if not public.pode_fazer_chamada() then raise exception 'Apenas administradores e secretários da chamada.'; end if;"
partes = []
for nome in ['cancelar_culto', 'reativar_culto', 'abrir_chamada', 'marcar_presenca', 'fechar_chamada']:
    t = funcao(nome)
    assert t.count(ADM) == 1, nome
    t = t.replace(ADM, NOVO)
    if nome == 'fechar_chamada':
        velho = "  return public.resumo_culto(p_culto) || jsonb_build_object('avisos_enviados', v_avisos);"
        assert velho in t
        t = t.replace(velho, """  -- O secretário recebe só as contagens (nada de avisos ou discipuladores).
  if not public.eh_admin() then
    return public.resumo_culto_secretario(p_culto);
  end if;
  return public.resumo_culto(p_culto) || jsonb_build_object('avisos_enviados', v_avisos);""")
    partes.append(t)
g = funcao('garantir_cultos')
velho = "if not public.eh_admin() and session_user::text = 'authenticator' then\n    raise exception 'Apenas administradores.';"
assert velho in g
partes.insert(0, g.replace(velho, "if not public.pode_fazer_chamada() and session_user::text = 'authenticator' then\n    raise exception 'Apenas administradores e secretários da chamada.';"))

b = funcao('buscar_cadastro_antigo')
velho = "   where auth.uid() is not null\n"
assert velho in b
b = b.replace(velho, "   where auth.uid() is not null\n     and not public.eh_secretario()   -- conta de secretário não tem cadastro de jovem\n")

modelo = (M.parent.parent / 'scripts' / 'dev' / 'v6_modelo.sql').read_text()
saida = modelo.replace('-- @@FUNCOES_CHAMADA@@', '\n\n'.join(partes)).replace('-- @@BUSCAR@@', b)
(M / '20261021000000_acessos_secretarios.sql').write_text(saida)
print('ok', len(saida))
