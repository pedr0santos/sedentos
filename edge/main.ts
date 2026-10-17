// Serviço das Edge Functions no Railway: um único servidor Deno que roteia pelo último trecho do caminho.
import { handler as gerenciarSecretarios } from './functions/gerenciar-secretarios/index.ts';
import { handler as avisarFaltas } from './functions/avisar-faltas/index.ts';

const rotas: Record<string, (req: Request) => Promise<Response>> = {
  'gerenciar-secretarios': gerenciarSecretarios,
  'avisar-faltas': avisarFaltas,
};

Deno.serve({ hostname: '0.0.0.0', port: Number(Deno.env.get('PORT') ?? 8000) }, (req) => {
  const { pathname } = new URL(req.url);
  if (pathname === '/health') return new Response('ok');
  const handler = rotas[pathname.split('/').filter(Boolean).pop() ?? ''];
  if (handler) return handler(req);
  return new Response(JSON.stringify({ erro: 'Função não encontrada.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
