import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { entrarDemo, exemploVinculacao, EMAIL_ADMIN, EMAIL_DISCIPULADOR, EMAIL_LIDERANCA, EMAIL_INCOMPLETO, EMAIL_SECRETARIO } from './clienteDemo';
import { formatarTelefone, isoParaData } from '../lib/formato';

/** Faixa do modo demonstração: atalhos para ver o sistema dos dois lados. */
export default function BarraDemo() {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const { email } = useAuth();
  const [exemplo, setExemplo] = useState(null);

  useEffect(() => { exemploVinculacao().then(setExemplo); }, [pathname]);

  const entrar = (e) => { entrarDemo(e); navegar('/inicio'); };
  const botao = 'min-h-[36px] rounded-lg px-3 text-xs font-extrabold transition';

  return (
    <div className="relative z-50 border-b border-warning/30 bg-[#1A1608] px-4 py-2.5 text-xs text-[#F7D9A4]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <span><strong className="text-warning">Demonstração.</strong> Dados de teste em memória: nada é salvo e nenhum e-mail é enviado.</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="font-bold">Entrar como:</span>
          <button type="button" className={`${botao} bg-warning/15 text-warning hover:bg-warning/25`}
            onClick={() => entrar(`jovem${Math.floor(Math.random() * 9000 + 1000)}@sedentos.demo`)}>Jovem</button>
          <button type="button" className={`${botao} bg-warning/15 text-warning hover:bg-warning/25`}
            onClick={() => entrar(EMAIL_DISCIPULADOR)}>Discipulador</button>
          <button type="button" className={`${botao} bg-warning/15 text-warning hover:bg-warning/25`}
            onClick={() => entrar(EMAIL_LIDERANCA)}>Liderança da rede</button>
          <button type="button" className={`${botao} bg-warning/15 text-warning hover:bg-warning/25`}
            onClick={() => entrar(EMAIL_ADMIN)}>Admin</button>
          <button type="button" className={`${botao} bg-warning/15 text-warning hover:bg-warning/25`}
            title="Usuário maria.chamada · senha sedentos123" onClick={() => entrar(EMAIL_SECRETARIO)}>Secretário</button>
          <button type="button" className={`${botao} bg-warning/15 text-warning hover:bg-warning/25`}
            title="Conta antiga sem apelido e sem sexo" onClick={() => entrar(EMAIL_INCOMPLETO)}>Cadastro incompleto</button>
        </div>
      </div>
      {pathname === '/vincular' && exemplo && (
        <p className="mx-auto mb-0 mt-2 max-w-6xl">
          Para testar o “Já veio antes?”, use um jovem da base: <strong className="text-texto">{formatarTelefone(exemplo.telefone)}</strong> e{' '}
          <strong className="text-texto">{isoParaData(exemplo.nascimento)}</strong>.
        </p>
      )}
      {email && <span className="sr-only">Logado como {email}</span>}
    </div>
  );
}
