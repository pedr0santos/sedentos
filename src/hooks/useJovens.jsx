import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase, mensagemErro } from '../lib/supabase';
import { urlsAssinadas } from '../lib/fotos';

const Ctx = createContext(null);

/** Base completa para o painel (carregada uma vez e compartilhada entre as telas). */
export function JovensProvider({ children }) {
  const [jovens, setJovens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Só mostra "carregando" na primeira vez; depois atualiza em silêncio (a tela não pisca nem perde mensagens).
  const primeira = useRef(true);
  const recarregar = useCallback(async () => {
    if (primeira.current) setCarregando(true);
    setErro('');
    const todos = [];
    // O Supabase devolve no máximo 1000 linhas por vez.
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from('jovens').select('*').order('nome').range(de, de + 999);
      if (error) { setErro(mensagemErro(error)); break; }
      todos.push(...data);
      if (data.length < 1000) break;
    }
    setJovens(todos);
    setCarregando(false);
    primeira.current = false;
    urlsAssinadas(todos.map((j) => j.foto_url)); // pré-carrega as fotos
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  /** Atualiza um registro e devolve a versão gravada (com inconsistências recalculadas). */
  const salvar = useCallback(async (id, dados) => {
    const { data, error } = await supabase.from('jovens').update(dados).eq('id', id).select().single();
    if (error) throw new Error(mensagemErro(error));
    // Telefone/nome mexem nas inconsistências de outros registros: busca de novo quem divide os mesmos valores.
    const antes = jovens.find((j) => j.id === id);
    let vizinhos = [];
    if (antes && (antes.telefone !== data.telefone || antes.nome !== data.nome)) {
      const tels = [antes.telefone, data.telefone].filter(Boolean);
      const filtros = [
        tels.length ? `telefone.in.(${tels.join(',')})` : null,
        `nome.ilike.${JSON.stringify(antes.nome)}`,
        `nome.ilike.${JSON.stringify(data.nome)}`,
      ].filter(Boolean).join(',');
      const r = await supabase.from('jovens').select('*').or(filtros).neq('id', id);
      vizinhos = r.data ?? [];
    }
    const novos = new Map([[data.id, data], ...vizinhos.map((v) => [v.id, v])]);
    setJovens((lista) => lista.map((j) => novos.get(j.id) ?? j));
    return data;
  }, [jovens]);

  return (
    <Ctx.Provider value={{ jovens, carregando, erro, recarregar, salvar, setJovens }}>
      {children}
    </Ctx.Provider>
  );
}

export const useJovens = () => useContext(Ctx);
