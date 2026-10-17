import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { formatarDataHora, iniciais } from '../../lib/formato';
import { copiarTexto } from '../../lib/rede';
import { Titulo, Carregando, Aviso, Campo } from '../../components/Visual';
import { Modal, BadgePapel } from '../../components/Rede';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

// ---------- utilidades ----------
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** "Maria da Silva" → "maria.silva" (só sugestão; a liderança pode trocar). */
export function sugerirUsuario(nome) {
  const p = semAcento(nome).toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/)
    .filter((x) => x && !['de', 'da', 'do', 'das', 'dos', 'e'].includes(x));
  if (!p.length) return '';
  return (p.length > 1 ? `${p[0]}.${p[p.length - 1]}` : p[0]).slice(0, 30);
}
/** Senha fácil de ditar: sem letras que se confundem (l, 1, O, 0). */
export function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const nums = '23456789';
  const sorteia = (s, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => s[x % s.length]).join('');
  return `${sorteia(letras, 4)}-${sorteia(nums, 4)}`;
}
const linkSecretario = () => `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}?secretario=1`;
const mensagemBoasVindas = (nome, usuario, senha) =>
  `Olá, ${nome.split(' ')[0]}! Você foi cadastrado(a) como secretário(a) da chamada do Sedentos. `
  + `Acesse ${linkSecretario()} e entre com o usuário ${usuario} e a senha ${senha}.`;

const USUARIO_OK = /^[a-z0-9][a-z0-9._-]{2,29}$/;

/** Chama a Edge Function e devolve a mensagem de erro em português, quando houver. */
async function gerenciar(acao, corpo) {
  const { data, error } = await supabase.functions.invoke('gerenciar-secretarios', { body: { acao, ...corpo } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json(); if (j?.erro) msg = j.erro; } catch { /* resposta sem JSON */ }
    if (/Failed to send a request|not found|404/i.test(msg)) msg = 'A função "gerenciar-secretarios" ainda não foi instalada no Supabase. Veja o README, seção Acessos.';
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

const ACOES_LOG = {
  secretario_criado: 'criou o secretário',
  secretario_desativado: 'desativou o secretário',
  secretario_reativado: 'reativou o secretário',
  secretario_renomeado: 'renomeou o secretário',
  secretario_senha: 'trocou a senha do secretário',
  secretario_removido: 'removeu o secretário',
  admin_adicionado: 'adicionou o administrador',
  admin_removido: 'removeu o administrador',
};

function CampoSenha({ id, valor, onChange }) {
  return (
    <Campo id={id} rotulo="Senha" dica="Mínimo de 8 caracteres. Use “Gerar” para uma senha fácil de ditar.">
      <div className="flex gap-2">
        <input id={id} className="campo font-mono" autoComplete="new-password" value={valor} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-secundario min-h-[48px] shrink-0 px-4 text-[13px]" onClick={() => onChange(gerarSenha())}>Gerar</button>
      </div>
    </Campo>
  );
}

/** Tela de sucesso: o que mandar pelo WhatsApp. */
function Entregar({ nome, usuario, senha, aoFechar, titulo = 'Acesso criado!' }) {
  const [copiado, setCopiado] = useState('');
  const texto = mensagemBoasVindas(nome, usuario, senha);
  const copiar = async (o, t) => { if (await copiarTexto(t)) { setCopiado(o); setTimeout(() => setCopiado(''), 2500); } };
  return (
    <div className="flex flex-col gap-4">
      <Aviso tipo="ok"><strong>{titulo}</strong> Mande os dados para {nome.split(' ')[0]}. A senha não aparece de novo depois que você fechar.</Aviso>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-dark/60 p-4 text-sm">
        <dt className="text-muted">Usuário</dt><dd className="m-0 font-mono font-bold">{usuario}</dd>
        <dt className="text-muted">Senha</dt><dd className="m-0 font-mono font-bold">{senha}</dd>
      </dl>
      <p className="m-0 rounded-xl border border-white/[0.08] p-3 text-[13px] leading-relaxed text-[#D6DDEA]">{texto}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primario min-h-[44px] text-[13px]" onClick={() => copiar('msg', texto)}>
          <Icone nome="check" tamanho={16} /> {copiado === 'msg' ? 'Mensagem copiada!' : 'Copiar mensagem'}
        </button>
        <button type="button" className="btn-secundario min-h-[44px] text-[13px]" onClick={() => copiar('link', linkSecretario())}>
          <Icone nome="link" tamanho={16} /> {copiado === 'link' ? 'Link copiado!' : 'Copiar link de acesso'}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"
          className="btn-secundario min-h-[44px] border-success/50 text-[13px] no-underline">
          <Icone nome="whatsapp" tamanho={16} className="text-success" /> Enviar no WhatsApp
        </a>
      </div>
      <button type="button" className="btn-texto self-end text-[13px]" onClick={aoFechar}>Fechar</button>
    </div>
  );
}

// ---------- Secretários ----------
function Secretarios({ aoMudar }) {
  const [lista, setLista] = useState(null);
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null); // {tipo: 'novo'|'nome'|'senha'|'remover', s}
  const [f, setF] = useState({ nome: '', usuario: '', senha: '', usuarioMexido: false });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [entregue, setEntregue] = useState(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('secretarios').select('*').order('nome');
    if (error) setMsg({ tipo: 'erro', texto: mensagemErro(error) });
    setLista(data ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (tipo, s = null) => {
    setErro(''); setEntregue(null);
    setF({ nome: s?.nome ?? '', usuario: s?.usuario ?? '', senha: tipo === 'novo' || tipo === 'senha' ? gerarSenha() : '', usuarioMexido: false });
    setModal({ tipo, s });
  };
  const fechar = () => { setModal(null); setEntregue(null); };
  const depois = async (texto) => { await carregar(); aoMudar(); if (texto) setMsg({ tipo: 'ok', texto }); };

  const salvarNovo = async () => {
    const nome = f.nome.trim(); const usuario = f.usuario.trim().toLowerCase();
    if (nome.length < 2) { setErro('Informe o nome.'); return; }
    if (!USUARIO_OK.test(usuario)) { setErro('Usuário: de 3 a 30 letras minúsculas, números, ponto, hífen ou _ (sem espaços nem acentos).'); return; }
    if (f.senha.length < 8) { setErro('A senha precisa ter pelo menos 8 caracteres.'); return; }
    setOcupado(true); setErro('');
    try {
      await gerenciar('criar', { nome, usuario, senha: f.senha });
      setEntregue({ nome, usuario, senha: f.senha });
      await depois();
    } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };

  const salvarSenha = async () => {
    if (f.senha.length < 8) { setErro('A senha precisa ter pelo menos 8 caracteres.'); return; }
    setOcupado(true); setErro('');
    try {
      await gerenciar('senha', { id: modal.s.id, senha: f.senha });
      setEntregue({ nome: modal.s.nome, usuario: modal.s.usuario, senha: f.senha, titulo: 'Senha trocada!' });
      await depois();
    } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };

  const salvarNome = async () => {
    if (f.nome.trim().length < 2) { setErro('Informe o nome.'); return; }
    setOcupado(true);
    const { error } = await supabase.rpc('secretario_atualizar', { p_id: modal.s.id, p_nome: f.nome.trim(), p_ativo: null });
    setOcupado(false);
    if (error) { setErro(mensagemErro(error)); return; }
    fechar(); depois('Nome atualizado.');
  };

  const alternar = async (s) => {
    const { error } = await supabase.rpc('secretario_atualizar', { p_id: s.id, p_nome: null, p_ativo: !s.ativo });
    if (error) { setMsg({ tipo: 'erro', texto: mensagemErro(error) }); return; }
    depois(s.ativo ? `${s.nome} foi desativado(a). O acesso foi cortado na hora.` : `${s.nome} foi reativado(a).`);
  };

  const remover = async () => {
    setOcupado(true); setErro('');
    try {
      await gerenciar('remover', { id: modal.s.id });
      const nome = modal.s.nome;
      fechar(); depois(`${nome} foi removido(a).`);
    } catch (e) { setErro(e.message); } finally { setOcupado(false); }
  };

  if (!lista) return <Carregando />;
  return (
    <section className="flex flex-col gap-4" aria-label="Secretários">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-xl text-[13px] leading-relaxed text-muted">
          Secretários só fazem a chamada dos cultos: veem foto, nome e apelido. Nada de telefone, rede, anotações ou avisos.
          Entram com usuário e senha.
        </p>
        <button type="button" className="btn-primario min-h-[46px] text-[13px]" onClick={() => abrir('novo')}>
          <Icone nome="mais" tamanho={16} /> Novo secretário
        </button>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      {lista.length === 0 && <div className="cartao p-8 text-center text-sm text-muted">Nenhum secretário ainda.</div>}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
        {lista.map((s) => (
          <li key={s.id} className={`cartao flex min-w-0 flex-col gap-3 p-4 ${s.ativo ? '' : 'opacity-70'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-secondary/40 bg-dark text-sm font-extrabold text-secondary">
                {iniciais(s.nome)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold">{s.nome}</span>
                <span className="truncate font-mono text-xs text-muted">{s.usuario}</span>
              </div>
              <span className={`badge ${s.ativo ? 'bg-success/15 text-success' : 'bg-white/10 text-muted'}`}>{s.ativo ? 'Ativo' : 'Inativo'}</span>
            </div>
            <span className="text-xs text-muted">
              Último acesso: {s.ultimo_acesso_em ? formatarDataHora(s.ultimo_acesso_em) : 'ainda não entrou'} · criado por {s.criado_por ?? '—'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn-secundario min-h-[38px] px-3 text-xs" onClick={() => alternar(s)}>{s.ativo ? 'Desativar' : 'Reativar'}</button>
              <button type="button" className="btn-texto min-h-[38px] px-2 text-xs" onClick={() => abrir('nome', s)}><Icone nome="lapis" tamanho={14} /> Editar nome</button>
              <button type="button" className="btn-texto min-h-[38px] px-2 text-xs" onClick={() => abrir('senha', s)}><Icone nome="chave" tamanho={14} /> Trocar senha</button>
              <button type="button" className="btn-texto min-h-[38px] px-2 text-xs text-[#FF8A8E]" onClick={() => abrir('remover', s)}><Icone nome="lixo" tamanho={14} /> Remover</button>
            </div>
          </li>
        ))}
      </ul>

      <Modal titulo={entregue ? 'Pronto!' : 'Novo secretário(a)'} aberto={modal?.tipo === 'novo'} aoFechar={fechar}>
        {entregue ? <Entregar {...entregue} aoFechar={fechar} /> : (
          <>
            <Campo id="sec-nome" rotulo="Nome">
              <input id="sec-nome" className="campo" placeholder="Nome e sobrenome" value={f.nome}
                onChange={(e) => setF((x) => ({ ...x, nome: e.target.value, usuario: x.usuarioMexido ? x.usuario : sugerirUsuario(e.target.value) }))} />
            </Campo>
            <Campo id="sec-usuario" rotulo="Usuário (para entrar)" dica="Letras minúsculas, números e ponto. Sem espaços nem acentos.">
              <input id="sec-usuario" className="campo font-mono" autoCapitalize="none" spellCheck={false} placeholder="maria.silva" value={f.usuario}
                onChange={(e) => setF((x) => ({ ...x, usuario: e.target.value.toLowerCase().replace(/\s/g, ''), usuarioMexido: true }))} />
            </Campo>
            <CampoSenha id="sec-senha" valor={f.senha} onChange={(v) => setF((x) => ({ ...x, senha: v }))} />
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <div className="flex flex-wrap justify-end gap-2.5">
              <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
              <button type="button" className="btn-primario" disabled={ocupado} onClick={salvarNovo}>{ocupado ? 'Criando…' : 'Criar acesso'}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal titulo={entregue ? 'Pronto!' : `Nova senha para ${modal?.s?.nome ?? ''}`} aberto={modal?.tipo === 'senha'} aoFechar={fechar}>
        {entregue ? <Entregar {...entregue} aoFechar={fechar} /> : (
          <>
            <CampoSenha id="sec-nova-senha" valor={f.senha} onChange={(v) => setF((x) => ({ ...x, senha: v }))} />
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <div className="flex flex-wrap justify-end gap-2.5">
              <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
              <button type="button" className="btn-primario" disabled={ocupado} onClick={salvarSenha}>{ocupado ? 'Salvando…' : 'Trocar senha'}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal titulo="Editar nome" aberto={modal?.tipo === 'nome'} aoFechar={fechar}>
        <Campo id="sec-renomear" rotulo="Nome">
          <input id="sec-renomear" className="campo" value={f.nome} onChange={(e) => setF((x) => ({ ...x, nome: e.target.value }))} />
        </Campo>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className="btn-secundario" onClick={fechar}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={ocupado} onClick={salvarNome}>Salvar</button>
        </div>
      </Modal>

      <Modal titulo={`Remover ${modal?.s?.nome ?? ''}?`} aberto={modal?.tipo === 'remover'} aoFechar={fechar}>
        <p className="m-0 text-sm leading-relaxed text-[#D6DDEA]">
          O usuário <strong className="font-mono">{modal?.s?.usuario}</strong> deixa de existir e perde o acesso na hora.
          As presenças que essa pessoa marcou continuam valendo. Se for só por um tempo, prefira <strong>Desativar</strong>.
        </p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className="btn-secundario" onClick={fechar}>Voltar</button>
          <button type="button" className="btn-perigo" disabled={ocupado} onClick={remover}>{ocupado ? 'Removendo…' : 'Remover'}</button>
        </div>
      </Modal>
    </section>
  );
}

// ---------- Administradores ----------
function Administradores({ aoMudar }) {
  const [lista, setLista] = useState(null);
  const [msg, setMsg] = useState(null);
  const [novo, setNovo] = useState(false);
  const [email, setEmail] = useState('');
  const [ciente, setCiente] = useState(false);
  const [remover, setRemover] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('lista_admins');
    if (error) setMsg({ tipo: 'erro', texto: mensagemErro(error) });
    setLista(data ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const adicionar = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setErro('Digite um e-mail válido.'); return; }
    if (!ciente) { setErro('Confirme que entende o que um administrador vê.'); return; }
    const { error } = await supabase.from('admins').insert({ email: e });
    if (error) { setErro(/duplicate/i.test(error.message) ? 'Este e-mail já é administrador.' : mensagemErro(error)); return; }
    setNovo(false); setEmail(''); setCiente(false); setErro('');
    setMsg({ tipo: 'ok', texto: `${e} agora é administrador. Ele(a) entra pelo código no e-mail, na tela inicial.` });
    carregar(); aoMudar();
  };

  const confirmarRemover = async () => {
    const { error } = await supabase.from('admins').delete().eq('email', remover);
    if (error) { setErro(mensagemErro(error)); return; }
    setMsg({ tipo: 'ok', texto: `${remover} não é mais administrador.` });
    setRemover(null); carregar(); aoMudar();
  };

  if (!lista) return <Carregando />;
  const unico = lista.length <= 1;
  return (
    <section className="flex flex-col gap-4" aria-label="Administradores">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-xl text-[13px] leading-relaxed text-muted">Administradores usam o painel completo e entram pelo código de 6 dígitos no e-mail.</p>
        <button type="button" className="btn-secundario min-h-[46px] text-[13px]" onClick={() => { setNovo(true); setErro(''); }}>
          <Icone nome="mais" tamanho={16} /> Novo administrador
        </button>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lista.map((a) => (
          <li key={a.email} className="cartao flex min-w-0 flex-wrap items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold">{a.email.slice(0, 2).toUpperCase()}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold">{a.email}{a.sou_eu && <span className="ml-2 text-xs font-semibold text-secondary">(você)</span>}</span>
              <span className="text-xs text-muted">Último acesso: {a.ultimo_acesso_em ? formatarDataHora(a.ultimo_acesso_em) : 'ainda não entrou'}</span>
            </div>
            <button type="button" className="btn-texto min-h-[38px] text-xs text-[#FF8A8E] disabled:text-muted" disabled={a.sou_eu || unico}
              title={a.sou_eu ? 'Você não pode remover a si mesmo.' : unico ? 'É o último administrador.' : undefined}
              onClick={() => { setRemover(a.email); setErro(''); }}>
              <Icone nome="lixo" tamanho={14} /> Remover
            </button>
          </li>
        ))}
      </ul>

      <Modal titulo="Novo administrador" aberto={novo} aoFechar={() => setNovo(false)}>
        <Aviso tipo="alerta">Administradores veem <strong>todos</strong> os dados, inclusive as anotações de discipulado.</Aviso>
        <Campo id="adm-email" rotulo="E-mail">
          <input id="adm-email" type="email" className="campo" placeholder="pessoa@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-[#D6DDEA]">
          <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--secondary)]" />
          Entendo que esta pessoa vai ver todos os dados dos jovens e as anotações de discipulado.
        </label>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className="btn-secundario" onClick={() => setNovo(false)}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={!ciente} onClick={adicionar}>Adicionar administrador</button>
        </div>
      </Modal>

      <Modal titulo="Remover administrador?" aberto={Boolean(remover)} aoFechar={() => setRemover(null)}>
        <p className="m-0 text-sm text-[#D6DDEA]"><strong>{remover}</strong> perde o acesso ao painel na próxima ação.</p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className="btn-secundario" onClick={() => setRemover(null)}>Voltar</button>
          <button type="button" className="btn-perigo" onClick={confirmarRemover}>Remover</button>
        </div>
      </Modal>
    </section>
  );
}

// ---------- Rede (somente leitura) ----------
function AcessosRede() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    supabase.rpc('acessos_rede').then(({ data, error }) => { if (error) setErro(mensagemErro(error)); setLista(data ?? []); });
  }, []);
  if (!lista) return <Carregando />;
  return (
    <section className="flex flex-col gap-4" aria-label="Rede">
      <p className="m-0 max-w-xl text-[13px] leading-relaxed text-muted">
        Quem entra por ser Liderança ou Discipulador. Para mudar o papel, abra a ficha da pessoa.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {lista.length === 0 && <div className="cartao p-8 text-center text-sm text-muted">Ninguém classificado como Liderança ou Discipulador.</div>}
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 lg:grid-cols-2">
        {lista.map((p) => (
          <li key={p.jovem_id}>
            <Link to={`/admin/jovens/${p.jovem_id}`} className="cartao flex min-w-0 items-center gap-3 p-3.5 text-texto no-underline hover:border-secondary/40">
              <Avatar caminho={p.foto_url} nome={p.nome} tamanho={42} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-bold">{p.apelido || p.nome}{p.apelido && <span className="font-normal text-muted"> {p.nome}</span>}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs">
                  <BadgePapel papel={p.papel} cargo={p.cargo_lideranca} />
                  {p.email
                    ? <span className="truncate text-muted">{p.email}</span>
                    : <span className="font-bold text-warning">sem e-mail, não consegue entrar</span>}
                </span>
                {p.email && (
                  <span className="text-xs text-muted">
                    {p.vinculado ? `Último acesso: ${p.ultimo_acesso_em ? formatarDataHora(p.ultimo_acesso_em) : '—'}` : 'Ainda não entrou'}
                  </span>
                )}
              </div>
              <Icone nome="direita" tamanho={16} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Registro ----------
function Registro({ versao }) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    supabase.from('acessos_log').select('*').order('criado_em', { ascending: false }).limit(50).then(({ data }) => setLog(data ?? []));
  }, [versao]);
  if (!log) return null;
  return (
    <section className="cartao flex flex-col gap-2 p-5" aria-labelledby="t-log">
      <h2 id="t-log" className="m-0 text-base">Registro de acessos</h2>
      {log.length === 0 && <span className="text-sm text-muted">Nada registrado ainda.</span>}
      <ul className="m-0 flex list-none flex-col p-0">
        {log.map((l) => (
          <li key={l.id} className="flex flex-wrap gap-x-2 border-b border-white/[0.06] py-2 text-[13px] last:border-0">
            <span className="text-muted">{formatarDataHora(l.criado_em)}</span>
            <span><strong>{l.feito_por}</strong> {ACOES_LOG[l.acao] ?? l.acao}{' '}
              <strong className="font-mono">{l.alvo}</strong>
              {l.detalhes?.para && <span className="text-muted"> ({l.detalhes.de} → {l.detalhes.para})</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ABAS = [['secretarios', 'Secretários'], ['admins', 'Administradores'], ['rede', 'Rede']];

export default function Acessos() {
  const [aba, setAba] = useState(() => { try { return sessionStorage.getItem('sed_aba_acessos') || 'secretarios'; } catch { return 'secretarios'; } });
  const [versao, setVersao] = useState(0);
  const mudar = (a) => { setAba(a); try { sessionStorage.setItem('sed_aba_acessos', a); } catch { /* sem armazenamento */ } };
  const aoMudar = () => setVersao((v) => v + 1);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Titulo inicio="Aces" destaque="sos" className="text-4xl" />
        <span className="text-sm text-muted">Quem entra no sistema e o que cada um vê.</span>
      </header>
      <div role="tablist" aria-label="Tipos de acesso" className="flex gap-1 overflow-x-auto rounded-xl bg-dark/60 p-1 sm:max-w-md">
        {ABAS.map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => mudar(k)}
            className={`min-h-[42px] flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-bold ${aba === k ? 'text-texto' : 'text-muted'}`}
            style={aba === k ? { background: 'var(--gradient)' } : undefined}>{r}</button>
        ))}
      </div>
      {aba === 'secretarios' && <Secretarios aoMudar={aoMudar} />}
      {aba === 'admins' && <Administradores aoMudar={aoMudar} />}
      {aba === 'rede' && <AcessosRede />}
      <Registro versao={versao} />
    </div>
  );
}
