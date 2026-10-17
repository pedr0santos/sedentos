import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMinhaRede } from './LayoutRede';
import { ddmm, mensagemFalta, mensagemFaltaResponsavel } from '../../lib/chamada';
import { linkWhatsApp, primeiroNome, chamarDe } from '../../lib/rede';
import { IDADE_RESPONSAVEL } from '../../lib/formato';
import { formatarTelefone, formatarDataHora } from '../../lib/formato';
import { ativarPush, pushSuportado, pushEstado } from '../../lib/push';
import { demo } from '../../lib/supabase';
import { Titulo, Carregando, Aviso, Campo } from '../../components/Visual';
import { Modal } from '../../components/Rede';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

function BotaoPush() {
  const [estado, setEstado] = useState(pushEstado());
  const [msg, setMsg] = useState('');
  if (estado === 'granted' && !msg) return <span className="flex items-center gap-1.5 text-xs text-success"><Icone nome="check" tamanho={14} largura={3} /> Notificações ativadas neste aparelho</span>;
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" className="btn-secundario min-h-[42px] self-start text-[13px]"
        onClick={async () => {
          if (demo) { setMsg('Na demonstração as notificações push são simuladas. No sistema publicado, este botão pede a permissão do celular.'); return; }
          try { await ativarPush(); setEstado('granted'); setMsg('Pronto! Você vai receber um aviso no celular quando um discípulo faltar.'); }
          catch (e) { setMsg(e.message); }
        }}>
        <Icone nome="sino" tamanho={16} /> Ativar notificações no celular
      </button>
      {!pushSuportado() && !demo && !msg && <span className="text-xs text-muted">Neste navegador as notificações push não estão disponíveis.</span>}
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}

export default function Avisos() {
  const { avisos, rede, marcarAviso } = useMinhaRede();
  const navegar = useNavigate();
  const [aba, setAba] = useState('pendentes');
  const [mensagem, setMensagem] = useState(null);
  const [texto, setTexto] = useState('');
  const [paraResponsavel, setParaResponsavel] = useState(false);

  // Abrir a lista marca os avisos como lidos (mas continuam pendentes até o contato).
  useEffect(() => {
    (avisos ?? []).filter((a) => !a.lida_em).forEach((a) => marcarAviso(a.id, { lida_em: true }));
  }, [avisos?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!avisos || !rede) return <Carregando tela />;
  const pessoa = (id) => rede.find((p) => p.id === id);
  const lista = avisos.filter((a) => (aba === 'pendentes' ? !a.contato_feito_em : a.contato_feito_em));

  const abrirMensagem = (a, resp) => {
    const p = pessoa(a.jovem_id);
    const usarResp = resp ?? Boolean(p && !p.telefone && p.responsavel_telefone);
    setParaResponsavel(usarResp);
    setTexto(p ? (usarResp ? mensagemFaltaResponsavel(p) : mensagemFalta(p)) : '');
    setMensagem(a);
  };
  const trocarDestino = (v) => { setParaResponsavel(v); setTexto(v ? mensagemFaltaResponsavel(p) : mensagemFalta(p)); };
  const menor14 = (pp) => pp?.idade !== null && pp?.idade !== undefined && pp.idade < IDADE_RESPONSAVEL;

  const p = mensagem ? pessoa(mensagem.jovem_id) : null;
  const telefone = p ? (paraResponsavel ? p.responsavel_telefone : p.telefone) : null;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/minha-rede" className="btn-texto self-start px-0">← Voltar</Link>
      <Titulo inicio="Avi" destaque="sos" className="text-[34px]" />
      <BotaoPush />

      <div role="tablist" aria-label="Avisos" className="flex gap-1 rounded-xl bg-dark/60 p-1">
        {[['pendentes', `Pendentes (${avisos.filter((a) => !a.contato_feito_em).length})`], ['resolvidos', 'Resolvidos']].map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`min-h-[42px] flex-1 rounded-lg text-[13px] font-bold ${aba === k ? 'text-texto' : 'text-muted'}`}
            style={aba === k ? { background: 'var(--gradient)' } : undefined}>{r}</button>
        ))}
      </div>

      {lista.length === 0 && (
        <div className="cartao p-8 text-center text-sm text-muted">
          {aba === 'pendentes' ? 'Nenhum aviso pendente. Que bom!' : 'Nenhum aviso resolvido ainda.'}
        </div>
      )}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {lista.map((a) => {
          const pp = pessoa(a.jovem_id);
          const seq = Number(a.dados?.sequencia ?? 0);
          const nome = pp ? chamarDe(pp) : '';
          const data = a.cultos?.data ? ddmm(a.cultos.data) : '';
          return (
            <li key={a.id} className={`cartao flex flex-col gap-3 p-4 ${!a.lida_em ? 'border-secondary/40' : ''}`}>
              <div className="flex items-start gap-3">
                <Avatar caminho={pp?.foto_url} nome={pp?.nome ?? '?'} tamanho={48} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15px] leading-snug">
                    <Icone nome="sino" tamanho={15} className="mr-1 inline text-secondary" />
                    {a.tipo === 'faltas_seguidas'
                      ? <><strong>{nome || 'Um jovem'} faltou {seq} cultos seguidos</strong> (último: {data}).</>
                      : <><strong>{nome || 'Alguém'} faltou</strong> ao {a.cultos?.titulo ?? 'culto'} de sábado, {data}.</>}
                  </span>
                  {a.tipo === 'falta' && seq >= 2 && <span className="text-[13px] font-bold italic text-[#FF8A8E]">{seq}ª falta seguida</span>}
                  {a.tipo === 'faltas_seguidas' && pp?.discipulador_nome && <span className="text-xs text-muted">Discipulador: {pp.discipulador_nome}</span>}
                  <span className="text-xs text-muted">
                    {a.contato_feito_em ? `Contato feito em ${formatarDataHora(a.contato_feito_em)}` : `Aviso de ${formatarDataHora(a.criado_em)}`}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {pp && menor14(pp) ? (
                  <>
                    {pp.telefone && (
                      <button type="button" className="btn-primario min-h-[42px] text-[13px]" onClick={() => abrirMensagem(a, false)}>
                        <Icone nome="whatsapp" tamanho={16} /> WhatsApp do jovem
                      </button>
                    )}
                    {pp.responsavel_telefone && (
                      <button type="button" className="btn-primario min-h-[42px] text-[13px]" onClick={() => abrirMensagem(a, true)}>
                        <Icone nome="whatsapp" tamanho={16} /> WhatsApp do responsável
                      </button>
                    )}
                  </>
                ) : pp && (pp.telefone || pp.responsavel_telefone) && (
                  <button type="button" className="btn-primario min-h-[42px] text-[13px]" onClick={() => abrirMensagem(a)}>
                    <Icone nome="whatsapp" tamanho={16} /> Mandar mensagem
                  </button>
                )}
                {!a.contato_feito_em && (
                  <button type="button" className="btn-secundario min-h-[42px] text-[13px]" onClick={() => marcarAviso(a.id, { contato_feito_em: true, lida_em: true })}>
                    <Icone nome="check" tamanho={16} /> Já falei com {nome ? nome : 'a pessoa'}
                  </button>
                )}
                {pp && (
                  <button type="button" className="btn-texto min-h-[42px] text-[13px]"
                    onClick={() => navegar(`/minha-rede/${a.jovem_id}`, { state: { retorno: `Sobre a falta de ${data}: ` } })}>
                    <Icone nome="lapis" tamanho={15} /> Registrar retorno
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Modal titulo={p ? `Mensagem para ${paraResponsavel ? primeiroNome(p.responsavel_nome) || 'o responsável' : chamarDe(p)}` : ''} aberto={Boolean(mensagem)} aoFechar={() => setMensagem(null)}>
        {p && (
          <>
            {p.responsavel_telefone && (
              <div role="radiogroup" aria-label="Para quem" className="grid grid-cols-2 gap-1 rounded-xl bg-dark/60 p-1">
                {[[false, p.telefone ? chamarDe(p) : 'Sem telefone'], [true, `Responsável${p.responsavel_nome ? ` (${primeiroNome(p.responsavel_nome)})` : ''}`]].map(([v, r]) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={paraResponsavel === v} disabled={!v && !p.telefone}
                    onClick={() => trocarDestino(v)}
                    className={`min-h-[42px] rounded-lg px-2 text-[13px] font-bold disabled:opacity-40 ${paraResponsavel === v ? 'text-texto' : 'text-muted'}`}
                    style={paraResponsavel === v ? { background: 'var(--gradient)' } : undefined}>{r}</button>
                ))}
              </div>
            )}
            <Campo id="msg-falta" rotulo={`Mensagem para ${formatarTelefone(telefone)} (pode editar)`}>
              <textarea id="msg-falta" className="campo h-32 resize-y py-3 text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            {telefone ? (
              <a href={linkWhatsApp(telefone, texto)} target="_blank" rel="noreferrer" className="btn-primario no-underline"
                onClick={() => { marcarAviso(mensagem.id, { contato_feito_em: true, lida_em: true }); setMensagem(null); }}>
                <Icone nome="whatsapp" /> Abrir no WhatsApp
              </a>
            ) : <Aviso tipo="alerta">Sem telefone cadastrado. Avise a liderança.</Aviso>}
          </>
        )}
      </Modal>
    </div>
  );
}
