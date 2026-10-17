// =====================================================================
// MODO DEMONSTRAÇÃO: imita o Supabase no navegador, com a base em memória.
// Só entra no build com `npm run build:demo`. Nada é gravado de verdade.
// As regras (inconsistências, travas do jovem, vinculação, mesclagem, rede
// de discipulado e anotações) espelham as do banco em supabase/migrations.
// =====================================================================
import { idade as calcIdade, soDigitos } from '../lib/formato';

export const EMAIL_ADMIN = 'admin@sedentos.demo';
export const EMAIL_DISCIPULADOR = 'discipulador@sedentos.demo';
export const EMAIL_LIDERANCA = 'lideranca@sedentos.demo';
/** Discipuladora fictícia sem apelido e sem sexo: mostra a tela "Complete seu cadastro". */
export const EMAIL_INCOMPLETO = 'camila@sedentos.demo';
/** Secretária fictícia: usuário maria.chamada, senha sedentos123. */
const DOMINIO_SEC = import.meta.env.VITE_SECRETARIO_DOMINIO || 'chamada.sedentos.app';
export const EMAIL_SECRETARIO = `maria.chamada@${DOMINIO_SEC}`;

let base = null;
let historico = [];
let anotacoes = [];
let seqHist = 1;
let limite = 12;
let cultos = [];
let presencas = [];
let notificacoes = [];
const LIM_SEGUIDAS = 2;
const ignorados = new Set();
const fotos = new Map();
const admins = new Set([EMAIL_ADMIN]);
let secretarios = [];
const senhas = new Map();
let acessosLog = [];

let sessao = null;
const ouvintes = new Set();
const emitir = (ev) => ouvintes.forEach((cb) => cb(ev, sessao));

const agora = () => new Date().toISOString();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const uidDe = (email) => `demo-${email}`;
const ehAdmin = () => Boolean(sessao && admins.has(sessao.user.email));
const ehSec = () => Boolean(sessao && secretarios.some((x) => x.user_id === sessao.user.id && x.ativo));
const podeChamada = () => ehAdmin() || ehSec();
const logAcesso = (acao, alvo, detalhes = null) => acessosLog.unshift({ id: acessosLog.length + 1, feito_por: quem(), acao, alvo, detalhes, criado_em: agora() });
function novoSecretario(usuario, nome, senha, por) {
  const email = `${usuario}@${DOMINIO_SEC}`;
  const sec = { id: uuid(), user_id: uidDe(email), usuario, email, nome, ativo: true, criado_por: por, criado_em: agora(), ultimo_acesso_em: null };
  secretarios.push(sec);
  senhas.set(usuario, senha);
  return sec;
}
const quem = () => sessao?.user.email ?? 'sistema';
const idade = (d) => calcIdade(d);
const normNome = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const erro = (message) => { throw new Error(message); };
const NIVEL = { jovem: 1, discipulador: 2, lideranca: 3 };

// ---------- quem é o usuário na rede ----------
const eu = () => (sessao ? base.find((j) => j.user_id === sessao.user.id) : null);
const porId = (id) => base.find((j) => j.id === id);
const ehMeuDiscipulo = (id) => { const e = eu(); const j = porId(id); return Boolean(e && j && e.papel === 'discipulador' && j.papel === 'jovem' && j.discipulado_por === e.id); };
const naMinhaRede = (id) => {
  const e = eu(); const j = porId(id);
  if (!e || !j || e.papel !== 'lideranca') return false;
  return j.discipulado_por === e.id || porId(j.discipulado_por)?.discipulado_por === e.id;
};
const podeVer = (id) => ehAdmin() || eu()?.id === id || ehMeuDiscipulo(id) || naMinhaRede(id);
const podeAnotar = (id) => eu()?.id !== id && (ehAdmin() || naMinhaRede(id) || ehMeuDiscipulo(id));

function calcular(j) {
  const c = [];
  if (!j.email) c.push('EMAIL_AUSENTE');
  if (!j.foto_url) {
    if (!j.foto_origem) c.push('FOTO_AUSENTE');
    else if (/^https?:\/\//i.test(j.foto_origem)) c.push('FOTO_LINK_EXTERNO');
    else c.push('FOTO_ARQUIVO_NAO_ENVIADO');
  }
  if (!j.telefone) c.push('TELEFONE_AUSENTE');
  else {
    if (base.some((o) => o.id !== j.id && o.telefone === j.telefone)) c.push('TELEFONE_DUPLICADO');
    if (!/^[1-9]{2}9\d{8}$/.test(j.telefone)) c.push('TELEFONE_FORMATO_INVALIDO');
  }
  if (j.nome.split(' ').length < 2) c.push('NOME_INCOMPLETO');
  if (j.nome === j.nome.toLowerCase() && j.nome !== j.nome.toUpperCase()) c.push('NOME_CAIXA_BAIXA');
  if (base.some((o) => o.id !== j.id && o.nome.toLowerCase() === j.nome.toLowerCase())) c.push('POSSIVEL_DUPLICADO');
  const hoje = new Date().toISOString().slice(0, 10);
  const invalido = !j.data_nascimento || j.data_nascimento > hoje || idade(j.data_nascimento) < 5;
  if (invalido) c.push('NASCIMENTO_INVALIDO');
  if (!String(j.apelido ?? '').trim()) c.push('APELIDO_AUSENTE');
  if (!j.sexo) c.push('SEXO_AUSENTE');
  if (j.data_nascimento && j.data_nascimento <= hoje && idade(j.data_nascimento) >= 5 && idade(j.data_nascimento) < 14 && (!j.responsavel_nome || !j.responsavel_telefone)) c.push('RESPONSAVEL_AUSENTE');
  return c;
}
const recalcularTodos = () => base.forEach((j) => { j.inconsistencias = calcular(j); });

function registrar(jovem_id, acao, campos = null, por = quem()) {
  historico.push({ id: seqHist++, jovem_id, alterado_em: agora(), alterado_por: por, acao, campos });
}

// ---------- rede de exemplo (pessoas fictícias) ----------
function pessoaExemplo(id, nome, email, papel, cargo, tel, nasc, apelido = nome.split(' ')[0], sexo = null) {
  return {
    id, user_id: null, nome, apelido, sexo, email, telefone: tel, data_nascimento: nasc, foto_url: null, foto_origem: null,
    status: 'validado', inconsistencias: [], origem: 'autocadastro', observacoes_admin: 'Pessoa fictícia da demonstração.',
    responsavel_nome: null, responsavel_telefone: null, consentimento_em: agora(), criado_em: agora(), atualizado_em: agora(),
    validado_em: agora(), validado_por: EMAIL_ADMIN, papel, cargo_lideranca: cargo, discipulado_por: null, ativo: true,
  };
}

function montarRedeExemplo() {
  const L1 = pessoaExemplo('ex-l1', 'Ana Exemplo Ribeiro', EMAIL_LIDERANCA, 'lideranca', 'Líder de jovens', '31990001001', '1988-03-12', 'Aninha', 'feminino');
  const L2 = pessoaExemplo('ex-l2', 'Bruno Exemplo Alves', 'bruno@sedentos.demo', 'lideranca', 'Pastor de jovens', '31990001002', '1985-07-21', 'Bruno', 'masculino');
  const ds = [
    pessoaExemplo('ex-d1', 'Rafael Exemplo Costa', EMAIL_DISCIPULADOR, 'discipulador', null, '31990001003', '1996-10-30', 'Rafa', 'masculino'),
    pessoaExemplo('ex-d2', 'Camila Exemplo Duarte', 'camila@sedentos.demo', 'discipulador', null, '31990001004', '1998-01-09', null, null),
    pessoaExemplo('ex-d3', 'Diego Exemplo Faria', null, 'discipulador', null, '31990001005', '1997-05-17', 'Diego', 'masculino'),
    pessoaExemplo('ex-d4', 'Elisa Exemplo Gomes', 'elisa@sedentos.demo', 'discipulador', null, '31990001006', '1999-12-02', 'Lisa', 'feminino'),
    pessoaExemplo('ex-d5', 'Felipe Exemplo Lima', null, 'discipulador', null, '31990001007', '2000-04-25', 'Felipe', 'masculino'),
  ];
  ds[0].discipulado_por = L1.id; ds[1].discipulado_por = L1.id; ds[2].discipulado_por = L1.id; ds[3].discipulado_por = L2.id;
  // Jovens reais da base (sem data inválida), distribuídos: Rafael fica com 13 (acima do limite de 12).
  const elegiveis = base.filter((j) => j.data_nascimento && !calcular(j).includes('NASCIMENTO_INVALIDO'))
    .sort((a, b) => a.id.localeCompare(b.id));
  // Quem faz aniversário mais cedo fica com o Rafael, para a demonstração mostrar o destaque.
  const hoje = new Date();
  const diasAte = (iso) => { const [, m, d] = iso.split('-').map(Number); let a = new Date(hoje.getFullYear(), m - 1, d); if (a < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) a = new Date(hoje.getFullYear() + 1, m - 1, d); return a - hoje; };
  const iProx = elegiveis.reduce((best, j, i) => (diasAte(j.data_nascimento) < diasAte(elegiveis[best].data_nascimento) ? i : best), 0);
  [elegiveis[0], elegiveis[iProx]] = [elegiveis[iProx], elegiveis[0]];
  const cotas = [13, 8, 6, 7, 3];
  let k = 0;
  cotas.forEach((n, i) => { for (let x = 0; x < n; x++) elegiveis[k++].discipulado_por = ds[i].id; });
  base.push(L1, L2, ...ds);

  const meus = base.filter((j) => j.discipulado_por === 'ex-d1');
  const nota = (jovem, autor, tipo, texto, horas) => anotacoes.push({
    id: uuid(), jovem_id: jovem.id, autor_id: autor.id, autor_email: autor.email, autor_nome: autor.nome,
    tipo, texto, criado_em: new Date(Date.now() - horas * 3600_000).toISOString(), editado_em: null,
  });
  nota(meus[0], ds[0], 'acompanhamento', 'Conversamos depois do culto. Está animado com o grupo de quinta.', 72);
  nota(meus[0], ds[0], 'pedido_oracao', 'Pediu oração pela família.', 3);
  nota(meus[1], ds[0], 'conquista', 'Começou a servir no louvor!', 30);
  nota(ds[0], L1, 'acompanhamento', 'Rafael está com muitos discípulos; avaliar dividir o grupo.', 20);
}

async function carregar() {
  if (base) return;
  // glob: o build normal não quebra se o arquivo de dados não existir.
  const carregadores = import.meta.glob('./dados.json');
  if (!carregadores['./dados.json']) erro('Dados de demonstração ausentes (src/demo/dados.json).');
  const { default: dados } = await carregadores['./dados.json']();
  base = dados.map((j) => ({ papel: 'jovem', cargo_lideranca: null, discipulado_por: null, ativo: true, apelido: null, sexo: null, ...j }));
  recalcularTodos();
  base.forEach((j) => registrar(j.id, 'importacao', null, 'sistema (importação)'));
  montarRedeExemplo();
  recalcularTodos();
  novoSecretario('maria.chamada', 'Maria da Chamada', 'sedentos123', EMAIL_ADMIN);
  acessosLog.unshift({ id: 1, feito_por: EMAIL_ADMIN, acao: 'secretario_criado', alvo: 'maria.chamada', detalhes: { nome: 'Maria da Chamada' }, criado_em: agora() });
  semearChamadas();
  garantirCultos();
}

function normalizar(d) {
  const r = { ...d };
  if ('nome' in r) r.nome = normNome(r.nome);
  if ('apelido' in r) r.apelido = String(r.apelido ?? '').trim().replace(/\s+/g, ' ') || null;
  if ('sexo' in r) r.sexo = ['feminino', 'masculino'].includes(r.sexo) ? r.sexo : null;
  if ('telefone' in r) r.telefone = soDigitos(r.telefone) || null;
  if ('responsavel_telefone' in r) r.responsavel_telefone = soDigitos(r.responsavel_telefone) || null;
  if ('email' in r) r.email = r.email ? String(r.email).trim().toLowerCase() : null;
  return r;
}

function validarJovem(j) {
  if (j.nome.split(' ').length < 2 || j.nome.length < 5) erro('Informe seu nome completo (nome e sobrenome).');
  if (!j.telefone || !/^[1-9]{2}9\d{8}$/.test(j.telefone)) erro('Telefone inválido. Use DDD + número, por exemplo (31) 99999-9999.');
  if (!j.data_nascimento || j.data_nascimento > new Date().toISOString().slice(0, 10)) erro('Informe uma data de nascimento válida.');
  const i = idade(j.data_nascimento);
  if (i < 5 || i > 100) erro('Confira a data de nascimento.');
  if (!j.consentimento_em) erro('É preciso aceitar o termo de uso dos dados e da imagem.');
  if (!j.apelido || j.apelido.length < 2 || j.apelido.length > 30) erro('Informe como você gosta de ser chamado(a): o apelido precisa ter de 2 a 30 caracteres.');
  if (!j.sexo) erro('Informe o sexo.');
  if (i < 14 && (!j.responsavel_nome || !j.responsavel_telefone)) erro('Para menores de 14 anos, informe o nome e o telefone do responsável.');
  if (j.responsavel_telefone && !/^[1-9]{2}9\d{8}$/.test(j.responsavel_telefone)) erro('Telefone do responsável inválido. Use DDD + número, por exemplo (31) 99999-9999.');
}

/** Regras da rede (espelho do gatilho jovens_rede_before). */
function validarRede(novo, antes) {
  if (novo.papel !== 'lideranca') novo.cargo_lideranca = null;
  else novo.cargo_lideranca = normNome(novo.cargo_lideranca) || null;
  if (antes && novo.papel !== antes.papel && ['discipulador', 'lideranca'].includes(antes.papel)) {
    const n = base.filter((j) => j.discipulado_por === antes.id).length;
    if (n) erro(`${antes.nome} tem ${n} ${antes.papel === 'discipulador' ? 'discípulo(s)' : 'discipulador(es)'} ligado(s). Transfira antes de mudar o papel.`);
  }
  if (novo.discipulado_por) {
    if (novo.discipulado_por === novo.id) erro('Uma pessoa não pode ser discipulada por ela mesma.');
    const alvo = porId(novo.discipulado_por)?.papel;
    const valido = novo.papel === 'discipulador' ? alvo === 'lideranca' : novo.papel === 'jovem' ? alvo === 'discipulador' : false;
    if (!valido) {
      if (antes && novo.papel !== antes.papel && novo.discipulado_por === antes.discipulado_por) novo.discipulado_por = null;
      else if (novo.papel === 'lideranca') erro('A Liderança não tem ninguém acima dela na rede.');
      else if (novo.papel === 'discipulador') erro('Um discipulador só pode ser ligado a alguém da Liderança.');
      else erro('Um jovem só pode ser ligado a um discipulador.');
    }
  }
}

const CAMPOS_HIST = ['nome', 'apelido', 'sexo', 'email', 'telefone', 'data_nascimento', 'foto_url', 'foto_origem', 'status', 'observacoes_admin',
  'responsavel_nome', 'responsavel_telefone', 'papel', 'cargo_lideranca', 'discipulado_por', 'ativo'];

function aplicarUpdate(alvo, dados, { sistema = false } = {}) {
  const antes = { ...alvo };
  let d = normalizar(dados);
  if (!ehAdmin() && !sistema) {
    const { nome, apelido, sexo, telefone, data_nascimento, foto_url, responsavel_nome, responsavel_telefone, consentimento_em } = d;
    d = Object.fromEntries(Object.entries({ nome, apelido, sexo, telefone, data_nascimento, foto_url, responsavel_nome, responsavel_telefone, consentimento_em }).filter(([, v]) => v !== undefined));
  }
  if (d.email && base.some((o) => o.id !== alvo.id && o.email === d.email)) erro('Este e-mail já está em outro cadastro.');
  const novo = { ...alvo, ...d };
  if (!ehAdmin() && !sistema) {
    novo.ativo = antes.ativo;
    validarJovem(novo);
    if (antes.status === 'validado' && ['nome', 'telefone', 'data_nascimento', 'foto_url'].some((c) => novo[c] !== antes[c])) novo.status = 'pendente_validacao';
  }
  validarRede(novo, antes);
  if (novo.status !== antes.status) {
    novo.validado_em = novo.status === 'validado' ? agora() : null;
    novo.validado_por = novo.status === 'validado' ? quem() : null;
  }
  novo.atualizado_em = agora();
  Object.assign(alvo, novo);
  recalcularTodos();
  if (sistema) return alvo;
  const diff = {};
  for (const c of CAMPOS_HIST) if ((antes[c] ?? null) !== (alvo[c] ?? null)) diff[c] = { de: antes[c] ?? null, para: alvo[c] ?? null };
  if (diff.discipulado_por) diff.discipulado_por = { de: porId(antes.discipulado_por)?.nome ?? null, para: porId(alvo.discipulado_por)?.nome ?? null };
  if (Object.keys(diff).length) registrar(alvo.id, 'edicao', diff);
  return alvo;
}

// ---------- query builder no formato do supabase-js ----------
class Consulta {
  constructor(tabela) {
    Object.assign(this, { tabela, op: 'select', filtros: [], dados: null, modo: 'lista', ordem: null, faixa: null, limite: null });
  }
  select() { return this; }
  insert(d) { this.op = 'insert'; this.dados = d; return this; }
  update(d) { this.op = 'update'; this.dados = d; return this; }
  upsert(d) { this.op = 'insert'; this.dados = d; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filtros.push((j) => j[c] === v); return this; }
  neq(c, v) { this.filtros.push((j) => j[c] !== v); return this; }
  in(c, vs) { this.filtros.push((j) => vs.includes(j[c])); return this; }
  is(c, v) { this.filtros.push((j) => (v === null ? j[c] == null : j[c] === v)); return this; }
  not(c, op, v) { this.filtros.push((j) => (op === 'is' && v === null ? j[c] != null : j[c] !== v)); return this; }
  gte(c, v) { this.filtros.push((j) => j[c] >= v); return this; }
  lte(c, v) { this.filtros.push((j) => j[c] <= v); return this; }
  lt(c, v) { this.filtros.push((j) => j[c] < v); return this; }
  or() { return this; }
  order(c, { ascending = true } = {}) { this.ordem = [c, ascending]; return this; }
  range(a, b) { this.faixa = [a, b]; return this; }
  limit(n) { this.limite = n; return this; }
  single() { this.modo = 'um'; return this; }
  maybeSingle() { this.modo = 'talvez'; return this; }
  then(ok, falha) { return this.executar().then(ok, falha); }

  async executar() {
    await carregar();
    await new Promise((r) => setTimeout(r, 120)); // simula a rede
    try {
      let linhas = this.rodar();
      linhas = linhas.map((j) => JSON.parse(JSON.stringify(j)));
      if (this.modo === 'um') {
        if (!linhas.length) return { data: null, error: { message: 'Registro não encontrado.' } };
        return { data: linhas[0], error: null };
      }
      if (this.modo === 'talvez') return { data: linhas[0] ?? null, error: null };
      return { data: linhas, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }

  ordenar(linhas) {
    if (this.ordem) {
      const [c, asc] = this.ordem;
      linhas = [...linhas].sort((a, b) => String(a[c] ?? '').localeCompare(String(b[c] ?? ''), 'pt-BR') * (asc ? 1 : -1));
    }
    if (this.faixa) linhas = linhas.slice(this.faixa[0], this.faixa[1] + 1);
    if (this.limite) linhas = linhas.slice(0, this.limite);
    return linhas;
  }

  rodar() {
    if (!sessao) erro('Faça login novamente.');
    const passa = (j) => this.filtros.every((f) => f(j));
    if (this.tabela === 'jovens_historico') {
      if (!ehAdmin()) return [];
      const h = historico.filter(passa).sort((a, b) => (a.alterado_em < b.alterado_em ? 1 : -1) || b.id - a.id);
      return this.limite ? h.slice(0, this.limite) : h;
    }
    if (this.tabela === 'config_rede') {
      if (!ehAdmin()) return [];
      if (this.op === 'update') limite = Number(this.dados.limite_discipulos) || limite;
      return [{ id: true, limite_discipulos: limite }];
    }
    if (this.tabela === 'anotacoes_discipulado') return this.rodarAnotacoes(passa);
    if (this.tabela === 'secretarios') {
      if (!ehAdmin()) { if (this.op !== 'select') erro('permission denied for table secretarios'); return []; }
      if (this.op !== 'select') erro('permission denied for table secretarios');
      return this.ordenar(secretarios.filter(passa));
    }
    if (this.tabela === 'acessos_log') {
      if (!ehAdmin()) return [];
      return this.ordenar(acessosLog.filter(passa));
    }
    if (this.tabela === 'admins') {
      if (!ehAdmin()) return [];
      if (this.op === 'insert') {
        const email = String((Array.isArray(this.dados) ? this.dados[0] : this.dados).email ?? '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erro('E-mail inválido.');
        if (secretarios.some((x) => x.email === email)) erro('Este e-mail é de uma conta de secretário.');
        if (admins.has(email)) erro('duplicate key value violates unique constraint "admins_pkey"');
        admins.add(email); logAcesso('admin_adicionado', email);
        return [{ email }];
      }
      const lista = [...admins].map((email) => ({ email })).filter(passa);
      if (this.op === 'delete') {
        for (const a of lista) {
          if (admins.size <= 1) erro('Não é possível remover o último administrador.');
          if (a.email === sessao.user.email) erro('Você não pode remover a si mesmo.');
          admins.delete(a.email); logAcesso('admin_removido', a.email);
        }
      }
      return lista;
    }
    if (this.tabela === 'cultos') {
      if (!(ehAdmin() || ehSec() || ['discipulador', 'lideranca'].includes(eu()?.papel))) return [];
      return this.ordenar(cultos.filter(passa));
    }
    if (this.tabela === 'presencas') {
      const ve = (p) => ehAdmin() || ehMeuDiscipulo(p.jovem_id) || naMinhaRede(p.jovem_id);
      if (this.op !== 'select') erro('permission denied for table presencas');
      return this.ordenar(presencas.filter((p) => ve(p) && passa(p)));
    }
    if (this.tabela === 'push_inscricoes') return [];
    if (this.tabela === 'notificacoes') {
      const meu = eu()?.id;
      const ve = (n) => ehAdmin() || (meu && n.destinatario_id === meu);
      if (this.op === 'update') {
        const pode = (n) => (meu && n.destinatario_id === meu) || (n.para_admins && ehAdmin());
        return notificacoes.filter((n) => pode(n) && passa(n)).map((n) => Object.assign(n, {
          lida_em: this.dados.lida_em ?? n.lida_em, contato_feito_em: this.dados.contato_feito_em ?? n.contato_feito_em,
        }));
      }
      return this.ordenar(notificacoes.filter((n) => ve(n) && passa(n))).map((n) => ({ ...n, cultos: (({ data, titulo }) => ({ data, titulo }))(cultos.find((c) => c.id === n.culto_id) ?? {}) }));
    }
    if (this.tabela !== 'jovens') return [];
    const visivel = (j) => ehAdmin() || j.user_id === sessao.user.id;

    if (this.op === 'insert') {
      const d = normalizar(Array.isArray(this.dados) ? this.dados[0] : this.dados);
      const novo = {
        id: uuid(), user_id: null, nome: '', apelido: null, sexo: null, email: null, telefone: null, data_nascimento: null, foto_url: null, foto_origem: null,
        status: 'pendente_validacao', inconsistencias: [], origem: 'autocadastro', observacoes_admin: null,
        responsavel_nome: null, responsavel_telefone: null, consentimento_em: null, papel: 'jovem', cargo_lideranca: null, discipulado_por: null,
        criado_em: agora(), atualizado_em: agora(), validado_em: null, validado_por: null, ...d,
      };
      if (ehSec() && !ehAdmin()) erro('Contas de secretário não têm cadastro de jovem.');
      if (!ehAdmin()) {
        Object.assign(novo, { user_id: sessao.user.id, email: sessao.user.email, origem: 'autocadastro', status: 'pendente_validacao',
          observacoes_admin: null, foto_origem: null, papel: 'jovem', cargo_lideranca: null, discipulado_por: null });
        if (base.some((o) => o.user_id === novo.user_id)) erro('Você já tem um cadastro.');
        validarJovem(novo);
      }
      validarRede(novo, null);
      base.push(novo);
      recalcularTodos();
      registrar(novo.id, 'cadastro');
      return [novo];
    }
    if (this.op === 'update') {
      return base.filter((j) => visivel(j) && passa(j)).map((j) => aplicarUpdate(j, this.dados));
    }
    return this.ordenar(base.filter((j) => visivel(j) && passa(j)));
  }

  rodarAnotacoes(passa) {
    const meuEmail = sessao.user.email;
    const ve = (a) => ehAdmin() || naMinhaRede(a.jovem_id) || (a.autor_email === meuEmail && ehMeuDiscipulo(a.jovem_id));
    const editavel = (a) => a.autor_email === meuEmail && Date.now() - new Date(a.criado_em).getTime() < 86_400_000 && podeAnotar(a.jovem_id);
    if (this.op === 'insert') {
      const d = Array.isArray(this.dados) ? this.dados[0] : this.dados;
      if (!podeAnotar(d.jovem_id)) erro('new row violates row-level security policy');
      const texto = String(d.texto ?? '').trim();
      if (!texto || texto.length > 2000) erro('A anotação precisa ter entre 1 e 2000 caracteres.');
      const e = eu();
      const nova = { id: uuid(), jovem_id: d.jovem_id, autor_id: e?.id ?? null, autor_email: meuEmail, autor_nome: e?.nome ?? meuEmail,
        tipo: d.tipo ?? 'acompanhamento', texto, criado_em: agora(), editado_em: null };
      anotacoes.push(nova);
      return [nova];
    }
    if (this.op === 'update') {
      return anotacoes.filter((a) => passa(a) && ve(a) && editavel(a)).map((a) => Object.assign(a, {
        texto: String(this.dados.texto ?? a.texto).trim(), tipo: this.dados.tipo ?? a.tipo, editado_em: agora(),
      }));
    }
    if (this.op === 'delete') {
      const sai = anotacoes.filter((a) => passa(a) && ve(a) && (ehAdmin() || editavel(a)));
      anotacoes = anotacoes.filter((a) => !sai.includes(a));
      return sai;
    }
    return this.ordenar(anotacoes.filter((a) => ve(a) && passa(a)));
  }
}

// ---------- funções (RPC) ----------
function exigirAdmin() { if (!ehAdmin()) erro('Apenas administradores.'); }
function exigirChamada() { if (!podeChamada()) erro('Apenas administradores e secretários da chamada.'); }

/** Imita a Edge Function gerenciar-secretarios. */
function gerenciarSecretarios(corpo) {
  if (!ehAdmin()) return { erro: 'Apenas administradores.' };
  const senhaRuim = (x) => (typeof x !== 'string' || x.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : null);
  if (corpo.acao === 'criar') {
    const usuario = String(corpo.usuario ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(usuario)) return { erro: 'Usuário inválido.' };
    if (senhaRuim(corpo.senha)) return { erro: senhaRuim(corpo.senha) };
    if (secretarios.some((x) => x.usuario === usuario)) return { erro: 'Esse usuário já existe. Escolha outro.' };
    const sec = novoSecretario(usuario, normNome(corpo.nome), corpo.senha, quem());
    logAcesso('secretario_criado', usuario, { nome: sec.nome });
    return { secretario: sec };
  }
  const x = secretarios.find((y) => y.id === corpo.id);
  if (!x) return { erro: 'Secretário não encontrado.' };
  if (corpo.acao === 'senha') {
    if (senhaRuim(corpo.senha)) return { erro: senhaRuim(corpo.senha) };
    senhas.set(x.usuario, corpo.senha); logAcesso('secretario_senha', x.usuario);
    return { ok: true };
  }
  if (corpo.acao === 'remover') {
    secretarios = secretarios.filter((y) => y.id !== x.id); senhas.delete(x.usuario);
    logAcesso('secretario_removido', x.usuario, { nome: x.nome });
    if (sessao?.user.id === x.user_id) { sessao = null; emitir('SIGNED_OUT'); }
    return { ok: true };
  }
  return { erro: 'Ação desconhecida.' };
}

function emMassa(ids, aplicar) {
  exigirAdmin();
  const falhas = [];
  for (const id of ids) {
    const j = porId(id);
    try { aplicarUpdate(j, aplicar(j)); } catch (e) { falhas.push({ jovem_id: id, jovem_nome: j?.nome, erro: e.message }); }
  }
  return falhas;
}

// ---------- chamada (espelho de 20261019000000_chamada_cultos.sql) ----------
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const maisDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pNome = (n) => { const p = String(n).trim().split(/\s+/)[0]; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };
const culto = (id) => cultos.find((c) => c.id === id);
const pres = (cid, jid) => presencas.find((p) => p.culto_id === cid && p.jovem_id === jid);

function garantirCultos() {
  const hoje = hojeISO();
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  let prox = maisDias(hoje, (6 - dow + 7) % 7);
  if (prox === hoje) prox = maisDias(hoje, 7);
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const d = maisDias(prox, i * 7);
    if (!cultos.some((c) => c.data === d)) { cultos.push(novoCulto(d)); n++; }
  }
  cultos.sort((a, b) => a.data.localeCompare(b.data));
  return n;
}
function novoCulto(data, extra = false, titulo = 'Culto de Jovens') {
  return { id: uuid(), data, titulo, status: 'agendado', extra, aberto_em: null, fechado_em: null, fechado_por: null, observacao: null, criado_em: agora() };
}
function sequencia(jid, cid) {
  const alvo = culto(cid).data;
  let n = 0;
  for (const c of [...cultos].filter((c) => c.data <= alvo && (c.status === 'fechado' || c.id === cid)).sort((a, b) => b.data.localeCompare(a.data))) {
    if (pres(c.id, jid)?.estado !== 'falta') break;
    n++;
  }
  return n;
}
function avisar(dados) {
  const existente = notificacoes.find((n) => n.destinatario_id === dados.destinatario_id && n.tipo === dados.tipo && n.jovem_id === dados.jovem_id && n.culto_id === dados.culto_id);
  if (existente) { Object.assign(existente, dados, { cancelada_em: null }); return 0; }
  notificacoes.push({ id: uuid(), para_admins: false, criado_em: agora(), lida_em: null, contato_feito_em: null, cancelada_em: null, email_enviado_em: null, push_enviado_em: null, ...dados });
  return 1;
}
function notificarFalta(cid, jid) {
  const j = porId(jid); const c = culto(cid);
  if (!j || j.ativo === false || j.papel === 'lideranca' || !j.discipulado_por) return 0;
  const seq = sequencia(jid, cid);
  let novos = avisar({ destinatario_id: j.discipulado_por, tipo: 'falta', jovem_id: jid, culto_id: cid,
    mensagem: `${pNome(j.nome)} faltou ao ${c.titulo} de sábado, ${dm(c.data)}.`, dados: { sequencia: seq } });
  if (seq >= LIM_SEGUIDAS && j.papel === 'jovem') {
    const lider = porId(j.discipulado_por)?.discipulado_por;
    if (lider) novos += avisar({ destinatario_id: lider, tipo: 'faltas_seguidas', jovem_id: jid, culto_id: cid,
      mensagem: `${pNome(j.nome)} faltou ${seq} cultos seguidos (último: ${dm(c.data)}).`, dados: { sequencia: seq, discipulador_id: j.discipulado_por } });
  }
  return novos;
}
function atualizarResumo(cid) {
  const lista = presencas.filter((p) => p.culto_id === cid && p.estado === 'falta').map((p) => porId(p.jovem_id))
    .filter((j) => j && !j.discipulado_por && j.papel !== 'lideranca').sort((a, b) => a.nome.localeCompare(b.nome));
  const r = notificacoes.find((n) => n.para_admins && n.culto_id === cid);
  if (!lista.length) { if (r) r.cancelada_em = r.cancelada_em ?? agora(); return; }
  const dados = { jovens: lista.map((j) => ({ id: j.id, nome: j.nome })), total: lista.length };
  const mensagem = `${lista.length} ${lista.length === 1 ? 'pessoa' : 'pessoas'} sem discipulador ${lista.length === 1 ? 'faltou' : 'faltaram'} no culto de ${dm(culto(cid).data)}.`;
  if (r) Object.assign(r, { dados, mensagem, cancelada_em: null });
  else notificacoes.push({ id: uuid(), destinatario_id: null, para_admins: true, tipo: 'falta_sem_discipulador', jovem_id: null, culto_id: cid, mensagem, dados,
    criado_em: agora(), lida_em: null, contato_feito_em: null, cancelada_em: null });
}
function marcar(cid, jid, estado, motivo) {
  const c = culto(cid);
  if (!c) erro('Culto não encontrado.');
  if (c.status === 'cancelado') erro('Este culto foi cancelado.');
  if (c.status === 'agendado') Object.assign(c, { status: 'aberto', aberto_em: agora() });
  const antes = pres(cid, jid)?.estado ?? null;
  if (!estado) {
    if (c.status === 'fechado') erro('Chamada fechada: escolha presente, falta ou justificada.');
    presencas = presencas.filter((p) => !(p.culto_id === cid && p.jovem_id === jid));
    return null;
  }
  if (estado === 'justificada' && !String(motivo ?? '').trim()) erro('Informe o motivo da falta justificada.');
  const reg = pres(cid, jid) ?? (presencas.push({ culto_id: cid, jovem_id: jid }), pres(cid, jid));
  Object.assign(reg, { estado, motivo: estado === 'justificada' ? String(motivo).trim() : null, marcado_por: quem(), marcado_em: agora() });
  if (c.status === 'fechado' && antes !== estado) {
    if (estado === 'falta') notificarFalta(cid, jid);
    else notificacoes.filter((n) => n.culto_id === cid && n.jovem_id === jid && !n.cancelada_em).forEach((n) => { n.cancelada_em = agora(); });
    atualizarResumo(cid);
    registrar(jid, 'presenca', { culto: dm(c.data), de: antes, para: estado, motivo: reg.motivo });
  }
  return reg;
}
function resumoCulto(cid) {
  const ps = presencas.filter((p) => p.culto_id === cid);
  const ns = notificacoes.filter((n) => n.culto_id === cid && !n.cancelada_em && !n.para_admins);
  return {
    presentes: ps.filter((p) => p.estado === 'presente').length, faltas: ps.filter((p) => p.estado === 'falta').length,
    justificadas: ps.filter((p) => p.estado === 'justificada').length, avisos: ns.length,
    contatos_feitos: ns.filter((n) => n.contato_feito_em).length,
    discipuladores_avisados: new Set(ns.filter((n) => n.tipo === 'falta').map((n) => n.destinatario_id)).size,
  };
}
function fechar(cid) {
  const c = culto(cid);
  if (!c) erro('Culto não encontrado.');
  if (c.status === 'cancelado') erro('Este culto foi cancelado.');
  let avisos = 0;
  if (c.status !== 'fechado') {
    base.filter((j) => j.ativo !== false && !pres(cid, j.id)).forEach((j) => presencas.push({ culto_id: cid, jovem_id: j.id, estado: 'falta', motivo: null, marcado_por: 'fechamento', marcado_em: agora() }));
    presencas.filter((p) => p.culto_id === cid && p.estado === 'falta').forEach((p) => { avisos += notificarFalta(cid, p.jovem_id); });
    atualizarResumo(cid);
    Object.assign(c, { status: 'fechado', fechado_em: agora(), fechado_por: quem() });
  }
  return { ...resumoCulto(cid), avisos_enviados: avisos };
}

/** Oito sábados anteriores com presenças "de verdade" para a demonstração. */
function semearChamadas() {
  const hoje = hojeISO();
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const ultimoSab = maisDias(hoje, -(((dow - 6) + 7) % 7 || 7));
  const datas = Array.from({ length: 8 }, (_, i) => maisDias(ultimoSab, -7 * (7 - i)));
  const hash = (t) => { let h = 2166136261; for (const ch of t) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
  const rafael = base.filter((j) => j.discipulado_por === 'ex-d1').map((j) => j.id);
  const faltosos = new Set(rafael.slice(1, 4)); // faltam nos dois últimos sábados (2 faltas seguidas)
  datas.forEach((d, i) => {
    const c = novoCulto(d);
    cultos.push(c);
    if (i === 3) { Object.assign(c, { status: 'cancelado', observacao: 'Retiro de jovens' }); return; }
    c.status = 'aberto';
    for (const j of base) {
      const r = hash(`${j.id}|${d}`);
      const ultimos = i >= 6 && faltosos.has(j.id);
      if (ultimos) continue;
      if (r < (j.discipulado_por || j.papel !== 'jovem' ? 0.78 : 0.55)) presencas.push({ culto_id: c.id, jovem_id: j.id, estado: 'presente', motivo: null, marcado_por: EMAIL_ADMIN, marcado_em: agora() });
      else if (r > 0.95) presencas.push({ culto_id: c.id, jovem_id: j.id, estado: 'justificada', motivo: 'Viagem', marcado_por: EMAIL_ADMIN, marcado_em: agora() });
    }
    fechar(c.id);
    c.fechado_por = EMAIL_ADMIN;
    // avisos antigos já foram respondidos; os do último sábado estão pendentes
    const ns = notificacoes.filter((n) => n.culto_id === c.id);
    ns.forEach((n) => { n.criado_em = `${d}T23:30:00.000Z`; if (i < 7) { n.lida_em = n.criado_em; n.contato_feito_em = `${maisDias(d, 1)}T15:00:00.000Z`; } });
  });
  cultos.sort((a, b) => a.data.localeCompare(b.data));
  historico = historico.filter((h) => h.acao !== 'presenca');
}

const rpcs = {
  eh_admin: () => ehAdmin(),
  garantir_cultos: () => { exigirChamada(); return garantirCultos(); },
  criar_culto_extra: ({ p_data, p_titulo }) => {
    exigirAdmin();
    const ex = cultos.find((c) => c.data === p_data);
    if (ex && ex.status !== 'cancelado') erro(`Já existe um culto em ${dm(p_data)}.`);
    if (ex) { Object.assign(ex, { status: 'agendado', titulo: p_titulo || 'Culto de Jovens', observacao: null }); return ex; }
    const c = novoCulto(p_data, new Date(`${p_data}T12:00:00Z`).getUTCDay() !== 6, p_titulo || 'Culto de Jovens');
    cultos.push(c); cultos.sort((a, b) => a.data.localeCompare(b.data));
    return c;
  },
  cancelar_culto: ({ p_culto, p_observacao }) => {
    exigirChamada();
    const c = culto(p_culto);
    if (c.status === 'fechado') erro('Esta chamada já foi fechada. Corrija as presenças em vez de cancelar.');
    presencas = presencas.filter((p) => p.culto_id !== p_culto);
    Object.assign(c, { status: 'cancelado', observacao: p_observacao || null });
    return null;
  },
  reativar_culto: ({ p_culto }) => { exigirChamada(); const c = culto(p_culto); if (c.status === 'cancelado') c.status = 'agendado'; return null; },
  abrir_chamada: ({ p_culto }) => {
    exigirChamada();
    const c = culto(p_culto);
    if (c.status === 'cancelado') erro('Este culto foi cancelado.');
    if (c.status === 'agendado') Object.assign(c, { status: 'aberto', aberto_em: agora() });
    return c;
  },
  marcar_presenca: ({ p_culto, p_jovem, p_estado, p_motivo }) => { exigirChamada(); return marcar(p_culto, p_jovem, p_estado, p_motivo); },
  fechar_chamada: ({ p_culto }) => {
    exigirChamada();
    const r = fechar(p_culto);
    return ehAdmin() ? r : { presentes: r.presentes, faltas: r.faltas, justificadas: r.justificadas };
  },
  resumo_culto: ({ p_culto }) => { exigirAdmin(); return resumoCulto(p_culto); },
  resumo_culto_secretario: ({ p_culto }) => {
    exigirChamada();
    const r = resumoCulto(p_culto);
    return { presentes: r.presentes, faltas: r.faltas, justificadas: r.justificadas };
  },
  lista_cultos_chamada: () => {
    exigirChamada();
    return cultos.map((c) => {
      const ps = presencas.filter((p) => p.culto_id === c.id);
      return { id: c.id, data: c.data, titulo: c.titulo, status: c.status, extra: c.extra, observacao: c.observacao,
        presentes: ps.filter((p) => p.estado === 'presente').length, faltas: ps.filter((p) => p.estado === 'falta').length,
        justificadas: ps.filter((p) => p.estado === 'justificada').length };
    });
  },
  // Exatamente as 7 colunas do banco: nada de telefone, rede ou nascimento.
  lista_chamada: ({ p_culto }) => {
    exigirChamada();
    if (!culto(p_culto)) erro('Culto não encontrado.');
    const eu2 = quem(); const adm = ehAdmin();
    return base.filter((j) => j.ativo !== false || pres(p_culto, j.id))
      .map((j) => { const p = pres(p_culto, j.id); return { jovem_id: j.id, nome: j.nome, apelido: j.apelido ?? null, foto_url: j.foto_url ?? null,
        estado: p?.estado ?? null, motivo: p && (adm || p.marcado_por === eu2) ? p.motivo ?? null : null, marcado_por_mim: Boolean(p && p.marcado_por === eu2) }; })
      .sort((a, b) => (a.apelido || a.nome).localeCompare(b.apelido || b.nome, 'pt-BR'));
  },
  lista_chamada_admin: ({ p_culto }) => {
    exigirAdmin();
    if (!culto(p_culto)) erro('Culto não encontrado.');
    return base.map((j) => { const p = pres(p_culto, j.id); return { jovem_id: j.id, nome: j.nome, apelido: j.apelido ?? null, foto_url: j.foto_url ?? null,
      estado: p?.estado ?? null, motivo: p?.motivo ?? null, marcado_por_mim: Boolean(p && p.marcado_por === quem()), ativo: j.ativo !== false,
      papel: j.papel, discipulado_por: j.discipulado_por, discipulador_nome: porId(j.discipulado_por)?.nome ?? null }; })
      .sort((a, b) => (a.apelido || a.nome).localeCompare(b.apelido || b.nome, 'pt-BR'));
  },
  meus_acessos: () => {
    const sec = secretarios.find((x) => x.user_id === sessao.user.id);
    if (sec?.ativo) sec.ultimo_acesso_em = agora();
    const j = eu();
    return { admin: ehAdmin(), secretario: Boolean(sec?.ativo), secretario_inativo: Boolean(sec && !sec.ativo),
      nome_secretario: sec?.ativo ? sec.nome : null, discipulador: j?.papel === 'discipulador', lideranca: j?.papel === 'lideranca', jovem: Boolean(j) };
  },
  secretario_atualizar: ({ p_id, p_nome, p_ativo }) => {
    exigirAdmin();
    const x = secretarios.find((y) => y.id === p_id);
    if (!x) erro('Secretário não encontrado.');
    if (p_ativo !== null && p_ativo !== undefined && p_ativo !== x.ativo) { x.ativo = p_ativo; logAcesso(p_ativo ? 'secretario_reativado' : 'secretario_desativado', x.usuario); }
    if (p_nome && normNome(p_nome) !== x.nome) { logAcesso('secretario_renomeado', x.usuario, { de: x.nome, para: normNome(p_nome) }); x.nome = normNome(p_nome); }
    return x;
  },
  lista_admins: () => {
    exigirAdmin();
    return [...admins].sort().map((email) => ({ email, criado_em: agora(), ultimo_acesso_em: email === sessao.user.email ? agora() : null, sou_eu: email === sessao.user.email }));
  },
  acessos_rede: () => {
    exigirAdmin();
    return base.filter((j) => j.papel === 'discipulador' || j.papel === 'lideranca')
      .sort((a, b) => (a.papel === b.papel ? a.nome.localeCompare(b.nome, 'pt-BR') : a.papel === 'lideranca' ? -1 : 1))
      .map((j) => ({ jovem_id: j.id, nome: j.nome, apelido: j.apelido, foto_url: j.foto_url, papel: j.papel, cargo_lideranca: j.cargo_lideranca,
        email: j.email, vinculado: Boolean(j.user_id), ultimo_acesso_em: j.user_id ? agora() : null }));
  },
  cuidado_da_rede: () => {
    if (!(ehAdmin() || eu()?.papel === 'lideranca')) erro('Apenas administradores e liderança.');
    const e = eu();
    const desde = Date.now() - 90 * 86400000;
    return base.filter((d) => d.papel === 'discipulador' && (ehAdmin() || (e?.papel === 'lideranca' && d.discipulado_por === e.id)))
      .map((d) => {
        const ns = notificacoes.filter((n) => n.destinatario_id === d.id && n.tipo === 'falta' && !n.cancelada_em && new Date(n.criado_em).getTime() > desde);
        return { discipulador_id: d.id, nome: d.nome, avisos: ns.length, respondidos: ns.filter((n) => n.contato_feito_em).length,
          pendentes_3_dias: ns.filter((n) => !n.contato_feito_em && new Date(n.criado_em).getTime() < Date.now() - 3 * 86400000).length };
      }).sort((a, b) => a.nome.localeCompare(b.nome));
  },
  vincular_por_email: () => {
    if (eu()) return true;
    const j = base.find((x) => x.email === sessao.user.email && !x.user_id);
    if (!j) return false;
    j.user_id = sessao.user.id;
    registrar(j.id, 'vinculacao', { login: { de: null, para: sessao.user.email } }, sessao.user.email);
    return true;
  },
  buscar_cadastro_antigo: ({ p_telefone, p_nascimento }) => {
    if (base.some((m) => m.user_id === sessao.user.id)) return [];
    const j = base.find((x) => !x.user_id && !x.email && x.telefone === soDigitos(p_telefone) && x.data_nascimento === p_nascimento);
    if (!j) return [];
    const p = j.nome.split(' ')[0];
    return [{ id: j.id, primeiro_nome: p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() }];
  },
  vincular_cadastro: ({ p_id, p_telefone, p_nascimento }) => {
    const email = sessao.user.email;
    if (base.some((o) => o.user_id === sessao.user.id || o.email === email)) erro('Você já tem um cadastro.');
    const j = base.find((x) => x.id === p_id && !x.user_id && !x.email && x.telefone === soDigitos(p_telefone) && x.data_nascimento === p_nascimento);
    if (!j) erro('Não foi possível vincular este cadastro.');
    Object.assign(j, { user_id: sessao.user.id, email, atualizado_em: agora() });
    recalcularTodos();
    registrar(j.id, 'vinculacao', { email: { de: null, para: email } }, email);
    return j;
  },
  minha_rede: () => {
    const e = eu();
    if (!e) return [];
    const linha = (r, nivel) => {
      const i = r.data_nascimento ? idade(r.data_nascimento) : null;
      return {
        id: r.id, nome: r.nome, apelido: r.apelido ?? null, sexo: r.sexo ?? null, foto_url: r.foto_url, telefone: r.telefone, data_nascimento: r.data_nascimento,
        idade: r.data_nascimento && r.data_nascimento <= new Date().toISOString().slice(0, 10) ? i : null,
        papel: r.papel, cargo_lideranca: r.cargo_lideranca, discipulado_por: r.discipulado_por,
        discipulador_nome: porId(r.discipulado_por)?.nome ?? null,
        responsavel_nome: r.responsavel_nome,
        responsavel_telefone: r.responsavel_telefone,
        nivel, discipulos: base.filter((c) => c.discipulado_por === r.id).length,
      };
    };
    const out = [linha(e, 0)];
    if (e.papel !== 'jovem') {
      const n1 = base.filter((j) => j.discipulado_por === e.id);
      out.push(...n1.map((j) => linha(j, 1)));
      if (e.papel === 'lideranca') out.push(...base.filter((j) => n1.some((d) => d.id === j.discipulado_por)).map((j) => linha(j, 2)));
    }
    return out.sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome, 'pt-BR'));
  },
  transferir_discipulos: ({ p_de, p_para }) => {
    exigirAdmin();
    if (p_de === p_para) erro('Escolha outra pessoa para receber.');
    const filhos = base.filter((j) => j.discipulado_por === p_de);
    filhos.forEach((j) => aplicarUpdate(j, { discipulado_por: p_para }));
    return filhos.length;
  },
  rede_definir_papel: ({ p_ids, p_papel, p_cargo }) => emMassa(p_ids, (j) => ({
    papel: p_papel, cargo_lideranca: p_papel === 'lideranca' ? (p_cargo || j.cargo_lideranca) : null,
  })),
  rede_atribuir: ({ p_ids, p_discipulado_por }) => emMassa(p_ids, () => ({ discipulado_por: p_discipulado_por })),
  listar_duplicados: () => {
    exigirAdmin();
    const pares = [];
    for (const a of base) for (const b of base) {
      if (a.id >= b.id) continue;
      const tel = a.telefone && a.telefone === b.telefone;
      const nomeNasc = a.nome.toLowerCase() === b.nome.toLowerCase() && a.data_nascimento === b.data_nascimento;
      if (!(tel || nomeNasc) || ignorados.has(`${a.id}|${b.id}`)) continue;
      pares.push({
        a_id: a.id, b_id: b.id,
        motivo: tel && a.nome.toLowerCase() === b.nome.toLowerCase() ? 'Mesmo nome e telefone' : tel ? 'Mesmo telefone' : 'Mesmo nome e nascimento',
        mesmo_nascimento: a.data_nascimento === b.data_nascimento,
      });
    }
    return pares.sort((x, y) => porId(x.a_id).nome.localeCompare(porId(y.a_id).nome));
  },
  ignorar_duplicado: ({ p_a, p_b }) => {
    exigirAdmin();
    ignorados.add(p_a < p_b ? `${p_a}|${p_b}` : `${p_b}|${p_a}`);
    return null;
  },
  mesclar_jovens: ({ p_manter, p_remover, p_dados }) => {
    exigirAdmin();
    const a = porId(p_manter);
    const b = porId(p_remover);
    if (!a || !b) erro('Registro não encontrado.');
    if (a.user_id && b.user_id) erro('Os dois registros já estão ligados a e-mails diferentes. Não dá para mesclar.');
    // papel mais alto e o vínculo que combina com ele; discípulos e anotações vão para o mantido
    const fonte = NIVEL[b.papel] > NIVEL[a.papel] ? b : a;
    let link = a.papel === b.papel ? (a.discipulado_por ?? b.discipulado_por) : fonte.discipulado_por;
    if (link === a.id || link === b.id) link = null;
    aplicarUpdate(a, { papel: fonte.papel, cargo_lideranca: fonte.cargo_lideranca ?? a.cargo_lideranca ?? b.cargo_lideranca, discipulado_por: link });
    base.filter((j) => j.discipulado_por === b.id && j.id !== a.id).forEach((j) => { j.discipulado_por = a.id; });
    anotacoes.forEach((n) => { if (n.jovem_id === b.id) n.jovem_id = a.id; if (n.autor_id === b.id) n.autor_id = a.id; });
    base = base.filter((j) => j.id !== b.id);
    historico = historico.filter((h) => h.jovem_id !== b.id);
    const d = normalizar(p_dados ?? {});
    Object.assign(a, {
      ...d,
      foto_url: 'foto_url' in d ? d.foto_url : a.foto_url ?? b.foto_url,
      foto_origem: 'foto_origem' in d ? d.foto_origem : a.foto_origem ?? b.foto_origem,
      email: a.email ?? b.email, user_id: a.user_id ?? b.user_id,
      apelido: 'apelido' in d ? d.apelido : a.apelido ?? b.apelido,
      sexo: 'sexo' in d ? d.sexo : a.sexo ?? b.sexo,
      responsavel_nome: a.responsavel_nome ?? b.responsavel_nome,
      responsavel_telefone: a.responsavel_telefone ?? b.responsavel_telefone,
      consentimento_em: a.consentimento_em ?? b.consentimento_em,
      observacoes_admin: [a.observacoes_admin, b.observacoes_admin].filter(Boolean).join('\n') || null,
      atualizado_em: agora(),
    });
    recalcularTodos();
    registrar(a.id, 'mesclagem', { registro_removido: b });
    return a;
  },
};

// ---------- cliente ----------
export function criarClienteDemo() {
  return {
    auth: {
      getSession: async () => ({ data: { session: sessao } }),
      onAuthStateChange: (cb) => {
        ouvintes.add(cb);
        return { data: { subscription: { unsubscribe: () => ouvintes.delete(cb) } } };
      },
      signInWithOtp: async () => { await new Promise((r) => setTimeout(r, 300)); return { error: null }; },
      verifyOtp: async ({ email, token }) => {
        if (!/^\d{6}$/.test(token)) return { error: { message: 'Código inválido ou vencido. Peça um novo código.' } };
        entrarDemo(email);
        return { data: {}, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        await carregar();
        await new Promise((res) => setTimeout(res, 300));
        const e = String(email).trim().toLowerCase();
        const x = secretarios.find((y) => y.email === e);
        if (!x || senhas.get(x.usuario) !== password) return { data: null, error: { message: 'Invalid login credentials' } };
        entrarDemo(e);
        return { data: { session: sessao }, error: null };
      },
      signOut: async () => { sessao = null; emitir('SIGNED_OUT'); return { error: null }; },
    },
    from: (tabela) => new Consulta(tabela),
    // Tempo real e Edge Functions não existem na demonstração.
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    removeChannel: () => {},
    functions: {
      invoke: async (nome, { body } = {}) => {
        await carregar();
        await new Promise((res) => setTimeout(res, 250));
        if (nome === 'gerenciar-secretarios') return { data: gerenciarSecretarios(body ?? {}), error: null };
        return { data: { simulado: true }, error: null };
      },
    },
    rpc: async (nome, args = {}) => {
      await carregar();
      await new Promise((r) => setTimeout(r, 150));
      try {
        if (!sessao) erro('Faça login novamente.');
        const data = rpcs[nome](args);
        return { data: JSON.parse(JSON.stringify(data ?? null)), error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
    storage: {
      from: () => ({
        upload: async (caminho, arquivo) => { fotos.set(caminho, URL.createObjectURL(arquivo)); return { data: { path: caminho }, error: null }; },
        remove: async (caminhos) => { caminhos.forEach((c) => fotos.delete(c)); return { error: null }; },
        createSignedUrls: async (caminhos) => ({
          data: caminhos.map((c) => {
            const dono = base?.find((j) => j.foto_url === c);
            const ok = !dono || podeVer(dono.id) || c.startsWith(`${sessao?.user.id}/`) || (ehSec() && dono.ativo !== false);
            return { path: c, signedUrl: ok ? fotos.get(c) ?? null : null };
          }),
          error: null,
        }),
      }),
    },
  };
}

/** Atalho da barra de demonstração: entra direto com um e-mail. */
export function entrarDemo(email) {
  const e = String(email).trim().toLowerCase();
  sessao = { user: { id: uidDe(e), email: e } };
  emitir('SIGNED_IN');
}

/** Para a barra: um jovem da base antiga para testar a vinculação. */
export async function exemploVinculacao() {
  await carregar();
  const j = base.find((x) => !x.user_id && !x.email && x.telefone && /^[1-9]{2}9\d{8}$/.test(x.telefone)
    && !x.inconsistencias.includes('TELEFONE_DUPLICADO') && !x.inconsistencias.includes('NASCIMENTO_INVALIDO'));
  return j ? { telefone: j.telefone, nascimento: j.data_nascimento } : null;
}
