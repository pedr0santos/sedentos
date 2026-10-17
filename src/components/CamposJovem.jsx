// Campos do cadastro usados no formulário completo e em "Complete seu cadastro".
import { Campo } from './Visual';
import { mascaraTelefone, SEXOS } from '../lib/formato';

const classe = (erro) => `campo ${erro ? 'campo-erro' : ''}`;

export function CampoApelido({ valor, onChange, onBlur, erro }) {
  return (
    <Campo id="apelido" rotulo="Apelido" erro={erro} dica="Como você gosta de ser chamado(a)?">
      <input id="apelido" maxLength={30} autoComplete="nickname" placeholder="Ex.: Júlia, Juju" value={valor}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        aria-invalid={Boolean(erro)} aria-describedby={erro ? 'apelido-erro' : undefined} className={classe(erro)} />
    </Campo>
  );
}

/** Dois botões grandes lado a lado; o escolhido fica com o gradiente. */
export function CampoSexo({ valor, onChange, erro }) {
  return (
    <div className="flex flex-col gap-2">
      <span id="sexo-rotulo" className="rotulo">Sexo</span>
      <div id="sexo" role="radiogroup" aria-labelledby="sexo-rotulo" aria-describedby={erro ? 'sexo-erro' : undefined} tabIndex={-1}
        className="grid grid-cols-2 gap-2.5 outline-none">
        {Object.entries(SEXOS).map(([k, r]) => (
          <button key={k} type="button" role="radio" aria-checked={valor === k} onClick={() => onChange(k)}
            className={`min-h-[52px] rounded-[10px] border text-[15px] font-bold transition duration-150
              ${valor === k ? 'border-transparent text-texto shadow-[0_8px_24px_rgb(var(--secondary-rgb)/0.25)]'
                : `${erro ? 'border-danger/60' : 'border-secondary/25'} bg-dark/60 text-texto/85 hover:border-secondary/60`}`}
            style={valor === k ? { background: 'var(--gradient)' } : undefined}>
            {r}
          </button>
        ))}
      </div>
      {erro && <span id="sexo-erro" className="text-xs font-semibold text-[#FF8A8E]">{erro}</span>}
    </div>
  );
}

/** "Dados do responsável" (aparece só para menores de 14). */
export function BlocoResponsavel({ nome, telefone, telefoneJovem, mesmo, onChange, erros = {}, onBlur }) {
  return (
    <div className="anim-subir flex flex-col gap-3 rounded-[14px] border border-secondary/20 bg-dark/50 p-4">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[15px] font-extrabold">Dados do responsável</span>
        <span className="badge bg-danger/15 uppercase tracking-wide text-[#FF8A8E]">Obrigatório</span>
      </div>
      <span className="text-[13px] leading-relaxed text-muted">Para menores de 14 anos, precisamos do contato de um dos pais ou responsável.</span>
      <Campo id="responsavelNome" rotulo="Nome do responsável" erro={erros.responsavelNome}>
        <input id="responsavelNome" placeholder="Nome e sobrenome" value={nome} onBlur={onBlur?.('responsavelNome')}
          onChange={(e) => onChange({ responsavelNome: e.target.value })}
          aria-invalid={Boolean(erros.responsavelNome)} className={classe(erros.responsavelNome)} />
      </Campo>
      <Campo id="responsavelTelefone" rotulo="Telefone do responsável" erro={erros.responsavelTelefone}>
        <input id="responsavelTelefone" inputMode="tel" placeholder="(31) 99999-9999" value={telefone} disabled={mesmo}
          onBlur={onBlur?.('responsavelTelefone')}
          onChange={(e) => onChange({ responsavelTelefone: mascaraTelefone(e.target.value) })}
          aria-invalid={Boolean(erros.responsavelTelefone)} className={classe(erros.responsavelTelefone)} />
      </Campo>
      <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-[#D6DDEA]">
        <input type="checkbox" checked={mesmo} className="mt-0.5 h-[20px] w-[20px] shrink-0 accent-[var(--secondary)]"
          onChange={(e) => onChange({ mesmoTelefone: e.target.checked, responsavelTelefone: e.target.checked ? telefoneJovem : telefone })} />
        O telefone do responsável é o mesmo que informei acima
      </label>
    </div>
  );
}
