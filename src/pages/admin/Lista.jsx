import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useJovens } from '../../hooks/useJovens';
import { formatarTelefone, idade, aniversarianteDoMes, FAIXAS, GRUPOS_IDADE, naFaixa, soDigitos, linkWhatsApp, SEXOS, sugerirSexo, IDADE_RESPONSAVEL } from '../../lib/formato';
import { STATUS, ORIGEM, INCONSISTENCIAS, CODIGOS } from '../../lib/inconsistencias';
import { PAPEIS, LISTA_PAPEIS } from '../../lib/rede';
import { exportarCsv, exportarXlsx } from '../../lib/exportar';
import { supabase, mensagemErro, demo } from '../../lib/supabase';
import { Titulo, StatusBadge, Carregando, Aviso, Campo } from '../../components/Visual';
import { BadgePapel, Modal, SeletorPessoa } from '../../components/Rede';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const lerVisao = () => { try { return localStorage.getItem('sed_visao') || 'tabela'; } catch { return 'tabela'; } };


function Selecao({ id, rotulo, valor, onChange, opcoes }) {
  return (
    <label htmlFor={id} className={`chip relative max-w-full pr-8 ${valor ? 'chip-ativo' : ''}`}>
      <span className="sr-only">{rotulo}</span>
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)}
        className="max-w-[220px] cursor-pointer appearance-none truncate bg-transparent pr-1 text-[13px] font-semibold text-inherit outline-none">
        <option value="" className="bg-bg">{rotulo}</option>
        {opcoes.map(([v, r]) => <option key={v} value={v} className="bg-bg">{r}</option>)}
      </select>
      <Icone nome="baixo" tamanho={12} largura={3} className="pointer-events-none absolute right-3" />
    </label>
  );
}

const menorSemResponsavel = (j) => j.inconsistencias.includes('RESPONSAVEL_AUSENTE')
  || (!j.inconsistencias.includes('NASCIMENTO_INVALIDO') && idade(j.data_nascimento) !== null && idade(j.data_nascimento) < IDADE_RESPONSAVEL
      && (!j.responsavel_nome || !j.responsavel_telefone));

/** Revisão do "Definir sexo": sugestão pelo primeiro nome, a liderança confere e aplica. */
function DefinirSexo({ selecionados, aoAplicar, ocupado }) {
  const [escolha, setEscolha] = useState(() => Object.fromEntries(selecionados.map((j) => [j.id, j.sexo ?? sugerirSexo(j.nome) ?? ''])));
  const todos = (v) => setEscolha(Object.fromEntries(selecionados.map((j) => [j.id, v])));
  const sugestao = () => setEscolha(Object.fromEntries(selecionados.map((j) => [j.id, sugerirSexo(j.nome) ?? escolha[j.id] ?? ''])));
  const conta = (v) => Object.values(escolha).filter((x) => x === v).length;
  const semEscolha = conta('');
  const opcoes = [['feminino', 'F'], ['masculino', 'M'], ['', '—']];
  return (
    <>
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Sugerimos pelo primeiro nome. Confira cada linha antes de aplicar; “—” deixa como está.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip" onClick={sugestao}>Usar sugestões</button>
        <button type="button" className="chip" onClick={() => todos('feminino')}>Todos Feminino</button>
        <button type="button" className="chip" onClick={() => todos('masculino')}>Todos Masculino</button>
      </div>
      <ul className="m-0 flex max-h-[45dvh] list-none flex-col overflow-y-auto rounded-xl border border-white/[0.08] p-0">
        {selecionados.map((j) => {
          const sug = sugerirSexo(j.nome);
          return (
            <li key={j.id} className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-bold">{j.nome}</span>
                <span className="text-[11px] text-muted">
                  {j.sexo ? `Hoje: ${SEXOS[j.sexo]}` : 'Não informado'}{sug ? ` · sugestão: ${SEXOS[sug]}` : ' · sem sugestão'}
                </span>
              </div>
              <div role="radiogroup" aria-label={`Sexo de ${j.nome}`} className="flex shrink-0 gap-1 rounded-lg bg-dark/60 p-0.5">
                {opcoes.map(([v, r]) => (
                  <button key={r} type="button" role="radio" aria-checked={escolha[j.id] === v} aria-label={v ? SEXOS[v] : 'Manter'}
                    onClick={() => setEscolha((e) => ({ ...e, [j.id]: v }))}
                    className={`h-9 w-9 rounded-md text-[13px] font-bold ${escolha[j.id] === v ? 'text-texto' : 'text-muted'}`}
                    style={escolha[j.id] === v ? { background: v ? 'var(--gradient)' : 'rgb(255 255 255 / 0.12)' } : undefined}>{r}</button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-[13px] text-[#D6DDEA]">
        {conta('feminino')} Feminino · {conta('masculino')} Masculino{semEscolha ? ` · ${semEscolha} sem alteração` : ''}
      </p>
      <button type="button" className="btn-primario" disabled={ocupado || semEscolha === selecionados.length} onClick={() => aoAplicar(escolha)}>
        {ocupado ? 'Aplicando…' : 'Aplicar'}
      </button>
    </>
  );
}

/** Ações em massa: definir papel, atribuir quem discipula e definir sexo. */
function AcoesEmMassa({ ids, jovens, porId, aoTerminar, aoLimpar }) {
  const [modal, setModal] = useState(null); // 'papel' | 'vinculo'
  const [papel, setPapel] = useState('jovem');
  const [cargo, setCargo] = useState('');
  const [destino, setDestino] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState(null);

  const selecionados = ids.map((id) => porId.get(id)).filter(Boolean);
  const papeis = [...new Set(selecionados.map((j) => j.papel))];
  const papelAlvo = papeis.length === 1 ? (papeis[0] === 'jovem' ? 'discipulador' : papeis[0] === 'discipulador' ? 'lideranca' : null) : null;

  const executar = async (rpc, args) => {
    setOcupado(true);
    const { data, error } = await supabase.rpc(rpc, args);
    setOcupado(false);
    setModal(null);
    if (error) { setResultado({ tipo: 'erro', texto: mensagemErro(error) }); return; }
    const falhas = data ?? [];
    setResultado(falhas.length
      ? { tipo: 'alerta', texto: `${ids.length - falhas.length} atualizados. Não deu certo para ${falhas.length}:`, falhas }
      : { tipo: 'ok', texto: `${ids.length} atualizados.` });
    await aoTerminar();
  };

  const aplicarSexo = async (escolha) => {
    setOcupado(true);
    let total = 0;
    let falha = null;
    for (const sexo of ['feminino', 'masculino']) {
      const alvo = Object.entries(escolha).filter(([id, v]) => v === sexo && porId.get(id)?.sexo !== sexo).map(([id]) => id);
      if (!alvo.length) continue;
      const { error } = await supabase.from('jovens').update({ sexo }).in('id', alvo);
      if (error) { falha = mensagemErro(error); break; }
      total += alvo.length;
    }
    setOcupado(false);
    setModal(null);
    setResultado(falha ? { tipo: 'erro', texto: falha } : { tipo: 'ok', texto: `Sexo definido para ${total} pessoa${total === 1 ? '' : 's'}.` });
    await aoTerminar();
  };

  return (
    <>
      <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-2.5 rounded-2xl border border-secondary/40 bg-[#141B2B]/95 px-4 py-3 shadow-[0_12px_40px_rgb(0_0_0/0.5)] backdrop-blur">
        <strong className="text-sm">{ids.length} selecionado{ids.length > 1 ? 's' : ''}</strong>
        <button type="button" className="btn-secundario min-h-[40px] text-[13px]" onClick={() => setModal('papel')}>Definir papel</button>
        <button type="button" className="btn-secundario min-h-[40px] text-[13px]" onClick={() => setModal('vinculo')}>
          Atribuir {papelAlvo === 'lideranca' ? 'liderança' : 'discipulador'}
        </button>
        <button type="button" className="btn-secundario min-h-[40px] text-[13px]" onClick={() => setModal('sexo')}>Definir sexo</button>
        <button type="button" className="btn-texto ml-auto text-[13px]" onClick={aoLimpar}>Limpar seleção</button>
      </div>
      {resultado && (
        <Aviso tipo={resultado.tipo}>
          {resultado.texto}
          {resultado.falhas && (
            <ul className="m-0 mt-1.5 pl-4">
              {resultado.falhas.map((f) => <li key={f.jovem_id}><strong>{f.jovem_nome}</strong>: {f.erro}</li>)}
            </ul>
          )}
        </Aviso>
      )}

      <Modal titulo={`Definir papel de ${ids.length} pessoa${ids.length > 1 ? 's' : ''}`} aberto={modal === 'papel'} aoFechar={() => setModal(null)}>
        <div role="radiogroup" aria-label="Papel" className="grid grid-cols-3 gap-1 rounded-xl bg-dark/60 p-1">
          {LISTA_PAPEIS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={papel === p} onClick={() => setPapel(p)}
              className={`min-h-[44px] rounded-lg text-[13px] font-bold ${papel === p ? 'text-texto' : 'text-muted'}`}
              style={papel === p ? { background: 'var(--gradient)' } : undefined}>{PAPEIS[p].rotulo}</button>
          ))}
        </div>
        {papel === 'lideranca' && (
          <Campo id="massa-cargo" rotulo="Cargo/função (opcional)">
            <input id="massa-cargo" className="campo" placeholder="Ex.: Líder de jovens" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </Campo>
        )}
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          Quem tiver discípulos ou discipuladores ligados não muda de papel. O sistema avisa quem ficou de fora.
        </p>
        <button type="button" className="btn-primario" disabled={ocupado}
          onClick={() => executar('rede_definir_papel', { p_ids: ids, p_papel: papel, p_cargo: cargo || null })}>
          {ocupado ? 'Aplicando…' : `Definir como ${PAPEIS[papel].rotulo}`}
        </button>
      </Modal>

      <Modal titulo={`Definir sexo de ${ids.length} pessoa${ids.length > 1 ? 's' : ''}`} aberto={modal === 'sexo'} aoFechar={() => setModal(null)}>
        {modal === 'sexo' && <DefinirSexo selecionados={selecionados} aoAplicar={aplicarSexo} ocupado={ocupado} />}
      </Modal>

      <Modal titulo="Atribuir quem discipula" aberto={modal === 'vinculo'} aoFechar={() => setModal(null)}>
        {!papelAlvo ? (
          <Aviso tipo="alerta">
            {papeis.includes('lideranca')
              ? 'A Liderança não tem ninguém acima dela. Tire essas pessoas da seleção.'
              : 'Selecione só jovens (para escolher um discipulador) ou só discipuladores (para escolher uma liderança).'}
          </Aviso>
        ) : (
          <>
            <p className="m-0 text-sm text-muted">
              {papelAlvo === 'discipulador' ? `Escolha o discipulador dos ${ids.length} jovens.` : `Escolha a liderança dos ${ids.length} discipuladores.`}
            </p>
            <SeletorPessoa id="massa-destino" pessoas={jovens.filter((j) => j.papel === papelAlvo)} valor={destino} onEscolher={setDestino}
              vazio={papelAlvo === 'discipulador' ? 'Escolher discipulador' : 'Escolher liderança'}
              contagem={(p) => `${jovens.filter((j) => j.discipulado_por === p.id).length}`} />
            <div className="flex flex-wrap justify-end gap-2.5">
              <button type="button" className="btn-secundario" disabled={ocupado}
                onClick={() => executar('rede_atribuir', { p_ids: ids, p_discipulado_por: null })}>Remover vínculo</button>
              <button type="button" className="btn-primario" disabled={!destino || ocupado}
                onClick={() => executar('rede_atribuir', { p_ids: ids, p_discipulado_por: destino })}>{ocupado ? 'Aplicando…' : 'Atribuir'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

export default function Lista() {
  const { jovens, carregando, recarregar } = useJovens();
  const [params, setParams] = useSearchParams();
  const [visao, setVisao] = useState(lerVisao);
  const [exportando, setExportando] = useState(false);
  const [avisoDemo, setAvisoDemo] = useState(false);
  const [selecao, setSelecao] = useState(() => new Set());

  const porId = useMemo(() => new Map(jovens.map((j) => [j.id, j])), [jovens]);
  const discipuladores = useMemo(() => jovens.filter((j) => j.papel === 'discipulador'), [jovens]);
  const liderancas = useMemo(() => jovens.filter((j) => j.papel === 'lideranca'), [jovens]);

  const p = (k) => params.get(k) ?? '';
  const definir = (k, v) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };
  const alternar = (k) => definir(k, p(k) ? '' : '1');
  const mudarVisao = (v) => { setVisao(v); try { localStorage.setItem('sed_visao', v); } catch { /* sem armazenamento */ } };

  const filtrados = useMemo(() => {
    const q = semAcento(p('q').trim());
    const qd = soDigitos(q);
    return jovens.filter((j) => {
      if (q && !(semAcento(j.nome).includes(q) || semAcento(j.apelido).includes(q) || semAcento(j.email).includes(q) || (qd.length >= 3 && (j.telefone ?? '').includes(qd)))) return false;
      if (p('status') && j.status !== p('status')) return false;
      if (p('origem') && j.origem !== p('origem')) return false;
      if (p('semFoto') && j.foto_url) return false;
      if (p('semEmail') && j.email) return false;
      if (p('semTelefone') && j.telefone) return false;
      if (p('inconsistencia') && !j.inconsistencias.includes(p('inconsistencia'))) return false;
      if (p('faixa') && !naFaixa(j, p('faixa'))) return false;
      if (p('ativos') && j.ativo === false) return false;
      if (p('sexo') && (p('sexo') === 'nao' ? j.sexo : j.sexo !== p('sexo'))) return false;
      if (p('semResponsavel') && !menorSemResponsavel(j)) return false;
      if (p('incompleto') && j.apelido && j.sexo) return false;
      if (p('aniversariantes') && !aniversarianteDoMes(j)) return false;
      if (p('papel') && j.papel !== p('papel')) return false;
      if (p('discipulador') && j.discipulado_por !== p('discipulador')) return false;
      if (p('lideranca') && !(j.discipulado_por === p('lideranca') || porId.get(j.discipulado_por)?.discipulado_por === p('lideranca'))) return false;
      if (p('semDiscipulador') && !(j.papel === 'jovem' && !j.discipulado_por)) return false;
      if (p('discSemLideranca') && !(j.papel === 'discipulador' && !j.discipulado_por)) return false;
      return true;
    });
  }, [jovens, params, porId]); // eslint-disable-line react-hooks/exhaustive-deps

  const temFiltro = [...params.keys()].length > 0;
  const todosMarcados = filtrados.length > 0 && filtrados.every((j) => selecao.has(j.id));
  const marcar = (id) => setSelecao((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const marcarTodos = () => setSelecao(todosMarcados ? new Set() : new Set(filtrados.map((j) => j.id)));

  const exportar = async (tipo) => {
    if (demo) { setAvisoDemo(true); return; }
    setExportando(true);
    try { tipo === 'xlsx' ? await exportarXlsx(filtrados, porId) : exportarCsv(filtrados, porId); }
    finally { setExportando(false); }
  };

  if (carregando) return <Carregando tela />;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Titulo inicio="Jo" destaque="vens" className="text-4xl" />
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="btn-secundario min-h-[44px] text-[13px]" disabled={exportando || !filtrados.length} onClick={() => exportar('xlsx')}>
            <Icone nome="baixar" tamanho={16} /> Excel
          </button>
          <button type="button" className="btn-secundario min-h-[44px] text-[13px]" disabled={exportando || !filtrados.length} onClick={() => exportar('csv')}>
            <Icone nome="baixar" tamanho={16} /> CSV
          </button>
        </div>
      </header>

      {avisoDemo && (
        <Aviso>Nesta demonstração o navegador bloqueia downloads. No sistema publicado, os botões baixam a lista filtrada em Excel ou CSV.</Aviso>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <label htmlFor="busca" className="sr-only">Buscar</label>
          <Icone nome="busca" className="absolute left-3.5 top-4 text-muted" />
          <input id="busca" type="search" className="campo h-12 pl-11" placeholder="Buscar por nome, apelido, telefone ou e-mail"
            value={p('q')} onChange={(e) => definir('q', e.target.value)} />
        </div>
        <div role="group" aria-label="Visualização" className="flex gap-1 rounded-xl bg-dark/60 p-1">
          {[['tabela', 'Tabela'], ['cards', 'Cards com foto']].map(([v, r]) => (
            <button key={v} type="button" aria-pressed={visao === v} onClick={() => mudarVisao(v)}
              className={`min-h-[40px] rounded-lg px-3.5 text-[13px] font-bold ${visao === v ? 'text-texto' : 'text-muted'}`}
              style={visao === v ? { background: 'var(--gradient)' } : undefined}>{r}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Selecao id="f-status" rotulo="Status" valor={p('status')} onChange={(v) => definir('status', v)}
          opcoes={Object.entries(STATUS).map(([k, s]) => [k, s.rotulo])} />
        <Selecao id="f-origem" rotulo="Origem" valor={p('origem')} onChange={(v) => definir('origem', v)}
          opcoes={Object.entries(ORIGEM)} />
        {[['semFoto', 'Sem foto'], ['semEmail', 'Sem e-mail'], ['semTelefone', 'Sem telefone'], ['aniversariantes', 'Aniversariantes do mês']].map(([k, r]) => (
          <button key={k} type="button" aria-pressed={Boolean(p(k))} onClick={() => alternar(k)} className={`chip ${p(k) ? 'chip-ativo' : ''}`}>{r}</button>
        ))}
        <Selecao id="f-inc" rotulo="Inconsistência" valor={p('inconsistencia')} onChange={(v) => definir('inconsistencia', v)}
          opcoes={CODIGOS.map((c) => [c, INCONSISTENCIAS[c].titulo])} />
        <Selecao id="f-faixa" rotulo="Faixa etária" valor={p('faixa')} onChange={(v) => definir('faixa', v)}
          opcoes={[...FAIXAS.map((f) => [f.id, f.rotulo]), ...GRUPOS_IDADE.map((g) => [g.id, g.rotulo])]} />
        <Selecao id="f-sexo" rotulo="Sexo" valor={p('sexo')} onChange={(v) => definir('sexo', v)}
          opcoes={[...Object.entries(SEXOS), ['nao', 'Não informado']]} />
        <button type="button" aria-pressed={Boolean(p('semResponsavel'))} onClick={() => alternar('semResponsavel')}
          className={`chip ${p('semResponsavel') ? 'chip-ativo' : ''}`}>Menores de 14 sem responsável</button>
        <button type="button" aria-pressed={Boolean(p('ativos'))} onClick={() => alternar('ativos')}
          className={`chip ${p('ativos') ? 'chip-ativo' : ''}`}>Só ativos</button>
        <button type="button" aria-pressed={Boolean(p('incompleto'))} onClick={() => alternar('incompleto')}
          className={`chip ${p('incompleto') ? 'chip-ativo' : ''}`}>Sem apelido ou sexo</button>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Filtros da rede">
        <Selecao id="f-papel" rotulo="Papel" valor={p('papel')} onChange={(v) => definir('papel', v)}
          opcoes={LISTA_PAPEIS.map((k) => [k, PAPEIS[k].rotulo])} />
        <Selecao id="f-disc" rotulo="Discipulador" valor={p('discipulador')} onChange={(v) => definir('discipulador', v)}
          opcoes={discipuladores.map((d) => [d.id, d.nome])} />
        <Selecao id="f-lid" rotulo="Liderança" valor={p('lideranca')} onChange={(v) => definir('lideranca', v)}
          opcoes={liderancas.map((d) => [d.id, d.nome])} />
        {[['semDiscipulador', 'Sem discipulador'], ['discSemLideranca', 'Discipulador sem liderança']].map(([k, r]) => (
          <button key={k} type="button" aria-pressed={Boolean(p(k))} onClick={() => alternar(k)} className={`chip ${p(k) ? 'chip-ativo' : ''}`}>{r}</button>
        ))}
        {temFiltro && <button type="button" className="btn-texto text-[13px]" onClick={() => setParams({}, { replace: true })}>Limpar filtros</button>}
      </div>

      <p className="m-0 text-[13px] text-muted" aria-live="polite">
        {filtrados.length === jovens.length ? `${jovens.length} pessoas` : `${filtrados.length} de ${jovens.length} pessoas`}
        {visao === 'tabela' && ' · marque as caixas para agir em várias de uma vez'}
      </p>

      {filtrados.length === 0 ? (
        <div className="cartao p-10 text-center text-sm text-muted">Ninguém encontrado com esses filtros.</div>
      ) : visao === 'tabela' ? (
        <div className="cartao overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-muted">
                <th className="w-12 border-b border-white/[0.08] py-3 pl-3.5">
                  <input type="checkbox" aria-label="Selecionar todos os filtrados" checked={todosMarcados} onChange={marcarTodos}
                    className="h-[18px] w-[18px] accent-[var(--secondary)]" />
                </th>
                {['Jovem', 'Idade', 'Telefone', 'Rede', 'Discipulado por', 'Status', 'Problemas'].map((c) => (
                  <th key={c} className="whitespace-nowrap border-b border-white/[0.08] px-3.5 py-3">{c}</th>
                ))}
                <th className="border-b border-white/[0.08] px-3.5 py-3"><span className="sr-only">WhatsApp</span></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((j) => {
                const inval = j.inconsistencias.includes('NASCIMENTO_INVALIDO');
                const n = j.inconsistencias.length;
                const wa = linkWhatsApp(j.telefone);
                const acima = porId.get(j.discipulado_por);
                const marcado = selecao.has(j.id);
                return (
                  <tr key={j.id} className={marcado ? 'bg-secondary/10' : 'hover:bg-secondary/5'}>
                    <td className="border-b border-white/5 py-2.5 pl-3.5">
                      <input type="checkbox" aria-label={`Selecionar ${j.nome}`} checked={marcado} onChange={() => marcar(j.id)}
                        className="h-[18px] w-[18px] accent-[var(--secondary)]" />
                    </td>
                    <td className="border-b border-white/5 px-3.5 py-2.5">
                      <Link to={`/admin/jovens/${j.id}`} className="flex items-center gap-3 font-bold text-texto no-underline hover:text-secondary">
                        <Avatar caminho={j.foto_url} nome={j.nome} tamanho={36} />
                        <span className="flex flex-col leading-tight">
                          <span className="whitespace-nowrap">{j.apelido || j.nome}</span>
                          {j.apelido && <span className="whitespace-nowrap text-xs font-semibold text-muted">{j.nome}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className={`whitespace-nowrap border-b border-white/5 px-3.5 py-2.5 ${inval ? 'text-[#FF7A7E]' : ''}`}>
                      {inval ? 'Inválida' : idade(j.data_nascimento) ?? '—'}
                    </td>
                    <td className="whitespace-nowrap border-b border-white/5 px-3.5 py-2.5 text-[#D6DDEA]">{formatarTelefone(j.telefone) || '—'}</td>
                    <td className="border-b border-white/5 px-3.5 py-2.5"><BadgePapel papel={j.papel} cargo={j.cargo_lideranca} /></td>
                    <td className="border-b border-white/5 px-3.5 py-2.5">
                      {acima ? (
                        <Link to={`/admin/jovens/${acima.id}`} className="flex items-center gap-2 whitespace-nowrap text-[13px] text-[#D6DDEA] no-underline hover:text-secondary">
                          <Avatar caminho={acima.foto_url} nome={acima.nome} tamanho={26} /> {acima.nome.split(' ').slice(0, 2).join(' ')}
                        </Link>
                      ) : j.papel === 'lideranca' ? <span className="text-muted">—</span> : <span className="text-[13px] text-warning">Sem vínculo</span>}
                    </td>
                    <td className="border-b border-white/5 px-3.5 py-2.5"><StatusBadge status={j.status} curto /></td>
                    <td className="border-b border-white/5 px-3.5 py-2.5">
                      {n > 0
                        ? <span className={`badge ${n >= 3 ? 'bg-danger/15 text-[#FF8A8E]' : 'bg-warning/15 text-warning'}`}>{n}</span>
                        : <span className="badge bg-success/15 text-success">0</span>}
                    </td>
                    <td className="border-b border-white/5 px-3.5 py-2.5">
                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${j.nome}`}
                          className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-success/40 text-success hover:bg-success/10">
                          <Icone nome="whatsapp" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
          {filtrados.map((j) => {
            const anos = j.inconsistencias.includes('NASCIMENTO_INVALIDO') ? null : idade(j.data_nascimento);
            return (
              <Link key={j.id} to={`/admin/jovens/${j.id}`}
                className="cartao flex flex-col items-center gap-2.5 px-4 py-5 text-center text-texto no-underline transition hover:border-secondary/40">
                <Avatar caminho={j.foto_url} nome={j.nome} tamanho={84} className="border-2" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-extrabold leading-snug">{j.apelido || j.nome}</span>
                  {j.apelido && <span className="text-xs font-semibold leading-snug text-muted">{j.nome}</span>}
                </span>
                <span className="text-xs text-muted">{anos !== null ? `${anos} anos` : 'Idade inválida'}</span>
                <div className="flex flex-wrap justify-center gap-1.5"><BadgePapel papel={j.papel} cargo={j.cargo_lideranca} /><StatusBadge status={j.status} curto /></div>
              </Link>
            );
          })}
        </div>
      )}

      {selecao.size > 0 && (
        <AcoesEmMassa ids={[...selecao]} jovens={jovens} porId={porId}
          aoTerminar={recarregar} aoLimpar={() => setSelecao(new Set())} />
      )}
    </div>
  );
}
