import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { useJovens } from '../../hooks/useJovens';
import { PAPEIS, papelAcima, LIMITE_PADRAO } from '../../lib/rede';
import { formatarDataHora } from '../../lib/formato';
import { Titulo, Carregando, Aviso, Campo } from '../../components/Visual';
import { BadgePapel, Modal, SeletorPessoa } from '../../components/Rede';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');

/** Pessoa arrastável (jovem ou discipulador) com botão "Transferir" para o celular. */
function Pessoa({ p, destaque, aoTransferir, aoArrastar, extra }) {
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; aoArrastar?.(p); }}
      data-match={destaque ? 'sim' : undefined}
      className={`flex min-w-0 cursor-grab items-center gap-2.5 rounded-xl border px-2.5 py-2 active:cursor-grabbing
        ${destaque ? 'border-secondary bg-secondary/15 ring-2 ring-secondary/50' : 'border-white/[0.07] bg-white/[0.03] hover:border-secondary/30'}`}>
      <Avatar caminho={p.foto_url} nome={p.nome} tamanho={30} />
      <Link to={`/admin/jovens/${p.id}`} className="min-w-0 flex-1 truncate text-[13px] font-semibold text-texto no-underline hover:text-secondary">{p.nome}</Link>
      {extra}
      <button type="button" onClick={() => aoTransferir(p)} aria-label={`Transferir ${p.nome}`} title="Transferir"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-secondary/10 hover:text-secondary">
        <Icone nome="transferir" tamanho={16} />
      </button>
    </div>
  );
}

/** Área que aceita soltar pessoas do papel certo. */
function AlvoSoltar({ papelAceito, arrastando, aoSoltar, children, className = '' }) {
  const [sobre, setSobre] = useState(false);
  const aceita = arrastando && papelAcima(arrastando.papel) === papelAceito;
  return (
    <div
      onDragOver={(e) => { if (aceita) { e.preventDefault(); setSobre(true); } }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => { e.preventDefault(); setSobre(false); if (aceita) aoSoltar(e.dataTransfer.getData('text/plain')); }}
      className={`${className} transition ${aceita ? 'outline-dashed outline-2 outline-offset-2 outline-secondary/40' : ''} ${sobre ? 'bg-secondary/10' : ''}`}>
      {children}
    </div>
  );
}

function Pendencia({ titulo, itens, tom = 'warning', render, vazio }) {
  const [aberto, setAberto] = useState(false);
  const cor = itens.length === 0 ? 'text-success' : tom === 'danger' ? 'text-[#FF8A8E]' : 'text-warning';
  return (
    <div className="flex flex-col border-b border-white/[0.06] last:border-0">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((a) => !a)} disabled={!itens.length}
        className="flex min-h-[48px] items-center gap-3 text-left text-sm disabled:cursor-default">
        <span className="flex-1 font-semibold">{titulo}</span>
        <span className={`text-base font-extrabold ${cor}`}>{itens.length}</span>
        {itens.length > 0 && <Icone nome="baixo" tamanho={14} className={`text-muted transition ${aberto ? 'rotate-180' : ''}`} />}
      </button>
      {itens.length === 0 && vazio && <span className="-mt-2 pb-3 text-xs text-muted">{vazio}</span>}
      {aberto && <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pb-3">{itens.map(render)}</div>}
    </div>
  );
}

export default function Rede() {
  const { jovens, carregando, recarregar } = useJovens();
  const [busca, setBusca] = useState('');
  const [fechados, setFechados] = useState(() => new Set());
  const [arrastando, setArrastando] = useState(null);
  const [transferindo, setTransferindo] = useState(null);
  const [destino, setDestino] = useState(null);
  const [msg, setMsg] = useState(null);
  const [limite, setLimite] = useState(LIMITE_PADRAO);
  const [limiteEdit, setLimiteEdit] = useState(String(LIMITE_PADRAO));
  const [correcoes, setCorrecoes] = useState([]);
  const [faltasSemDisc, setFaltasSemDisc] = useState([]);

  useEffect(() => {
    supabase.from('config_rede').select('*').maybeSingle().then(({ data }) => {
      if (data?.limite_discipulos) { setLimite(data.limite_discipulos); setLimiteEdit(String(data.limite_discipulos)); }
    });
    supabase.from('anotacoes_discipulado').select('id, jovem_id, autor_nome, texto, criado_em')
      .eq('tipo', 'correcao_cadastro').order('criado_em', { ascending: false }).limit(30)
      .then(({ data }) => setCorrecoes(data ?? []));
    supabase.from('notificacoes').select('id, mensagem, dados, criado_em, contato_feito_em').eq('para_admins', true)
      .is('cancelada_em', null).is('contato_feito_em', null).order('criado_em', { ascending: false }).limit(10)
      .then(({ data }) => setFaltasSemDisc(data ?? []));
  }, []);

  const resolverResumo = async (id) => {
    await supabase.from('notificacoes').update({ contato_feito_em: new Date().toISOString(), lida_em: new Date().toISOString() }).eq('id', id);
    setFaltasSemDisc((l) => l.filter((n) => n.id !== id));
  };

  const filhos = useMemo(() => {
    const m = new Map();
    for (const j of jovens) if (j.discipulado_por) m.set(j.discipulado_por, [...(m.get(j.discipulado_por) ?? []), j]);
    for (const l of m.values()) l.sort(porNome);
    return m;
  }, [jovens]);
  const porId = useMemo(() => new Map(jovens.map((j) => [j.id, j])), [jovens]);

  const t = semAcento(busca.trim());
  const casa = (p) => t.length >= 2 && semAcento(p.nome).includes(t);
  const totalAchados = t.length >= 2 ? jovens.filter(casa).length : 0;

  useEffect(() => {
    if (t.length < 2) return;
    const el = document.querySelector('[data-match="sim"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [t]);

  if (carregando) return <Carregando tela />;

  const liderancas = jovens.filter((j) => j.papel === 'lideranca').sort(porNome);
  const discSemLider = jovens.filter((j) => j.papel === 'discipulador' && !j.discipulado_por).sort(porNome);
  const jovensSemDisc = jovens.filter((j) => j.papel === 'jovem' && !j.discipulado_por).sort(porNome);
  const semAcesso = jovens.filter((j) => j.papel !== 'jovem' && !j.email).sort(porNome);
  const sobrecarga = jovens.filter((j) => j.papel === 'discipulador' && (filhos.get(j.id)?.length ?? 0) > limite)
    .sort((a, b) => (filhos.get(b.id)?.length ?? 0) - (filhos.get(a.id)?.length ?? 0));

  const contemAchado = (no) => t.length >= 2 && (casa(no) || (filhos.get(no.id) ?? []).some((f) => casa(f) || (filhos.get(f.id) ?? []).some(casa)));
  const aberto = (id, no) => contemAchado(no) || !fechados.has(id);
  const alternar = (id) => setFechados((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const mover = async (id, para) => {
    setArrastando(null);
    const p = porId.get(id);
    if (!p || p.discipulado_por === para) return;
    setMsg(null);
    const { data, error } = await supabase.rpc('rede_atribuir', { p_ids: [id], p_discipulado_por: para });
    if (error || data?.length) { setMsg({ tipo: 'erro', texto: error ? mensagemErro(error) : data[0].erro }); return; }
    setMsg({ tipo: 'ok', texto: `${p.nome} agora está com ${porId.get(para)?.nome ?? 'ninguém'}.` });
    await recarregar();
  };

  const salvarLimite = async () => {
    const n = Number(limiteEdit);
    if (!Number.isInteger(n) || n < 1 || n > 200) { setMsg({ tipo: 'erro', texto: 'O limite precisa ser um número entre 1 e 200.' }); return; }
    const { error } = await supabase.from('config_rede').update({ limite_discipulos: n, atualizado_em: new Date().toISOString() }).eq('id', true);
    if (error) { setMsg({ tipo: 'erro', texto: mensagemErro(error) }); return; }
    setLimite(n);
    setMsg({ tipo: 'ok', texto: `Limite de sobrecarga: ${n} discípulos.` });
  };

  const renderDiscipulador = (d) => {
    const disc = filhos.get(d.id) ?? [];
    const cheio = disc.length > limite;
    const abre = aberto(d.id, d);
    return (
      <AlvoSoltar key={d.id} papelAceito="discipulador" arrastando={arrastando} aoSoltar={(id) => mover(id, d.id)}
        className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-dark/40 p-3">
        <div className="flex items-center gap-2.5" data-match={casa(d) ? 'sim' : undefined}>
          <button type="button" aria-expanded={abre} aria-label={abre ? `Recolher ${d.nome}` : `Expandir ${d.nome}`} onClick={() => alternar(d.id)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white/5">
            <Icone nome="direita" tamanho={16} className={`transition ${abre ? 'rotate-90' : ''}`} />
          </button>
          <div draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', d.id); setArrastando(d); }}
            className={`flex min-w-0 flex-1 cursor-grab items-center gap-2.5 rounded-lg ${casa(d) ? 'ring-2 ring-secondary/60' : ''}`}>
            <Avatar caminho={d.foto_url} nome={d.nome} tamanho={36} />
            <div className="flex min-w-0 flex-col">
              <Link to={`/admin/jovens/${d.id}`} className="truncate text-sm font-bold text-texto no-underline hover:text-secondary">{d.nome.split(' ').slice(0, 2).join(' ')}</Link>
              <span className={`text-xs ${cheio ? 'font-bold text-warning' : 'text-muted'}`}>
                {disc.length} discípulo{disc.length === 1 ? '' : 's'}{cheio ? ` · acima do limite (${limite})` : ''}
              </span>
            </div>
          </div>
          <BadgePapel papel="discipulador" />
          <button type="button" onClick={() => { setTransferindo(d); setDestino(null); }} aria-label={`Mudar a liderança de ${d.nome}`} title="Mudar liderança"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-secondary/10 hover:text-secondary">
            <Icone nome="transferir" tamanho={16} />
          </button>
        </div>
        {abre && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5 pl-2 sm:pl-11">
            {disc.length === 0 && <span className="text-xs text-muted">Arraste jovens para cá ou use a ficha.</span>}
            {disc.map((j) => (
              <Pessoa key={j.id} p={j} destaque={casa(j)} aoArrastar={setArrastando}
                aoTransferir={(p) => { setTransferindo(p); setDestino(null); }} />
            ))}
          </div>
        )}
      </AlvoSoltar>
    );
  };

  return (
    <div className="flex flex-col gap-6" onDragEnd={() => setArrastando(null)}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Titulo inicio="Rede de " destaque="discipulado" className="text-[34px]" />
          <span className="text-sm text-muted">
            {liderancas.length} na liderança · {jovens.filter((j) => j.papel === 'discipulador').length} discipuladores · {jovens.filter((j) => j.papel === 'jovem').length} jovens
          </span>
        </div>
        <div className="relative w-full max-w-sm">
          <label htmlFor="busca-rede" className="sr-only">Buscar na rede</label>
          <Icone nome="busca" className="absolute left-3.5 top-4 text-muted" />
          <input id="busca-rede" type="search" className="campo h-12 pl-11" placeholder="Achar alguém na árvore"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
          {t.length >= 2 && <span className="mt-1 block text-xs text-muted" aria-live="polite">{totalAchados} encontrado(s)</span>}
        </div>
      </header>

      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <section className="cartao flex flex-col p-5 sm:p-6" aria-labelledby="t-pend">
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <h2 id="t-pend" className="m-0 text-lg">Pendências da rede</h2>
          <div className="flex items-end gap-2">
            <Campo id="limite" rotulo="Limite de discípulos">
              <input id="limite" type="number" min={1} max={200} inputMode="numeric" className="campo h-11 w-24 text-sm"
                value={limiteEdit} onChange={(e) => setLimiteEdit(e.target.value)} />
            </Campo>
            {Number(limiteEdit) !== limite && <button type="button" className="btn-secundario min-h-[44px] text-[13px]" onClick={salvarLimite}>Salvar</button>}
          </div>
        </div>
        <Pendencia titulo="Jovens sem discipulador" itens={jovensSemDisc} vazio="Todos os jovens têm discipulador."
          render={(j) => <Pessoa key={j.id} p={j} destaque={casa(j)} aoArrastar={setArrastando} aoTransferir={(p) => { setTransferindo(p); setDestino(null); }} />} />
        <Pendencia titulo="Discipuladores sem liderança" itens={discSemLider} vazio="Todos os discipuladores têm liderança."
          render={(j) => <Pessoa key={j.id} p={j} destaque={casa(j)} aoArrastar={setArrastando} aoTransferir={(p) => { setTransferindo(p); setDestino(null); }} />} />
        <Pendencia titulo="Discipuladores e líderes sem e-mail (não conseguem acessar)" itens={semAcesso} tom="danger" vazio="Todos podem acessar."
          render={(j) => (
            <Link key={j.id} to={`/admin/jovens/${j.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] font-semibold text-texto no-underline hover:bg-white/5">
              <Avatar caminho={j.foto_url} nome={j.nome} tamanho={28} /> <span className="flex-1 truncate">{j.nome}</span> <BadgePapel papel={j.papel} />
            </Link>
          )} />
        <Pendencia titulo={`Discipuladores com mais de ${limite} discípulos`} itens={sobrecarga} vazio="Ninguém sobrecarregado."
          render={(j) => (
            <Link key={j.id} to={`/admin/jovens/${j.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] font-semibold text-texto no-underline hover:bg-white/5">
              <Avatar caminho={j.foto_url} nome={j.nome} tamanho={28} /> <span className="flex-1 truncate">{j.nome}</span>
              <span className="font-extrabold text-warning">{filhos.get(j.id)?.length}</span>
            </Link>
          )} />
        <Pendencia titulo="Faltas de quem não tem discipulador" itens={faltasSemDisc} vazio="Nenhum aviso pendente."
          render={(n) => (
            <div key={n.id} className="flex flex-col gap-1.5 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[13px]">
              <span className="font-semibold">{n.mensagem}</span>
              <span className="text-[#D6DDEA]">
                {(n.dados?.jovens ?? []).map((x, i) => (
                  <span key={x.id}>{i > 0 && ', '}<Link to={`/admin/jovens/${x.id}`}>{x.nome}</Link></span>
                ))}
              </span>
              <button type="button" className="btn-texto self-start px-0 text-xs" onClick={() => resolverResumo(n.id)}>Marcar como resolvido</button>
            </div>
          )} />
        <Pendencia titulo="Avisos de dado incorreto (dos discipuladores)" itens={correcoes} vazio="Nenhum aviso."
          render={(c) => (
            <Link key={c.id} to={`/admin/jovens/${c.jovem_id}`} className="flex flex-col gap-0.5 rounded-xl px-2 py-2 text-[13px] text-texto no-underline hover:bg-white/5">
              <span><strong>{porId.get(c.jovem_id)?.nome ?? 'Jovem'}</strong> <span className="text-muted">· por {c.autor_nome} · {formatarDataHora(c.criado_em)}</span></span>
              <span className="line-clamp-2 text-[#D6DDEA]">{c.texto}</span>
            </Link>
          )} />
      </section>

      <p className="m-0 text-[13px] text-muted">
        Arraste um jovem para outro discipulador (ou um discipulador para outra liderança) para transferir. No celular, use o botão <Icone nome="transferir" tamanho={13} className="inline" />.
      </p>

      <div className="flex flex-col gap-4">
        {liderancas.length === 0 && (
          <div className="cartao p-8 text-center text-sm text-muted">
            Ninguém classificado como Liderança ainda. Abra a ficha de alguém, ou selecione várias pessoas na lista de Jovens e use “Definir papel”.
          </div>
        )}
        {liderancas.map((l) => {
          const discs = filhos.get(l.id) ?? [];
          const totalJovens = discs.reduce((s, d) => s + (filhos.get(d.id)?.length ?? 0), 0);
          const abre = aberto(l.id, l);
          return (
            <AlvoSoltar key={l.id} papelAceito="lideranca" arrastando={arrastando} aoSoltar={(id) => mover(id, l.id)}
              className="cartao flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex items-center gap-3" data-match={casa(l) ? 'sim' : undefined}>
                <button type="button" aria-expanded={abre} aria-label={abre ? `Recolher ${l.nome}` : `Expandir ${l.nome}`} onClick={() => alternar(l.id)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-white/5">
                  <Icone nome="direita" className={`transition ${abre ? 'rotate-90' : ''}`} />
                </button>
                <div className="rounded-full p-[2px]" style={{ background: 'var(--gradient)' }}>
                  <Avatar caminho={l.foto_url} nome={l.nome} tamanho={44} borda={false} />
                </div>
                <div className={`flex min-w-0 flex-1 flex-col ${casa(l) ? 'rounded-lg ring-2 ring-secondary/60' : ''}`}>
                  <Link to={`/admin/jovens/${l.id}`} className="truncate text-base font-extrabold text-texto no-underline hover:text-secondary">{l.nome}</Link>
                  <span className="text-xs text-muted">{discs.length} discipuladores · {totalJovens} jovens</span>
                </div>
                <BadgePapel papel="lideranca" cargo={l.cargo_lideranca} />
              </div>
              {abre && (
                <div className="flex flex-col gap-2.5 sm:pl-6">
                  {discs.length === 0 && <span className="pl-2 text-xs text-muted">Arraste discipuladores para cá.</span>}
                  {discs.map(renderDiscipulador)}
                </div>
              )}
            </AlvoSoltar>
          );
        })}
        {discSemLider.length > 0 && (
          <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-warning/40 p-4">
            <h2 className="m-0 text-sm font-extrabold text-warning">Discipuladores sem liderança</h2>
            {discSemLider.map(renderDiscipulador)}
          </div>
        )}
      </div>

      <Modal titulo={transferindo ? `Transferir ${transferindo.nome}` : ''} aberto={Boolean(transferindo)} aoFechar={() => setTransferindo(null)}>
        {transferindo && (
          <>
            <p className="m-0 text-sm text-muted">
              Escolha {transferindo.papel === 'jovem' ? 'o novo discipulador' : 'a nova liderança'}.
              {transferindo.papel === 'jovem' && ' As anotações continuam no registro do jovem; o discipulador anterior deixa de vê-las.'}
            </p>
            <SeletorPessoa id="transf-destino" pessoas={jovens.filter((j) => j.papel === papelAcima(transferindo.papel) && j.id !== transferindo.discipulado_por)}
              valor={destino} onEscolher={setDestino} vazio={`Escolher ${PAPEIS[papelAcima(transferindo.papel)]?.rotulo.toLowerCase() ?? ''}`}
              contagem={(p) => `${filhos.get(p.id)?.length ?? 0}`} />
            <div className="flex flex-wrap justify-end gap-2.5">
              {transferindo.discipulado_por && (
                <button type="button" className="btn-secundario" onClick={() => { const id = transferindo.id; setTransferindo(null); mover(id, null); }}>Tirar vínculo</button>
              )}
              <button type="button" className="btn-primario" disabled={!destino}
                onClick={() => { const id = transferindo.id; setTransferindo(null); mover(id, destino); }}>Transferir</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
