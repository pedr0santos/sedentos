#!/usr/bin/env node
/**
 * Importa jovens para o Supabase e cria o admin inicial.
 *
 * Aceita:
 *   - CSV no formato de importação (id, nome, telefone, data_nascimento, foto_origem, ...)
 *   - Planilha original .xlsx com as colunas: Nome | Telefone | Data de nascimento | Foto
 *
 * Colunas opcionais (nos dois formatos): Apelido | Sexo (F, M, Feminino ou Masculino) |
 * Nome do responsável | Telefone do responsável. Se não vierem, o registro entra com as
 * inconsistências correspondentes (APELIDO_AUSENTE, SEXO_AUSENTE, RESPONSAVEL_AUSENTE).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=lider@exemplo.com \
 *     node scripts/importar.mjs dados/base_jovens_importacao.csv
 *
 * Pode rodar de novo com segurança: registros já importados são ignorados.
 * Nada é corrigido automaticamente — o banco só marca as inconsistências.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL } = process.env;
const simular = process.argv.includes('--simular');   // só lê o arquivo, não grava nada
const arquivo = process.argv.slice(2).find((a) => !a.startsWith('--'));
let db = null;

// ---------- leitura ----------
function parseCsv(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((v) => v !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas;
  return resto.map((l) => Object.fromEntries(cab.map((k, i) => [k.trim(), l[i] ?? ''])));
}

function idDeterministico(chave) {
  const h = createHash('sha1').update(chave).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function dataIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Telefones que a planilha estragou (viraram número decimal ou notação científica). */
export const telefonesRejeitados = [];

/**
 * Telefone sempre como TEXTO, só com dígitos. Nunca usa Number/parseFloat em texto.
 * Valor em notação científica (3.19E+10) ou com casas decimais (31972454210.5) não é
 * gravado: entra vazio e vai para `telefonesRejeitados`, para a liderança corrigir.
 */
export function telefoneTexto(v, quem = '') {
  if (v === null || v === undefined || v === '') return null;
  const rejeitar = () => { telefonesRejeitados.push({ quem, valor: String(v) }); return null; };
  if (typeof v === 'number') {
    // O Excel guarda celulares como número inteiro: só aceita se for inteiro e exato.
    if (!Number.isSafeInteger(v) || v < 0) return rejeitar();
    return String(v);
  }
  const s = String(v).trim();
  if (/\d[.,]?\d*e[+-]?\d+/i.test(s)) return rejeitar();            // 3.19E+10
  if (/^\d+[.,]\d+$/.test(s) && !/^\d+[.,]0+$/.test(s)) return rejeitar(); // 31972454210.5
  const d = s.replace(/[.,]0+$/, '').replace(/\D/g, '');               // "31972454210.0" → ok
  return d || null;
}

const chaveCab = (c) => String(c ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[\s_]+/g, ' ');

/** "F", "m", "Feminino", "MASCULINO"... → enum do banco (ou null). */
export function sexoDe(v) {
  const s = chaveCab(v);
  if (!s) return null;
  if (s === 'f' || s === 'feminino') return 'feminino';
  if (s === 'm' || s === 'masculino') return 'masculino';
  console.warn(`  Sexo não reconhecido: "${v}" (o registro entra sem sexo)`);
  return null;
}

const textoOuNull = (v) => { const t = String(v ?? '').trim().replace(/\s+/g, ' '); return t || null; };

/** Campos opcionais do v4, a partir de uma função que lê a coluna pelo nome normalizado. */
function opcionais(ler) {
  return {
    apelido: textoOuNull(ler('apelido'))?.slice(0, 30) ?? null,
    sexo: sexoDe(ler('sexo')),
    responsavel_nome: textoOuNull(ler('nome do responsavel') ?? ler('responsavel nome')),
    responsavel_telefone: telefoneTexto(ler('telefone do responsavel') ?? ler('responsavel telefone'), 'responsável'),
  };
}

export async function lerRegistros(caminho) {
  const ext = extname(caminho).toLowerCase();
  if (ext === '.csv') {
    const linhas = parseCsv(await readFile(caminho, 'utf8'));
    return linhas.map((l, i) => {
      const norm = Object.fromEntries(Object.entries(l).map(([k, v]) => [chaveCab(k), v]));
      return ({
      id: l.id || idDeterministico(`${l.nome}|${l.telefone}|${l.data_nascimento}|${i}`),
      nome: l.nome,
      telefone: telefoneTexto(l.telefone, l.nome),
      data_nascimento: dataIso(l.data_nascimento),
      foto_origem: l.foto_origem || null,
      ...opcionais((k) => norm[k]),
    });
    });
  }
  if (ext === '.xlsx') {
    const { default: readXlsx } = await import('read-excel-file/node');
    const [cab, ...linhas] = await readXlsx(caminho);
    const cabs = cab.map(chaveCab);
    // "Nome" e "Telefone" do jovem não podem casar com as colunas do responsável.
    const col = (nome) => cabs.findIndex((c) => c.startsWith(nome) && !c.includes('respons'));
    const iNome = col('nome'), iTel = col('telefone'), iNasc = col('data'), iFoto = col('foto');
    const exata = (k) => cabs.indexOf(k);
    if (iNome < 0) throw new Error('A planilha precisa de uma coluna "Nome".');
    const vistos = new Map();
    return linhas
      .filter((l) => l.slice(0, 4).some((v) => v !== null && v !== ''))
      .map((l) => {
        const r = {
          nome: String(l[iNome] ?? ''),
          telefone: iTel >= 0 ? telefoneTexto(l[iTel], String(l[iNome] ?? '')) : null,
          data_nascimento: iNasc >= 0 ? dataIso(l[iNasc]) : null,
          foto_origem: iFoto >= 0 && l[iFoto] ? String(l[iFoto]) : null,
        };
        const extra = opcionais((k) => (exata(k) >= 0 ? l[exata(k)] : undefined));
        const chave = `${r.nome.trim()}|${r.telefone}|${r.data_nascimento}|${r.foto_origem}`;
        const n = (vistos.get(chave) ?? 0) + 1;
        vistos.set(chave, n);
        // O id continua dependendo só das colunas originais: reimportar não duplica.
        return { id: idDeterministico(`${chave}|${n}`), ...r, ...extra };
      });
  }
  throw new Error('Use um arquivo .csv (formato de importação) ou .xlsx (planilha original).');
}

// ---------- execução ----------
function avisarRejeitados() {
  if (!telefonesRejeitados.length) return;
  console.warn(`\nATENÇÃO: ${telefonesRejeitados.length} telefone(s) estavam estragados na planilha e entraram vazios:`);
  for (const r of telefonesRejeitados) console.warn(`  ${r.quem || '(sem nome)'}: "${r.valor}"`);
  console.warn('No Excel, formate a coluna Telefone como Texto e digite de novo esses números.');
}

async function main() {
  if (simular) {
    const regs = await lerRegistros(arquivo);
    console.log(`Simulação: ${regs.length} registros lidos de ${arquivo}. Nada foi gravado.`);
    console.log(regs.slice(0, 3));
    avisarRejeitados();
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (Supabase › Project Settings › API).');
    process.exit(1);
  }
  db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  if (ADMIN_EMAIL) {
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const { error } = await db.from('admins').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`Admin garantido: ${email}`);
  }
  if (!arquivo) {
    console.log('Nenhum arquivo informado: só o admin foi configurado.');
    return;
  }

  const registros = (await lerRegistros(arquivo)).map((r) => ({
    ...r,
    origem: 'importacao_planilha',
    status: 'pendente_validacao',
  }));
  console.log(`Lidos ${registros.length} registros de ${arquivo}`);
  avisarRejeitados();

  let novos = 0;
  for (let i = 0; i < registros.length; i += 100) {
    const lote = registros.slice(i, i + 100);
    const { data, error } = await db.from('jovens')
      .upsert(lote, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    novos += data.length;
  }
  console.log(`Importados agora: ${novos} · já existiam: ${registros.length - novos}`);

  const { data: todos, error } = await db.from('jovens').select('inconsistencias');
  if (error) throw error;
  const cont = {};
  for (const j of todos) for (const c of j.inconsistencias) cont[c] = (cont[c] ?? 0) + 1;
  console.log(`\nTotal na base: ${todos.length}`);
  for (const [c, n] of Object.entries(cont).sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(28)} ${n}`);
}

// Só roda quando chamado pela linha de comando (os testes importam as funções sem rodar).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('Falhou:', e.message ?? e);
    process.exit(1);
  });
}
