import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { supabase, mensagemErro, demo } from '../../lib/supabase';
import { urlsAssinadas } from '../../lib/fotos';
import { frequencia } from '../../lib/chamada';
import { useAuth } from '../../hooks/useAuth';
import { cultosFechados } from '../../components/Frequencia';
import { Fundo, Logo, Aviso } from '../../components/Visual';
import SeletorArea from '../../components/SeletorArea';
import Icone from '../../components/Icone';

const Ctx = createContext(null);
export const useMinhaRede = () => useContext(Ctx);

/** Área do Discipulador / da Liderança: rede (campos permitidos), avisos de falta e frequência. */
export default function LayoutRede() {
  const { sair, admin } = useAuth();
  const [rede, setRede] = useState(null);
  const [avisos, setAvisos] = useState(null);
  const [freq, setFreq] = useState({});
  const [erro, setErro] = useState('');
  const { pathname } = useLocation();

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('minha_rede');
    if (error) { setErro(mensagemErro(error)); setRede([]); return; }
    setRede(data ?? []);
    urlsAssinadas((data ?? []).map((p) => p.foto_url));
  }, []);

  const carregarAvisos = useCallback(async () => {
    const { data } = await supabase.from('notificacoes').select('*, cultos(data, titulo)')
      .not('destinatario_id', 'is', null).order('criado_em', { ascending: false }).limit(150);
    setAvisos(data ?? []);
  }, []);

  const carregarFrequencia = useCallback(async () => {
    const cultos = await cultosFechados();
    if (!cultos.length) { setFreq({}); return; }
    const { data } = await supabase.from('presencas').select('culto_id, jovem_id, estado').in('culto_id', cultos.slice(0, 26).map((c) => c.id));
    const porPessoa = {};
    for (const p of data ?? []) (porPessoa[p.jovem_id] ??= {})[p.culto_id] = p.estado;
    setFreq(Object.fromEntries(Object.entries(porPessoa).map(([id, m]) => [id, frequencia(cultos, m)])));
  }, []);

  useEffect(() => { carregar(); carregarAvisos(); carregarFrequencia(); }, [carregar, carregarAvisos, carregarFrequencia]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  const eu = rede?.find((p) => p.nivel === 0);

  // Tempo real: quando a chamada é fechada, o sino atualiza sozinho.
  useEffect(() => {
    if (demo || !eu?.id) return undefined;
    const canal = supabase.channel(`avisos-${eu.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `destinatario_id=eq.${eu.id}` }, () => {
        carregarAvisos(); carregarFrequencia();
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [eu?.id, carregarAvisos, carregarFrequencia]);

  const ativos = useMemo(() => (avisos ?? []).filter((a) => !a.cancelada_em), [avisos]);
  const pendentes = ativos.filter((a) => !a.contato_feito_em);

  const marcarAviso = useCallback(async (id, campos) => {
    const agora = new Date().toISOString();
    const dados = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v === true ? agora : v]));
    setAvisos((l) => l.map((a) => (a.id === id ? { ...a, ...dados } : a)));
    await supabase.from('notificacoes').update(dados).eq('id', id);
  }, []);

  return (
    <Ctx.Provider value={{ rede, carregar, avisos: ativos, pendentes, marcarAviso, carregarAvisos, freq }}>
      <div className="relative min-h-[100dvh]">
        <Fundo variante="jovem" />
        <header className="mx-auto flex w-full max-w-[760px] items-center gap-2 px-5 pt-5">
          <Link to="/minha-rede" className="text-texto no-underline"><Logo className="text-[22px]" /></Link>
          <nav aria-label="Navegação" className="ml-auto flex items-center gap-1">
            <Link to="/minha-rede/avisos" aria-label={`Avisos: ${pendentes.length} pendentes`}
              className="relative flex h-11 w-11 items-center justify-center rounded-xl text-texto hover:bg-white/5">
              <Icone nome="sino" tamanho={22} />
              {pendentes.length > 0 && (
                <span className="absolute right-1 top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-extrabold text-texto">
                  {pendentes.length > 99 ? '99+' : pendentes.length}
                </span>
              )}
            </Link>
            <Link to="/meu-cadastro" className="btn-texto text-[13px] text-muted hover:text-texto"><Icone nome="usuario" tamanho={16} /> <span className="hidden sm:inline">Meu cadastro</span></Link>
            <button type="button" onClick={sair} className="btn-texto text-[13px] text-muted hover:text-texto"><Icone nome="sair" tamanho={16} /> <span className="hidden sm:inline">Sair</span></button>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[760px] px-5 pb-12 pt-6">
          {admin && <SeletorArea atual="rede" className="mb-6" />}
          {erro && <Aviso tipo="erro" className="mb-4">{erro}</Aviso>}
          <Outlet />
        </main>
      </div>
    </Ctx.Provider>
  );
}
