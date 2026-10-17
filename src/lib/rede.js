// Rede de discipulado: rótulos, regras de tela e mensagens prontas.

export const PAPEIS = {
  lideranca: { rotulo: 'Liderança', plural: 'Liderança', nivel: 3 },
  discipulador: { rotulo: 'Discipulador', plural: 'Discipuladores', nivel: 2 },
  jovem: { rotulo: 'Jovem', plural: 'Jovens', nivel: 1 },
};
export const LISTA_PAPEIS = ['lideranca', 'discipulador', 'jovem'];

/** Papel que a pessoa precisa ter para ser "discipulado por" de alguém com este papel. */
export const papelAcima = (papel) => (papel === 'jovem' ? 'discipulador' : papel === 'discipulador' ? 'lideranca' : null);
export const papelAbaixo = (papel) => (papel === 'lideranca' ? 'discipulador' : papel === 'discipulador' ? 'jovem' : null);

export const TIPOS_ANOTACAO = {
  acompanhamento: { rotulo: 'Acompanhamento', icone: 'conversa', classe: 'text-muted bg-white/[0.06]' },
  pedido_oracao: { rotulo: 'Pedido de oração', icone: 'maos', classe: 'text-secondary bg-secondary/15' },
  conquista: { rotulo: 'Conquista', icone: 'estrela', classe: 'text-success bg-success/15' },
  alerta: { rotulo: 'Alerta', icone: 'alerta', classe: 'text-[#FF8A8E] bg-danger/15' },
  correcao_cadastro: { rotulo: 'Correção de cadastro', icone: 'lapis', classe: 'text-warning bg-warning/15' },
};

export const LIMITE_PADRAO = 12;
const DIA = 24 * 60 * 60 * 1000;

/** Autor ainda pode editar/apagar (24h)? */
export const dentroDoPrazo = (criadoEm) => Date.now() - new Date(criadoEm).getTime() < DIA;

export { linkWhatsApp } from './formato';

export const primeiroNome = (nome) => {
  const p = String(nome ?? '').trim().split(/\s+/)[0] ?? '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
};

/** Como chamar alguém nas mensagens: apelido, senão o primeiro nome. Aceita a pessoa ou só o nome. */
export const chamarDe = (p) => (p && typeof p === 'object' ? (String(p.apelido ?? '').trim() || primeiroNome(p.nome)) : primeiroNome(p));

export const mensagemAniversario = (p) =>
  `Feliz aniversário, ${chamarDe(p)}! 🎉 Que Deus te abençoe muito neste novo ano. Conte comigo sempre!`;

export function linkAcesso(email) {
  const base = `${window.location.origin}/`;
  return email ? `${base}?email=${encodeURIComponent(email)}` : base;
}

export const mensagemAcesso = (p, email) =>
  `Oi, ${chamarDe(p)}! Para acessar a área do Sedentos, entre por este link com o e-mail ${email}: ${linkAcesso(email)}`;

/** Próximo aniversário a partir de hoje (dias até lá e a data). */
export function proximoAniversario(iso, hoje = new Date()) {
  if (!iso) return null;
  const [, m, d] = iso.split('-').map(Number);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let alvo = new Date(hoje.getFullYear(), m - 1, d);
  if (alvo < base) alvo = new Date(hoje.getFullYear() + 1, m - 1, d);
  return { dias: Math.round((alvo - base) / DIA), data: alvo };
}

/** Aniversariantes de hoje e dos próximos N dias, ordenados pela data. */
export function aniversariantes(pessoas, dias = 30) {
  return pessoas
    .map((p) => ({ ...p, aniv: proximoAniversario(p.data_nascimento) }))
    .filter((p) => p.aniv && p.aniv.dias <= dias)
    .sort((a, b) => a.aniv.dias - b.aniv.dias);
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
