import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase, mensagemErro } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { mascaraTelefone, mascaraData, dataParaIso, soDigitos } from '../../lib/formato';
import { Titulo, Aviso, Campo } from '../../components/Visual';
import Icone from '../../components/Icone';

/** Item 4.3: procura o jovem na base antiga por telefone + data de nascimento. */
export default function Vincular() {
  const { jovem, setJovem, sair } = useAuth();
  const navegar = useNavigate();
  const [telefone, setTelefone] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [achado, setAchado] = useState(undefined); // undefined = não buscou; null = não achou
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  if (jovem) return <Navigate to="/meu-cadastro" replace />;

  const iso = dataParaIso(nascimento);
  const prefill = { telefone, nascimento };

  const procurar = async (e) => {
    e.preventDefault();
    if (soDigitos(telefone).length < 10 || !iso) {
      setErro('Preencha o telefone com DDD e a data no formato DD/MM/AAAA.');
      return;
    }
    setErro(''); setOcupado(true);
    const { data, error } = await supabase.rpc('buscar_cadastro_antigo', { p_telefone: telefone, p_nascimento: iso });
    setOcupado(false);
    if (error) { setErro(mensagemErro(error)); return; }
    setAchado(data?.[0] ?? null);
  };

  const confirmar = async () => {
    setOcupado(true);
    const { data, error } = await supabase.rpc('vincular_cadastro', { p_id: achado.id, p_telefone: telefone, p_nascimento: iso });
    setOcupado(false);
    if (error) { setErro(mensagemErro(error)); return; }
    setJovem(data);
    navegar('/cadastro', { replace: true, state: { vinculado: true } });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col px-7 pb-8 pt-10">
      <button type="button" aria-label="Sair" onClick={sair}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-secondary/25 hover:bg-secondary/10">
        <Icone nome="voltar" tamanho={20} largura={2.4} />
      </button>
      <div className="mt-8"><Titulo inicio="Já veio " destaque="antes?" /></div>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        Talvez você já esteja na nossa lista antiga. Informe seu telefone e sua data de nascimento para procurarmos.
      </p>

      <form onSubmit={procurar} className="mt-6 flex flex-col gap-3.5">
        <Campo id="tel" rotulo="Telefone / WhatsApp">
          <input id="tel" className="campo" inputMode="tel" autoComplete="tel-national" placeholder="(31) 99999-9999"
            value={telefone} onChange={(e) => { setTelefone(mascaraTelefone(e.target.value)); setAchado(undefined); }} />
        </Campo>
        <Campo id="nasc" rotulo="Data de nascimento">
          <input id="nasc" className="campo" inputMode="numeric" placeholder="DD/MM/AAAA"
            value={nascimento} onChange={(e) => { setNascimento(mascaraData(e.target.value)); setAchado(undefined); }} />
        </Campo>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {achado === undefined && (
          <button className="btn-primario mt-2" disabled={ocupado}>{ocupado ? 'Procurando…' : 'Procurar meu cadastro'}</button>
        )}
      </form>

      {achado && (
        <div className="anim-subir mt-6 flex flex-col gap-3.5 rounded-2xl border border-secondary/30 bg-dark/55 p-[18px]">
          <p className="m-0 text-[15px] font-extrabold">Encontramos um cadastro seu. É você?</p>
          <div className="flex items-center gap-3.5">
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full text-[22px] font-extrabold" style={{ background: 'var(--gradient)' }} aria-hidden="true">
              {achado.primeiro_nome?.[0]}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-lg font-extrabold">{achado.primeiro_nome}</span>
              <span className="text-[13px] text-muted">Cadastro da lista antiga</span>
            </div>
          </div>
        </div>
      )}
      {achado === null && (
        <Aviso className="anim-subir mt-6">Não achamos nenhum cadastro com esses dados. Sem problema: vamos fazer um novo.</Aviso>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-8">
        {achado && (
          <>
            <button className="btn-primario" onClick={confirmar} disabled={ocupado}>{ocupado ? 'Vinculando…' : 'Sim, sou eu'}</button>
            <Link className="btn-secundario" to="/cadastro" state={prefill}>Não sou eu</Link>
          </>
        )}
        {achado === null && <Link className="btn-primario" to="/cadastro" state={prefill}>Fazer meu cadastro</Link>}
        {achado === undefined && (
          <Link to="/cadastro" state={prefill} className="p-3 text-center text-sm font-bold">É minha primeira vez no Sedentos</Link>
        )}
      </div>
    </div>
  );
}
