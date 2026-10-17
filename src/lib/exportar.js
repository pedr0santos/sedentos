import { formatarTelefone, isoParaData, idade, formatarDataHora, faixaEtaria, rotuloFaixa } from './formato';
import { STATUS, ORIGEM, tituloInconsistencia } from './inconsistencias';
import { PAPEIS } from './rede';

const COLUNAS = [
  ['Nome', (j) => j.nome],
  ['Apelido', (j) => j.apelido ?? ''],
  ['Sexo', (j) => (j.sexo === 'feminino' ? 'Feminino' : j.sexo === 'masculino' ? 'Masculino' : '')],
  ['E-mail', (j) => j.email],
  ['Telefone', (j) => formatarTelefone(j.telefone)],
  ['Data de nascimento', (j) => isoParaData(j.data_nascimento)],
  ['Idade', (j) => (j.inconsistencias?.includes('NASCIMENTO_INVALIDO') ? null : idade(j.data_nascimento))],
  ['Faixa etária', (j) => rotuloFaixa(faixaEtaria(j))],
  ['Status', (j) => STATUS[j.status]?.rotulo],
  ['Origem', (j) => ORIGEM[j.origem]],
  ['Papel', (j) => PAPEIS[j.papel]?.rotulo],
  ['Cargo', (j) => j.cargo_lideranca],
  ['Discipulado por', (j, porId) => porId?.get(j.discipulado_por)?.nome],
  ['Inconsistências', (j) => (j.inconsistencias ?? []).map(tituloInconsistencia).join('; ')],
  ['Códigos', (j) => (j.inconsistencias ?? []).join(';')],
  ['Foto no sistema', (j) => (j.foto_url ? 'Sim' : 'Não')],
  ['Foto (referência antiga)', (j) => j.foto_origem],
  ['Responsável', (j) => j.responsavel_nome],
  ['Telefone do responsável', (j) => formatarTelefone(j.responsavel_telefone)],
  ['Observações', (j) => j.observacoes_admin],
  ['Criado em', (j) => formatarDataHora(j.criado_em)],
  ['Validado em', (j) => formatarDataHora(j.validado_em)],
  ['Validado por', (j) => j.validado_por],
  ['ID', (j) => j.id],
];

const nomeArquivo = (ext) => `sedentos-jovens-${new Date().toISOString().slice(0, 10)}.${ext}`;

function baixar(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportarCsv(jovens, porId) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [COLUNAS.map(([c]) => c), ...jovens.map((j) => COLUNAS.map(([, f]) => f(j, porId)))];
  // ";" e BOM: abre certo no Excel em português
  const texto = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
  baixar(new Blob([texto], { type: 'text/csv;charset=utf-8' }), nomeArquivo('csv'));
}

export async function exportarXlsx(jovens, porId) {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const cabecalho = COLUNAS.map(([c]) => ({ value: c, fontWeight: 'bold', backgroundColor: '#3D5BA9', color: '#FFFFFF' }));
  const linhas = jovens.map((j) =>
    COLUNAS.map(([, f]) => {
      const v = f(j, porId);
      if (v === null || v === undefined || v === '') return null;
      return typeof v === 'number' ? { type: Number, value: v } : { type: String, value: String(v) };
    }),
  );
  await writeXlsxFile([cabecalho, ...linhas], {
    fileName: nomeArquivo('xlsx'),
    sheet: 'Jovens',
    stickyRowsCount: 1,
    columns: COLUNAS.map(([c]) => ({ width: c === 'Nome' || c.startsWith('Foto') || c === 'Inconsistências' || c === 'Discipulado por' ? 36 : 18 })),
  });
}

/** Frequência: uma linha por pessoa, uma coluna por sábado do período. */
export async function exportarFrequencia(tipo, pessoas, cultos, porPessoa, porId) {
  const rotulo = { presente: 'Presente', falta: 'Falta', justificada: 'Justificada' };
  const cab = ['Nome', 'Papel', 'Discipulado por', ...cultos.map((c) => isoParaData(c.data)), 'Presenças', 'Faltas', 'Justificadas', '% presença'];
  const linhas = pessoas.map((j) => {
    const m = porPessoa.get(j.id) ?? {};
    const estados = cultos.map((c) => m[c.id] ?? null);
    const n = (e) => estados.filter((x) => x === e).length;
    const pres = n('presente'); const falt = n('falta');
    return [j.nome, PAPEIS[j.papel]?.rotulo, porId.get(j.discipulado_por)?.nome ?? null,
      ...estados.map((e) => (e ? rotulo[e] : null)), pres, falt, n('justificada'), pres + falt ? Math.round((pres / (pres + falt)) * 100) : null];
  });
  const nome = `sedentos-frequencia-${new Date().toISOString().slice(0, 10)}.${tipo}`;
  if (tipo === 'csv') {
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const texto = '﻿' + [cab, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n');
    baixar(new Blob([texto], { type: 'text/csv;charset=utf-8' }), nome);
    return;
  }
  const { default: writeXlsxFile } = await import('write-excel-file');
  const celula = (v) => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? { type: Number, value: v } : { type: String, value: String(v) });
  await writeXlsxFile([
    cab.map((c) => ({ value: c, fontWeight: 'bold', backgroundColor: '#3D5BA9', color: '#FFFFFF' })),
    ...linhas.map((l) => l.map(celula)),
  ], { fileName: nome, sheet: 'Frequência', stickyRowsCount: 1, columns: cab.map((c, i) => ({ width: i < 3 ? 32 : 12 })) });
}
