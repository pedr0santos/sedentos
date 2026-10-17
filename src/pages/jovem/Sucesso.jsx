import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Titulo, StatusBadge } from '../../components/Visual';
import Avatar from '../../components/Avatar';

export default function Sucesso() {
  const { jovem } = useAuth();
  if (!jovem) return <Navigate to="/inicio" replace />;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center px-7 pb-9 pt-32 text-center">
      <div className="relative h-[120px] w-[120px]">
        <div className="anim-anel absolute inset-0 rounded-full border-2 border-secondary" aria-hidden="true" />
        <div className="anim-pop absolute inset-0 flex items-center justify-center rounded-full shadow-[0_16px_48px_rgb(var(--secondary-rgb)/0.4)]"
          style={{ background: 'var(--gradient)' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8"
            strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Concluído">
            <path className="anim-tracar" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
      </div>
      <div className="mt-11 flex flex-col items-center">
        <Titulo inicio="Tudo cer" destaque="to!" className="text-[38px]" />
      </div>
      <p className="mt-5 max-w-[300px] text-base leading-relaxed text-muted">
        Seu cadastro foi enviado. A liderança vai conferir os dados nos próximos dias.
      </p>
      <div className="cartao mt-8 flex w-full items-center gap-3.5 p-4 text-left">
        <Avatar caminho={jovem.foto_url} nome={jovem.nome} tamanho={52} />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <span className="truncate text-[15px] font-extrabold">{jovem.nome}</span>
          <StatusBadge status={jovem.status} />
        </div>
      </div>
      <Link to="/meu-cadastro" className="btn-primario mt-auto w-full">Ver meu cadastro</Link>
    </div>
  );
}
