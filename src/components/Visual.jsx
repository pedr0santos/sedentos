import { STATUS } from '../lib/inconsistencias';

/** Título com a palavra em duas cores e o sublinhado curto azul. */
export function Titulo({ inicio, destaque, fim = '', as: Tag = 'h1', className = 'text-[34px]', semLinha = false }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Tag className={`m-0 leading-[1.05] tracking-tight ${className}`}>
        {inicio}<span className="text-secondary">{destaque}</span>{fim}
      </Tag>
      {!semLinha && <div className="h-[3px] w-10 rounded-sm bg-secondary" aria-hidden="true" />}
    </div>
  );
}

export function Logo({ className = 'text-[26px]' }) {
  return (
    <span className={`font-titulo font-extrabold tracking-tight ${className}`}>
      Sede<span className="text-secondary">ntos</span>
    </span>
  );
}

/** Fundo escuro com brilhos azuis e quadrados translúcidos. */
export function Fundo({ variante = 'jovem' }) {
  const q = 'absolute rounded-[14px] border border-secondary/40 bg-secondary/10';
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute -right-48 -top-48 h-[480px] w-[480px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(var(--secondary-rgb) / 0.3), transparent 65%)' }} />
      <div className="absolute -bottom-56 -left-56 h-[520px] w-[520px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(var(--primary-rgb) / 0.42), transparent 65%)' }} />
      {variante === 'jovem' ? (
        <>
          <div className={`${q} -left-4 top-24 h-16 w-16 rotate-[14deg]`} />
          <div className={`${q} right-8 top-40 h-10 w-10 -rotate-12 rounded-[10px] bg-primary/20`} />
          <div className={`${q} -right-8 bottom-28 h-24 w-24 rotate-[22deg] rounded-[18px] border-secondary/30`} />
        </>
      ) : (
        <>
          <div className={`${q} right-10 top-[42%] h-[70px] w-[70px] rotate-[14deg] border-secondary/35`} />
          <div className={`${q} bottom-20 right-14 h-20 w-20 -rotate-12 rounded-[18px] border-secondary/30 bg-secondary/[0.08]`} />
        </>
      )}
    </div>
  );
}

export function StatusBadge({ status, curto = false }) {
  const s = STATUS[status] ?? STATUS.pendente_validacao;
  return <span className={`badge ${s.classe}`}>{curto ? s.curto : s.rotulo}</span>;
}

export function Carregando({ texto = 'Carregando…', tela = false }) {
  const conteudo = (
    <div className="flex items-center gap-3 text-sm text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-secondary/30 border-t-secondary" />
      {texto}
    </div>
  );
  return tela ? <div className="flex min-h-[60vh] items-center justify-center">{conteudo}</div> : conteudo;
}

export function Aviso({ tipo = 'info', children, className = '' }) {
  const cores = {
    info: 'border-secondary/30 bg-secondary/10 text-[#D6E6F5]',
    alerta: 'border-warning/35 bg-warning/10 text-[#F7D9A4]',
    erro: 'border-danger/40 bg-danger/10 text-[#FFC9CB]',
    ok: 'border-success/35 bg-success/10 text-[#A6EBC3]',
  };
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'}
      className={`rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${cores[tipo]} ${className}`}>
      {children}
    </div>
  );
}

/** Rótulo + campo + mensagem de erro/dica, ligados por id para leitores de tela. */
export function Campo({ id, rotulo, erro, dica, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {rotulo && <label htmlFor={id} className="rotulo">{rotulo}</label>}
      {children}
      {erro ? (
        <span id={`${id}-erro`} className="text-xs font-semibold text-[#FF8A8E]">{erro}</span>
      ) : dica ? (
        <span className="text-xs text-muted">{dica}</span>
      ) : null}
    </div>
  );
}
