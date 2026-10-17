import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useJovens } from '../../hooks/useJovens';
import { idade, formatarDataHora, SEXOS } from '../../lib/formato';
import { ORIGEM, ROTULO_CAMPO, ACAO_HISTORICO, STATUS } from '../../lib/inconsistencias';
import { Titulo, StatusBadge, Carregando, Aviso } from '../../components/Visual';
import { CamposAdmin, BlocoInconsistencias, FotoAdmin, valoresDoJovem, valoresParaBanco } from '../../components/AdminJovem';
import { linkWhatsApp } from '../../lib/formato';
import Icone from '../../components/Icone';
import BlocoRede from './BlocoRede';
import Frequencia from '../../components/Frequencia';
import { Anotacoes } from '../../components/Rede';
import { useAuth } from '../../hooks/useAuth';
import { PAPEIS } from '../../lib/rede';

const mostrarValor = (campo, v) => {
  if (v === null || v === undefined || v === '') return '(vazio)';
  if (campo === 'status') return STATUS[v]?.rotulo ?? v;
  if (campo === 'foto_url') return 'nova foto';
  if (campo === 'papel') return PAPEIS[v]?.rotulo ?? v;
  if (campo === 'ativo') return v ? 'ativo' : 'inativo';
  if (campo === 'sexo') return SEXOS[v] ?? v;
  return String(v);
};

export default function Ficha() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { jovens, carregando, salvar, recarregar } = useJovens();
  const { email } = useAuth();
  const jovem = jovens.find((j) => j.id === id);
  const [valores, setValores] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [msg, setMsg] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (jovem) setValores(valoresDoJovem(jovem)); }, [jovem?.id, jovem?.atualizado_em]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregarHistorico = () =>
    supabase.from('jovens_historico').select('*').eq('jovem_id', id).order('alterado_em', { ascending: false }).limit(50)
      .then(({ data }) => setHistorico(data ?? []));
  useEffect(() => { carregarHistorico(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (carregando) return <Carregando tela />;
  if (!jovem) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="alerta">Cadastro não encontrado. Pode ter sido mesclado com outro.</Aviso>
        <Link to="/admin/jovens">← Voltar para a lista</Link>
      </div>
    );
  }
  if (!valores) return null;

  const gravar = async (extra = {}, texto = 'Alterações salvas.') => {
    setMsg(null); setSalvando(true);
    try {
      await salvar(jovem.id, { ...valoresParaBanco(valores), ...extra });
      setMsg({ tipo: 'ok', texto });
      carregarHistorico();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setSalvando(false);
    }
  };

  const anos = jovem.inconsistencias.includes('NASCIMENTO_INVALIDO') ? null : idade(jovem.data_nascimento);
  const [primeiro, ...resto] = jovem.nome.split(' ');
  const wa = linkWhatsApp(jovem.telefone);

  return (
    <div className="flex flex-col gap-6">
      <button type="button" onClick={() => navegar(-1)} className="btn-texto self-start px-0">← Voltar</button>

      <div className="flex flex-wrap items-start gap-6">
        <section className="cartao flex w-full flex-col gap-4 p-6 sm:max-w-[310px]">
          <FotoAdmin jovem={jovem} onEnviada={(caminho) => gravar({ foto_url: caminho }, 'Foto enviada.')} />
          <div className="h-px bg-white/[0.08]" />
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-muted">Status</dt><dd className="m-0 text-right"><StatusBadge status={jovem.status} /></dd>
            <dt className="text-muted">Origem</dt><dd className="m-0 text-right font-semibold">{ORIGEM[jovem.origem]}</dd>
            <dt className="text-muted">Idade</dt><dd className="m-0 text-right font-semibold">{anos !== null ? `${anos} anos` : 'Inválida'}</dd>
            {jovem.validado_por && <><dt className="text-muted">Validado por</dt><dd className="m-0 truncate text-right font-semibold" title={jovem.validado_por}>{jovem.validado_por}</dd></>}
          </dl>
          {jovem.ativo === false && <Aviso tipo="alerta">Inativo: fica fora da chamada e das estatísticas.</Aviso>}
          <button type="button" className={jovem.ativo === false ? 'btn-secundario min-h-[44px] text-[13px]' : 'btn-texto justify-center text-[13px] text-muted'}
            disabled={salvando} onClick={() => gravar({ ativo: jovem.ativo === false }, jovem.ativo === false ? 'Marcado como ativo.' : 'Marcado como inativo.')}>
            {jovem.ativo === false ? 'Reativar (volta para a chamada)' : 'Marcar como inativo'}
          </button>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="btn-secundario min-h-[44px] border-success/50 text-[13px] no-underline">
              <Icone nome="whatsapp" className="text-success" /> Chamar no WhatsApp
            </a>
          )}
          {jovem.responsavel_telefone && linkWhatsApp(jovem.responsavel_telefone) && (
            <a href={linkWhatsApp(jovem.responsavel_telefone)} target="_blank" rel="noreferrer" className="btn-secundario min-h-[44px] text-[13px] no-underline">
              <Icone nome="whatsapp" className="text-success" /> WhatsApp do responsável
            </a>
          )}
        </section>

        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-6">
          <div className="flex flex-col gap-1">
            <Titulo inicio={`${primeiro} `} destaque={resto.join(' ')} className="text-[32px]" />
            {jovem.apelido && <span className="text-sm text-muted">Chamado(a) de <strong className="text-texto">{jovem.apelido}</strong>{jovem.sexo ? ` · ${SEXOS[jovem.sexo]}` : ''}</span>}
          </div>
          <BlocoInconsistencias codigos={jovem.inconsistencias} />

          <section className="cartao flex flex-col gap-4 p-6">
            <h2 className="m-0 text-base">Dados</h2>
            <CamposAdmin valores={valores} onChange={setValores} inconsistencias={jovem.inconsistencias} />
            {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className="btn-primario" disabled={salvando} onClick={() => gravar({ status: 'validado' }, 'Cadastro validado.')}>
                <Icone nome="check" largura={3} /> Marcar como validado
              </button>
              <button type="button" className="btn-perigo" disabled={salvando} onClick={() => gravar({ status: 'inconsistente' }, 'Marcado como inconsistente.')}>
                Marcar como inconsistente
              </button>
              <button type="button" className="btn-secundario" disabled={salvando} onClick={() => gravar()}>Salvar alterações</button>
            </div>
          </section>

          <BlocoRede jovem={jovem} jovens={jovens} salvar={salvar} recarregar={recarregar} />

          <div className="cartao p-6"><Frequencia jovemId={jovem.id} /></div>

          <div className="cartao p-6">
            <Anotacoes jovemId={jovem.id} email={email} admin />
          </div>

          <section className="cartao flex flex-col gap-3 p-6" aria-labelledby="t-hist">
            <h2 id="t-hist" className="m-0 text-base">Histórico</h2>
            {historico.length === 0 && <span className="text-sm text-muted">Sem registros.</span>}
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {historico.map((h) => (
                <li key={h.id} className="grid gap-1 text-[13px] sm:grid-cols-[140px_1fr] sm:gap-3">
                  <span className="text-muted">{formatarDataHora(h.alterado_em)}</span>
                  <span>
                    <strong>{h.alterado_por}</strong> {ACAO_HISTORICO[h.acao] ?? h.acao}
                    {h.acao === 'edicao' && h.campos && (
                      <ul className="m-0 mt-1 list-none p-0 text-[#D6DDEA]">
                        {Object.entries(h.campos).map(([c, { de, para }]) => (
                          <li key={c}>{ROTULO_CAMPO[c] ?? c}: <span className="text-muted line-through">{mostrarValor(c, de)}</span> → {mostrarValor(c, para)}</li>
                        ))}
                      </ul>
                    )}
                    {h.acao === 'presenca' && h.campos && (
                      <span className="text-[#D6DDEA]"> do culto de {h.campos.culto}: {h.campos.de ?? '—'} → {h.campos.para}{h.campos.motivo ? ` (${h.campos.motivo})` : ''}</span>
                    )}
                    {h.acao === 'mesclagem' && h.campos?.registro_removido && (
                      <span className="text-muted"> (removido: {h.campos.registro_removido.nome})</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
