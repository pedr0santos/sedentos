import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Carregando, Titulo, Aviso } from '../../components/Visual';
import { precisaCompletar } from '../../lib/formato';

/** Depois do login: decide para onde a pessoa vai, pelo acesso e pelo papel na rede. */
export default function Inicio() {
  const { sessao, carregando, admin, jovem, lidera, secretario, secretarioInativo, sair } = useAuth();
  if (sessao === null) return <Navigate to="/" replace />;
  if (carregando) return <Carregando tela texto="Entrando…" />;
  if (admin) return <Navigate to="/admin" replace />;
  if (secretario) return <Navigate to="/chamada" replace />;
  if (secretarioInativo) {
    return (
      <div className="flex min-h-[100dvh] flex-col justify-center gap-5 px-7">
        <Titulo inicio="Acesso " destaque="desativado" className="text-[32px]" />
        <Aviso tipo="alerta">Seu acesso de secretário(a) da chamada foi desativado. Se for engano, fale com a liderança.</Aviso>
        <button type="button" className="btn-secundario" onClick={sair}>Sair</button>
      </div>
    );
  }
  if (jovem && precisaCompletar(jovem)) return <Navigate to="/completar" replace />;
  if (lidera) return <Navigate to="/minha-rede" replace />;
  if (jovem) return <Navigate to="/meu-cadastro" replace />;
  return <Navigate to="/vincular" replace />;
}
