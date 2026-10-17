import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase, mensagemErro, demo, emailDoSecretario, SECRETARIO_DOMINIO } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Titulo, Aviso, Campo } from '../../components/Visual';
import Icone from '../../components/Icone';

const ESPERA = 60; // segundos até poder reenviar

/** Secretário(a) da chamada: entra com usuário e senha criados pela liderança na aba Acessos. */
function EntrarSecretario({ aoVoltar }) {
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    const u = usuario.trim().toLowerCase();
    if (!u || !senha) { setErro('Preencha o usuário e a senha.'); return; }
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: emailDoSecretario(u), password: senha });
    setEnviando(false);
    if (error) { setErro(mensagemErro(error)); return; }
    navegar('/inicio', { replace: true });
  };

  return (
    <form onSubmit={entrar} className="flex min-h-[100dvh] flex-col px-7 pb-9 pt-10">
      <button type="button" aria-label="Voltar" onClick={aoVoltar}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-secondary/25 hover:bg-secondary/10">
        <Icone nome="voltar" tamanho={20} largura={2.4} />
      </button>
      <div className="mt-12 flex flex-col gap-3">
        <Titulo inicio="Secretário(a) da " destaque="chamada" className="text-[34px]" />
        <p className="m-0 text-base leading-relaxed text-muted">Entre com o usuário e a senha que a liderança te passou.</p>
      </div>
      <div className="mt-9 flex flex-col gap-4">
        <Campo id="usuario" rotulo="Usuário">
          <input id="usuario" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="ex.: maria.chamada"
            value={usuario} onChange={(e) => setUsuario(e.target.value.replace(/\s/g, ''))} className="campo" />
        </Campo>
        <Campo id="senha" rotulo="Senha">
          <div className="relative">
            <input id="senha" type={ver ? 'text' : 'password'} autoComplete="current-password" value={senha}
              onChange={(e) => setSenha(e.target.value)} className="campo pr-20" />
            <button type="button" onClick={() => setVer((v) => !v)} aria-pressed={ver}
              className="btn-texto absolute right-1 top-1/2 min-h-[40px] -translate-y-1/2 px-3 text-xs">{ver ? 'Ocultar' : 'Mostrar'}</button>
          </div>
        </Campo>
        {demo && <Aviso>Demonstração: use o usuário <strong>maria.chamada</strong> e a senha <strong>sedentos123</strong>.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <div className="mt-auto flex flex-col gap-3.5 pt-8">
        <button className="btn-primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="text-center text-xs leading-relaxed text-muted/80">Esqueceu a senha? Peça para a liderança criar uma nova.</p>
      </div>
    </form>
  );
}

export default function Entrar() {
  const { sessao } = useAuth();
  const navegar = useNavigate();
  const [etapa, setEtapa] = useState(() => (sessionStorage.getItem('sed_email') ? 'codigo'
    : new URLSearchParams(window.location.search).has('secretario') ? 'secretario' : 'email'));
  const [email, setEmail] = useState(() => sessionStorage.getItem('sed_email') ?? new URLSearchParams(window.location.search).get('email') ?? '');
  const [codigo, setCodigo] = useState(['', '', '', '', '', '']);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resta, setResta] = useState(0);
  const caixas = useRef([]);

  useEffect(() => {
    if (resta <= 0) return;
    const t = setTimeout(() => setResta((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resta]);

  if (sessao) return <Navigate to="/inicio" replace />;

  const enviarCodigo = async (e) => {
    e?.preventDefault();
    const limpo = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo)) { setErro('Digite um e-mail válido.'); return; }
    if (limpo.endsWith(`@${SECRETARIO_DOMINIO}`)) { setEtapa('secretario'); return; }
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: limpo,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/inicio` },
    });
    setEnviando(false);
    if (error) { setErro(mensagemErro(error)); return; }
    sessionStorage.setItem('sed_email', limpo);
    setEmail(limpo);
    setCodigo(['', '', '', '', '', '']);
    setEtapa('codigo');
    setResta(ESPERA);
    setTimeout(() => caixas.current[0]?.focus(), 50);
  };

  const confirmar = async (e) => {
    e?.preventDefault();
    const token = codigo.join('');
    if (token.length !== 6) { setErro('Digite os 6 números do código.'); return; }
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setEnviando(false);
    if (error) { setErro(mensagemErro(error)); return; }
    sessionStorage.removeItem('sed_email');
    navegar('/inicio', { replace: true });
  };

  const digitar = (i, v) => {
    const d = v.replace(/\D/g, '');
    if (d.length > 1) { // colou o código inteiro
      const n = d.slice(0, 6).split('');
      setCodigo([...n, ...Array(6 - n.length).fill('')]);
      caixas.current[Math.min(n.length, 5)]?.focus();
      return;
    }
    const novo = [...codigo];
    novo[i] = d;
    setCodigo(novo);
    if (d && i < 5) caixas.current[i + 1]?.focus();
  };

  if (etapa === 'secretario') return <EntrarSecretario aoVoltar={() => { setEtapa('email'); setErro(''); }} />;

  if (etapa === 'codigo') {
    return (
      <form onSubmit={confirmar} className="flex min-h-[100dvh] flex-col px-7 pb-9 pt-10">
        <button type="button" aria-label="Voltar"
          onClick={() => { sessionStorage.removeItem('sed_email'); setEtapa('email'); setErro(''); }}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-secondary/25 hover:bg-secondary/10">
          <Icone nome="voltar" tamanho={20} largura={2.4} />
        </button>
        <div className="mt-12"><Titulo inicio="Seu có" destaque="digo" className="text-4xl" /></div>
        <p className="mt-5 text-base leading-relaxed text-muted">
          Mandamos 6 números para <strong className="text-texto">{email}</strong>. Confira também a caixa de spam.
        </p>
        <fieldset className="mt-9 min-w-0 border-0 p-0">
          <legend className="rotulo mb-3">Código de verificação</legend>
          <div className="grid grid-cols-6 gap-2">
            {codigo.map((c, i) => (
              <input key={i} ref={(el) => (caixas.current[i] = el)} value={c}
                inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6}
                aria-label={`Dígito ${i + 1}`}
                onChange={(e) => digitar(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Backspace' && !c && i > 0) caixas.current[i - 1]?.focus(); }}
                className="campo h-[60px] min-w-0 px-0 text-center text-2xl font-extrabold" />
            ))}
          </div>
        </fieldset>
        {demo && <Aviso className="mt-4">Demonstração: nenhum e-mail é enviado. Digite quaisquer 6 números.</Aviso>}
        <p className="mt-4 text-[13px] text-muted">
          {resta > 0 ? <>Não chegou? Reenviar em <strong className="text-texto">0:{String(resta).padStart(2, '0')}</strong></>
            : <button type="button" className="btn-texto px-0" onClick={enviarCodigo}>Reenviar código</button>}
        </p>
        {erro && <Aviso tipo="erro" className="mt-4">{erro}</Aviso>}
        <div className="mt-auto flex flex-col gap-3.5 pt-8">
          <button className="btn-primario" disabled={enviando}>{enviando ? 'Conferindo…' : 'Confirmar'}</button>
          <p className="text-center text-xs leading-relaxed text-muted/80">
            Você também pode entrar pelo link que veio no mesmo e-mail.
          </p>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={enviarCodigo} className="flex min-h-[100dvh] flex-col px-7 pb-9 pt-24">
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-muted">Ministério jovem</span>
        <Titulo as="h1" inicio="Sede" destaque="ntos" className="text-[52px]" />
      </div>
      <p className="mt-7 max-w-[300px] text-[17px] leading-relaxed text-muted">
        Que bom ter você aqui. Entre com seu e-mail para fazer ou atualizar seu cadastro.
      </p>
      <div className="mt-auto flex flex-col gap-3.5 pt-10">
        <Campo id="email" rotulo="Seu e-mail" erro={erro}>
          <input id="email" type="email" inputMode="email" autoComplete="email" placeholder="voce@email.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(erro)} aria-describedby={erro ? 'email-erro' : undefined}
            className={`campo ${erro ? 'campo-erro' : ''}`} />
        </Campo>
        <button className="btn-primario" disabled={enviando}>
          {enviando ? 'Enviando…' : <>Entrar / Cadastrar <Icone nome="seta" largura={2.4} /></>}
        </button>
        <p className="text-center text-[13px] leading-relaxed text-muted">
          Sem senha: vamos mandar um código de 6 dígitos para o seu e-mail.
        </p>
      </div>
      <p className="mt-9 text-center text-xs leading-relaxed text-muted/80">
        Seus dados ficam só com a liderança do Sedentos e são usados apenas nas atividades do ministério.
      </p>
      <button type="button" onClick={() => { setEtapa('secretario'); setErro(''); }}
        className="btn-texto mt-3 self-center text-[13px] text-muted">
        <Icone nome="chave" tamanho={15} /> Sou secretário(a) da chamada
      </button>
    </form>
  );
}
