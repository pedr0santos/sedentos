// Peças da Rede de discipulado usadas no painel e nas áreas do discipulador/liderança.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, mensagemErro } from '../lib/supabase';
import { PAPEIS, TIPOS_ANOTACAO, dentroDoPrazo, mensagemAcesso, linkWhatsApp, copiarTexto } from '../lib/rede';
import { formatarDataHora } from '../lib/formato';
import { Aviso } from './Visual';
import Avatar from './Avatar';
import Icone from './Icone';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Selo do papel: Liderança em gradiente, Discipulador sólido, Jovem com contorno. */
export function BadgePapel({ papel, cargo }) {
  if (papel === 'lideranca') {
    return (
      <span className="badge text-texto" style={{ background: 'var(--gradient)' }} title={cargo || undefined}>
        {cargo || 'Liderança'}
      </span>
    );
  }
  if (papel === 'discipulador') return <span className="badge bg-primary text-texto">Discipulador</span>;
  return <span className="badge border border-secondary/70 text-secondary">Jovem</span>;
}

export function Modal({ titulo, aberto, aoFechar, children, largura = 'max-w-lg' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    ref.current?.focus();
    const esc = (e) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titulo}
        className={`anim-subir flex max-h-[90dvh] w-full ${largura} flex-col gap-4 overflow-y-auto rounded-t-2xl border border-secondary/20 bg-[#141B2B] p-6 outline-none sm:rounded-2xl`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-lg">{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-white/5 hover:text-texto">
            <Icone nome="fechar" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Busca por nome com foto. Só lista as pessoas recebidas (já filtradas pelo papel permitido). */
export function SeletorPessoa({ id, pessoas, valor, onEscolher, vazio = 'Ninguém', permitirVazio = true, contagem }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const atual = pessoas.find((p) => p.id === valor);
  const lista = useMemo(() => {
    const t = semAcento(q.trim());
    return pessoas.filter((p) => !t || semAcento(p.nome).includes(t)).slice(0, 40);
  }, [pessoas, q]);

  return (
    <div className="flex flex-col gap-2">
      <button id={id} type="button" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}
        className="campo flex h-auto min-h-[50px] items-center gap-3 py-2 text-left">
        {atual ? (
          <>
            <Avatar caminho={atual.foto_url} nome={atual.nome} tamanho={32} />
            <span className="min-w-0 flex-1 truncate">{atual.nome}</span>
          </>
        ) : (
          <span className="flex-1 text-muted">{vazio}</span>
        )}
        <Icone nome="baixo" tamanho={14} largura={2.6} className="shrink-0 text-muted" />
      </button>
      {aberto && (
        <div className="anim-subir flex flex-col gap-2 rounded-xl border border-secondary/20 bg-[#141B2B] p-2">
          <label className="sr-only" htmlFor={`${id}-busca`}>Buscar por nome</label>
          <input id={`${id}-busca`} autoFocus className="campo h-11 text-sm" placeholder="Buscar por nome…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="m-0 flex max-h-64 list-none flex-col overflow-y-auto p-0">
            {permitirVazio && valor && (
              <li>
                <button type="button" onClick={() => { onEscolher(null); setAberto(false); }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-muted hover:bg-white/5">
                  <Icone nome="fechar" tamanho={16} /> Remover vínculo
                </button>
              </li>
            )}
            {lista.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { onEscolher(p.id); setAberto(false); setQ(''); }}
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-secondary/10 ${p.id === valor ? 'bg-secondary/10' : ''}`}>
                  <Avatar caminho={p.foto_url} nome={p.nome} tamanho={30} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.nome}</span>
                  {contagem && <span className="text-xs text-muted">{contagem(p)}</span>}
                </button>
              </li>
            ))}
            {lista.length === 0 && <li className="px-2 py-3 text-sm text-muted">Ninguém com esse nome e esse papel.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Alerta + botão de copiar o acesso para quem lidera mas ainda não tem e-mail ou login. */
export function AvisoAcesso({ pessoa }) {
  const [copiado, setCopiado] = useState(false);
  if (!pessoa || pessoa.papel === 'jovem') return null;
  const titulo = PAPEIS[pessoa.papel].rotulo.toLowerCase();
  if (!pessoa.email) {
    return (
      <Aviso tipo="alerta">
        Este {pessoa.papel === 'lideranca' ? 'membro da liderança' : titulo} ainda não tem e-mail vinculado e não consegue acessar a área dele.
        Preencha o e-mail em “Dados” e depois envie o acesso.
      </Aviso>
    );
  }
  const texto = mensagemAcesso(pessoa, pessoa.email);
  const wa = linkWhatsApp(pessoa.telefone, texto);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-secondary/25 bg-secondary/[0.07] px-4 py-3 text-[13px] leading-relaxed">
      <span>
        {pessoa.user_id ? 'Já acessou o sistema.' : 'Ainda não entrou no sistema.'} Ele entra com o e-mail <strong>{pessoa.email}</strong>.
      </span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secundario min-h-[40px] text-[13px]"
          onClick={async () => { if (await copiarTexto(texto)) { setCopiado(true); setTimeout(() => setCopiado(false), 2500); } }}>
          <Icone nome="copias" tamanho={16} /> {copiado ? 'Copiado!' : 'Copiar link de acesso'}
        </button>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="btn-secundario min-h-[40px] border-success/50 text-[13px] no-underline">
            <Icone nome="whatsapp" tamanho={16} className="text-success" /> Enviar no WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

function BadgeTipo({ tipo }) {
  const t = TIPOS_ANOTACAO[tipo] ?? TIPOS_ANOTACAO.acompanhamento;
  return (
    <span className={`badge gap-1.5 ${t.classe}`}>
      <Icone nome={t.icone} tamanho={13} largura={2.4} /> {t.rotulo}
    </span>
  );
}

/**
 * Anotações de discipulado (confidenciais). A regra de quem vê está no banco;
 * aqui só mostramos o que ele devolve.
 */
export function Anotacoes({ jovemId, email, admin = false, podeEscrever = true, correcao = false, aoMudar, textoInicial }) {
  const [lista, setLista] = useState(null);
  const [texto, setTexto] = useState(textoInicial ?? '');
  const [tipo, setTipo] = useState(correcao ? 'correcao_cadastro' : 'acompanhamento');
  useEffect(() => {
    if (!textoInicial) return;
    setTexto(textoInicial); setTipo('acompanhamento');
    setTimeout(() => { const el = document.getElementById(`texto-${jovemId}`); el?.focus(); el?.scrollIntoView({ block: 'center' }); }, 300);
  }, [textoInicial, jovemId]);
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(null);

  const carregar = async () => {
    const { data, error } = await supabase.from('anotacoes_discipulado').select('*')
      .eq('jovem_id', jovemId).order('criado_em', { ascending: false });
    if (error) setErro(mensagemErro(error));
    setLista(data ?? []);
  };
  useEffect(() => { setLista(null); carregar(); }, [jovemId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (correcao) setTipo('correcao_cadastro'); }, [correcao]);

  const salvar = async (e) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) { setErro('Escreva a anotação.'); return; }
    setErro(''); setOcupado(true);
    const q = editando
      ? supabase.from('anotacoes_discipulado').update({ texto: t, tipo }).eq('id', editando)
      : supabase.from('anotacoes_discipulado').insert({ jovem_id: jovemId, texto: t, tipo });
    const { error } = await q;
    setOcupado(false);
    if (error) { setErro(mensagemErro(error)); return; }
    setTexto(''); setEditando(null); setTipo('acompanhamento');
    await carregar();
    aoMudar?.();
  };

  const apagar = async (id) => {
    setConfirmarApagar(null);
    const { error } = await supabase.from('anotacoes_discipulado').delete().eq('id', id);
    if (error) setErro(mensagemErro(error));
    await carregar();
  };

  const meu = (a) => a.autor_email === String(email ?? '').toLowerCase();

  return (
    <section className="flex flex-col gap-3.5" aria-labelledby={`anot-${jovemId}`}>
      <h2 id={`anot-${jovemId}`} className="m-0 text-base">Anotações de discipulado</h2>
      <div className="flex items-start gap-2.5 rounded-xl bg-white/[0.04] px-3.5 py-3 text-[13px] leading-relaxed text-[#D6DDEA]">
        <Icone nome="cadeado" tamanho={16} className="mt-0.5 shrink-0 text-secondary" />
        <span>
          Visível apenas para você e para a liderança. O jovem não tem acesso.
          <span className="text-muted"> Muitos jovens são menores de idade: escreva só o necessário para o cuidado pastoral.</span>
        </span>
      </div>

      {podeEscrever && (
        <form onSubmit={salvar} className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo da anotação">
            {Object.entries(TIPOS_ANOTACAO).filter(([k]) => k !== 'correcao_cadastro' || correcao || tipo === k).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={tipo === k} onClick={() => setTipo(k)}
                className={`chip min-h-[34px] text-xs ${tipo === k ? 'chip-ativo' : ''}`}>
                <Icone nome={t.icone} tamanho={13} /> {t.rotulo}
              </button>
            ))}
          </div>
          <label htmlFor={`texto-${jovemId}`} className="sr-only">Texto da anotação</label>
          <textarea id={`texto-${jovemId}`} className="campo h-28 resize-y py-3 text-sm" maxLength={2000}
            placeholder={correcao ? 'Qual dado está errado e qual seria o certo?' : 'O que você quer registrar?'}
            value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted">{texto.length}/2000</span>
            <div className="flex gap-2">
              {editando && <button type="button" className="btn-secundario min-h-[42px] text-[13px]" onClick={() => { setEditando(null); setTexto(''); }}>Cancelar</button>}
              <button className="btn-primario min-h-[42px] text-[13px]" disabled={ocupado}>
                {ocupado ? 'Salvando…' : editando ? 'Salvar edição' : correcao ? 'Avisar a liderança' : 'Nova anotação'}
              </button>
            </div>
          </div>
        </form>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {lista === null ? (
        <span className="text-sm text-muted">Carregando…</span>
      ) : lista.length === 0 ? (
        <span className="text-sm text-muted">Nenhuma anotação ainda.</span>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {lista.map((a) => {
            const editavel = meu(a) && dentroDoPrazo(a.criado_em);
            return (
              <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <BadgeTipo tipo={a.tipo} />
                  <span><strong className="text-texto">{meu(a) ? 'Você' : a.autor_nome || a.autor_email}</strong> · {formatarDataHora(a.criado_em)}</span>
                  {a.editado_em && <span>(editada)</span>}
                </div>
                <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">{a.texto}</p>
                {(editavel || admin) && (
                  <div className="flex gap-1">
                    {editavel && (
                      <button type="button" className="btn-texto min-h-[36px] px-1 text-xs"
                        onClick={() => { setEditando(a.id); setTexto(a.texto); setTipo(a.tipo); }}>
                        <Icone nome="lapis" tamanho={14} /> Editar
                      </button>
                    )}
                    {confirmarApagar === a.id ? (
                      <>
                        <button type="button" className="btn-texto min-h-[36px] px-1 text-xs text-[#FF8A8E]" onClick={() => apagar(a.id)}>Confirmar exclusão</button>
                        <button type="button" className="btn-texto min-h-[36px] px-1 text-xs text-muted" onClick={() => setConfirmarApagar(null)}>Cancelar</button>
                      </>
                    ) : (
                      <button type="button" className="btn-texto min-h-[36px] px-1 text-xs text-muted" onClick={() => setConfirmarApagar(a.id)}>
                        <Icone nome="lixo" tamanho={14} /> Apagar
                      </button>
                    )}
                    {editavel && <span className="self-center text-[11px] text-muted">pode editar por 24h</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
