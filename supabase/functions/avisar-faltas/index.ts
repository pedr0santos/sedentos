// Supabase Edge Function: avisar-faltas
// Chamada pela tela da chamada (admin ou secretário) logo depois de "Fechar chamada". Para cada discipulador/liderança
// com avisos novos daquele culto, manda UM e-mail (Resend) e um push (Web Push).
// Pode ser chamada de novo sem duplicar: marca email_enviado_em / push_enviado_em.
//
// Segredos (Supabase › Edge Functions › Secrets):
//   RESEND_API_KEY, EMAIL_REMETENTE (ex.: "Sedentos <avisos@seudominio.com>"), SITE_URL
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTATO (ex.: "mailto:lideranca@seudominio.com")
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem por padrão.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const env = (k: string) => Deno.env.get(k) ?? '';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const primeiro = (n: string) => {
  const p = (n ?? '').trim().split(/\s+/)[0] ?? '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
};
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Preparado para o futuro: envio direto pelo WhatsApp Business (API paga). Hoje não faz nada. */
async function enviarWhatsApp(_telefone: string, _texto: string): Promise<boolean> {
  return false;
}

function htmlEmail(nome: string, itens: { nome: string; seq: number; tipo: string }[], data: string, link: string) {
  const linhas = itens.map((i) =>
    `<li style="margin:6px 0">${esc(i.nome)}${i.tipo === 'faltas_seguidas' || i.seq >= 2 ? ` <strong style="color:#E5484D">(${i.seq}ª falta seguida)</strong>` : ''}</li>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#0B111F;font-family:Montserrat,Arial,sans-serif;color:#fff">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <h1 style="margin:0 0 4px;font-size:26px">Sede<span style="color:#29ABE2">ntos</span></h1>
    <div style="width:40px;height:3px;background:#29ABE2;margin-bottom:24px"></div>
    <p style="font-size:16px;line-height:1.5;color:#D6DDEA">Oi, ${esc(primeiro(nome))}! No culto de sábado, ${data}, sentimos falta de:</p>
    <ul style="font-size:16px;line-height:1.5;padding-left:20px">${linhas}</ul>
    <p style="font-size:15px;line-height:1.5;color:#B8C2D6">Que tal mandar uma mensagem hoje? Pelo sistema você abre o WhatsApp com a mensagem pronta.</p>
    <a href="${link}" style="display:inline-block;margin-top:12px;padding:14px 22px;border-radius:10px;background:linear-gradient(135deg,#3D5BA9,#29ABE2);color:#fff;font-weight:800;text-decoration:none">Ver avisos</a>
    <p style="margin-top:28px;font-size:12px;color:#8C96AA">Estas informações são confidenciais e só para o cuidado pastoral.</p>
  </div></body></html>`;
}

export const handler = async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { culto_id } = await req.json();
    if (!culto_id) return json({ erro: 'culto_id obrigatório' }, 400);

    // Só admin pode disparar.
    const usuario = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    // Admin ou secretário(a) da chamada (quem fecha a chamada dispara os avisos).
    // A resposta só traz contagens: nada de nomes ou discipuladores.
    const { data: pode } = await usuario.rpc('pode_fazer_chamada');
    if (!pode) return json({ erro: 'Apenas administradores e secretários da chamada.' }, 403);

    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const { data: culto } = await db.from('cultos').select('id, data, titulo').eq('id', culto_id).single();
    const { data: avisos } = await db.from('notificacoes')
      .select('id, destinatario_id, jovem_id, tipo, dados, email_enviado_em, push_enviado_em')
      .eq('culto_id', culto_id).is('cancelada_em', null).not('destinatario_id', 'is', null);
    if (!avisos?.length) return json({ emails: 0, push: 0 });

    const ids = [...new Set(avisos.flatMap((a) => [a.destinatario_id, a.jovem_id]))];
    const { data: pessoas } = await db.from('jovens').select('id, nome, email, user_id').in('id', ids);
    const porId = new Map((pessoas ?? []).map((p) => [p.id, p]));
    const site = env('SITE_URL').replace(/\/$/, '');
    const data = ddmm(culto!.data);

    const grupos = new Map<string, typeof avisos>();
    for (const a of avisos) grupos.set(a.destinatario_id, [...(grupos.get(a.destinatario_id) ?? []), a]);

    const temEmail = Boolean(env('RESEND_API_KEY') && env('EMAIL_REMETENTE'));
    const temPush = Boolean(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY'));
    if (temPush) webpush.setVapidDetails(env('VAPID_CONTATO') || 'mailto:contato@sedentos.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

    let emails = 0; let pushes = 0;
    for (const [dest, lista] of grupos) {
      const pessoa = porId.get(dest);
      if (!pessoa) continue;
      const itens = lista.map((a) => ({ nome: porId.get(a.jovem_id)?.nome ?? 'Alguém', seq: Number(a.dados?.sequencia ?? 0), tipo: a.tipo }));
      const qtd = new Set(lista.map((a) => a.jovem_id)).size;
      const assunto = `Sedentos · ${qtd} ${qtd === 1 ? 'discípulo faltou' : 'discípulos faltaram'} no culto de sábado`;

      // E-mail (um por pessoa)
      const novosEmail = lista.filter((a) => !a.email_enviado_em);
      if (temEmail && pessoa.email && novosEmail.length) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env('EMAIL_REMETENTE'), to: pessoa.email, subject: assunto,
            html: htmlEmail(pessoa.nome, itens, data, `${site}/minha-rede/avisos`) }),
        });
        if (r.ok) {
          emails++;
          await db.from('notificacoes').update({ email_enviado_em: new Date().toISOString() }).in('id', novosEmail.map((a) => a.id));
        }
      }

      // Push (todos os aparelhos que a pessoa autorizou)
      const novosPush = lista.filter((a) => !a.push_enviado_em);
      if (temPush && pessoa.user_id && novosPush.length) {
        const { data: inscricoes } = await db.from('push_inscricoes').select('*').eq('user_id', pessoa.user_id);
        const corpo = JSON.stringify({
          title: assunto.replace('Sedentos · ', ''),
          body: itens.map((i) => primeiro(i.nome)).join(', '),
          url: '/minha-rede/avisos',
        });
        let ok = false;
        for (const s of inscricoes ?? []) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, corpo);
            ok = true;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) await db.from('push_inscricoes').delete().eq('id', s.id); // aparelho saiu
          }
        }
        if (ok) {
          pushes++;
          await db.from('notificacoes').update({ push_enviado_em: new Date().toISOString() }).in('id', novosPush.map((a) => a.id));
        }
      }
      await enviarWhatsApp('', ''); // desligado nesta versão
    }
    return json({ emails, push: pushes, email_configurado: temEmail, push_configurado: temPush });
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500);
  }
};

// No Supabase hospedado o arquivo roda sozinho; no Railway quem serve é edge/main.ts.
if (import.meta.main) Deno.serve(handler);
