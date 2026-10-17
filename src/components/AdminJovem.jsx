// Peças compartilhadas pela Ficha e pela Fila de validação.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { INCONSISTENCIAS } from '../lib/inconsistencias';
import { isoParaData, dataParaIso, mascaraData, soDigitos, formatarTelefone, mascaraTelefone, idade, SEXOS, IDADE_RESPONSAVEL } from '../lib/formato';
import { enviarFoto, urlsAssinadas } from '../lib/fotos';
import { Campo, Aviso } from './Visual';
import FotoPicker from './FotoPicker';
import Icone from './Icone';

/** Admin pode digitar números estrangeiros (com +DDI); brasileiros ganham a máscara. */
export function mascaraTelefoneLivre(v) {
  const s = String(v ?? '');
  const d = soDigitos(s);
  if (s.trim().startsWith('+') || d.length > 11) return d ? `+${d}` : '+';
  return mascaraTelefone(d);
}

export function valoresDoJovem(j) {
  return {
    nome: j.nome ?? '',
    apelido: j.apelido ?? '',
    sexo: j.sexo ?? null,
    email: j.email ?? '',
    telefone: j.telefone ? (j.telefone.length > 11 ? `+${j.telefone}` : formatarTelefone(j.telefone)) : '',
    nascimento: isoParaData(j.data_nascimento),
    responsavelNome: j.responsavel_nome ?? '',
    responsavelTelefone: j.responsavel_telefone ? formatarTelefone(j.responsavel_telefone) : '',
    observacoes: j.observacoes_admin ?? '',
  };
}

/** Converte o formulário para colunas do banco. Lança erro com mensagem amigável. */
export function valoresParaBanco(v) {
  const nome = v.nome.trim();
  if (!nome) throw new Error('O nome não pode ficar vazio.');
  let data_nascimento = null;
  if (v.nascimento.trim()) {
    data_nascimento = dataParaIso(v.nascimento);
    if (!data_nascimento) throw new Error('Data de nascimento inválida. Use DD/MM/AAAA.');
  }
  const apelido = String(v.apelido ?? '').trim().replace(/\s+/g, ' ');
  if (apelido && (apelido.length < 2 || apelido.length > 30)) throw new Error('O apelido precisa ter de 2 a 30 letras.');
  const email = v.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('E-mail inválido.');
  return {
    nome,
    apelido: apelido || null,
    sexo: v.sexo || null,
    email: email || null,
    telefone: soDigitos(v.telefone) || null,
    data_nascimento,
    responsavel_nome: v.responsavelNome.trim() || null,
    responsavel_telefone: soDigitos(v.responsavelTelefone) || null,
    observacoes_admin: v.observacoes.trim() || null,
  };
}

const destaqueCampo = {
  nome: ['NOME_INCOMPLETO', 'NOME_CAIXA_BAIXA', 'POSSIVEL_DUPLICADO'],
  telefone: ['TELEFONE_AUSENTE', 'TELEFONE_DUPLICADO', 'TELEFONE_FORMATO_INVALIDO'],
  nascimento: ['NASCIMENTO_INVALIDO'],
  email: ['EMAIL_AUSENTE'],
  apelido: ['APELIDO_AUSENTE'],
  sexo: ['SEXO_AUSENTE'],
  responsavelNome: ['RESPONSAVEL_AUSENTE'],
  responsavelTelefone: ['RESPONSAVEL_AUSENTE'],
};

/** Feminino / Masculino / Não informado, em botões compactos. */
function SexoAdmin({ id, valor, onChange, erro }) {
  const op = [...Object.entries(SEXOS), [null, 'Não informado']];
  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-r`} className="rotulo">Sexo</span>
      <div id={id} role="radiogroup" aria-labelledby={`${id}-r`} className="grid grid-cols-3 gap-1.5">
        {op.map(([k, r]) => (
          <button key={r} type="button" role="radio" aria-checked={valor === k} onClick={() => onChange(k)}
            className={`h-12 rounded-[10px] border px-1 text-[13px] font-bold transition
              ${valor === k ? 'border-transparent text-texto' : `${erro ? 'border-danger/60' : 'border-secondary/25'} bg-dark/60 text-texto/80 hover:border-secondary/60`}`}
            style={valor === k ? { background: k ? 'var(--gradient)' : 'rgb(255 255 255 / 0.12)' } : undefined}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CamposAdmin({ valores, onChange, inconsistencias = [], completo = true, prefixo = 'f' }) {
  const muda = (c) => (e) => {
    let v = e.target.value;
    if (c === 'telefone' || c === 'responsavelTelefone') v = mascaraTelefoneLivre(v);
    if (c === 'nascimento') v = mascaraData(v);
    onChange({ ...valores, [c]: v });
  };
  const cls = (c) => `campo h-12 text-sm ${destaqueCampo[c]?.some((x) => inconsistencias.includes(x)) ? 'campo-erro' : ''}`;
  const id = (c) => `${prefixo}-${c}`;
  const iso = dataParaIso(valores.nascimento);
  const anos = iso ? idade(iso) : null;
  const semResp = anos !== null && anos >= 5 && anos < IDADE_RESPONSAVEL && (!valores.responsavelNome.trim() || !soDigitos(valores.responsavelTelefone));
  return (
    <div className="flex flex-col gap-4">
      {semResp && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/[0.12] px-4 py-3 text-[13px] leading-relaxed">
          <Icone nome="alerta" className="mt-0.5 shrink-0 text-[#FF8A8E]" />
          <span><strong className="text-[#FF8A8E]">Menor de 14 anos sem responsável.</strong> Preencha o nome e o telefone de um dos pais ou responsável.</span>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <Campo id={id('nome')} rotulo="Nome completo"><input id={id('nome')} className={cls('nome')} value={valores.nome} onChange={muda('nome')} /></Campo>
        <Campo id={id('apelido')} rotulo="Apelido"><input id={id('apelido')} maxLength={30} className={cls('apelido')} placeholder="Como gosta de ser chamado(a)" value={valores.apelido} onChange={muda('apelido')} /></Campo>
        <SexoAdmin id={id('sexo')} valor={valores.sexo} erro={inconsistencias.includes('SEXO_AUSENTE')} onChange={(v) => onChange({ ...valores, sexo: v })} />
        <Campo id={id('email')} rotulo="E-mail"><input id={id('email')} type="email" className={cls('email')} placeholder="Ainda não vinculado" value={valores.email} onChange={muda('email')} /></Campo>
        <Campo id={id('telefone')} rotulo="Telefone"><input id={id('telefone')} inputMode="tel" className={cls('telefone')} placeholder="(31) 99999-9999" value={valores.telefone} onChange={muda('telefone')} /></Campo>
        <Campo id={id('nascimento')} rotulo="Nascimento"><input id={id('nascimento')} inputMode="numeric" className={cls('nascimento')} placeholder="DD/MM/AAAA" value={valores.nascimento} onChange={muda('nascimento')} /></Campo>
        <Campo id={id('rn')} rotulo="Responsável"><input id={id('rn')} className={cls('responsavelNome')} value={valores.responsavelNome} onChange={muda('responsavelNome')} /></Campo>
        <Campo id={id('rt')} rotulo="Telefone do responsável"><input id={id('rt')} inputMode="tel" className={cls('responsavelTelefone')} placeholder="(31) 99999-9999" value={valores.responsavelTelefone} onChange={muda('responsavelTelefone')} /></Campo>
      </div>
      {completo && (
        <Campo id={id('obs')} rotulo="Observações da liderança">
          <textarea id={id('obs')} className="campo h-24 resize-y py-3 text-sm" placeholder="Anotações internas, visíveis só para admins"
            value={valores.observacoes} onChange={muda('observacoes')} />
        </Campo>
      )}
    </div>
  );
}

export function BlocoInconsistencias({ codigos }) {
  if (!codigos.length) return <Aviso tipo="ok">Nenhuma inconsistência. Pronto para validar.</Aviso>;
  return (
    <section className="flex flex-col gap-2.5" aria-label="Inconsistências">
      <h2 className="m-0 text-base text-[#FF8A8E]">{codigos.length} {codigos.length === 1 ? 'inconsistência' : 'inconsistências'}</h2>
      {codigos.map((c) => {
        const i = INCONSISTENCIAS[c] ?? { titulo: c, explicacao: '', acao: '' };
        return (
          <div key={c} className="flex gap-3 rounded-xl border border-danger/25 bg-danger/[0.07] px-4 py-3">
            <Icone nome="alerta" className="mt-0.5 shrink-0 text-[#FF8A8E]" />
            <div className="flex flex-col gap-1 text-[13px] leading-relaxed">
              <strong className="text-sm">{i.titulo}</strong>
              <span className="text-[#D6DDEA]">{i.explicacao} <span className="text-texto">{i.acao}</span></span>
              {(c === 'TELEFONE_DUPLICADO' || c === 'POSSIVEL_DUPLICADO') && <Link to="/admin/duplicados" className="text-[13px] font-bold">Revisar em Duplicados</Link>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Foto atual + referência antiga + envio manual pelo admin. */
export function FotoAdmin({ jovem, onEnviada, tamanho = 168 }) {
  const [previa, setPrevia] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setPrevia(null);
    if (jovem.foto_url) urlsAssinadas([jovem.foto_url]).then((m) => setPrevia(m[jovem.foto_url]));
  }, [jovem.id, jovem.foto_url]);

  const enviar = async (arquivo, url) => {
    setErro(''); setEnviando(true); setPrevia(url);
    try {
      const caminho = await enviarFoto(arquivo, `admin/${jovem.id}`);
      await onEnviada(caminho);
    } catch (e) {
      setErro(e.message || 'Falha ao enviar a foto.');
      setPrevia(null);
    } finally {
      setEnviando(false);
    }
  };

  const ref = jovem.foto_origem;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <FotoPicker previa={previa} onChange={enviar} tamanho={tamanho} rotulo="Enviar foto" erro={erro} />
      {enviando && <span className="text-xs text-muted">Enviando…</span>}
      {!jovem.foto_url && ref && (
        <div className="w-full rounded-xl bg-white/[0.04] px-3 py-2.5 text-left text-xs leading-relaxed text-muted">
          <span className="font-bold text-texto">Referência da planilha antiga:</span>{' '}
          {/^https?:\/\//i.test(ref)
            ? <a href={ref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all font-bold"><Icone nome="link" tamanho={13} /> abrir link da foto</a>
            : <span className="break-all">{ref}</span>}
        </div>
      )}
    </div>
  );
}
