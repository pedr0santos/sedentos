// As faixas do front precisam bater com public.faixa_etaria() do banco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faixaPorIdade, faixaEtaria, rotuloFaixa, FAIXAS, idade } from '../src/lib/formato.js';

test('faixas sem sobreposição e iguais às do banco', () => {
  const r = (i) => rotuloFaixa(faixaPorIdade(i));
  assert.equal(r(11), 'Abaixo de 12');
  assert.equal(r(12), '12 a 14'); assert.equal(r(14), '12 a 14');
  assert.equal(r(15), '15 a 17'); assert.equal(r(17), '15 a 17');
  assert.equal(r(18), '18 e 19'); assert.equal(r(19), '18 e 19');
  assert.equal(r(20), '20 e 21'); assert.equal(r(23), '22 e 23'); assert.equal(r(25), '24 e 25');
  assert.equal(r(27), '26 e 27'); assert.equal(r(29), '28 e 29'); assert.equal(r(30), '30+'); assert.equal(r(80), '30+');
  assert.equal(r(null), 'Sem data válida');
  for (let i = 0; i <= 100; i++) {
    const n = FAIXAS.filter((f) => !f.semData && i >= f.min && i <= f.max).length;
    assert.equal(n, 1, `idade ${i} cai em ${n} faixas`);
  }
});

test('cadastro sem data, no futuro ou com nascimento inválido fica em "Sem data válida"', () => {
  assert.equal(faixaEtaria({ data_nascimento: null, inconsistencias: [] }), 'sem-data');
  assert.equal(faixaEtaria({ data_nascimento: '2026-08-18', inconsistencias: ['NASCIMENTO_INVALIDO'] }), 'sem-data');
  assert.equal(faixaEtaria({ data_nascimento: '2000-01-01', inconsistencias: [] }), faixaPorIdade(idade('2000-01-01')));
});

test('"Até 19 × 20+": 19 anos cai em Até 19; ao completar 20 passa para 20+', async () => {
  const { grupoIdade, naFaixa } = await import('../src/lib/formato.js');
  const iso = (d) => d.toISOString().slice(0, 10);
  const hoje = new Date();
  const ha = (anos, dias = 0) => { const d = new Date(hoje.getFullYear() - anos, hoje.getMonth(), hoje.getDate() + dias, 12); return iso(d); };
  assert.equal(grupoIdade({ data_nascimento: ha(19), inconsistencias: [] }), 'ate-19');
  assert.equal(grupoIdade({ data_nascimento: ha(20, 1), inconsistencias: [] }), 'ate-19'); // faz 20 amanhã
  assert.equal(grupoIdade({ data_nascimento: ha(20), inconsistencias: [] }), '20+');      // fez 20 hoje
  assert.equal(grupoIdade({ data_nascimento: ha(35), inconsistencias: [] }), '20+');
  assert.equal(grupoIdade({ data_nascimento: ha(12), inconsistencias: [] }), 'ate-19');
  assert.equal(grupoIdade({ data_nascimento: null, inconsistencias: [] }), null);
  assert.equal(grupoIdade({ data_nascimento: '2026-08-18', inconsistencias: ['NASCIMENTO_INVALIDO'] }), null);
  assert.ok(naFaixa({ data_nascimento: ha(19), inconsistencias: [] }, 'ate-19'));
  assert.ok(naFaixa({ data_nascimento: ha(19), inconsistencias: [] }, '18-19'));
});
