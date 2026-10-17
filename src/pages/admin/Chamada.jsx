import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { dataCulto, hojeSP, STATUS_CULTO } from '../../lib/chamada';
import { Titulo, Carregando, Aviso, Campo } from '../../components/Visual';
import { Modal } from '../../components/Rede';
import Icone from '../../components/Icone';

function Badge({ status }) {
  const s = STATUS_CULTO[status];
  return <span className={`badge ${s.classe}`}>{s.rotulo}</span>;
}

/** Lista de cultos. Admin e secretário usam a mesma tela; o secretário não cria culto extra nem vê relatórios. */
export default function Chamada() {
  const navegar = useNavigate();
  const { admin } = useAuth();
  const base = admin ? '/admin/chamada' : '/chamada';
  const [cultos, setCultos] = useState(null);
  const [contagens, setContagens] = useState({});
  const [msg, setMsg] = useState(null);
  const [cancelar, setCancelar] = useState(null);
  const [obs, setObs] = useState('');
  const [extra, setExtra] = useState(false);
  const [novo, setNovo] = useState({ data: '', titulo: '' });
  const [ocupado, setOcupado] = useState(false);
  const hoje = hojeSP();

  const carregar = useCallback(async () => {
    await supabase.rpc('garantir_cultos');
    // Cultos + contagens numa RPC só (ninguém lê a tabela presencas por aqui).
    const { data, error } = await supabase.rpc('lista_cultos_chamada');
    if (error) { setMsg({ tipo: 'erro', texto: mensagemErro(error) }); setCultos([]); return; }
    setCultos(data ?? []);
    setContagens(Object.fromEntries((data ?? []).map((c) => [c.id, { presente: c.presentes, falta: c.faltas, justificada: c.justificadas }])));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const { proximo, futuros, anteriores } = useMemo(() => {
    const lista = cultos ?? [];
    const prox = lista.find((c) => c.data >= hoje && c.status !== 'cancelado' && c.status !== 'fechado')
      ?? lista.find((c) => c.status === 'aberto');
    return {
      proximo: prox,
      futuros: lista.filter((c) => c.data >= hoje && c.id !== prox?.id),
      anteriores: lista.filter((c) => c.data < hoje && c.id !== prox?.id).reverse(),
    };
  }, [cultos, hoje]);

  const fazerChamada = async (c) => {
    if (c.status === 'agendado') {
      const { error } = await supabase.rpc('abrir_chamada', { p_culto: c.id });
      if (error) { setMsg({ tipo: 'erro', texto: mensagemErro(error) }); return; }
    }
    navegar(`${base}/${c.id}`);
  };

  const confirmarCancelar = async () => {
    setOcupado(true);
    const { error } = await supabase.rpc('cancelar_culto', { p_culto: cancelar.id, p_observacao: obs || null });
    setOcupado(false);
    if (error) { setMsg({ tipo: 'erro', texto: mensagemErro(error) }); } else setMsg({ tipo: 'ok', texto: `Culto de ${dataCulto(cancelar.data)} cancelado.` });
    setCancelar(null); setObs('');
    carregar();
  };

  const reativar = async (c) => {
    const { error } = await supabase.rpc('reativar_culto', { p_culto: c.id });
    if (error) setMsg({ tipo: 'erro', texto: mensagemErro(error) });
    carregar();
  };

  const criarExtra = async () => {
    if (!novo.data) { setMsg({ tipo: 'erro', texto: 'Escolha a data do culto extra.' }); return; }
    setOcupado(true);
    const { error } = await supabase.rpc('criar_culto_extra', { p_data: novo.data, p_titulo: novo.titulo || null });
    setOcupado(false);
    if (error) { setMsg({ tipo: 'erro', texto: mensagemErro(error) }); return; }
    setExtra(false); setNovo({ data: '', titulo: '' });
    setMsg({ tipo: 'ok', texto: 'Culto extra criado.' });
    carregar();
  };

  if (!cultos) return <Carregando tela />;

  const Cartao = ({ c, destaque = false }) => {
    const k = contagens[c.id];
    return (
      <div className={`flex flex-col gap-3 rounded-2xl p-5 ${destaque ? 'shadow-[0_12px_36px_rgb(var(--secondary-rgb)/0.25)]' : 'cartao'}`}
        style={destaque ? { background: 'var(--gradient)' } : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            {destaque && <span className="text-xs font-bold uppercase tracking-wider text-[#EAF4FF]">Próximo culto</span>}
            <span className={`font-extrabold ${destaque ? 'text-3xl' : 'text-xl'}`}>{dataCulto(c.data)}</span>
            <span className={`text-sm ${destaque ? 'text-[#EAF4FF]' : 'text-muted'}`}>{c.titulo}{c.extra ? ' · extra' : ''}</span>
          </div>
          {destaque ? <span className="badge bg-bg/30 text-texto">{STATUS_CULTO[c.status].rotulo}</span> : <Badge status={c.status} />}
        </div>
        {c.status === 'fechado' && k && (
          <span className="text-sm text-[#D6DDEA]">
            <strong className="text-success">{k.presente}</strong> presentes · <strong className="text-[#FF8A8E]">{k.falta}</strong> faltas · {k.justificada} justificadas
          </span>
        )}
        {c.status === 'cancelado' && c.observacao && <span className="text-sm text-muted">{c.observacao}</span>}
        <div className="flex flex-wrap gap-2">
          {(c.status === 'agendado' || c.status === 'aberto') && (
            <button type="button" onClick={() => fazerChamada(c)}
              className={destaque ? 'btn min-h-[48px] bg-bg/90 text-texto hover:bg-bg' : 'btn-primario min-h-[44px] text-[13px]'}>
              <Icone nome="validar" /> {c.status === 'aberto' ? 'Continuar chamada' : 'Fazer chamada'}
            </button>
          )}
          {c.status === 'fechado' && (
            <Link to={`${base}/${c.id}`} className="btn-secundario min-h-[44px] text-[13px] no-underline">Ver resumo e corrigir</Link>
          )}
          {(c.status === 'agendado' || c.status === 'aberto') && (
            <button type="button" onClick={() => setCancelar(c)}
              className={`btn-texto text-[13px] ${destaque ? 'text-texto' : 'text-muted'}`}>Cancelar culto</button>
          )}
          {c.status === 'cancelado' && <button type="button" className="btn-texto text-[13px]" onClick={() => reativar(c)}>Reativar</button>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Titulo inicio="Cha" destaque="mada" className="text-4xl" />
        {admin && <div className="flex flex-wrap gap-2">
          <Link to="/admin/frequencia" className="btn-secundario min-h-[44px] text-[13px] no-underline"><Icone nome="painel" tamanho={16} /> Relatórios</Link>
          <button type="button" className="btn-secundario min-h-[44px] text-[13px]" onClick={() => setExtra(true)}><Icone nome="mais" tamanho={16} /> Novo culto extra</button>
        </div>}
      </header>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      {proximo && <div className="max-w-xl"><Cartao c={proximo} destaque /></div>}

      {anteriores.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="t-ant">
          <h2 id="t-ant" className="m-0 text-lg">Anteriores</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {anteriores.map((c) => <Cartao key={c.id} c={c} />)}
          </div>
        </section>
      )}
      {futuros.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="t-fut">
          <h2 id="t-fut" className="m-0 text-lg">Próximos sábados</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {futuros.map((c) => <Cartao key={c.id} c={c} />)}
          </div>
        </section>
      )}

      <Modal titulo={cancelar ? `Cancelar o culto de ${dataCulto(cancelar.data)}?` : ''} aberto={Boolean(cancelar)} aoFechar={() => setCancelar(null)}>
        <p className="m-0 text-sm text-muted">Um culto cancelado não entra na frequência nem quebra a sequência de faltas de ninguém.</p>
        <Campo id="obs-cancelar" rotulo="Motivo ou observação (opcional)">
          <input id="obs-cancelar" className="campo" placeholder="Ex.: Retiro, evento fora" value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className="btn-secundario" onClick={() => setCancelar(null)}>Voltar</button>
          <button type="button" className="btn-perigo" disabled={ocupado} onClick={confirmarCancelar}>Cancelar culto</button>
        </div>
      </Modal>

      <Modal titulo="Novo culto extra" aberto={extra} aoFechar={() => setExtra(false)}>
        <Campo id="extra-data" rotulo="Data">
          <input id="extra-data" type="date" className="campo" value={novo.data} onChange={(e) => setNovo((n) => ({ ...n, data: e.target.value }))} />
        </Campo>
        <Campo id="extra-titulo" rotulo="Título">
          <input id="extra-titulo" className="campo" placeholder="Culto de Jovens" value={novo.titulo} onChange={(e) => setNovo((n) => ({ ...n, titulo: e.target.value }))} />
        </Campo>
        <button type="button" className="btn-primario" disabled={ocupado} onClick={criarExtra}>Criar culto</button>
      </Modal>
    </div>
  );
}
