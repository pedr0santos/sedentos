// Supabase Edge Function: gerenciar-secretarios
// Cria, troca a senha e remove as contas de login (usuário + senha) dos secretários da chamada.
// Precisa da chave de serviço (só existe aqui no servidor, nunca no site).
//
// Toda ação passa por uma RPC chamada COM O LOGIN DO ADMIN, que confere se é admin
// e grava no registro de acessos. Sem admin, nada acontece.
//
// Segredo opcional (Supabase › Edge Functions › Secrets):
//   SECRETARIO_DOMINIO  (padrão: chamada.sedentos.app) — precisa ser igual ao VITE_SECRETARIO_DOMINIO do site.
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem por padrão.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const env = (k: string) => Deno.env.get(k) ?? '';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const DOMINIO = env('SECRETARIO_DOMINIO') || 'chamada.sedentos.app';
const USUARIO_OK = /^[a-z0-9][a-z0-9._-]{2,29}$/;

function validarSenha(s: unknown) {
  if (typeof s !== 'string' || s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (s.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const corpo = await req.json();
    const acao = corpo?.acao as string;

    // Cliente com o login de quem chamou (as RPCs conferem se é admin).
    const comoAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: ehAdmin } = await comoAdmin.rpc('eh_admin');
    if (!ehAdmin) return json({ erro: 'Apenas administradores.' }, 403);

    const servico = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

    if (acao === 'criar') {
      const usuario = String(corpo.usuario ?? '').trim().toLowerCase();
      const nome = String(corpo.nome ?? '').trim();
      if (!USUARIO_OK.test(usuario)) {
        return json({ erro: 'Usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou _ (sem espaços nem acentos).' }, 400);
      }
      if (nome.length < 2) return json({ erro: 'Informe o nome.' }, 400);
      const erroSenha = validarSenha(corpo.senha);
      if (erroSenha) return json({ erro: erroSenha }, 400);

      const email = `${usuario}@${DOMINIO}`;
      const { data: criado, error } = await servico.auth.admin.createUser({
        email, password: corpo.senha, email_confirm: true,
        user_metadata: { nome, tipo: 'secretario' },
      });
      if (error || !criado?.user) {
        const ja = /already|registered|exists/i.test(error?.message ?? '');
        return json({ erro: ja ? 'Esse usuário já existe. Escolha outro.' : `Não foi possível criar o login: ${error?.message}` }, 400);
      }
      const { data: sec, error: e2 } = await comoAdmin.rpc('secretario_registrar', {
        p_user_id: criado.user.id, p_usuario: usuario, p_nome: nome,
      });
      if (e2) {
        await servico.auth.admin.deleteUser(criado.user.id); // desfaz: não deixa login solto
        return json({ erro: e2.message }, 400);
      }
      return json({ secretario: sec });
    }

    if (acao === 'senha') {
      const erroSenha = validarSenha(corpo.senha);
      if (erroSenha) return json({ erro: erroSenha }, 400);
      const { data: userId, error } = await comoAdmin.rpc('secretario_senha_trocada', { p_id: corpo.id });
      if (error) return json({ erro: error.message }, 400);
      const { error: e2 } = await servico.auth.admin.updateUserById(userId as string, { password: corpo.senha });
      if (e2) return json({ erro: `Não foi possível trocar a senha: ${e2.message}` }, 400);
      return json({ ok: true });
    }

    if (acao === 'remover') {
      const { data: userId, error } = await comoAdmin.rpc('secretario_remover', { p_id: corpo.id });
      if (error) return json({ erro: error.message }, 400);
      // O cadastro já saiu (o acesso some na hora); agora apaga o login.
      await servico.auth.admin.deleteUser(userId as string);
      return json({ ok: true });
    }

    return json({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500);
  }
});
