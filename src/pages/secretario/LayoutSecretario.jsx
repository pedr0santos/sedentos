import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usuarioDoEmail } from '../../lib/supabase';
import { Fundo, Logo, Aviso } from '../../components/Visual';
import Icone from '../../components/Icone';

/**
 * Área do secretário(a): só a Chamada. Não tem menu do painel, não carrega a lista de jovens
 * e não tem nenhuma outra tela. O bloqueio de verdade está no banco; aqui o front só esconde.
 */
export default function LayoutSecretario() {
  const { nomeSecretario, email, sair } = useAuth();
  const { state } = useLocation();
  return (
    <div className="relative min-h-[100dvh]">
      <Fundo variante="admin" />
      <header className="sticky top-0 z-40 border-b border-white/5 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="text-[22px]" />
            <span className="badge bg-secondary/15 text-secondary">Chamada</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden truncate text-xs text-muted sm:inline">{nomeSecretario ?? usuarioDoEmail(email)}</span>
            <button type="button" onClick={sair} className="btn-texto min-h-[40px] px-2 text-[13px]"><Icone nome="sair" tamanho={16} /> Sair</button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-5">
        {state?.semAcesso && <div className="mb-4"><Aviso tipo="alerta">Você não tem acesso a esta área.</Aviso></div>}
        <Outlet />
      </main>
    </div>
  );
}
