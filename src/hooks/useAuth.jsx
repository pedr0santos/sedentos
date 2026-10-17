import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const Ctx = createContext(null);

/** Sessão + perfil (é admin? já tem cadastro?) disponíveis em todo o app. */
export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(undefined); // undefined = carregando
  const vazio = { carregando: false, admin: false, secretario: false, secretarioInativo: false, nomeSecretario: null, jovem: null };
  const [perfil, setPerfil] = useState({ ...vazio, carregando: true });

  const carregarPerfil = useCallback(async (s) => {
    if (!s) {
      setPerfil(vazio);
      return;
    }
    setPerfil((p) => ({ ...p, carregando: true }));
    // meus_acessos decide o roteamento: admin, secretário, rede ou jovem.
    const { data: a } = await supabase.rpc('meus_acessos');
    if (a?.secretario || a?.secretario_inativo) {
      // Conta de secretário: não tem cadastro de jovem (nem tenta vincular).
      setPerfil({ ...vazio, admin: Boolean(a.admin), secretario: Boolean(a.secretario),
        secretarioInativo: Boolean(a.secretario_inativo), nomeSecretario: a.nome_secretario ?? null });
      return;
    }
    // Se um admin já cadastrou este e-mail (ex.: discipulador), o login é ligado automaticamente.
    await supabase.rpc('vincular_por_email');
    const { data: jovem } = await supabase.from('jovens').select('*').eq('user_id', s.user.id).maybeSingle();
    setPerfil({ ...vazio, admin: Boolean(a?.admin), jovem: jovem ?? null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      carregarPerfil(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') carregarPerfil(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [carregarPerfil]);

  const valor = {
    sessao,
    email: sessao?.user?.email ?? null,
    uid: sessao?.user?.id ?? null,
    carregando: sessao === undefined || perfil.carregando,
    admin: perfil.admin,
    /** Só faz a chamada (e não é admin). */
    secretario: perfil.secretario && !perfil.admin,
    secretarioInativo: perfil.secretarioInativo && !perfil.admin,
    nomeSecretario: perfil.nomeSecretario,
    jovem: perfil.jovem,
    papel: perfil.jovem?.papel ?? null,
    lidera: perfil.jovem?.papel === 'discipulador' || perfil.jovem?.papel === 'lideranca',
    recarregar: () => carregarPerfil(sessao),
    setJovem: (jovem) => setPerfil((p) => ({ ...p, jovem })),
    sair: () => supabase.auth.signOut(),
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
