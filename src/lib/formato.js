// Máscaras, datas e idade — tudo em português do Brasil.

export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * ÚNICA função de exibição de telefone do sistema.
 * "31972454210" → "(31) 97245-4210". Estrangeiro (mais de 11 dígitos) → "+351312349582".
 */
export function formatarTelefone(v) {
  const d = soDigitos(v);
  if (!d) return '';
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d.length > 11 ? `+${d}` : d;
}

/**
 * ÚNICA função de link do WhatsApp do sistema.
 * "31972454210" → "https://wa.me/5531972454210". Com mais de 11 dígitos o DDI já veio junto e não ganha outro 55.
 */
export function linkWhatsApp(tel, texto) {
  const d = soDigitos(tel);
  if (!d) return null;
  const numero = d.length > 11 ? d : `55${d}`;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

/** Máscara enquanto digita: (99) 99999-9999 */
export function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Máscara enquanto digita: DD/MM/AAAA */
export function mascaraData(v) {
  const d = soDigitos(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "DD/MM/AAAA" → "AAAA-MM-DD" (ou null se não for uma data real) */
export function dataParaIso(br) {
  const m = String(br ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const dt = new Date(Date.UTC(+aaaa, +mm - 1, +dd));
  if (dt.getUTCFullYear() !== +aaaa || dt.getUTCMonth() !== +mm - 1 || dt.getUTCDate() !== +dd) return null;
  return `${aaaa}-${mm}-${dd}`;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" */
export function isoParaData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function formatarDataHora(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function idade(iso, hoje = new Date()) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  let i = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) i--;
  return i;
}

/**
 * Faixas etárias: ÚNICO lugar no front (gráfico, filtro da lista e exportação).
 * Espelha a função public.faixa_etaria() do banco. O ministério começa aos 12;
 * "Abaixo de 12" fica em destaque (ainda é da salinha). Para ajustar, mude aqui e lá.
 */
export const FAIXAS = [
  { id: 'abaixo-12', rotulo: 'Abaixo de 12', min: 0, max: 11, alerta: true },
  { id: '12-14', rotulo: '12 a 14', min: 12, max: 14 },
  { id: '15-17', rotulo: '15 a 17', min: 15, max: 17 },
  { id: '18-19', rotulo: '18 e 19', min: 18, max: 19 },
  { id: '20-21', rotulo: '20 e 21', min: 20, max: 21 },
  { id: '22-23', rotulo: '22 e 23', min: 22, max: 23 },
  { id: '24-25', rotulo: '24 e 25', min: 24, max: 25 },
  { id: '26-27', rotulo: '26 e 27', min: 26, max: 27 },
  { id: '28-29', rotulo: '28 e 29', min: 28, max: 29 },
  { id: '30+', rotulo: '30+', min: 30, max: Infinity },
  { id: 'sem-data', rotulo: 'Sem data válida', semData: true },
];

/**
 * Corte do gráfico "Até 19 × 20+" (mesmo lugar das faixas, para ajustar fácil).
 * Até 19 = idade < IDADE_CORTE_GRUPO; 20+ = idade >= IDADE_CORTE_GRUPO.
 */
export const IDADE_CORTE_GRUPO = 20;
export const GRUPOS_IDADE = [
  { id: 'ate-19', rotulo: `Até ${IDADE_CORTE_GRUPO - 1}`, rotuloLongo: `Até ${IDADE_CORTE_GRUPO - 1} anos`, cor: 'var(--secondary)' },
  { id: '20+', rotulo: `${IDADE_CORTE_GRUPO}+`, rotuloLongo: `${IDADE_CORTE_GRUPO} anos ou mais`, cor: 'var(--primary)' },
];
export const rotuloFaixa = (id) => FAIXAS.find((f) => f.id === id)?.rotulo ?? GRUPOS_IDADE.find((g) => g.id === id)?.rotulo ?? '';

/** Faixa pela idade (null/negativa = "Sem data válida"). */
export function faixaPorIdade(i) {
  if (i === null || i === undefined || i < 0) return 'sem-data';
  return FAIXAS.find((f) => !f.semData && i >= f.min && i <= f.max)?.id ?? 'sem-data';
}

/** Faixa de um cadastro: data vazia, no futuro ou com menos de 5 anos conta como "Sem data válida". */
export function faixaEtaria(j) {
  if (!j.data_nascimento || j.inconsistencias?.includes('NASCIMENTO_INVALIDO')) return 'sem-data';
  const i = idade(j.data_nascimento);
  if (i === null || i < 5) return 'sem-data';
  return faixaPorIdade(i);
}

/** 'ate-19' | '20+' | null (sem data de nascimento válida: fica fora do gráfico). */
export function grupoIdade(j) {
  if (faixaEtaria(j) === 'sem-data') return null;
  return idade(j.data_nascimento) < IDADE_CORTE_GRUPO ? 'ate-19' : '20+';
}

/** Filtro da lista: aceita uma faixa ou um dos dois grupos. */
export const naFaixa = (j, id) => (GRUPOS_IDADE.some((g) => g.id === id) ? grupoIdade(j) === id : faixaEtaria(j) === id);

export const aniversarianteDoMes = (j, mes = new Date().getMonth() + 1) =>
  Boolean(j.data_nascimento) && Number(j.data_nascimento.slice(5, 7)) === mes;

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function iniciais(nome) {
  const p = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** Idade a partir da qual o responsável deixa de ser obrigatório. */
export const IDADE_RESPONSAVEL = 14;

/** Como chamar a pessoa: apelido, senão o primeiro nome. */
export function tratamento(p) {
  const a = String(p?.apelido ?? '').trim();
  if (a) return a;
  const n = String(p?.nome ?? '').trim().split(/\s+/)[0] ?? '';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

/** Validações do formulário (as mesmas que o banco aplica). Retorna { campo: mensagem }. */
export function validarCadastro(f, { exigirFoto }) {
  const e = {};
  const nome = String(f.nome ?? '').trim().replace(/\s+/g, ' ');
  if (!nome) e.nome = 'Escreva seu nome completo.';
  else if (nome.split(' ').length < 2 || nome.length < 5) e.nome = 'Falta o sobrenome. Escreva o nome completo.';

  const apelido = String(f.apelido ?? '').trim().replace(/\s+/g, ' ');
  if (!apelido) e.apelido = 'Conte como você gosta de ser chamado(a).';
  else if (apelido.length < 2 || apelido.length > 30) e.apelido = 'O apelido precisa ter de 2 a 30 letras.';

  if (!f.sexo) e.sexo = 'Escolha uma opção.';

  const tel = soDigitos(f.telefone);
  if (!tel) e.telefone = 'Informe seu WhatsApp.';
  else if (!/^[1-9]{2}9\d{8}$/.test(tel)) e.telefone = 'Use DDD + número com 9 dígitos, ex.: (31) 99999-9999.';

  const iso = dataParaIso(f.nascimento);
  const anos = iso ? idade(iso) : null;
  if (!f.nascimento) e.nascimento = 'Informe sua data de nascimento.';
  else if (!iso || anos < 0) e.nascimento = 'Data inválida. Use o formato DD/MM/AAAA.';
  else if (anos < 5 || anos > 100) e.nascimento = 'Confira o ano de nascimento.';

  if (anos !== null && anos >= 0 && anos < IDADE_RESPONSAVEL) {
    if (!String(f.responsavelNome ?? '').trim()) e.responsavelNome = 'Informe o nome do responsável.';
    const rt = soDigitos(f.responsavelTelefone);
    if (!rt) e.responsavelTelefone = 'Informe o telefone do responsável.';
    else if (!/^[1-9]{2}9\d{8}$/.test(rt)) e.responsavelTelefone = 'Use DDD + número com 9 dígitos.';
  }

  if (exigirFoto && !f.temFoto) e.foto = 'Adicione uma foto sua.';
  if (!f.consentimento) e.consentimento = 'É preciso aceitar para continuar.';
  return e;
}

/** Quem já tem conta precisa completar algo antes de usar o sistema? */
export function precisaCompletar(j) {
  if (!j) return false;
  const anos = j.data_nascimento ? idade(j.data_nascimento) : null;
  return !String(j.apelido ?? '').trim() || !j.sexo
    || (anos !== null && anos >= 0 && anos < IDADE_RESPONSAVEL && (!j.responsavel_nome || !j.responsavel_telefone));
}

// Sugestão de sexo pelo primeiro nome (só sugestão: a liderança confere antes de aplicar).
const FEMININOS = new Set(['alice', 'beatriz', 'ester', 'esther', 'raquel', 'rachel', 'isabel', 'isabelle', 'ingrid', 'miriam', 'carmen', 'lis', 'liz',
  'thais', 'thays', 'ines', 'ruth', 'rute', 'agnes', 'emily', 'emilly', 'kelly', 'jennifer', 'yasmin', 'jasmin', 'lorraine', 'kemilly', 'heloise',
  'nicole', 'michele', 'michelle', 'gabrielle', 'gabriele', 'daniele', 'danielle', 'raissa', 'rayssa', 'beatrice', 'carolyne', 'caroline', 'eloise',
  'evelyn', 'evellyn', 'hellen', 'helen', 'ellen', 'eduarda', 'irene', 'jaqueline', 'jacqueline', 'lauren', 'mabel', 'monique', 'naomi', 'noemi',
  'rachel', 'sarah', 'sara', 'sophie', 'stefany', 'stephanie', 'tamires', 'vitoria', 'victoria', 'yasmim', 'julie', 'emanuelly', 'manuelly', 'natielle',
  'kamille', 'camille', 'ariel', 'mel', 'flor', 'joyce', 'nancy', 'karen', 'ashlley', 'ashley', 'luziellem', 'mariani', 'kely', 'shedly', 'miria', 'raquel', 'larissa', 'lilian', 'marielle', 'shirley', 'sheila', 'suellen', 'janaine', 'jhulia', 'eidsa']);
const MASCULINOS = new Set(['luca', 'lucca', 'joshua', 'nicola', 'elias', 'jonas', 'tomas', 'thomas', 'matias', 'lucas', 'mateus', 'matheus',
  'jose', 'andre', 'felipe', 'henrique', 'guilherme', 'jorge', 'vicente', 'rique', 'kaique', 'caique', 'davi', 'levi', 'ravi', 'noah', 'isaque',
  'gustavo', 'enzo', 'arthur', 'artur', 'joao', 'yago', 'iago', 'hiago', 'thiago', 'tiago', 'william', 'willian', 'wesley', 'kevin', 'ryan',
  'rian', 'luan', 'juan', 'cristian', 'christian', 'samuel', 'daniel', 'gabriel', 'rafael', 'miguel', 'ismael', 'emanuel', 'manoel', 'manuel',
  'anthony', 'antony', 'douglas', 'luiz', 'luis', 'marlon', 'ramon', 'rayan', 'raian', 'richard', 'riquelme', 'ruan', 'asafe', 'asaph', 'johnny', 'danny', 'henry', 'harry', 'rony', 'jhony']);
const semAcentoMin = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** 'feminino' | 'masculino' | null (quando não dá para sugerir com segurança). */
export function sugerirSexo(nome) {
  const p = semAcentoMin(String(nome ?? '').trim().split(/\s+/)[0]);
  if (!p || p.length < 2) return null;
  if (FEMININOS.has(p)) return 'feminino';
  if (MASCULINOS.has(p)) return 'masculino';
  if (/a$/.test(p)) return 'feminino';
  if (/(o|os|son|el|or|ar|er|im|om|um|us|ur)$/.test(p)) return 'masculino';
  if (/(ane|iane|ele|elle|ly|lly|ny|ine|ise|isse|ete|ette)$/.test(p)) return 'feminino';
  return null;
}

export const SEXOS = { feminino: 'Feminino', masculino: 'Masculino' };
