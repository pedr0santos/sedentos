import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, demo } from '../../lib/supabase';
import { useJovens } from '../../hooks/useJovens';
import { frequencia, hojeSP, somarDias, ddmm, dataCulto, ESTADOS } from '../../lib/chamada';
import { exportarFrequencia } from '../../lib/exportar';
import { Titulo, Carregando, Aviso, Campo } from '../../components/Visual';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

/** Barras de presentes por sábado: uma série, rótulo no último e no maior valor, valor exato no toque/hover. */
function GraficoPresentes({ pontos }) {
  const [foco, setFoco] = useState(null);
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  const iMax = pontos.findIndex((p) => p.valor === max);
  const rotular = (i) => i === pontos.length - 1 || i === iMax;
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="relative flex h-48 items-end gap-1.5 border-b border-white/10 pt-6" role="img"
        aria-label={`Presentes por sábado: ${pontos.map((p) => `${ddmm(p.data)} ${p.valor}`).join(', ')}`}>
        {/* linhas de grade discretas */}
        {[0.5, 1].map((f) => (
          <div key={f} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-white/[0.05]" style={{ bottom: `${f * 100 * 0.86}%` }} />
        ))}
        {pontos.map((p, i) => (
          <button key={p.id} type="button" onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)}
            className="relative flex h-full min-w-0 flex-1 items-end justify-center" aria-label={`${dataCulto(p.data)}: ${p.valor} presentes`}>
            {(rotular(i) || foco === i) && (
              <span className={`absolute text-xs font-extrabold ${foco === i ? 'rounded bg-[#141B2B] px-1.5 py-0.5 text-texto' : 'text-[#D6DDEA]'}`}
                style={{ bottom: `calc(${(p.valor / max) * 86}% + 4px)` }}>{p.valor}</span>
            )}
            <span className="block w-full max-w-[28px] rounded-t transition-[filter]"
              style={{ height: `${(p.valor / max) * 86}%`, background: 'var(--secondary)', filter: foco === null || foco === i ? 'none' : 'brightness(0.6)' }} />
          </button>
        ))}
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {pontos.map((p) => <span key={p.id} className="flex-1 text-center text-[10px] text-muted">{ddmm(p.data)}</span>)}
      </div>
    </figure>
  );
}

export default function Relatorios() {
  const { jovens, carregando } = useJovens();
  const [cultos, setCultos] = useState(null);
  const [presencas, setPresencas] = useState([]);
  const [de, setDe] = useState(somarDias(hojeSP(), -91));
  const [ate, setAte] = useState(hojeSP());
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    (async () => {
      const { data: cs } = await supabase.from('cultos').select('id, data, titulo').eq('status', 'fechado')
        .gte('data', somarDias(hojeSP(), -365)).order('data', { ascending: false });
      setCultos(cs ?? []);
      const ids = (cs ?? []).map((c) => c.id);
      if (ids.length) {
        const todas = [];
        for (let i = 0; i < ids.length; i += 20) {
          const { data } = await supabase.from('presencas').select('culto_id, jovem_id, estado').in('culto_id', ids.slice(i, i + 20));
          todas.push(...(data ?? []));
        }
        setPresencas(todas);
      }
    })();
  }, []);

  const dados = useMemo(() => {
    if (!cultos) return null;
    const porPessoa = new Map();
    for (const p of presencas) {
      if (!porPessoa.has(p.jovem_id)) porPessoa.set(p.jovem_id, {});
      porPessoa.get(p.jovem_id)[p.culto_id] = p.estado;
    }
    const limite3m = somarDias(hojeSP(), -91);
    const recentes = cultos.filter((c) => c.data >= limite3m);
    const pontos = [...recentes].reverse().map((c) => ({ ...c, valor: presencas.filter((p) => p.culto_id === c.id && p.estado === 'presente').length }));
    const ativos = jovens.filter((j) => j.ativo !== false);
    const freq = new Map(ativos.map((j) => [j.id, frequencia(cultos, porPessoa.get(j.id) ?? {})]));
    const ranking = ativos.map((j) => ({ j, f: freq.get(j.id) })).filter((x) => x.f.sequencia >= 2)
      .sort((a, b) => b.f.sequencia - a.f.sequencia || a.j.nome.localeCompare(b.j.nome));
    const porDisc = jovens.filter((d) => d.papel === 'discipulador').map((d) => {
      const seus = ativos.filter((j) => j.discipulado_por === d.id).map((j) => freq.get(j.id)).filter((f) => f.percentual !== null);
      return { d, n: seus.length, media: seus.length ? Math.round(seus.reduce((s, f) => s + f.percentual, 0) / seus.length) : null };
    }).sort((a, b) => (a.media ?? 101) - (b.media ?? 101));
    return { pontos, ranking, porDisc, porPessoa };
  }, [cultos, presencas, jovens]);

  if (carregando || !dados) return <Carregando tela />;

  const exportar = async (tipo) => {
    if (demo) { setAviso('Nesta demonstração o navegador bloqueia downloads. No sistema publicado, o arquivo é baixado com uma coluna por sábado.'); return; }
    const periodo = cultos.filter((c) => c.data >= de && c.data <= ate).reverse();
    const porId = new Map(jovens.map((j) => [j.id, j]));
    await exportarFrequencia(tipo, jovens.filter((j) => j.ativo !== false), periodo, dados.porPessoa, porId);
  };

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/chamada" className="btn-texto self-start px-0">← Chamada</Link>
      <Titulo inicio="Frequên" destaque="cia" className="text-4xl" />

      <section className="cartao flex flex-col gap-3 p-6" aria-labelledby="t-graf">
        <h2 id="t-graf" className="m-0 text-lg">Presentes por sábado · últimos 3 meses</h2>
        {dados.pontos.length === 0 ? <span className="text-sm text-muted">Nenhuma chamada fechada nesse período.</span> : <GraficoPresentes pontos={dados.pontos} />}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <section id="seguidas" className="cartao flex flex-col gap-3 p-6" aria-labelledby="t-rank">
          <h2 id="t-rank" className="m-0 text-lg">Faltas seguidas agora</h2>
          {dados.ranking.length === 0 && <span className="text-sm text-muted">Ninguém com 2 ou mais faltas seguidas.</span>}
          {dados.ranking.length > 0 && <span className="text-[13px] text-muted">{dados.ranking.length} pessoas · as sequências mais longas primeiro</span>}
          <ol className="m-0 flex max-h-[520px] list-none flex-col gap-1 overflow-y-auto p-0">
            {dados.ranking.map(({ j, f }) => (
              <li key={j.id}>
                <Link to={`/admin/jovens/${j.id}`} className="flex items-center gap-3 rounded-xl px-1 py-1.5 text-texto no-underline hover:bg-white/5">
                  <Avatar caminho={j.foto_url} nome={j.nome} tamanho={32} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{j.nome}</span>
                  <span className="badge bg-danger/15 text-[#FF8A8E]">{f.sequencia} seguidas</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="cartao flex flex-col gap-3 p-6" aria-labelledby="t-disc">
          <h2 id="t-disc" className="m-0 text-lg">Frequência média por discipulador</h2>
          {dados.porDisc.length === 0 && <span className="text-sm text-muted">Nenhum discipulador ainda.</span>}
          <table className="w-full border-collapse text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-bold">Discipulador</th><th className="pb-2 text-right font-bold">Discípulos</th><th className="pb-2 text-right font-bold">Média</th></tr></thead>
            <tbody>
              {dados.porDisc.map(({ d, n, media }) => (
                <tr key={d.id} className="border-t border-white/5">
                  <td className="py-2"><Link to={`/admin/jovens/${d.id}`} className="text-texto no-underline hover:text-secondary">{d.nome}</Link></td>
                  <td className="py-2 text-right tabular-nums">{n}</td>
                  <td className={`py-2 text-right font-extrabold tabular-nums ${media !== null && media < 50 ? 'text-warning' : ''}`}>{media === null ? '—' : `${media}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="cartao flex flex-col gap-3 p-6" aria-labelledby="t-exp">
        <h2 id="t-exp" className="m-0 text-lg">Exportar frequência</h2>
        <p className="m-0 text-[13px] text-muted">Uma linha por pessoa ativa e uma coluna por sábado do período, com {Object.values(ESTADOS).map((e) => e.rotulo.toLowerCase()).join(', ')}.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Campo id="exp-de" rotulo="De"><input id="exp-de" type="date" className="campo h-12" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
          <Campo id="exp-ate" rotulo="Até"><input id="exp-ate" type="date" className="campo h-12" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
          <button type="button" className="btn-secundario min-h-[48px] text-[13px]" onClick={() => exportar('xlsx')}><Icone nome="baixar" tamanho={16} /> Excel</button>
          <button type="button" className="btn-secundario min-h-[48px] text-[13px]" onClick={() => exportar('csv')}><Icone nome="baixar" tamanho={16} /> CSV</button>
        </div>
        {aviso && <Aviso>{aviso}</Aviso>}
      </section>
    </div>
  );
}
