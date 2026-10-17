import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  validarCadastro, precisaCompletar, tratamento, isoParaData, dataParaIso, idade, soDigitos, mascaraTelefone, mascaraData,
  formatarTelefone, IDADE_RESPONSAVEL,
} from '../../lib/formato';
import { Titulo, Aviso, Campo } from '../../components/Visual';
import { CampoApelido, CampoSexo, BlocoResponsavel } from '../../components/CamposJovem';

/** "Complete seu cadastro": só os campos que faltam. Não dá para pular. */
export default function Completar() {
  const { jovem, setJovem, sair } = useAuth();
  const navegar = useNavigate();
  const [f, setF] = useState(() => ({
    nome: jovem?.nome ?? '',
    apelido: jovem?.apelido ?? '',
    sexo: jovem?.sexo ?? null,
    telefone: jovem?.telefone ? formatarTelefone(jovem.telefone) : '',
    nascimento: isoParaData(jovem?.data_nascimento),
    responsavelNome: jovem?.responsavel_nome ?? '',
    responsavelTelefone: jovem?.responsavel_telefone ? formatarTelefone(jovem.responsavel_telefone) : '',
    mesmoTelefone: false,
    consentimento: Boolean(jovem?.consentimento_em),
  }));
  // Quais campos mostrar é decidido uma vez, com os dados que estavam faltando ao entrar.
  const faltando = useMemo(() => {
    if (!jovem) return {};
    return validarCadastro({ ...f, apelido: jovem.apelido ?? '', sexo: jovem.sexo, temFoto: true }, { exigirFoto: false });
  }, [jovem?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  if (!jovem) return <Navigate to="/inicio" replace />;
  if (!precisaCompletar(jovem) && !Object.keys(faltando).length) return <Navigate to="/inicio" replace />;

  const erros = validarCadastro({ ...f, temFoto: true }, { exigirFoto: false });
  const mostra = (c) => (tentou ? erros[c] : undefined);
  const muda = (m) => setF((x) => ({ ...x, ...m }));
  const iso = dataParaIso(f.nascimento);
  const anos = iso ? idade(iso) : null;
  const menor14 = anos !== null && anos >= 0 && anos < IDADE_RESPONSAVEL;
  const mostrar = (c) => c in faltando;

  const salvar = async (e) => {
    e.preventDefault();
    setTentou(true);
    const primeiro = Object.keys(erros)[0];
    if (primeiro) { document.getElementById(primeiro)?.focus(); return; }
    setSalvando(true); setErro('');
    const dados = {
      nome: f.nome, apelido: f.apelido.trim(), sexo: f.sexo, telefone: soDigitos(f.telefone), data_nascimento: iso,
      consentimento_em: jovem.consentimento_em ?? new Date().toISOString(),
      ...(menor14 ? { responsavel_nome: f.responsavelNome.trim(), responsavel_telefone: soDigitos(f.mesmoTelefone ? f.telefone : f.responsavelTelefone) } : {}),
    };
    const { data, error } = await supabase.from('jovens').update(dados).eq('id', jovem.id).select().single();
    setSalvando(false);
    if (error) { setErro(mensagemErro(error)); return; }
    setJovem(data);
    navegar('/inicio', { replace: true });
  };

  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-[22px] px-7 pb-10 pt-12">
      <div className="flex flex-col gap-3">
        <Titulo inicio="Complete seu " destaque="cadastro" className="text-[32px]" />
        <p className="m-0 text-[15px] leading-relaxed text-muted">
          Oi, {tratamento(jovem)}! Faltam só {Object.keys(faltando).length === 1 ? 'uma informação' : 'algumas informações'} para continuar.
        </p>
      </div>

      {mostrar('nome') && (
        <Campo id="nome" rotulo="Nome completo" erro={mostra('nome')}>
          <input id="nome" className={`campo ${mostra('nome') ? 'campo-erro' : ''}`} value={f.nome} onChange={(e) => muda({ nome: e.target.value })} />
        </Campo>
      )}
      {mostrar('apelido') && <CampoApelido valor={f.apelido} onChange={(v) => muda({ apelido: v })} erro={mostra('apelido')} />}
      {mostrar('sexo') && <CampoSexo valor={f.sexo} onChange={(v) => muda({ sexo: v })} erro={mostra('sexo')} />}
      {mostrar('telefone') && (
        <Campo id="telefone" rotulo="Telefone / WhatsApp" erro={mostra('telefone')}>
          <input id="telefone" inputMode="tel" placeholder="(31) 99999-9999" className={`campo ${mostra('telefone') ? 'campo-erro' : ''}`}
            value={f.telefone} onChange={(e) => muda({ telefone: mascaraTelefone(e.target.value) })} />
        </Campo>
      )}
      {mostrar('nascimento') && (
        <Campo id="nascimento" rotulo="Data de nascimento" erro={mostra('nascimento')}>
          <input id="nascimento" inputMode="numeric" placeholder="DD/MM/AAAA" className={`campo ${mostra('nascimento') ? 'campo-erro' : ''}`}
            value={f.nascimento} onChange={(e) => muda({ nascimento: mascaraData(e.target.value) })} />
        </Campo>
      )}
      {menor14 && (mostrar('responsavelNome') || mostrar('responsavelTelefone') || mostrar('nascimento')) && (
        <BlocoResponsavel nome={f.responsavelNome} telefone={f.mesmoTelefone ? f.telefone : f.responsavelTelefone} telefoneJovem={f.telefone}
          mesmo={f.mesmoTelefone} onChange={muda} erros={{ responsavelNome: mostra('responsavelNome'), responsavelTelefone: mostra('responsavelTelefone') }} />
      )}
      {mostrar('consentimento') && (
        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-[#D6DDEA]">
            <input id="consentimento" type="checkbox" checked={f.consentimento} onChange={(e) => muda({ consentimento: e.target.checked })}
              className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-[var(--secondary)]" />
            <span>Autorizo o ministério Sedentos a usar meus dados e minha imagem nas atividades e na comunicação do ministério.</span>
          </label>
          {mostra('consentimento') && <span className="pl-[34px] text-xs font-semibold text-[#FF8A8E]">{erros.consentimento}</span>}
        </div>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button className="btn-primario min-h-[54px] text-base" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar e continuar'}</button>
      <button type="button" onClick={sair} className="btn-texto self-center text-[13px] text-muted">Sair</button>
    </form>
  );
}
