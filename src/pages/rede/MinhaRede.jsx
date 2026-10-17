import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { BadgeSequencia } from '../../components/Frequencia';
import { Link } from 'react-router-dom';
import { useMinhaRede } from './LayoutRede';
import { aniversariantes, linkWhatsApp, mensagemAniversario, chamarDe } from '../../lib/rede';
import { isoParaData } from '../../lib/formato';
import { Titulo, Carregando, Campo } from '../../components/Visual';
import { BadgePapel, Modal } from '../../components/Rede';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ddmm = (iso) => isoParaData(iso).slice(0, 5);

function BotaoWhats({ pessoa, texto, rotulo }) {
  const wa = linkWhatsApp(pessoa.telefone, texto);
  if (!wa) return null;
  return (
    <a href={wa} target="_blank" rel="noreferrer" aria-label={rotulo ?? `WhatsApp de ${pessoa.nome}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-success/40 text-success hover:bg-success/10">
      <Icone nome="whatsapp" />
    </a>
  );
}

function CardPessoa({ p, seq = 0, pendente = false }) {
  return (
    <div className="cartao flex min-w-0 items-center gap-3 p-3">
      <Link to={`/minha-rede/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-texto no-underline">
        <Avatar caminho={p.foto_url} nome={p.nome} tamanho={48} />
        <span className="flex min-w-0 flex-col">
<span className="flex min-w-0 flex-col leading-tight"><span className="truncate text-[15px] font-bold">{p.apelido || p.nome}</span>{p.apelido && <span className="truncate text-xs font-semibold text-muted">{p.nome}</span>}</span>
          <span className="text-xs text-muted">
            {p.idade !== null && p.idade >= 0 ? `${p.idade} anos` : 'Idade a confirmar'}
            {p.data_nascimento && ` · aniversário ${ddmm(p.data_nascimento)}`}
          </span>
          {(seq >= 2 || pendente) && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {pendente && <span className="badge bg-danger/15 text-[#FF8A8E]">Faltou: aviso pendente</span>}
              <BadgeSequencia n={seq} />
            </span>
          )}
        </span>
      </Link>
      <BotaoWhats pessoa={p} />
    </div>
  );
}

export default function MinhaRede() {
  const { rede, pendentes, freq } = useMinhaRede();
  const [cuidado, setCuidado] = useState(null);
  const [busca, setBusca] = useState('');
  const [parabens, setParabens] = useState(null);
  const [texto, setTexto] = useState('');

  const dados = useMemo(() => {
    if (!rede) return null;
    const eu = rede.find((p) => p.nivel === 0);
    const outros = rede.filter((p) => p.nivel > 0);
    return { eu, outros, niveis1: outros.filter((p) => p.nivel === 1), niveis2: outros.filter((p) => p.nivel === 2) };
  }, [rede]);

  const ehLider = dados?.eu?.papel === 'lideranca';
  useEffect(() => {
    if (ehLider) supabase.rpc('cuidado_da_rede').then(({ data }) => setCuidado(data ?? []));
  }, [ehLider]);

  if (!dados) return <Carregando tela />;
  const { eu, outros, niveis2 } = dados;
  if (!eu) return <Carregando tela />;
  const lider = eu.papel === 'lideranca';
  const comAviso = new Set((pendentes ?? []).map((a) => a.jovem_id));
  const seqDe = (id) => freq?.[id]?.sequencia ?? 0;
  const primeiroPendentes = (a, b) => (comAviso.has(b.id) - comAviso.has(a.id)) || (seqDe(b.id) - seqDe(a.id)) || a.nome.localeCompare(b.nome, 'pt-BR');
  const niveis1 = [...dados.niveis1].sort(primeiroPendentes);
  const faltasPend = (pendentes ?? []).filter((a) => a.tipo === 'falta');
  const ultimaData = faltasPend.map((a) => a.cultos?.data).filter(Boolean).sort().at(-1);
  const faltaramUltimo = new Set(faltasPend.filter((a) => a.cultos?.data === ultimaData).map((a) => a.jovem_id)).size;
  const t = semAcento(busca.trim());
  const casa = (p) => !t || semAcento(p.nome).includes(t) || semAcento(p.apelido).includes(t);
  const anivs = aniversariantes(outros, 30);

  const abrirParabens = (p) => { setParabens(p); setTexto(mensagemAniversario(p)); };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Titulo inicio={lider ? 'Minha ' : 'Meus '} destaque={lider ? 'rede' : 'discípulos'} className="text-[34px]" />
        <div className="flex items-center gap-3">
          <div className="rounded-full p-[2px]" style={{ background: 'var(--gradient)' }}>
            <Avatar caminho={eu.foto_url} nome={eu.nome} tamanho={46} borda={false} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-[15px] font-extrabold">{eu.nome}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <BadgePapel papel={eu.papel} cargo={eu.cargo_lideranca} />
              {!lider && (eu.discipulador_nome ? <>Liderança: <strong className="text-texto">{eu.discipulador_nome}</strong></> : 'Sem liderança definida')}
              {lider && `${niveis1.length} discipuladores · ${niveis2.length} jovens`}
            </span>
          </div>
        </div>
      </header>

      {(pendentes ?? []).length > 0 && (
        <Link to="/minha-rede/avisos" className="flex items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3.5 text-texto no-underline hover:bg-danger/15">
          <Icone nome="sino" tamanho={22} className="shrink-0 text-[#FF8A8E]" />
          <span className="flex-1 text-[15px] leading-snug">
            {faltaramUltimo > 0
              ? <><strong>{faltaramUltimo} {lider ? (faltaramUltimo === 1 ? 'pessoa faltou' : 'pessoas faltaram') : (faltaramUltimo === 1 ? 'discípulo faltou' : 'discípulos faltaram')}</strong> no culto de sábado{ultimaData ? `, ${ddmm(ultimaData)}` : ''}.</>
              : <><strong>{pendentes.length} aviso{pendentes.length > 1 ? 's' : ''}</strong> esperando seu contato.</>}
          </span>
          <span className="shrink-0 text-[13px] font-bold text-secondary">Ver avisos</span>
        </Link>
      )}

      {lider && cuidado && cuidado.length > 0 && (
        <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="t-cuidado">
          <h2 id="t-cuidado" className="m-0 text-lg">Cuidado da rede</h2>
          <p className="m-0 text-[13px] text-muted">Avisos de falta dos últimos 90 dias: quantos cada discipulador recebeu e quantos já respondeu.</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {cuidado.map((c) => {
              const pct = c.avisos ? Math.round((c.respondidos / c.avisos) * 100) : null;
              return (
                <li key={c.discipulador_id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <Link to={`/minha-rede/${c.discipulador_id}`} className="truncate font-semibold text-texto">{c.nome}</Link>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {c.respondidos}/{c.avisos} respondidos{c.pendentes_3_dias ? <strong className="text-warning"> · {c.pendentes_3_dias} há 3+ dias</strong> : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06]" aria-hidden="true">
                    <div className="h-2 rounded-full" style={{ width: `${pct ?? 0}%`, background: 'var(--secondary)' }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="cartao flex flex-col gap-3 p-5" aria-labelledby="t-aniv">
        <h2 id="t-aniv" className="m-0 flex items-center gap-2 text-lg"><Icone nome="bolo" className="text-secondary" /> Aniversariantes</h2>
        {anivs.length === 0 && <span className="text-sm text-muted">Ninguém faz aniversário nos próximos 30 dias.</span>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {anivs.map((p) => {
            const hoje = p.aniv.dias === 0;
            return (
              <li key={p.id} className={`flex items-center gap-3 rounded-xl p-2.5 ${hoje ? 'shadow-[0_8px_24px_rgb(var(--secondary-rgb)/0.25)]' : 'bg-white/[0.03]'}`}
                style={hoje ? { background: 'var(--gradient)' } : undefined}>
                <Avatar caminho={p.foto_url} nome={p.nome} tamanho={40} />
                <Link to={`/minha-rede/${p.id}`} className="flex min-w-0 flex-1 flex-col text-texto no-underline">
<span className="flex min-w-0 flex-col leading-tight"><span className="truncate text-sm font-bold">{p.apelido || p.nome}</span>{p.apelido && <span className="truncate text-xs font-semibold text-muted">{p.nome}</span>}</span>
                  <span className={`text-xs ${hoje ? 'font-bold text-texto' : 'text-muted'}`}>
                    {hoje ? `Hoje! Faz ${p.aniv.data.getFullYear() - Number(p.data_nascimento.slice(0, 4))} anos` : `${ddmm(p.data_nascimento)} · em ${p.aniv.dias} dia${p.aniv.dias > 1 ? 's' : ''}`}
                  </span>
                </Link>
                {p.telefone && (
                  <button type="button" onClick={() => abrirParabens(p)}
                    className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold ${hoje ? 'bg-bg/30 text-texto hover:bg-bg/40' : 'border border-success/40 text-success hover:bg-success/10'}`}>
                    <Icone nome="whatsapp" tamanho={15} /> Parabenizar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="relative">
        <label htmlFor="busca-disc" className="sr-only">Buscar por nome</label>
        <Icone nome="busca" className="absolute left-3.5 top-4 text-muted" />
        <input id="busca-disc" type="search" className="campo h-12 pl-11" placeholder="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {outros.length === 0 ? (
        <div className="cartao flex flex-col items-center gap-3 p-8 text-center">
          <Icone nome="pessoas" tamanho={34} className="text-secondary" />
          <p className="m-0 text-[15px] font-bold">{lider ? 'Nenhum discipulador ligado a você ainda.' : 'A liderança ainda não vinculou discípulos a você.'}</p>
          <p className="m-0 text-sm text-muted">Assim que isso acontecer, eles aparecem aqui.</p>
        </div>
      ) : lider ? (
        <div className="flex flex-col gap-5">
          {niveis1.filter((d) => casa(d) || niveis2.some((j) => j.discipulado_por === d.id && casa(j))).map((d) => {
            const seus = niveis2.filter((j) => j.discipulado_por === d.id);
            return (
              <section key={d.id} className="flex flex-col gap-2.5" aria-label={`Discípulos de ${d.nome}`}>
                <Link to={`/minha-rede/${d.id}`} className="flex items-center gap-3 text-texto no-underline">
                  <Avatar caminho={d.foto_url} nome={d.nome} tamanho={40} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-base font-extrabold">{d.nome}</span>
                    <span className="text-xs text-muted">Discipulador · {seus.length} discípulo{seus.length === 1 ? '' : 's'}</span>
                  </span>
                  <Icone nome="direita" className="ml-auto text-muted" />
                </Link>
                <div className="grid grid-cols-1 gap-2 border-l-2 border-secondary/25 pl-3 sm:grid-cols-2">
                  {seus.filter(casa).sort(primeiroPendentes).map((p) => <CardPessoa key={p.id} p={p} seq={seqDe(p.id)} pendente={comAviso.has(p.id)} />)}
                  {seus.length === 0 && <span className="text-xs text-muted">Sem discípulos ainda.</span>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section aria-label="Discípulos" className="flex flex-col gap-2.5">
          <h2 className="m-0 text-sm font-extrabold text-muted">{niveis1.length} discípulo{niveis1.length === 1 ? '' : 's'}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {niveis1.filter(casa).map((p) => <CardPessoa key={p.id} p={p} seq={seqDe(p.id)} pendente={comAviso.has(p.id)} />)}
          </div>
        </section>
      )}

      <Modal titulo={parabens ? `Parabenizar ${chamarDe(parabens)}` : ''} aberto={Boolean(parabens)} aoFechar={() => setParabens(null)}>
        {parabens && (
          <>
            <Campo id="msg-parabens" rotulo="Mensagem (pode editar)">
              <textarea id="msg-parabens" className="campo h-32 resize-y py-3 text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            <a href={linkWhatsApp(parabens.telefone, texto)} target="_blank" rel="noreferrer" onClick={() => setParabens(null)}
              className="btn-primario no-underline"><Icone nome="whatsapp" /> Abrir no WhatsApp</a>
          </>
        )}
      </Modal>
    </div>
  );
}
