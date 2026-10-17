import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Frequencia from '../../components/Frequencia';
import { useMinhaRede } from './LayoutRede';
import { useAuth } from '../../hooks/useAuth';
import { formatarTelefone, isoParaData } from '../../lib/formato';
import { linkWhatsApp } from '../../lib/rede';
import { Carregando, Aviso } from '../../components/Visual';
import { BadgePapel, Anotacoes } from '../../components/Rede';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

function Linha({ rotulo, children }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/[0.07] py-3">
      <span className="text-xs font-bold text-muted">{rotulo}</span>
      <span className="text-[15px] font-semibold">{children || <span className="text-muted">Não informado</span>}</span>
    </div>
  );
}

/** Ficha do discípulo para discipulador/liderança: só leitura + anotações. */
export default function FichaRede() {
  const { id } = useParams();
  const { rede } = useMinhaRede();
  const { email } = useAuth();
  const [correcao, setCorrecao] = useState(false);
  const { state } = useLocation();

  if (!rede) return <Carregando tela />;
  const p = rede.find((x) => x.id === id && x.nivel > 0);
  if (!p) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="alerta">Esta pessoa não está mais na sua rede.</Aviso>
        <Link to="/minha-rede">← Voltar</Link>
      </div>
    );
  }
  const wa = linkWhatsApp(p.telefone);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/minha-rede" className="btn-texto self-start px-0">← Voltar</Link>

      <section className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full p-[3px]" style={{ background: 'var(--gradient)' }}>
          <Avatar caminho={p.foto_url} nome={p.nome} tamanho={150} borda={false} />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[26px] leading-tight">{p.apelido || p.nome}</h1>
          {p.apelido && <span className="text-sm font-semibold text-[#D6DDEA]">{p.nome}</span>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          <BadgePapel papel={p.papel} cargo={p.cargo_lideranca} />
          {p.idade !== null && p.idade >= 0 && <span>{p.idade} anos</span>}
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="btn-secundario min-h-[44px] border-success/50 text-[13px] no-underline">
            <Icone nome="whatsapp" className="text-success" /> Chamar no WhatsApp
          </a>
        )}
      </section>

      <section className="cartao px-5 py-2">
        <Linha rotulo="Aniversário">{p.data_nascimento && isoParaData(p.data_nascimento)}</Linha>
        <Linha rotulo="Telefone / WhatsApp">{formatarTelefone(p.telefone)}</Linha>
        {p.nivel === 2 && <Linha rotulo="Discipulado por">{p.discipulador_nome}</Linha>}
        {(p.responsavel_nome || p.responsavel_telefone || (p.idade !== null && p.idade < 14)) && (
          <Linha rotulo="Responsável">
            {(p.responsavel_nome || p.responsavel_telefone) && (
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>{p.responsavel_nome}{p.responsavel_telefone ? ` · ${formatarTelefone(p.responsavel_telefone)}` : ''}</span>
                {linkWhatsApp(p.responsavel_telefone) && (
                  <a href={linkWhatsApp(p.responsavel_telefone)} target="_blank" rel="noreferrer" aria-label="WhatsApp do responsável"
                    className="flex h-10 items-center gap-1.5 rounded-[10px] border border-success/40 px-3 text-[13px] font-bold text-success no-underline hover:bg-success/10">
                    <Icone nome="whatsapp" tamanho={16} /> WhatsApp
                  </a>
                )}
              </span>
            )}
          </Linha>
        )}
        <div className="py-3">
          <button type="button" onClick={() => { setCorrecao(true); setTimeout(() => document.getElementById(`texto-${p.id}`)?.focus(), 50); }}
            className="btn-texto px-0 text-[13px]">
            <Icone nome="alerta" tamanho={15} /> Avisar a liderança sobre dado incorreto
          </button>
          <p className="m-0 text-xs text-muted">Você não edita os dados de cadastro. A liderança recebe o aviso e corrige.</p>
        </div>
      </section>

      <div className="cartao p-5"><Frequencia jovemId={p.id} /></div>

      <div className="cartao p-5">
        <Anotacoes jovemId={p.id} email={email} correcao={correcao} aoMudar={() => setCorrecao(false)} textoInicial={state?.retorno} />
      </div>
    </div>
  );
}
