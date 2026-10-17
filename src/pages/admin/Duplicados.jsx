import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { useJovens } from '../../hooks/useJovens';
import { formatarTelefone, isoParaData, idade } from '../../lib/formato';
import { Titulo, Carregando, Aviso } from '../../components/Visual';
import Avatar from '../../components/Avatar';

const descreverFoto = (j) => (j.foto_url ? 'Foto no sistema' : j.foto_origem ? (/^https?:/i.test(j.foto_origem) ? 'Link do Google Drive' : `Arquivo: ${j.foto_origem}`) : 'Sem foto');

// Campos que a liderança escolhe quando os dois registros discordam.
const CAMPOS = [
  { id: 'nome', rotulo: 'Nome', ler: (j) => j.nome, mostrar: (j) => j.nome },
  { id: 'telefone', rotulo: 'Telefone', ler: (j) => j.telefone, mostrar: (j) => formatarTelefone(j.telefone) || 'Sem telefone' },
  { id: 'data_nascimento', rotulo: 'Nascimento', ler: (j) => j.data_nascimento, mostrar: (j) => isoParaData(j.data_nascimento) || 'Sem data' },
  { id: 'foto', rotulo: 'Foto', ler: (j) => `${j.foto_url}|${j.foto_origem}`, mostrar: descreverFoto },
];

/** Qual registro manter por padrão: o vinculado a e-mail; senão o que tem mais dados. */
function sugerirManter(a, b) {
  if (a.user_id && !b.user_id) return 'a';
  if (b.user_id && !a.user_id) return 'b';
  const pontos = (j) => (j.foto_url ? 3 : j.foto_origem ? 1 : 0) + (j.email ? 2 : 0) + j.nome.split(' ').length * 0.1;
  return pontos(b) > pontos(a) ? 'b' : 'a';
}

function Par({ par, a, b, aoResolver }) {
  const [manter, setManter] = useState(() => sugerirManter(a, b));
  const [escolhas, setEscolhas] = useState(() => {
    const e = {};
    for (const c of CAMPOS) {
      if (c.ler(a) === c.ler(b)) continue;
      // Por padrão: o valor preenchido / mais completo.
      const va = c.ler(a), vb = c.ler(b);
      if (c.id === 'nome') e[c.id] = vb.length > va.length ? 'b' : 'a';
      else if (c.id === 'foto') e[c.id] = b.foto_url || (!a.foto_url && b.foto_origem && !a.foto_origem) ? 'b' : 'a';
      else e[c.id] = va ? 'a' : 'b';
    }
    return e;
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const diferentes = CAMPOS.filter((c) => c.ler(a) !== c.ler(b));
  const ambosVinculados = a.user_id && b.user_id;

  const mesclar = async () => {
    setOcupado(true); setErro('');
    const fonte = (lado) => (lado === 'a' ? a : b);
    const dados = {};
    for (const c of diferentes) {
      const j = fonte(escolhas[c.id]);
      if (c.id === 'foto') { dados.foto_url = j.foto_url; dados.foto_origem = j.foto_origem; }
      else dados[c.id] = j[c.id];
    }
    const [m, r] = manter === 'a' ? [a, b] : [b, a];
    const { error } = await supabase.rpc('mesclar_jovens', { p_manter: m.id, p_remover: r.id, p_dados: dados });
    setOcupado(false);
    if (error) { setErro(mensagemErro(error)); return; }
    aoResolver();
  };

  const ignorar = async () => {
    setOcupado(true); setErro('');
    const { error } = await supabase.rpc('ignorar_duplicado', { p_a: a.id, p_b: b.id });
    setOcupado(false);
    if (error) { setErro(mensagemErro(error)); return; }
    aoResolver();
  };

  const nomePar = a.nome.toLowerCase() === b.nome.toLowerCase() ? a.nome : `${a.nome} e ${b.nome}`;
  const prova = par.mesmo_nascimento;

  return (
    <section className="cartao flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 text-lg">{nomePar}</h2>
        <span className={`badge ${prova ? 'bg-secondary/15 text-[#9FDCF5]' : 'bg-warning/15 text-warning'}`}>
          {par.motivo}{prova ? ' · mesmo nascimento' : ' · nascimentos diferentes'}
        </span>
      </div>
      {!prova && (
        <p className="m-0 text-sm leading-relaxed text-[#D6DDEA]">
          Nomes ou nascimentos diferentes: pode ser o telefone de um responsável. Confirme antes de mesclar.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[['a', a], ['b', b]].map(([lado, j]) => (
          <label key={lado} className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition
            ${manter === lado ? 'border-secondary bg-secondary/10' : 'border-white/10 bg-white/[0.03]'}`}>
            <input type="radio" name={`manter-${a.id}`} checked={manter === lado} onChange={() => setManter(lado)}
              className="h-[18px] w-[18px] accent-[var(--secondary)]" />
            <Avatar caminho={j.foto_url} nome={j.nome} tamanho={40} />
            <span className="flex min-w-0 flex-col">
              <Link to={`/admin/jovens/${j.id}`} className="truncate text-sm font-bold text-texto" onClick={(e) => e.stopPropagation()}>{j.nome}</Link>
              <span className="text-xs text-muted">
                {j.inconsistencias.includes('NASCIMENTO_INVALIDO') ? 'idade inválida' : `${idade(j.data_nascimento) ?? '?'} anos`}
                {j.email ? ` · ${j.email}` : ' · sem e-mail'}
              </span>
            </span>
            {manter === lado && <span className="badge ml-auto bg-secondary/20 text-texto">Manter</span>}
          </label>
        ))}
      </div>

      {diferentes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="pb-2 text-left text-xs font-bold text-muted">Escolha qual dado fica em cada campo</caption>
            <tbody>
              {diferentes.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="w-28 border-b border-white/5 py-2 pr-3 text-left text-[13px] font-semibold text-muted">{c.rotulo}</th>
                  {[['a', a], ['b', b]].map(([lado, j]) => (
                    <td key={lado} className="border-b border-white/5 py-1 pr-3">
                      <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5">
                        <input type="radio" name={`${c.id}-${a.id}`} checked={escolhas[c.id] === lado}
                          onChange={() => setEscolhas((e) => ({ ...e, [c.id]: lado }))}
                          className="h-[18px] w-[18px] shrink-0 accent-[var(--secondary)]" />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{c.mostrar(j)}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <span className="text-sm text-muted">Os dois registros têm os mesmos dados principais.</span>
      )}

      {ambosVinculados && <Aviso tipo="alerta">Os dois já estão ligados a e-mails diferentes. Não dá para mesclar.</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={prova ? 'btn-primario' : 'btn-secundario'} disabled={ocupado || ambosVinculados} onClick={mesclar}>
          {prova ? 'Mesclar registros' : 'Mesclar mesmo assim'}
        </button>
        <button type="button" className={prova ? 'btn-secundario' : 'btn-primario'} disabled={ocupado} onClick={ignorar}>
          São pessoas diferentes
        </button>
      </div>
    </section>
  );
}

export default function Duplicados() {
  const { jovens, carregando, recarregar } = useJovens();
  const [pares, setPares] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const buscar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_duplicados');
    if (error) setErro(mensagemErro(error));
    else setPares(data);
  }, []);
  useEffect(() => { buscar(); }, [buscar]);

  if (carregando || pares === null) return erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando tela />;
  const porId = new Map(jovens.map((j) => [j.id, j]));
  const visiveis = pares.filter((p) => porId.has(p.a_id) && porId.has(p.b_id));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Titulo inicio="Dupli" destaque="cados" className="text-4xl" />
        <span className="max-w-[640px] text-sm leading-relaxed text-muted">
          Registros com o mesmo telefone, ou com o mesmo nome e nascimento. Nada é mesclado sozinho: você escolhe o que fica.
        </span>
      </header>
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {visiveis.length === 0 && <div className="cartao p-10 text-center text-sm text-muted">Nenhum possível duplicado.</div>}
      {visiveis.map((p) => (
        <Par key={`${p.a_id}-${p.b_id}`} par={p} a={porId.get(p.a_id)} b={porId.get(p.b_id)}
          aoResolver={async () => { setAviso('Pronto! Grupo resolvido.'); await recarregar(); await buscar(); }} />
      ))}
    </div>
  );
}
