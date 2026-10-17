import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { configurado, demo } from './lib/supabase';
import BarraDemo from './demo/BarraDemo';
import { Fundo, Carregando, Aviso, Titulo } from './components/Visual';
import Entrar from './pages/jovem/Entrar';
import Inicio from './pages/jovem/Inicio';
import Vincular from './pages/jovem/Vincular';
import Cadastro from './pages/jovem/Cadastro';
import Sucesso from './pages/jovem/Sucesso';
import MeuCadastro from './pages/jovem/MeuCadastro';
import Completar from './pages/jovem/Completar';
import { precisaCompletar } from './lib/formato';

// O painel só é baixado por quem é admin (o celular do jovem carrega menos).
const LayoutAdmin = lazy(() => import('./pages/admin/LayoutAdmin'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Lista = lazy(() => import('./pages/admin/Lista'));
const Ficha = lazy(() => import('./pages/admin/Ficha'));
const Fila = lazy(() => import('./pages/admin/Fila'));
const Duplicados = lazy(() => import('./pages/admin/Duplicados'));
const RedeAdmin = lazy(() => import('./pages/admin/Rede'));
const Chamada = lazy(() => import('./pages/admin/Chamada'));
const ChamadaCulto = lazy(() => import('./pages/admin/ChamadaCulto'));
const Relatorios = lazy(() => import('./pages/admin/Relatorios'));
const LayoutSecretario = lazy(() => import('./pages/secretario/LayoutSecretario'));
const Acessos = lazy(() => import('./pages/admin/Acessos'));
const Avisos = lazy(() => import('./pages/rede/Avisos'));
const LayoutRede = lazy(() => import('./pages/rede/LayoutRede'));
const MinhaRede = lazy(() => import('./pages/rede/MinhaRede'));
const FichaRede = lazy(() => import('./pages/rede/FichaRede'));

function LayoutJovem() {
  return (
    <div className="relative min-h-[100dvh]">
      <Fundo variante="jovem" />
      <main className="mx-auto w-full max-w-[440px]"><Outlet /></main>
    </div>
  );
}

function SoLogado() {
  const { sessao, carregando } = useAuth();
  if (sessao === undefined || (sessao && carregando)) return <Carregando tela />;
  if (!sessao) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Área de discipulador e liderança (papel na rede, não confundir com admin). */
function SoRede() {
  const { sessao, carregando, lidera, jovem } = useAuth();
  if (sessao === undefined || (sessao && carregando)) return <Carregando tela />;
  if (!sessao) return <Navigate to="/" replace />;
  if (!lidera) return <Navigate to="/inicio" replace />;
  if (precisaCompletar(jovem)) return <Navigate to="/completar" replace />;
  return <Outlet />;
}

function SoAdmin() {
  const { sessao, carregando, admin } = useAuth();
  if (sessao === undefined || (sessao && carregando)) return <Carregando tela />;
  if (!sessao) return <Navigate to="/" replace />;
  if (!admin) return <Navigate to="/inicio" replace />;
  return <Outlet />;
}

/** Área do secretário(a). Admin que abrir /chamada vai para a chamada do painel. */
function SoSecretario() {
  const { sessao, carregando, admin, secretario } = useAuth();
  if (sessao === undefined || (sessao && carregando)) return <Carregando tela />;
  if (!sessao) return <Navigate to="/" replace />;
  if (admin) return <Navigate to="/admin/chamada" replace />;
  if (!secretario) return <Navigate to="/inicio" replace />;
  return <Outlet />;
}

/**
 * Secretário(a) só enxerga a Chamada: qualquer outra rota digitada na URL volta para lá
 * com o aviso "Você não tem acesso a esta área". (O bloqueio real é feito no banco.)
 */
function GuardaSecretario({ children }) {
  const { secretario, carregando } = useAuth();
  const { pathname } = useLocation();
  const livre = pathname === '/' || pathname === '/inicio' || pathname === '/chamada' || pathname.startsWith('/chamada/');
  if (!carregando && secretario && !livre) return <Navigate to="/chamada" replace state={{ semAcesso: true }} />;
  return children;
}

function SemConfiguracao() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center gap-6 p-8">
      <Fundo />
      <Titulo inicio="Quase " destaque="lá" />
      <Aviso tipo="alerta">
        Faltam as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>.
        Copie <code>.env.example</code> para <code>.env</code> e preencha com os dados do seu projeto Supabase.
      </Aviso>
    </div>
  );
}

export default function App() {
  if (!configurado) return <SemConfiguracao />;
  return (
    <Suspense fallback={<Carregando tela />}>
      {demo && <BarraDemo />}
      <GuardaSecretario>
      <Routes>
        <Route element={<LayoutJovem />}>
          <Route index element={<Entrar />} />
          <Route path="inicio" element={<Inicio />} />
          <Route element={<SoLogado />}>
            <Route path="vincular" element={<Vincular />} />
            <Route path="cadastro" element={<Cadastro />} />
            <Route path="sucesso" element={<Sucesso />} />
            <Route path="meu-cadastro" element={<MeuCadastro />} />
            <Route path="completar" element={<Completar />} />
          </Route>
        </Route>
        <Route path="minha-rede" element={<SoRede />}>
          <Route element={<LayoutRede />}>
            <Route index element={<MinhaRede />} />
            <Route path="avisos" element={<Avisos />} />
            <Route path=":id" element={<FichaRede />} />
          </Route>
        </Route>
        <Route path="admin" element={<SoAdmin />}>
          <Route element={<LayoutAdmin />}>
            <Route index element={<Dashboard />} />
            <Route path="jovens" element={<Lista />} />
            <Route path="jovens/:id" element={<Ficha />} />
            <Route path="validacao" element={<Fila />} />
            <Route path="duplicados" element={<Duplicados />} />
            <Route path="rede" element={<RedeAdmin />} />
            <Route path="chamada" element={<Chamada />} />
            <Route path="chamada/:id" element={<ChamadaCulto />} />
            <Route path="frequencia" element={<Relatorios />} />
            <Route path="acessos" element={<Acessos />} />
          </Route>
        </Route>
        <Route path="chamada" element={<SoSecretario />}>
          <Route element={<LayoutSecretario />}>
            <Route index element={<Chamada />} />
            <Route path=":id" element={<ChamadaCulto />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </GuardaSecretario>
    </Suspense>
  );
}
