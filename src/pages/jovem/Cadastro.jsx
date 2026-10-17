import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  mascaraTelefone, mascaraData, dataParaIso, isoParaData, idade, soDigitos, validarCadastro, formatarTelefone, IDADE_RESPONSAVEL, tratamento,
} from '../../lib/formato';
import { CampoApelido, CampoSexo, BlocoResponsavel } from '../../components/CamposJovem';
import { enviarFoto, apagarFoto, urlsAssinadas } from '../../lib/fotos';
import { Titulo, Aviso, Campo } from '../../components/Visual';
import FotoPicker from '../../components/FotoPicker';
import Icone from '../../components/Icone';

export default function Cadastro() {
  const { jovem, uid, email, setJovem } = useAuth();
  const navegar = useNavigate();
  const { state } = useLocation();
  const editando = Boolean(state?.editar);
  const vinculado = Boolean(state?.vinculado) || (jovem?.origem === 'importacao_planilha' && !editando);

  const [f, setF] = useState(() => ({
    nome: jovem?.nome ?? '',
    apelido: jovem?.apelido ?? '',
    sexo: jovem?.sexo ?? null,
    telefone: jovem?.telefone ? formatarTelefone(jovem.telefone) : state?.telefone ?? '',
    nascimento: jovem?.data_nascimento ? isoParaData(jovem.data_nascimento) : state?.nascimento ?? '',
    responsavelNome: jovem?.responsavel_nome ?? '',
    responsavelTelefone: jovem?.responsavel_telefone ? formatarTelefone(jovem.responsavel_telefone) : '',
    consentimento: Boolean(jovem?.consentimento_em),
    mesmoTelefone: Boolean(jovem?.responsavel_telefone && jovem.responsavel_telefone === jovem.telefone),
  }));
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [tocados, setTocados] = useState({});
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const seletorData = useRef(null);

  useEffect(() => {
    if (jovem?.foto_url && !arquivo) urlsAssinadas([jovem.foto_url]).then((m) => setPrevia(m[jovem.foto_url]));
  }, [jovem?.foto_url]); // eslint-disable-line react-hooks/exhaustive-deps

  const iso = dataParaIso(f.nascimento);
  const anos = iso ? idade(iso) : null;
  const menor14 = anos !== null && anos >= 0 && anos < IDADE_RESPONSAVEL;

  const erros = useMemo(
    () => validarCadastro({ ...f, temFoto: Boolean(arquivo || jovem?.foto_url) }, { exigirFoto: true }),
    [f, arquivo, jovem?.foto_url],
  );
  const mostra = (c) => (tentou || tocados[c] ? erros[c] : undefined);
  const muda = (c, v) => setF((x) => ({ ...x, [c]: v }));
  const toca = (c) => () => setTocados((t) => ({ ...t, [c]: true }));
  const attrs = (c) => ({
    'aria-invalid': Boolean(mostra(c)),
    'aria-describedby': mostra(c) ? `${c}-erro` : undefined,
    onBlur: toca(c),
    className: `campo ${mostra(c) ? 'campo-erro' : ''}`,
  });

  const salvar = async (e) => {
    e.preventDefault();
    setTentou(true);
    setErroGeral('');
    const primeiro = Object.keys(erros)[0];
    if (primeiro) {
      document.getElementById(primeiro === 'foto' ? 'topo' : primeiro)?.focus();
      return;
    }
    setSalvando(true);
    let novaFoto = null;
    try {
      if (arquivo) novaFoto = await enviarFoto(arquivo, uid);
      const dados = {
        nome: f.nome,
        apelido: f.apelido.trim(),
        sexo: f.sexo,
        telefone: soDigitos(f.telefone),
        data_nascimento: iso,
        // Responsável só vai junto para menores de 14 (para os demais, nada é enviado)
        ...(menor14 ? {
          responsavel_nome: f.responsavelNome.trim() || null,
          responsavel_telefone: soDigitos(f.mesmoTelefone ? f.telefone : f.responsavelTelefone) || null,
        } : {}),
        consentimento_em: jovem?.consentimento_em ?? new Date().toISOString(),
        foto_url: novaFoto ?? jovem?.foto_url ?? null,
      };
      const q = jovem
        ? supabase.from('jovens').update(dados).eq('id', jovem.id)
        : supabase.from('jovens').insert({ ...dados, user_id: uid, email });
      const { data, error } = await q.select().single();
      if (error) throw error;
      if (novaFoto && jovem?.foto_url?.startsWith(`${uid}/`)) apagarFoto(jovem.foto_url);
      setJovem(data);
      navegar(editando ? '/meu-cadastro' : '/sucesso', { replace: true, state: editando ? { salvo: true } : undefined });
    } catch (err) {
      if (novaFoto) apagarFoto(novaFoto);
      setErroGeral(mensagemErro(err));
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-[22px] px-7 pb-10 pt-10">
      <div className="flex items-center gap-3.5">
        <button type="button" aria-label="Voltar" onClick={() => navegar(editando ? '/meu-cadastro' : jovem ? '/meu-cadastro' : '/vincular')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-secondary/25 hover:bg-secondary/10">
          <Icone nome="voltar" tamanho={20} largura={2.4} />
        </button>
        {!editando && (
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs font-bold text-muted">Etapa 2 de 2</span>
            <div className="h-1.5 rounded-full bg-white/10"><div className="h-1.5 w-[70%] rounded-full" style={{ background: 'var(--gradient)' }} /></div>
          </div>
        )}
      </div>

      <div id="topo" tabIndex={-1} className="outline-none">
        {editando ? <Titulo inicio="Editar " destaque="dados" className="text-4xl" /> : <Titulo inicio="Cadas" destaque="tro" className="text-4xl" />}
      </div>

      {vinculado && !editando && <Aviso>Trouxemos o que já tínhamos de você. Confira e complete o que falta.</Aviso>}

      <FotoPicker previa={previa} erro={mostra('foto')}
        onChange={(arq, url) => { setArquivo(arq); setPrevia(url); toca('foto')(); }} />

      <Campo id="nome" rotulo="Nome completo" erro={mostra('nome')}>
        <input id="nome" autoComplete="name" value={f.nome} onChange={(e) => muda('nome', e.target.value)} {...attrs('nome')}
          onBlur={() => { toca('nome')(); if (!f.apelido.trim() && f.nome.trim()) muda('apelido', tratamento({ nome: f.nome })); }} />
      </Campo>

      <CampoApelido valor={f.apelido} onChange={(v) => muda('apelido', v)} onBlur={toca('apelido')} erro={mostra('apelido')} />
      <CampoSexo valor={f.sexo} onChange={(v) => { muda('sexo', v); toca('sexo')(); }} erro={mostra('sexo')} />

      <Campo id="email" rotulo="E-mail">
        <div className="relative">
          <input id="email" className="campo pr-11" value={jovem?.email ?? email ?? ''} disabled />
          <Icone nome="cadeado" className="absolute right-3.5 top-4 text-muted" />
        </div>
      </Campo>

      <Campo id="telefone" rotulo="Telefone / WhatsApp" erro={mostra('telefone')}>
        <input id="telefone" inputMode="tel" autoComplete="tel-national" placeholder="(31) 99999-9999"
          value={f.telefone} {...attrs('telefone')}
          onChange={(e) => { const v = mascaraTelefone(e.target.value); setF((x) => ({ ...x, telefone: v, ...(x.mesmoTelefone ? { responsavelTelefone: v } : {}) })); }} />
      </Campo>

      <Campo id="nascimento" rotulo="Data de nascimento" erro={mostra('nascimento')}
        dica={anos !== null && anos >= 0 ? `${anos} anos` : undefined}>
        <div className="relative">
          <input id="nascimento" inputMode="numeric" placeholder="DD/MM/AAAA"
            value={f.nascimento} onChange={(e) => muda('nascimento', mascaraData(e.target.value))} {...attrs('nascimento')} />
          <button type="button" aria-label="Abrir calendário"
            onClick={() => seletorData.current?.showPicker?.()}
            className="absolute right-1 top-1 flex h-[42px] w-[42px] items-center justify-center rounded-lg text-secondary hover:bg-secondary/10">
            <Icone nome="calendario" />
          </button>
          <input ref={seletorData} type="date" tabIndex={-1} aria-hidden="true" value={iso ?? ''}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { muda('nascimento', isoParaData(e.target.value)); toca('nascimento')(); }}
            className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0" />
        </div>
      </Campo>

      {menor14 && (
        <BlocoResponsavel nome={f.responsavelNome} telefone={f.mesmoTelefone ? f.telefone : f.responsavelTelefone} telefoneJovem={f.telefone}
          mesmo={f.mesmoTelefone} onChange={(m) => setF((x) => ({ ...x, ...m }))} onBlur={toca}
          erros={{ responsavelNome: mostra('responsavelNome'), responsavelTelefone: mostra('responsavelTelefone') }} />
      )}

      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-[#D6DDEA]">
          <input id="consentimento" type="checkbox" checked={f.consentimento} disabled={Boolean(jovem?.consentimento_em)}
            onChange={(e) => { muda('consentimento', e.target.checked); toca('consentimento')(); }}
            className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-[var(--secondary)]" />
          <span>
            Autorizo o ministério Sedentos a usar meus dados e minha imagem nas atividades e na comunicação do ministério.
            {menor14 && ' Meu responsável está de acordo.'}
          </span>
        </label>
        {mostra('consentimento') && <span className="pl-[34px] text-xs font-semibold text-[#FF8A8E]">{erros.consentimento}</span>}
      </div>

      {erroGeral && <Aviso tipo="erro">{erroGeral}</Aviso>}

      <button className="btn-primario min-h-[54px] text-base" disabled={salvando}>
        {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Concluir cadastro'}
      </button>
    </form>
  );
}
