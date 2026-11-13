// Supabase Edge Function: avisar-aniversarios
// Chamada uma vez por dia por um agendador (pg_cron/pg_net ou cron do Railway) com o cabeçalho x-cron-secret.
// Manda UM e-mail (Resend) por discipulador com os discípulos que fazem aniversário hoje (America/Sao_Paulo).
// Pode ser chamada de novo no mesmo dia sem duplicar: registra em avisos_aniversario.
//
// Segredos: RESEND_API_KEY, EMAIL_REMETENTE, SITE_URL, CRON_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const env = (k: string) => Deno.env.get(k) ?? '';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const primeiro = (n: string) => {
  const p = (n ?? '').trim().split(/\s+/)[0] ?? '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
};
const chamarDe = (p: { nome: string; apelido?: string | null }) => (p.apelido ?? '').trim() || primeiro(p.nome);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

function htmlEmail(nome: string, itens: { nome: string; idade: number }[], link: string) {
  const linhas = itens.map((i) => `<li style="margin:6px 0">${esc(i.nome)} <span style="color:#B8C2D6">(${i.idade} anos)</span></li>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#0B111F;font-family:Montserrat,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <h1 style="margin:0 0 4px;font-size:26px">Sede<span style="color:#29ABE2">ntos</span></h1>
    <div style="width:40px;height:3px;background:#29ABE2;margin-bottom:24px"></div>
    <p style="font-size:16px;line-height:1.5;color:#D6DDEA">Oi, ${esc(primeiro(nome))}! Hoje é aniversário de:</p>
    <ul style="font-size:16px;line-height:1.5;padding-left:20px">${linhas}</ul>
    <p style="font-size:15px;line-height:1.5;color:#B8C2D6">Que tal mandar uma mensagem de parabéns? Pelo sistema você abre o WhatsApp com o texto pronto.</p>
    <a href="${link}" style="display:inline-block;margin-top:12px;padding:14px 22px;border-radius:10px;background:linear-gradient(135deg,#3D5BA9,#29ABE2);color:#fff;font-weight:800;text-decoration:none">Ver minha rede</a>
    <p style="margin-top:28px;font-size:12px;color:#8C96AA">Estas informações são confidenciais e só para o cuidado pastoral.</p>
  </div></body></html>`;
}

export const handler = async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const segredo = env('CRON_SECRET');
    if (!segredo || req.headers.get('x-cron-secret') !== segredo) return json({ erro: 'Não autorizado.' }, 403);
    if (!env('RESEND_API_KEY') || !env('EMAIL_REMETENTE')) return json({ erro: 'RESEND_API_KEY/EMAIL_REMETENTE ausentes.' }, 500);

    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); // AAAA-MM-DD
    const ano = Number(hoje.slice(0, 4));
    const mmdd = hoje.slice(5);
    const incluir29 = mmdd === '02-28' && !bissexto(ano); // 29/02 comemora em 28/02 nos anos comuns

    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const { data: jovens, error } = await db.from('jovens')
      .select('id, nome, apelido, data_nascimento, discipulado_por')
      .eq('ativo', true).not('data_nascimento', 'is', null).not('discipulado_por', 'is', null);
    if (error) throw error;

    const aniversariantes = (jovens ?? []).filter((j) => {
      const md = j.data_nascimento.slice(5);
      return md === mmdd || (incluir29 && md === '02-29');
    });
    if (!aniversariantes.length) return json({ aniversariantes: 0, emails: 0 });

    const grupos = new Map<string, typeof aniversariantes>();
    for (const j of aniversariantes) grupos.set(j.discipulado_por, [...(grupos.get(j.discipulado_por) ?? []), j]);

    const ids = [...grupos.keys()];
    const { data: dests } = await db.from('jovens').select('id, nome, email').in('id', ids);
    const { data: jaEnviados } = await db.from('avisos_aniversario').select('destinatario_id').eq('data', hoje).in('destinatario_id', ids);
    const enviados = new Set((jaEnviados ?? []).map((r) => r.destinatario_id));
    const site = env('SITE_URL').replace(/\/$/, '');

    let emails = 0; let semEmail = 0;
    const erros: string[] = [];
    for (const d of dests ?? []) {
      if (enviados.has(d.id)) continue;
      if (!d.email) { semEmail++; continue; }
      const itens = (grupos.get(d.id) ?? []).map((j) => ({ nome: chamarDe(j), idade: ano - Number(j.data_nascimento.slice(0, 4)) }));
      const qtd = itens.length;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env('EMAIL_REMETENTE'), to: d.email,
          subject: `Sedentos · ${qtd === 1 ? 'aniversário de hoje' : `${qtd} aniversários hoje`} na sua rede`,
          html: htmlEmail(d.nome, itens, `${site}/minha-rede`),
        }),
      });
      if (r.ok) {
        emails++;
        await db.from('avisos_aniversario').insert({ destinatario_id: d.id, data: hoje });
      } else {
        const msg = `Resend ${r.status}: ${await r.text()}`;
        console.error('avisar-aniversarios', msg);
        erros.push(msg);
      }
    }
    return json({ aniversariantes: aniversariantes.length, emails, sem_email: semEmail, erros });
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500);
  }
};

// No Supabase hospedado o arquivo roda sozinho; no Railway quem serve é edge/main.ts.
if (import.meta.main) Deno.serve(handler);
