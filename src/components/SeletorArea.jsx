import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/** Para quem é admin e também discipulador/liderança: alterna entre as duas áreas. */
export default function SeletorArea({ atual, className = '' }) {
  const { admin, lidera, papel } = useAuth();
  if (!admin || !lidera) return null;
  const itens = [
    ['painel', '/admin', 'Painel'],
    ['rede', '/minha-rede', papel === 'lideranca' ? 'Minha rede' : 'Meus discípulos'],
  ];
  return (
    <nav aria-label="Trocar de área" className={`flex w-full max-w-sm gap-1 rounded-xl bg-dark/60 p-1 ${className}`}>
      {itens.map(([k, to, r]) => (
        <Link key={k} to={to} aria-current={atual === k ? 'page' : undefined}
          className={`flex min-h-[40px] flex-1 items-center justify-center rounded-lg text-[13px] font-bold no-underline ${atual === k ? 'text-texto' : 'text-muted hover:text-texto'}`}
          style={atual === k ? { background: 'var(--gradient)' } : undefined}>{r}</Link>
      ))}
    </nav>
  );
}
