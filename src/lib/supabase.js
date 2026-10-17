import { createClient } from '@supabase/supabase-js';
import { criarClienteDemo } from '../demo/clienteDemo';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Build de demonstração (`npm run build:demo`): dados em memória, sem Supabase. */
export const demo = import.meta.env.VITE_DEMO === '1';
export const configurado = demo || Boolean(url && chave);

export const supabase = demo ? criarClienteDemo() : createClient(url || 'http://localhost', chave || 'sem-chave', {
  // "implicit": o link mágico funciona mesmo se o jovem abrir o e-mail em outro aparelho.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

const funcoesUrl = (import.meta.env.VITE_FUNCOES_URL || '').replace(/\/$/, '');

/** Chama uma função de servidor; com VITE_FUNCOES_URL vai direto ao serviço no Railway. Devolve { data, error }. */
export async function chamarFuncao(nome, body) {
  if (demo || !funcoesUrl) return supabase.functions.invoke(nome, { body });
  try {
    const { data: s } = await supabase.auth.getSession();
    const r = await fetch(`${funcoesUrl}/${nome}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => null);
    if (r.ok) return { data: json, error: null };
    const error = new Error(json?.erro || `Erro ${r.status}`);
    error.context = { json: async () => json };
    return { data: null, error };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Secretários entram com USUÁRIO e senha. Por baixo, o login usa um e-mail técnico
 * "<usuario>@<domínio>"; precisa ser o mesmo SECRETARIO_DOMINIO da Edge Function.
 */
export const SECRETARIO_DOMINIO = import.meta.env.VITE_SECRETARIO_DOMINIO || 'chamada.sedentos.app';
export const emailDoSecretario = (usuario) => `${String(usuario ?? '').trim().toLowerCase()}@${SECRETARIO_DOMINIO}`;
export const usuarioDoEmail = (email) => String(email ?? '').split('@')[0];

/** Mensagem amigável a partir de um erro do Supabase. */
export function mensagemErro(e) {
  const m = e?.message || String(e || '');
  if (/invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (/expired|invalid.*otp|token has expired/i.test(m)) return 'Código inválido ou vencido. Peça um novo código.';
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão. Confira sua internet e tente de novo.';
  if (/duplicate key.*email/i.test(m)) return 'Este e-mail já está em outro cadastro.';
  return m || 'Algo deu errado. Tente de novo.';
}
