import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { JovensProvider, useJovens } from '../../hooks/useJovens';
import { supabase } from '../../lib/supabase';
import { Fundo, Logo, Aviso } from '../../components/Visual';
import Icone from '../../components/Icone';
import SeletorArea from '../../components/SeletorArea';

function Menu({ aoNavegar }) {
  const { jovens } = useJovens();
  const [dups, setDups] = useState(null);
  const pendentes = jovens.filter((j) => j.status === 'pendente_validacao').length;
  const semDisc = jovens.filter((j) => (j.papel === 'jovem' || j.papel === 'discipulador') && !j.discipulado_por).length;

  useEffect(() => {
    supabase.rpc('listar_duplicados').then(({ data }) => setDups(data?.length ?? 0));
  }, [jovens]);

  const itens = [
    { to: '/admin', end: true, icone: 'painel', rotulo: 'Dashboard' },
    { to: '/admin/jovens', icone: 'pessoas', rotulo: 'Jovens' },
    { to: '/admin/chamada', icone: 'calendario', rotulo: 'Chamada' },
    { to: '/admin/validacao', icone: 'validar', rotulo: 'Validação', cont: pendentes },
    { to: '/admin/duplicados', icone: 'copias', rotulo: 'Duplicados', cont: dups },
    { to: '/admin/rede', icone: 'rede', rotulo: 'Rede de discipulado', cont: semDisc || null },
    { to: '/admin/acessos', icone: 'chave', rotulo: 'Acessos' },
  ];
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {itens.map((i) => (
        <li key={i.to}>
          <NavLink to={i.to} end={i.end} onClick={aoNavegar}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center gap-3 rounded-[10px] px-3.5 text-sm font-semibold no-underline transition
               ${isActive ? 'bg-secondary/15 text-texto shadow-[inset_3px_0_0_var(--secondary)]' : 'text-muted hover:bg-secondary/10 hover:text-texto'}`}>
            <Icone nome={i.icone} />
            {i.rotulo}
            {Boolean(i.cont) && <span className="badge ml-auto bg-warning/15 px-2 py-0.5 text-warning">{i.cont}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Conteudo() {
  const { email, sair, jovem } = useAuth();
  const temRede = jovem && jovem.papel !== 'jovem';
  const { erro } = useJovens();
  const [aberto, setAberto] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="relative min-h-[100dvh]">
      <Fundo variante="admin" />
      {/* Topo no celular */}
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 lg:hidden">
        <Logo className="text-[22px]" />
        <button type="button" aria-label="Abrir menu" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-secondary/25">
          <Icone nome={aberto ? 'fechar' : 'menu'} />
        </button>
      </header>
      <div className="flex">
        <nav aria-label="Menu do painel"
          className={`${aberto ? 'block' : 'hidden'} fixed inset-x-0 top-[69px] z-40 border-b border-white/5 bg-bg/95 p-4 backdrop-blur
            lg:sticky lg:top-0 lg:block lg:h-[100dvh] lg:w-[250px] lg:shrink-0 lg:border-0 lg:bg-transparent lg:px-4 lg:py-7`}>
          <div className="hidden flex-col gap-2 px-3.5 pb-6 lg:flex">
            <Logo />
            <div className="h-[3px] w-8 rounded-sm bg-secondary" />
            <span className="text-xs text-muted">Painel administrativo</span>
          </div>
          <Menu aoNavegar={() => setAberto(false)} />
          <div className="mt-6 flex flex-col gap-1 border-t border-white/5 px-3.5 pt-4 lg:absolute lg:bottom-6 lg:left-4 lg:right-4">
            <span className="truncate text-xs text-muted" title={email}>{email}</span>
            {temRede && <Link to="/minha-rede" className="btn-texto px-0 text-[13px]"><Icone nome="pessoas" tamanho={16} /> {jovem.papel === 'lideranca' ? 'Minha rede' : 'Meus discípulos'}</Link>}
            {jovem && <Link to="/meu-cadastro" className="btn-texto px-0 text-[13px]"><Icone nome="usuario" tamanho={16} /> Meu cadastro</Link>}
            <button type="button" onClick={sair} className="btn-texto px-0 text-[13px]"><Icone nome="sair" tamanho={16} /> Sair</button>
          </div>
        </nav>
        <main className="min-w-0 flex-1 px-4 pb-12 pt-6 sm:px-8 lg:px-10 lg:pt-9">
          {temRede && <SeletorArea atual="painel" className="mb-6" />}
          {erro && <Aviso tipo="erro" className="mb-4">Erro ao carregar a base: {erro}</Aviso>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function LayoutAdmin() {
  return (
    <JovensProvider>
      <Conteudo />
    </JovensProvider>
  );
}
