import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useJovens } from '../../hooks/useJovens';
import { FAIXAS, GRUPOS_IDADE, grupoIdade, faixaEtaria, idade, aniversarianteDoMes, MESES } from '../../lib/formato';
import { INCONSISTENCIAS } from '../../lib/inconsistencias';
import { Titulo, Carregando } from '../../components/Visual';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';
import { supabase } from '../../lib/supabase';
import { cultosFechados } from '../../components/Frequencia';
import { frequencia, hojeSP, dataCulto } from '../../lib/chamada';
import { useEffect, useState } from 'react';

/** Cards da chamada: último culto, média do mês, faltas seguidas e avisos sem contato. */
function CardsChamada({ jovens }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    (async () => {
      const cultos = await cultosFechados();
      const ids = cultos.map((c) => c.id);
      const pres = [];
      for (let i = 0; i < ids.length; i += 20) {
        const { data } = await supabase.from('presencas').select('culto_id, jovem_id, estado').in('culto_id', ids.slice(i, i + 20));
        pres.push(...(data ?? []));
      }
      const tresDias = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data: avisos } = await supabase.from('notificacoes').select('id').eq('para_admins', false)
        .is('contato_feito_em', null).is('cancelada_em', null).lt('criado_em', tresDias);
      setD({ cultos, pres, semContato: avisos?.length ?? 0 });
    })();
  }, []);
  if (!d) return null;
  const ultimo = d.cultos[0];
  const presentesUltimo = ultimo ? d.pres.filter((p) => p.culto_id === ultimo.id && p.estado === 'presente').length : null;
  const mes = hojeSP().slice(0, 7);
  const doMes = new Set(d.cultos.filter((c) => c.data.startsWith(mes)).map((c) => c.id));
  const pm = d.pres.filter((p) => doMes.has(p.culto_id));
  const p1 = pm.filter((p) => p.estado === 'presente').length; const f1 = pm.filter((p) => p.estado === 'falta').length;
  const porPessoa = new Map();
  for (const p of d.pres) { if (!porPessoa.has(p.jovem_id)) porPessoa.set(p.jovem_id, {}); porPessoa.get(p.jovem_id)[p.culto_id] = p.estado; }
  const seguidas = jovens.filter((j) => j.ativo !== false && frequencia(d.cultos, porPessoa.get(j.id) ?? {}).sequencia >= 2).length;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="t-chamada">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-chamada" className="m-0 text-lg">Chamada dos cultos</h2>
        <Link to="/admin/chamada" className="text-[13px] font-bold">Ir para a chamada</Link>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <Stat rotulo="Presentes no último culto" valor={presentesUltimo ?? '—'} sub={ultimo ? dataCulto(ultimo.data) : 'Nenhuma chamada fechada'} para={ultimo ? `/admin/chamada/${ultimo.id}` : '/admin/chamada'} />
        <Stat rotulo="Frequência média do mês" valor={p1 + f1 ? `${Math.round((p1 / (p1 + f1)) * 100)}%` : '—'} sub={`${doMes.size} culto(s) no mês`} para="/admin/frequencia" />
        <Stat rotulo="Com 2+ faltas seguidas" valor={seguidas} cor={seguidas ? 'text-[#FF7A7E]' : 'text-success'} para="/admin/frequencia#seguidas" />
        <Stat rotulo="Avisos sem contato há 3+ dias" valor={d.semContato} cor={d.semContato ? 'text-warning' : 'text-success'} para="/admin/rede" />
      </div>
    </section>
  );
}

function Stat({ rotulo, valor, sub, cor = '', destaque = false, para }) {
  const corpo = (
    <>
      <span className={`text-[13px] font-semibold ${destaque ? 'text-[#EAF4FF]' : 'text-muted'}`}>{rotulo}</span>
      <span className={`text-[34px] font-extrabold leading-tight ${cor}`}>{valor}</span>
      {sub && <span className={`text-xs ${destaque ? 'text-[#EAF4FF]' : 'text-muted'}`}>{sub}</span>}
    </>
  );
  const cls = `flex flex-col gap-1.5 rounded-2xl p-5 no-underline text-texto transition ${destaque
    ? 'shadow-[0_12px_36px_rgb(var(--secondary-rgb)/0.25)]' : 'cartao hover:border-secondary/35'}`;
  const estilo = destaque ? { background: 'var(--gradient)' } : undefined;
  return para ? <Link to={para} className={cls} style={estilo}>{corpo}</Link> : <div className={cls} style={estilo}>{corpo}</div>;
}

/** "Até 19 × 20+": uma barra única dividida em dois (100%), com número e % de cada grupo. */
function GraficoGrupos({ grupos, semData, porSexo, setPorSexo, partes }) {
  const total = grupos.reduce((s, g) => s + g.n, 0);
  const pct = (n, t = total) => (t ? Math.round((n / t) * 100) : 0);
  const resumo = grupos.map((g) => `${g.rotulo}: ${g.n} (${pct(g.n)}%)`).join(' · ');
  return (
    <section className="cartao flex flex-col gap-4 p-6" aria-labelledby="t-grupos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 id="t-grupos" className="m-0 text-lg">{grupos.map((g) => g.rotulo).join(' × ')}</h2>
          <span className="text-xs text-muted">Só jovens ativos</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#D6DDEA]">
          <input type="checkbox" checked={porSexo} onChange={(e) => setPorSexo(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--secondary)]" />
          Separar por sexo
        </label>
      </div>

      <div className="flex h-12 gap-[3px] overflow-hidden rounded-xl bg-white/[0.06]" role="img" aria-label={resumo}>
        {grupos.map((g) => g.n > 0 && (
          <Link key={g.id} to={`/admin/jovens?faixa=${encodeURIComponent(g.id)}&ativos=1`} title={`${g.rotulo}: ${g.n} (${pct(g.n)}%)`}
            className="flex h-full min-w-[44px] items-center justify-center text-sm font-extrabold text-texto no-underline transition hover:brightness-110"
            style={{ width: `${pct(g.n)}%`, background: g.cor }}>
            {pct(g.n)}%
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {grupos.map((g) => (
          <Link key={g.id} to={`/admin/jovens?faixa=${encodeURIComponent(g.id)}&ativos=1`}
            className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-dark/40 p-3.5 text-texto no-underline hover:border-secondary/40">
            <span className="flex items-center gap-2 text-[13px] font-bold">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: g.cor }} aria-hidden="true" />{g.rotuloLongo}
            </span>
            <span className="text-2xl font-extrabold leading-none">{g.n} <span className="text-sm font-semibold text-muted">({pct(g.n)}%)</span></span>
            {porSexo && (
              <>
                <span className="flex h-2.5 gap-px overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                  {partes.map(([k, , c]) => g[k] > 0 && <span key={k} className="h-full" style={{ width: `${pct(g[k], g.n)}%`, background: c }} />)}
                </span>
                <span className="flex flex-col gap-0.5 text-xs text-[#D6DDEA]">
                  {partes.map(([k, r, c]) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: c }} aria-hidden="true" />
                      {r}: <strong className="text-texto">{g[k]}</strong> ({pct(g[k], g.n)}%)
                    </span>
                  ))}
                </span>
              </>
            )}
          </Link>
        ))}
      </div>

      <span className="text-xs text-muted">
        {semData} {semData === 1 ? 'jovem' : 'jovens'} sem data de nascimento válida · toque num grupo para ver a lista.
      </span>
    </section>
  );
}

// Duas cores bem distintas (não dependem só do matiz azul do tema) + neutro para "não informado".
const COR_SEXO = { feminino: '#D2694F', masculino: '#1E9BD7', nao: 'rgb(255 255 255 / 0.22)' };

export default function Dashboard() {
  const { jovens, carregando } = useJovens();
  const [porSexo, setPorSexo] = useState(false);
  const hoje = new Date();
  const mes = hoje.getMonth() + 1;

  const d = useMemo(() => {
    const conta = (fn) => jovens.filter(fn).length;
    // Gráfico de faixa etária: só jovens ATIVOS.
    const ativos = jovens.filter((j) => j.ativo !== false);
    const faixas = FAIXAS.map((f) => {
      const da = ativos.filter((j) => faixaEtaria(j) === f.id);
      return { ...f, n: da.length, feminino: da.filter((j) => j.sexo === 'feminino').length,
        masculino: da.filter((j) => j.sexo === 'masculino').length, nao: da.filter((j) => !j.sexo).length };
    });
    const aniversariantes = jovens
      .filter((j) => aniversarianteDoMes(j, mes) && !j.inconsistencias.includes('NASCIMENTO_INVALIDO'))
      .sort((a, b) => a.data_nascimento.slice(8).localeCompare(b.data_nascimento.slice(8)));
    const incs = Object.keys(INCONSISTENCIAS)
      .map((c) => ({ c, titulo: INCONSISTENCIAS[c].titulo, n: conta((j) => j.inconsistencias.includes(c)) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    return {
      total: jovens.length,
      menores: conta((j) => { const i = idade(j.data_nascimento); return i !== null && i < 18 && !j.inconsistencias.includes('NASCIMENTO_INVALIDO'); }),
      validados: conta((j) => j.status === 'validado'),
      pendentes: conta((j) => j.status === 'pendente_validacao'),
      inconsistentes: conta((j) => j.status === 'inconsistente'),
      semFoto: conta((j) => !j.foto_url),
      soReferencia: conta((j) => !j.foto_url && j.foto_origem),
      semEmail: conta((j) => !j.email),
      semTelefone: conta((j) => !j.telefone),
      inativos: conta((j) => j.ativo === false),
      // "Até 19 × 20+": mesmos ativos do gráfico de faixas; sem data válida fica fora.
      grupos: GRUPOS_IDADE.map((g) => {
        const da = ativos.filter((j) => grupoIdade(j) === g.id);
        return { ...g, n: da.length, feminino: da.filter((j) => j.sexo === 'feminino').length,
          masculino: da.filter((j) => j.sexo === 'masculino').length, nao: da.filter((j) => !j.sexo).length };
      }),
      semDataAtivos: ativos.filter((j) => grupoIdade(j) === null).length,
      faixas, aniversariantes, incs,
      feminino: conta((j) => j.sexo === 'feminino'),
      masculino: conta((j) => j.sexo === 'masculino'),
      semSexo: conta((j) => !j.sexo),
      incompletos: conta((j) => !j.apelido || !j.sexo),
      semResponsavel: conta((j) => j.inconsistencias.includes('RESPONSAVEL_AUSENTE')),
      lideranca: conta((j) => j.papel === 'lideranca'),
      discipuladores: conta((j) => j.papel === 'discipulador'),
      jovensRede: conta((j) => j.papel === 'jovem'),
      semDiscipulador: conta((j) => j.papel === 'jovem' && !j.discipulado_por),
      discSemLider: conta((j) => j.papel === 'discipulador' && !j.discipulado_por),
      comDiscipulador: conta((j) => j.papel === 'jovem' && j.discipulado_por),
    };
  }, [jovens, mes]);

  if (carregando) return <Carregando tela />;
  const maxFaixa = Math.max(1, ...d.faixas.map((f) => f.n));
  const partes = [['feminino', 'Feminino', COR_SEXO.feminino], ['masculino', 'Masculino', COR_SEXO.masculino], ['nao', 'Não informado', COR_SEXO.nao]];

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Titulo inicio="Visão ge" destaque="ral" className="text-4xl" />
          <span className="text-sm text-muted">{d.total} jovens na base</span>
        </div>
        {d.pendentes > 0 && <Link to="/admin/validacao" className="btn-primario no-underline">Validar pendentes</Link>}
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Stat destaque rotulo="Total de jovens" valor={d.total} sub={`${d.menores} menores de 18 anos`} para="/admin/jovens" />
        <Stat rotulo="Validados" valor={d.validados} cor="text-success" para="/admin/jovens?status=validado" />
        <Stat rotulo="Pendentes" valor={d.pendentes} cor="text-warning" para="/admin/jovens?status=pendente_validacao" />
        <Stat rotulo="Inconsistentes" valor={d.inconsistentes} cor="text-[#FF7A7E]" para="/admin/jovens?status=inconsistente" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Stat rotulo="Sem foto no sistema" valor={d.semFoto} sub={`${d.soReferencia} com referência antiga`} para="/admin/jovens?semFoto=1" />
        <Stat rotulo="Sem e-mail" valor={d.semEmail} sub="Ainda não vinculados" para="/admin/jovens?semEmail=1" />
        <Stat rotulo="Sem telefone" valor={d.semTelefone} para="/admin/jovens?semTelefone=1" />
        <Stat rotulo={`Aniversariantes de ${MESES[mes - 1]}`} valor={d.aniversariantes.length} para="/admin/jovens?aniversariantes=1" />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="t-cad">
        <h2 id="t-cad" className="m-0 text-lg">Apelido, sexo e responsável</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          <Stat rotulo="Feminino" valor={d.feminino} para="/admin/jovens?sexo=feminino" />
          <Stat rotulo="Masculino" valor={d.masculino} para="/admin/jovens?sexo=masculino"
            sub={d.semSexo ? `${d.semSexo} sem sexo informado` : undefined} />
          <Stat rotulo="Cadastros incompletos" valor={d.incompletos} sub="sem apelido ou sexo" cor={d.incompletos ? 'text-warning' : 'text-success'}
            para="/admin/jovens?incompleto=1" />
          <Stat rotulo="Menores de 14 sem responsável" valor={d.semResponsavel} cor={d.semResponsavel ? 'text-[#FF7A7E]' : 'text-success'}
            para="/admin/jovens?semResponsavel=1" />
        </div>
      </section>

      <CardsChamada jovens={jovens} />

      <section className="flex flex-col gap-3" aria-labelledby="t-rede">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="t-rede" className="m-0 text-lg">Rede de discipulado</h2>
          <Link to="/admin/rede" className="text-[13px] font-bold">Ver a rede e as pendências</Link>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          <Stat rotulo="Liderança" valor={d.lideranca} para="/admin/jovens?papel=lideranca" />
          <Stat rotulo="Discipuladores" valor={d.discipuladores} para="/admin/jovens?papel=discipulador"
            sub={d.discSemLider ? `${d.discSemLider} sem liderança` : undefined} />
          <Stat rotulo="Jovens" valor={d.jovensRede} para="/admin/jovens?papel=jovem" />
          <Stat rotulo="Jovens sem discipulador" valor={d.semDiscipulador} cor={d.semDiscipulador ? 'text-warning' : 'text-success'} para="/admin/jovens?semDiscipulador=1" />
          <Stat rotulo="Média por discipulador" valor={d.discipuladores ? (d.comDiscipulador / d.discipuladores).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}
            sub="discípulos" para="/admin/rede" />
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <section className="cartao flex flex-col gap-4 p-6" aria-labelledby="t-faixa">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <h2 id="t-faixa" className="m-0 text-lg">Faixa etária</h2>
              <span className="text-xs text-muted">Só jovens ativos{d.inativos ? ` (${d.inativos} inativos fora)` : ''}</span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#D6DDEA]">
              <input type="checkbox" checked={porSexo} onChange={(e) => setPorSexo(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--secondary)]" />
              Separar por sexo
            </label>
          </div>
          {porSexo && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#D6DDEA]" aria-hidden="true">
              {partes.map(([k, r, c]) => (
                <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{r}</span>
              ))}
            </div>
          )}
          {d.faixas.map((f) => (
            <Link key={f.id} to={`/admin/jovens?faixa=${encodeURIComponent(f.id)}&ativos=1`}
              title={porSexo ? `${f.rotulo}: ${f.feminino} feminino, ${f.masculino} masculino, ${f.nao} não informado` : `${f.rotulo}: ${f.n}`}
              aria-label={porSexo ? `${f.rotulo}: ${f.feminino} feminino, ${f.masculino} masculino, ${f.nao} não informado` : undefined}
              className={`grid grid-cols-[112px_1fr_40px] items-center gap-3 rounded-lg text-texto no-underline ${f.alerta && f.n ? '-mx-2 bg-warning/[0.08] px-2 py-1.5' : ''}`}>
              <span className={`flex flex-col text-[13px] font-semibold leading-tight ${f.alerta && f.n ? 'text-warning' : 'text-muted'}`}>
                {f.alerta && f.n > 0 && <Icone nome="alerta" tamanho={13} className="mb-0.5" />}
                {f.rotulo}
                {f.alerta && f.n > 0 && <span className="text-[10px] font-bold uppercase tracking-wide">ainda é da salinha</span>}
              </span>
              <span className="h-3.5 rounded-full bg-white/[0.06]">
                {porSexo ? (
                  <span className="flex h-3.5 gap-px overflow-hidden rounded-full transition-all" style={{ width: `${(f.n / maxFaixa) * 100}%` }}>
                    {partes.map(([k, , c]) => f[k] > 0 && <span key={k} className="h-full" style={{ width: `${(f[k] / f.n) * 100}%`, background: c }} />)}
                  </span>
                ) : (
                  <span className="block h-3.5 rounded-full transition-all"
                    style={{ width: `${(f.n / maxFaixa) * 100}%`, background: f.semData ? 'rgb(255 255 255 / 0.22)' : f.alerta ? 'var(--warning)' : 'var(--gradient)' }} />
                )}
              </span>
              <span className="text-right text-sm font-extrabold">{f.n}</span>
            </Link>
          ))}
          <span className="text-xs text-muted">Toque numa faixa para ver a lista.</span>
        </section>

        <GraficoGrupos grupos={d.grupos} semData={d.semDataAtivos} porSexo={porSexo} setPorSexo={setPorSexo} partes={partes} />

        <section className="cartao flex flex-col gap-3 p-6" aria-labelledby="t-aniv">
          <div className="flex items-baseline justify-between">
            <h2 id="t-aniv" className="m-0 text-lg">Aniversariantes de {MESES[mes - 1]}</h2>
            <span className="text-[13px] font-bold text-secondary">{d.aniversariantes.length}</span>
          </div>
          {d.aniversariantes.length === 0 && <span className="text-sm text-muted">Ninguém faz aniversário este mês.</span>}
          <ul className="m-0 flex max-h-[360px] list-none flex-col gap-1 overflow-y-auto p-0">
            {d.aniversariantes.map((j) => {
              const dia = Number(j.data_nascimento.slice(8));
              const ehHoje = dia === hoje.getDate();
              return (
                <li key={j.id}>
                  <Link to={`/admin/jovens/${j.id}`} className="flex items-center gap-3 py-1.5 text-texto no-underline">
                    <Avatar caminho={j.foto_url} nome={j.nome} tamanho={34} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{j.apelido || j.nome}{j.apelido && <span className="font-normal text-muted"> {j.nome}</span>}</span>
                    <span className={`text-[13px] font-bold ${ehHoje ? 'text-secondary' : 'text-muted'}`}>
                      {ehHoje ? 'Hoje' : `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="cartao flex flex-col gap-3.5 p-6" aria-labelledby="t-incs">
        <h2 id="t-incs" className="m-0 text-lg">Inconsistências na base</h2>
        {d.incs.length === 0 && <span className="text-sm text-muted">Nenhuma inconsistência. Base limpa!</span>}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-8">
          {d.incs.map((i) => (
            <Link key={i.c} to={`/admin/jovens?inconsistencia=${i.c}`}
              className="flex items-center gap-2.5 border-b border-white/[0.06] py-2.5 text-texto no-underline hover:text-secondary">
              <span className="flex-1 text-sm">{i.titulo}</span>
              <span className="text-sm font-extrabold">{i.n}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
