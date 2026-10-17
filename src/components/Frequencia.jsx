import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { frequencia, hojeSP, somarDias, ddmm, ESTADOS } from '../lib/chamada';

/** Busca os cultos fechados dos últimos 6 meses (mais recentes primeiro). */
export async function cultosFechados() {
  const { data } = await supabase.from('cultos').select('id, data, titulo')
    .eq('status', 'fechado').gte('data', somarDias(hojeSP(), -182)).order('data', { ascending: false });
  return data ?? [];
}

export function BadgeSequencia({ n, limite = 2 }) {
  if (!n || n < limite) return null;
  return <span className="badge bg-danger/15 text-[#FF8A8E]">{n} faltas seguidas</span>;
}

/** Linha do tempo com bolinhas: verde presente, vermelho falta, cinza justificada; contorno = fora da chamada. */
export function LinhaTempo({ linha }) {
  return (
    <div className="flex flex-col gap-2">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="Últimos sábados">
        {linha.map((c) => {
          const e = c.estado ? ESTADOS[c.estado] : null;
          return (
            <li key={c.id} title={`${ddmm(c.data)}: ${e ? e.rotulo : 'fora da chamada'}`}
              className="flex flex-col items-center gap-1">
              <span className="block h-5 w-5 rounded-full border-2"
                style={e ? { background: e.cor, borderColor: e.cor } : { borderColor: 'rgb(255 255 255 / 0.18)' }} />
              <span className="text-[10px] text-muted">{ddmm(c.data).slice(0, 2)}</span>
              <span className="sr-only">{ddmm(c.data)}: {e ? e.rotulo : 'fora da chamada'}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted" aria-hidden="true">
        {['presente', 'falta', 'justificada'].map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ESTADOS[k].cor }} />{ESTADOS[k].rotulo}</span>
        ))}
      </div>
    </div>
  );
}

/** Seção "Frequência" de uma pessoa (ficha do admin e do discipulador). */
export default function Frequencia({ jovemId, titulo = 'Frequência' }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const cultos = await cultosFechados();
      const { data } = await supabase.from('presencas').select('culto_id, estado').eq('jovem_id', jovemId);
      const m = Object.fromEntries((data ?? []).map((p) => [p.culto_id, p.estado]));
      if (vivo) setDados({ cultos, f: frequencia(cultos, m) });
    })();
    return () => { vivo = false; };
  }, [jovemId]);

  if (!dados) return <span className="text-sm text-muted">Carregando frequência…</span>;
  const { f, cultos } = dados;
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base">{titulo}</h2>
        <BadgeSequencia n={f.sequencia} />
      </div>
      {cultos.length === 0 ? (
        <span className="text-sm text-muted">Nenhuma chamada fechada ainda.</span>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl font-extrabold">{f.percentual === null ? '—' : `${f.percentual}%`}</span>
            <span className="text-[13px] text-muted">
              de presença nos últimos 3 meses ({f.presentes} presenças, {f.faltas} faltas)
            </span>
          </div>
          <LinhaTempo linha={f.linha} />
        </>
      )}
    </section>
  );
}
