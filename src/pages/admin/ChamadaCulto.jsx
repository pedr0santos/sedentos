import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { dataCulto, ESTADOS, STATUS_CULTO, lerFila, gravarFila } from '../../lib/chamada';
import { Carregando, Aviso, Campo } from '../../components/Visual';
import { Modal } from '../../components/Rede';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Modal para justificar (durante a chamada) ou corrigir (depois de fechada). */
function ModalEstado({ jovem, atual, fechada, secretario, aoSalvar, aoFechar }) {
  const [estado, setEstado] = useState(atual?.estado === 'justificada' || !fechada ? 'justificada' : atual?.estado ?? 'presente');
  const [motivo, setMotivo] = useState(atual?.motivo ?? '');
  if (!jovem) return null;
  const opcoes = fechada ? ['presente', 'falta', 'justificada'] : ['justificada'];
  return (
    <Modal titulo={fechada ? `Corrigir: ${jovem.nome}` : `Justificar falta: ${jovem.nome}`} aberto aoFechar={aoFechar}>
      {fechada && (
        <div role="radiogroup" aria-label="Presença" className="grid grid-cols-3 gap-1 rounded-xl bg-dark/60 p-1">
          {opcoes.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={estado === e} onClick={() => setEstado(e)}
              className={`min-h-[44px] rounded-lg text-[13px] font-bold ${estado === e ? 'text-texto' : 'text-muted'}`}
              style={estado === e ? { background: 'var(--gradient)' } : undefined}>{ESTADOS[e].rotulo}</button>
          ))}
        </div>
      )}
      {estado === 'justificada' && (
        <Campo id="motivo" rotulo="Motivo">
          <input id="motivo" autoFocus className="campo" placeholder="Ex.: viagem, doença, trabalho" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      )}
      {fechada && (
        <p className="m-0 text-[13px] text-muted">
          {secretario ? 'Se a falta virar presença ou justificada, o aviso é cancelado.' : 'Se a falta virar presença ou justificada, o aviso ao discipulador é cancelado. A correção fica no histórico.'}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className="btn-secundario" onClick={aoFechar}>Voltar</button>
        <button type="button" className="btn-primario" disabled={estado === 'justificada' && !motivo.trim()}
          onClick={() => aoSalvar(estado, estado === 'justificada' ? motivo.trim() : null)}>Salvar</button>
      </div>
    </Modal>
  );
}

/** Cartão tocável: um toque marca/desmarca presença; segurar abre "Justificar". */
function CartaoChamada({ j, secretario, registro, salvando, aoTocar, aoSegurar }) {
  const timer = useRef(null);
  const segurou = useRef(false);
  const presente = registro?.estado === 'presente';
  const justificada = registro?.estado === 'justificada';
  const inicio = () => { segurou.current = false; timer.current = setTimeout(() => { segurou.current = true; aoSegurar(); }, 550); };
  const fim = () => clearTimeout(timer.current);
  return (
    <div className="flex items-stretch gap-1.5">
      <button type="button" aria-pressed={presente}
        onPointerDown={inicio} onPointerUp={fim} onPointerLeave={fim} onPointerCancel={fim}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (!segurou.current) aoTocar(); }}
        className={`flex min-h-[64px] min-w-0 flex-1 select-none items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left transition duration-150 active:scale-[0.99]
          ${presente ? 'border-success bg-success/10' : justificada ? 'border-white/20 bg-white/[0.04]' : 'border-white/[0.07] bg-dark/50 hover:border-secondary/40'}`}>
        <div className="relative">
          <Avatar caminho={j.foto_url} nome={j.nome} tamanho={44} />
          {presente && (
            <span className="anim-pop absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-success text-bg">
              <Icone nome="check" tamanho={14} largura={3.2} />
            </span>
          )}
        </div>
        <span className="flex min-w-0 flex-1 flex-col">
<span className="truncate text-[15px] font-bold">{j.apelido || j.nome}{j.apelido && <span className="text-xs font-semibold text-muted"> {j.nome}</span>}</span>
          {(justificada || !secretario) && (
            <span className="truncate text-xs text-muted">
              {justificada ? `Justificada${registro.motivo ? `: ${registro.motivo}` : ''}`
                : j.discipulador_nome ? `Discipulador: ${j.discipulador_nome.split(' ')[0]}` : j.papel === 'lideranca' ? 'Liderança' : 'Sem discipulador'}
            </span>
          )}
        </span>
        <span className="w-14 shrink-0 text-right text-[11px] font-semibold text-muted" aria-live="polite">
          {salvando === 'salvando' ? 'salvando…' : salvando === 'fila' ? 'na fila' : salvando === 'salvo' ? <span className="text-success">salvo</span> : ''}
        </span>
      </button>
      <button type="button" onClick={aoSegurar} aria-label={`Mais opções para ${j.nome}`}
        className="flex w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.07] text-xl font-bold text-muted hover:text-texto">⋯</button>
    </div>
  );
}

/**
 * Tela da chamada. O admin lê por lista_chamada_admin (com a rede); o secretário, por
 * lista_chamada (só foto, nome, apelido e presença). Nada de consulta direta a jovens/presencas.
 */
export default function ChamadaCulto() {
  const { id } = useParams();
  const { admin } = useAuth();
  const secretario = !admin;
  const base = admin ? '/admin/chamada' : '/chamada';
  const [pessoas, setPessoas] = useState(null);         // linhas da RPC
  const [culto, setCulto] = useState(null);
  const [registros, setRegistros] = useState({});       // jovem_id → {estado, motivo}
  const [salvando, setSalvando] = useState({});         // jovem_id → 'salvando' | 'fila' | 'salvo'
  const [fila, setFila] = useState(() => lerFila(id));
  const [online, setOnline] = useState(navigator.onLine);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [porDisc, setPorDisc] = useState('');
  const [modal, setModal] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState(null);
  const enviando = useRef(false);

  const carregar = useCallback(async () => {
    const { data: c, error } = await supabase.from('cultos').select('*').eq('id', id).single();
    if (error) { setErro(mensagemErro(error)); return; }
    setCulto(c);
    const { data: linhas, error: e2 } = await supabase.rpc(secretario ? 'lista_chamada' : 'lista_chamada_admin', { p_culto: id });
    if (e2) { setErro(mensagemErro(e2)); return; }
    setPessoas((linhas ?? []).map((l) => ({ ...l, id: l.jovem_id, ativo: secretario ? true : l.ativo })));
    const m = {};
    for (const l of linhas ?? []) if (l.estado) m[l.jovem_id] = { estado: l.estado, motivo: l.motivo };
    // marcações ainda na fila local valem por cima do servidor
    for (const f of lerFila(id)) { if (f.estado) m[f.jovem] = { estado: f.estado, motivo: f.motivo }; else delete m[f.jovem]; }
    setRegistros(m);
    if (c.status === 'fechado') {
      const { data: r } = await supabase.rpc(secretario ? 'resumo_culto_secretario' : 'resumo_culto', { p_culto: id });
      setResumo(r);
    }
  }, [id, secretario]);
  useEffect(() => { carregar(); }, [carregar]);

  // Envia a fila, um por vez; para se a internet cair.
  const enviarFila = useCallback(async () => {
    if (enviando.current) return;
    enviando.current = true;
    try {
      let atual = lerFila(id);
      while (atual.length) {
        const item = atual[0];
        setSalvando((s) => ({ ...s, [item.jovem]: 'salvando' }));
        const { error } = await supabase.rpc('marcar_presenca', { p_culto: id, p_jovem: item.jovem, p_estado: item.estado, p_motivo: item.motivo });
        if (error && /fetch|network|Failed/i.test(error.message)) {
          setSalvando((s) => ({ ...s, [item.jovem]: 'fila' }));
          break;
        }
        atual = lerFila(id).slice(1);
        gravarFila(id, atual);
        setFila(atual);
        if (error) setErro(`${mensagemErro(error)}`);
        else setSalvando((s) => ({ ...s, [item.jovem]: atual.some((f) => f.jovem === item.jovem) ? 'fila' : 'salvo' }));
      }
    } finally {
      enviando.current = false;
    }
  }, [id]);

  useEffect(() => {
    const on = () => { setOnline(true); enviarFila(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(() => { if (navigator.onLine && lerFila(id).length) enviarFila(); }, 10000);
    enviarFila();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, [enviarFila, id]);

  // "Tempo real": com a chamada aberta, confere a lista a cada 5 s (o que chega é só o que a RPC
  // devolve; nenhum canal expõe a tabela presencas). Para quando a aba fica escondida.
  const aberta = culto && culto.status !== 'fechado';
  useEffect(() => {
    if (!aberta) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine && !lerFila(id).length && !enviando.current) carregar();
    }, 5000);
    return () => clearInterval(t);
  }, [aberta, id, carregar]);

  const marcar = (jovem, estado, motivo = null) => {
    setRegistros((r) => { const n = { ...r }; if (estado) n[jovem] = { estado, motivo }; else delete n[jovem]; return n; });
    const nova = [...lerFila(id), { jovem, estado, motivo, t: Date.now() }];
    gravarFila(id, nova);
    setFila(nova);
    setSalvando((s) => ({ ...s, [jovem]: navigator.onLine ? 'salvando' : 'fila' }));
    enviarFila();
  };

  const ativos = useMemo(() => (pessoas ?? []).filter((j) => j.ativo !== false), [pessoas]);
  const discipuladores = useMemo(() => {
    if (secretario) return [];
    const m = new Map();
    for (const j of pessoas ?? []) if (j.discipulado_por && j.discipulador_nome) m.set(j.discipulado_por, j.discipulador_nome);
    return [...m.entries()].map(([id2, nome]) => ({ id: id2, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pessoas, secretario]);

  if (!pessoas || !culto) return erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando tela />;

  const fechada = culto.status === 'fechado';
  const presentes = ativos.filter((j) => registros[j.id]?.estado === 'presente').length;
  const t = semAcento(busca.trim());
  const visiveis = ativos.filter((j) => {
    if (t.length >= 2 && !semAcento(j.nome).includes(t) && !semAcento(j.apelido).includes(t)) return false;
    if (porDisc && j.discipulado_por !== porDisc) return false;
    const e = registros[j.id]?.estado;
    if (filtro === 'presentes') return e === 'presente';
    if (filtro === 'naomarcados') return !e;
    if (filtro === 'faltas') return e === 'falta';
    if (filtro === 'justificadas') return e === 'justificada';
    return true;
  });

  // Prévia do fechamento
  const vaoFaltar = ativos.filter((j) => !registros[j.id]);
  const discAvisados = new Set(vaoFaltar.filter((j) => j.papel !== 'lideranca' && j.discipulado_por).map((j) => j.discipulado_por));
  const semDisc = vaoFaltar.filter((j) => j.papel !== 'lideranca' && !j.discipulado_por).length;

  const nomeCurto = (j) => j.apelido || j.nome;

  const fechar = async () => {
    setErro('');
    if (lerFila(id).length) { setErro('Ainda há marcações aguardando envio. Espere a conexão voltar antes de fechar.'); setConfirmar(false); return; }
    const { data, error } = await supabase.rpc('fechar_chamada', { p_culto: id });
    setConfirmar(false);
    if (error) { setErro(mensagemErro(error)); return; }
    let envio = null;
    try {
      const r = await supabase.functions.invoke('avisar-faltas', { body: { culto_id: id } });
      envio = r.error ? { erro: true } : r.data;
    } catch { envio = { erro: true }; }
    setResultado({ ...data, envio });
    await carregar();
  };

  const grupos = (() => {
    if (!fechada) return [];
    if (secretario) {
      // Secretário: só as três listas, sem rede.
      return [['presente', 'Presentes'], ['falta', 'Faltas'], ['justificada', 'Justificadas']]
        .map(([e, nome]) => ({ k: e, nome, lista: ativos.filter((j) => registros[j.id]?.estado === e) }));
    }
    const m = new Map();
    for (const j of ativos.filter((x) => registros[x.id])) {
      const k = j.papel === 'lideranca' ? 'lideranca' : j.discipulado_por ?? 'sem';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(j);
    }
    for (const j of pessoas.filter((x) => x.ativo === false && registros[x.id])) {
      if (!m.has('inativos')) m.set('inativos', []);
      m.get('inativos').push(j);
    }
    const nome = (k) => (k === 'lideranca' ? 'Liderança' : k === 'sem' ? 'Sem discipulador' : k === 'inativos' ? 'Hoje inativos' : `Grupo de ${discipuladores.find((d) => d.id === k)?.nome ?? '—'}`);
    return [...m.entries()].map(([k, l]) => ({ k, nome: nome(k), lista: l })).sort((a, b) => a.nome.localeCompare(b.nome));
  })();

  return (
    <div className="flex flex-col gap-4 pb-28">
      <Link to={base} className="btn-texto self-start px-0">← Cultos</Link>

      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b border-white/5 bg-bg/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold">{dataCulto(culto.data)}</span>
            <span className="text-sm text-muted">{culto.titulo} · <span className={`badge ${STATUS_CULTO[culto.status].classe}`}>{STATUS_CULTO[culto.status].rotulo}</span></span>
          </div>
          <span className="flex items-center gap-2 text-base font-extrabold" aria-live="polite">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success text-bg"><Icone nome="check" tamanho={16} largura={3} /></span>
            {presentes} <span className="font-semibold text-muted">presentes de {ativos.length}</span>
          </span>
        </div>
        <div className="relative">
          <label htmlFor="busca-chamada" className="sr-only">Buscar por nome ou apelido</label>
          <Icone nome="busca" tamanho={22} className="absolute left-4 top-[17px] text-muted" />
          <input id="busca-chamada" type="search" autoComplete="off" className="campo h-14 pl-12 text-lg" placeholder="Digite o nome ou apelido…"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(fechada
            ? [['todos', 'Todos'], ['presentes', 'Presentes'], ['faltas', 'Faltas'], ['justificadas', 'Justificadas']]
            : [['todos', 'Todos'], ['presentes', 'Presentes'], ['naomarcados', 'Ainda não marcados']]).map(([k, r]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={`chip ${filtro === k ? 'chip-ativo' : ''}`}>{r}</button>
          ))}
          {!secretario && (
            <>
              <label htmlFor="f-disc-chamada" className="sr-only">Discipulador</label>
              <select id="f-disc-chamada" value={porDisc} onChange={(e) => setPorDisc(e.target.value)} className={`chip max-w-[200px] bg-transparent ${porDisc ? 'chip-ativo' : ''}`}>
                <option value="" className="bg-bg">Todos os grupos</option>
                {discipuladores.map((d) => <option key={d.id} value={d.id} className="bg-bg">{d.nome}</option>)}
              </select>
            </>
          )}
        </div>
        {(!online || fila.length > 0) && (
          <Aviso tipo={online ? 'info' : 'alerta'}>
            {online ? `Enviando ${fila.length} marcaç${fila.length === 1 ? 'ão' : 'ões'}…` : `Sem conexão: ${fila.length} marcaç${fila.length === 1 ? 'ão aguardando' : 'ões aguardando'} envio. Pode continuar marcando.`}
          </Aviso>
        )}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {resultado && (
        <Aviso tipo="ok">
          Chamada fechada: {resultado.presentes} presentes, {resultado.faltas} faltas, {resultado.justificadas} justificadas.
          {secretario ? ' Os responsáveis serão avisados.' : (
            <>
              {' '}{resultado.avisos_enviados} avisos criados.
              {resultado.envio?.erro && ' Os avisos estão no sistema; o envio por e-mail/push não está configurado ou falhou.'}
              {resultado.envio?.emails !== undefined && ` E-mails: ${resultado.envio.emails}. Push: ${resultado.envio.push ?? 0}.`}
              {resultado.envio?.simulado && ' (Na demonstração, e-mail e push são simulados.)'}
            </>
          )}
        </Aviso>
      )}

      {fechada && resumo && (
        <section className={`grid gap-3 ${secretario ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`} aria-label="Resumo">
          {[['Presentes', resumo.presentes, 'text-success'], ['Faltas', resumo.faltas, 'text-[#FF8A8E]'], ['Justificadas', resumo.justificadas, 'text-muted'],
            ...(secretario ? [] : [['Avisos com contato', `${resumo.contatos_feitos}/${resumo.avisos}`, 'text-secondary']])].map(([r, v, c]) => (
            <div key={r} className="cartao flex flex-col gap-1 p-4">
              <span className="text-xs font-semibold text-muted">{r}</span>
              <span className={`text-2xl font-extrabold ${c}`}>{v}</span>
            </div>
          ))}
          {!secretario && resumo.avisos > resumo.contatos_feitos && (
            <p className="col-span-full m-0 text-[13px] text-muted">
              {resumo.avisos - resumo.contatos_feitos} aviso(s) ainda sem contato do discipulador ou da liderança.
            </p>
          )}
        </section>
      )}

      {fechada ? (
        <div className="flex flex-col gap-5">
          <p className="m-0 text-[13px] text-muted">Toque em alguém para corrigir a presença.</p>
          {grupos.map((g) => {
            const lista = g.lista.filter((j) => visiveis.includes(j) || (g.k === 'inativos' && (!t || semAcento(j.nome).includes(t) || semAcento(j.apelido).includes(t))));
            if (!lista.length) return null;
            const n = (e) => g.lista.filter((j) => registros[j.id]?.estado === e).length;
            return (
              <section key={g.k} className="flex flex-col gap-2">
                <h2 className="m-0 flex flex-wrap items-baseline gap-2 text-sm font-extrabold">
                  {g.nome}{' '}
                  <span className="font-semibold text-muted">
                    {secretario ? `· ${g.lista.length}` : `· ${n('presente')} presentes · ${n('falta')} faltas · ${n('justificada')} justificadas`}
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {lista.map((j) => {
                    const r = registros[j.id];
                    return (
                      <button key={j.id} type="button" onClick={() => setModal(j)}
                        className="flex min-h-[52px] min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-dark/40 px-3 text-left hover:border-secondary/40">
                        <Avatar caminho={j.foto_url} nome={j.nome} tamanho={34} />
                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span className="truncate text-sm font-semibold">{nomeCurto(j)}</span>
                          {j.apelido && <span className="truncate text-xs text-muted">{j.nome}</span>}
                        </span>
                        <span className={`badge ${ESTADOS[r.estado].classe}`}>{ESTADOS[r.estado].rotulo}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          {t.length > 0 && t.length < 2 && <span className="text-sm text-muted">Continue digitando…</span>}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {visiveis.map((j) => (
              <CartaoChamada key={j.id} j={j} secretario={secretario} registro={registros[j.id]} salvando={salvando[j.id]}
                aoTocar={() => marcar(j.id, registros[j.id]?.estado === 'presente' ? null : 'presente')}
                aoSegurar={() => setModal(j)} />
            ))}
          </div>
          {visiveis.length === 0 && <div className="cartao p-8 text-center text-sm text-muted">Ninguém com esse filtro.</div>}

          <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-bg/95 px-4 py-3 backdrop-blur ${admin ? 'lg:left-[250px]' : ''}`}>
            <button type="button" className="btn-primario mx-auto flex w-full max-w-xl min-h-[54px] text-base" onClick={() => setConfirmar(true)}>
              Fechar chamada
            </button>
          </div>
        </>
      )}

      {modal && (
        <ModalEstado jovem={modal} atual={registros[modal.id]} fechada={fechada} secretario={secretario} aoFechar={() => setModal(null)}
          aoSalvar={async (estado, motivo) => {
            const j = modal; setModal(null);
            if (!fechada) { marcar(j.id, estado, motivo); return; }
            const { error } = await supabase.rpc('marcar_presenca', { p_culto: id, p_jovem: j.id, p_estado: estado, p_motivo: motivo });
            if (error) setErro(mensagemErro(error)); else await carregar();
          }} />
      )}

      <Modal titulo="Fechar a chamada?" aberto={confirmar} aoFechar={() => setConfirmar(false)}>
        {secretario ? (
          <p className="m-0 text-[15px] leading-relaxed">
            <strong>{vaoFaltar.length} {vaoFaltar.length === 1 ? 'pessoa ficará' : 'pessoas ficarão'}</strong> com falta. Os responsáveis serão avisados.
          </p>
        ) : (
          <p className="m-0 text-[15px] leading-relaxed">
            <strong>{vaoFaltar.length} {vaoFaltar.length === 1 ? 'pessoa ficará' : 'pessoas ficarão'}</strong> com falta e{' '}
            <strong>{discAvisados.size} discipulador{discAvisados.size === 1 ? '' : 'es'}</strong> {discAvisados.size === 1 ? 'será avisado' : 'serão avisados'}.
            {semDisc > 0 && <span className="text-muted"> {semDisc} sem discipulador vão num resumo para a administração.</span>}
          </p>
        )}
        <ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto rounded-xl bg-white/[0.03] p-2">
          {vaoFaltar.map((j) => (
            <li key={j.id} className="flex items-center gap-2.5 px-1 py-1 text-sm">
              <Avatar caminho={j.foto_url} nome={j.nome} tamanho={28} />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate">{nomeCurto(j)}</span>
                {j.apelido && <span className="truncate text-xs text-muted">{j.nome}</span>}
              </span>
              {!secretario && <span className="text-xs text-muted">{j.discipulador_nome?.split(' ')[0] ?? (j.papel === 'lideranca' ? 'Liderança' : 'sem discipulador')}</span>}
            </li>
          ))}
          {vaoFaltar.length === 0 && <li className="p-2 text-sm text-muted">Todos foram marcados.</li>}
        </ul>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className="btn-secundario" onClick={() => setConfirmar(false)}>Voltar</button>
          <button type="button" className="btn-primario" onClick={fechar}>Fechar e avisar</button>
        </div>
      </Modal>
    </div>
  );
}
