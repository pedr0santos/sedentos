// Chamada dos cultos: datas, estados, frequência e fila offline.
import { chamarDe, primeiroNome } from './rede';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Hoje no fuso de Brasília, como "AAAA-MM-DD". */
export function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

const partes = (iso) => iso.slice(0, 10).split('-').map(Number);
export function dataCulto(iso) {
  const [a, m, d] = partes(iso);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
export const ddmm = (iso) => { const [, m, d] = partes(iso); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`; };
export const somarDias = (iso, n) => { const [a, m, d] = partes(iso); const x = new Date(Date.UTC(a, m - 1, d + n)); return x.toISOString().slice(0, 10); };

export const STATUS_CULTO = {
  agendado: { rotulo: 'Agendado', classe: 'bg-white/[0.08] text-muted' },
  aberto: { rotulo: 'Chamada aberta', classe: 'bg-secondary/20 text-secondary' },
  fechado: { rotulo: 'Fechado', classe: 'bg-success/15 text-success' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-danger/15 text-[#FF8A8E]' },
};

export const ESTADOS = {
  presente: { rotulo: 'Presente', cor: 'var(--success)', classe: 'bg-success/15 text-success' },
  falta: { rotulo: 'Falta', cor: 'var(--danger)', classe: 'bg-danger/15 text-[#FF8A8E]' },
  justificada: { rotulo: 'Justificada', cor: '#8C96AA', classe: 'bg-white/[0.08] text-muted' },
};

export const mensagemFaltaResponsavel = (p) =>
  `Oi, ${primeiroNome(p?.responsavel_nome) || 'tudo bem'}! Aqui é do Sedentos. Sentimos falta de ${chamarDe(p)} no culto de sábado 💙 Está tudo bem por aí? Contem com a gente!`;

export const mensagemFalta = (p) =>
  `Oi, ${chamarDe(p)}! Sentimos sua falta no culto de sábado 💙 Tá tudo bem com você? Conta comigo pro que precisar!`;

/**
 * Frequência de uma pessoa.
 * cultosFechados: [{id, data}] (mais recentes primeiro, sem cancelados)
 * presencas: { [culto_id]: estado }
 */
export function frequencia(cultosFechados, presencas, hoje = hojeSP()) {
  const limite3m = somarDias(hoje, -91);
  let pres = 0; let falt = 0;
  for (const c of cultosFechados) {
    if (c.data < limite3m) break;
    if (presencas[c.id] === 'presente') pres++;
    if (presencas[c.id] === 'falta') falt++;
  }
  let sequencia = 0;
  for (const c of cultosFechados) {
    if (presencas[c.id] !== 'falta') break;
    sequencia++;
  }
  return {
    percentual: pres + falt ? Math.round((pres / (pres + falt)) * 100) : null,
    presentes: pres,
    faltas: falt,
    sequencia,
    linha: cultosFechados.slice(0, 12).map((c) => ({ ...c, estado: presencas[c.id] ?? null })).reverse(),
  };
}

// ---- Fila offline da chamada (cada toque fica guardado até o servidor confirmar) ----
const chave = (cultoId) => `sed_fila_${cultoId}`;
export function lerFila(cultoId) {
  try { return JSON.parse(localStorage.getItem(chave(cultoId)) || '[]'); } catch { return []; }
}
export function gravarFila(cultoId, fila) {
  try { localStorage.setItem(chave(cultoId), JSON.stringify(fila)); } catch { /* sem armazenamento: fica só na memória */ }
}
