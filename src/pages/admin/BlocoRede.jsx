import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { PAPEIS, LISTA_PAPEIS, papelAcima } from '../../lib/rede';
import { Aviso, Campo } from '../../components/Visual';
import { BadgePapel, SeletorPessoa, Modal, AvisoAcesso } from '../../components/Rede';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

/** Modal "Transferir os X discípulos para…" (também usado na página da Rede). */
export function ModalTransferir({ de, jovens, aberto, aoFechar, aoConcluir }) {
  const [para, setPara] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ligados = de ? jovens.filter((j) => j.discipulado_por === de.id) : [];
  const candidatos = de ? jovens.filter((j) => j.papel === de.papel && j.id !== de.id) : [];
  const nomeLigados = de?.papel === 'lideranca' ? 'discipuladores' : 'discípulos';
  const contar = (p) => `${jovens.filter((j) => j.discipulado_por === p.id).length}`;

  const transferir = async () => {
    setErro(''); setOcupado(true);
    const { error } = await supabase.rpc('transferir_discipulos', { p_de: de.id, p_para: para });
    setOcupado(false);
    if (error) { setErro(mensagemErro(error)); return; }
    setPara(null);
    aoConcluir();
  };

  return (
    <Modal titulo={`Transferir os ${ligados.length} ${nomeLigados} de ${de?.nome ?? ''}`} aberto={aberto} aoFechar={aoFechar}>
      <p className="m-0 text-sm leading-relaxed text-muted">
        Escolha {de?.papel === 'lideranca' ? 'outra pessoa da Liderança' : 'outro discipulador'} para receber. Depois disso você pode mudar o papel.
      </p>
      <SeletorPessoa id="transferir-para" pessoas={candidatos} valor={para} onEscolher={setPara}
        vazio="Escolher quem recebe" permitirVazio={false} contagem={contar} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className="btn-secundario" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn-primario" disabled={!para || ocupado} onClick={transferir}>
          <Icone nome="transferir" /> {ocupado ? 'Transferindo…' : 'Transferir'}
        </button>
      </div>
    </Modal>
  );
}

export default function BlocoRede({ jovem, jovens, salvar, recarregar }) {
  const [papel, setPapel] = useState(jovem.papel);
  const [cargo, setCargo] = useState(jovem.cargo_lideranca ?? '');
  const [acima, setAcima] = useState(jovem.discipulado_por);
  const [msg, setMsg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [transferir, setTransferir] = useState(false);
  const [novoDiscipulo, setNovoDiscipulo] = useState(null);

  useEffect(() => {
    setPapel(jovem.papel); setCargo(jovem.cargo_lideranca ?? ''); setAcima(jovem.discipulado_por);
  }, [jovem.id, jovem.papel, jovem.cargo_lideranca, jovem.discipulado_por]);
  useEffect(() => { setMsg(null); }, [jovem.id]);

  const porId = useMemo(() => new Map(jovens.map((j) => [j.id, j])), [jovens]);
  const ligados = jovens.filter((j) => j.discipulado_por === jovem.id).sort((a, b) => a.nome.localeCompare(b.nome));
  const papelDoVinculo = papelAcima(papel);
  // Ao trocar o papel, o vínculo antigo só continua se ainda for válido.
  const acimaValido = acima && porId.get(acima)?.papel === papelDoVinculo ? acima : null;
  const candidatosAcima = papelDoVinculo ? jovens.filter((j) => j.papel === papelDoVinculo && j.id !== jovem.id) : [];
  const contar = (p) => `${jovens.filter((j) => j.discipulado_por === p.id).length}`;
  const mudou = papel !== jovem.papel || (papel === 'lideranca' && cargo.trim() !== (jovem.cargo_lideranca ?? '')) || acimaValido !== jovem.discipulado_por;

  const gravar = async () => {
    setMsg(null); setSalvando(true);
    try {
      await salvar(jovem.id, { papel, cargo_lideranca: papel === 'lideranca' ? cargo.trim() || null : null, discipulado_por: acimaValido });
      setMsg({ tipo: 'ok', texto: 'Rede atualizada.' });
    } catch (e) {
      if (/Transfira antes/i.test(e.message)) setTransferir(true);
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setSalvando(false);
    }
  };

  const adicionar = async (id) => {
    setNovoDiscipulo(null);
    const { data, error } = await supabase.rpc('rede_atribuir', { p_ids: [id], p_discipulado_por: jovem.id });
    if (error || data?.length) setMsg({ tipo: 'erro', texto: error ? mensagemErro(error) : data[0].erro });
    await recarregar();
  };

  const remover = async (id) => {
    try { await salvar(id, { discipulado_por: null }); } catch (e) { setMsg({ tipo: 'erro', texto: e.message }); }
  };

  return (
    <section className="cartao flex flex-col gap-4 p-6" aria-labelledby="t-rede">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="t-rede" className="m-0 text-base">Rede de discipulado</h2>
        <BadgePapel papel={jovem.papel} cargo={jovem.cargo_lideranca} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <Campo id="rede-papel" rotulo="Papel na rede">
          <div role="radiogroup" aria-label="Papel na rede" className="grid grid-cols-3 gap-1 rounded-xl bg-dark/60 p-1">
            {LISTA_PAPEIS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={papel === p} onClick={() => setPapel(p)}
                className={`min-h-[42px] rounded-lg px-2 text-[13px] font-bold ${papel === p ? 'text-texto' : 'text-muted hover:text-texto'}`}
                style={papel === p ? { background: 'var(--gradient)' } : undefined}>
                {PAPEIS[p].rotulo}
              </button>
            ))}
          </div>
        </Campo>
        {papel === 'lideranca' ? (
          <Campo id="rede-cargo" rotulo="Cargo/função (opcional)">
            <input id="rede-cargo" className="campo h-12 text-sm" placeholder="Ex.: Líder de jovens" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </Campo>
        ) : (
          <Campo id="rede-acima" rotulo={papel === 'jovem' ? 'Discipulado por (discipulador)' : 'Discipulado por (liderança)'}>
            <SeletorPessoa id="rede-acima" pessoas={candidatosAcima} valor={acimaValido} onEscolher={setAcima}
              vazio={papel === 'jovem' ? 'Sem discipulador' : 'Sem liderança'} contagem={contar} />
          </Campo>
        )}
      </div>

      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      {mudou && (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="btn-primario" disabled={salvando} onClick={gravar}>{salvando ? 'Salvando…' : 'Salvar rede'}</button>
          <button type="button" className="btn-secundario" onClick={() => { setPapel(jovem.papel); setCargo(jovem.cargo_lideranca ?? ''); setAcima(jovem.discipulado_por); setMsg(null); }}>Desfazer</button>
        </div>
      )}

      <AvisoAcesso pessoa={jovem} />

      {jovem.papel !== 'jovem' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-sm font-extrabold">
              {jovem.papel === 'discipulador' ? `Discípulos (${ligados.length})` : `Discipuladores (${ligados.length})`}
            </h3>
            {ligados.length > 0 && (
              <button type="button" className="btn-texto min-h-[36px] px-0 text-[13px]" onClick={() => setTransferir(true)}>
                <Icone nome="transferir" tamanho={15} /> Transferir todos
              </button>
            )}
          </div>
          {ligados.length === 0 && <span className="text-sm text-muted">Ninguém ligado ainda.</span>}
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {ligados.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-white/[0.03]">
                <Avatar caminho={p.foto_url} nome={p.nome} tamanho={34} />
                <Link to={`/admin/jovens/${p.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-texto">{p.nome}</Link>
                {jovem.papel === 'lideranca' && <span className="text-xs text-muted">{jovens.filter((j) => j.discipulado_por === p.id).length} discípulos</span>}
                {jovem.papel === 'discipulador' && (
                  <button type="button" className="btn-texto min-h-[36px] px-1 text-xs text-muted" onClick={() => remover(p.id)}>Remover</button>
                )}
              </li>
            ))}
          </ul>
          {jovem.papel === 'discipulador' && (
            <Campo id="add-discipulo" rotulo="Adicionar discípulo">
              <SeletorPessoa id="add-discipulo" vazio="Buscar entre os jovens…" permitirVazio={false}
                pessoas={jovens.filter((j) => j.papel === 'jovem' && j.discipulado_por !== jovem.id)}
                valor={novoDiscipulo} onEscolher={adicionar}
                contagem={(p) => (p.discipulado_por ? `com ${porId.get(p.discipulado_por)?.nome.split(' ')[0] ?? 'outro'}` : 'sem discipulador')} />
            </Campo>
          )}
        </div>
      )}

      <ModalTransferir de={jovem} jovens={jovens} aberto={transferir} aoFechar={() => setTransferir(false)}
        aoConcluir={async () => { setTransferir(false); setMsg({ tipo: 'ok', texto: 'Transferência feita. Agora você pode mudar o papel.' }); await recarregar(); }} />
    </section>
  );
}
