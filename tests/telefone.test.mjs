// Testes do telefone/WhatsApp. Rodar com: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatarTelefone, linkWhatsApp, mascaraTelefone } from '../src/lib/formato.js';
import { lerRegistros, telefoneTexto, telefonesRejeitados } from '../scripts/importar.mjs';

const CSV = fileURLToPath(new URL('../dados/base_jovens_importacao.csv', import.meta.url));
const XLSX = fileURLToPath(new URL('../dados/Dados - Jovens (original).xlsx', import.meta.url));

test('formatarTelefone', () => {
  assert.equal(formatarTelefone('31972454210'), '(31) 97245-4210');
  assert.equal(formatarTelefone('(31) 97245-4210'), '(31) 97245-4210');
  assert.equal(formatarTelefone('351312349582'), '+351312349582'); // estrangeiro não é cortado
  assert.equal(formatarTelefone(null), '');
});

test('linkWhatsApp', () => {
  assert.equal(linkWhatsApp('31972454210'), 'https://wa.me/5531972454210');
  assert.equal(linkWhatsApp('(31) 97245-4210'), 'https://wa.me/5531972454210');
  assert.equal(linkWhatsApp('351312349582'), 'https://wa.me/351312349582'); // sem 55 a mais
  assert.equal(linkWhatsApp('31972454210', 'Oi, Alicia!'), 'https://wa.me/5531972454210?text=Oi%2C%20Alicia!');
  assert.equal(linkWhatsApp(''), null);
});

test('máscara de digitação não desloca nem repete dígitos', () => {
  assert.equal(mascaraTelefone('31972454210'), '(31) 97245-4210');
  assert.equal(mascaraTelefone('(31) 97245-4210'), '(31) 97245-4210');
});

test('importador lê telefone como texto e rejeita valores estragados', () => {
  assert.equal(telefoneTexto(31972454210), '31972454210');       // número inteiro do Excel
  assert.equal(telefoneTexto('31972454210'), '31972454210');
  assert.equal(telefoneTexto('31972454210.0'), '31972454210');
  assert.equal(telefoneTexto('(31) 97245-4210'), '31972454210');
  const antes = telefonesRejeitados.length;
  assert.equal(telefoneTexto('3.19725E+10', 'X'), null);           // notação científica
  assert.equal(telefoneTexto(31972454210.5, 'Y'), null);            // casas decimais
  assert.equal(telefoneTexto('31972454210,5', 'Z'), null);
  assert.equal(telefonesRejeitados.length, antes + 3);
});

test('importar o CSV atual grava 31972454210 para a Alicia', { skip: !existsSync(CSV) && 'dados/ não está nesta máquina' }, async () => {
  const regs = await lerRegistros(CSV);
  const alicia = regs.find((r) => r.nome === 'Alicia Ribeiro de Oliveira');
  assert.equal(alicia.telefone, '31972454210');
  assert.ok(regs.every((r) => r.telefone === null || /^\d{10,13}$/.test(r.telefone)), 'todo telefone só com dígitos');
});

test('a planilha original dá os mesmos telefones que o CSV', { skip: !existsSync(XLSX) && 'planilha não está nesta máquina' }, async () => {
  const [x, c] = await Promise.all([lerRegistros(XLSX), lerRegistros(CSV)]);
  assert.equal(x.length, c.length);
  x.forEach((r, i) => assert.equal(r.telefone, c[i].telefone, r.nome));
});
