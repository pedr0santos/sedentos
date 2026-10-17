import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useJovens } from '../../hooks/useJovens';
import { idade } from '../../lib/formato';
import { Titulo, Carregando, Aviso } from '../../components/Visual';
import { CamposAdmin, BlocoInconsistencias, FotoAdmin, valoresDoJovem, valoresParaBanco } from '../../components/AdminJovem';
import Icone from '../../components/Icone';

/** Um cadastro pendente por vez: corrige, valida e vai para o próximo. */
export default function Fila() {
  const { jovens, carregando, salvar } = useJovens();
  // A fila é "congelada" ao abrir a tela para os itens não pularem de lugar.
  const [fila, setFila] = useState(null);
  const [pos, setPos] = useState(0);
  const [feitos, setFeitos] = useState(0);
  const [valores, setValores] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!carregando && fila === null) {
      setFila(jovens.filter((j) => j.status === 'pendente_validacao').map((j) => j.id));
    }
  }, [carregando, jovens, fila]);

  const atual = useMemo(() => (fila ? jovens.find((j) => j.id === fila[pos]) : null), [fila, pos, jovens]);
  useEffect(() => { if (atual) setValores(valoresDoJovem(atual)); setErro(''); }, [atual?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (carregando || fila === null) return <Carregando tela />;
  const pendentes = jovens.filter((j) => j.status === 'pendente_validacao').length;
  const fim = pos >= fila.length;

  const proximo = () => setPos((p) => p + 1);
  const decidir = async (status) => {
    setErro(''); setSalvando(true);
    try {
      await salvar(atual.id, { ...valoresParaBanco(valores), ...(status ? { status } : {}) });
      if (status === 'validado') setFeitos((f) => f + 1);
      proximo();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Titulo inicio="Vali" destaque="dação" className="text-4xl" />
        <div className="flex w-full max-w-[340px] flex-col gap-2">
          <div className="flex justify-between text-[13px]">
            <span className="text-muted">{feitos} validados agora</span>
            <strong>{pendentes} pendentes</strong>
          </div>
          <div className="h-2 rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={fila.length} aria-valuenow={Math.min(pos, fila.length)}>
            <div className="h-2 min-w-[8px] rounded-full transition-all" style={{ width: `${fila.length ? (Math.min(pos, fila.length) / fila.length) * 100 : 100}%`, background: 'var(--gradient)' }} />
          </div>
        </div>
      </header>

      {fim || !atual ? (
        <div className="cartao flex max-w-[880px] flex-col items-start gap-4 p-8">
          <h2 className="m-0 text-xl">{fila.length === 0 ? 'Nenhum cadastro pendente.' : 'Você chegou ao fim da fila.'}</h2>
          <p className="m-0 text-sm text-muted">
            {pendentes > 0 ? `Ainda há ${pendentes} pendentes (os que você pulou).` : 'Todos os cadastros foram revisados.'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {pendentes > 0 && (
              <button type="button" className="btn-primario" onClick={() => { setFila(jovens.filter((j) => j.status === 'pendente_validacao').map((j) => j.id)); setPos(0); }}>
                Recomeçar com os pendentes
              </button>
            )}
            <Link to="/admin" className="btn-secundario no-underline">Ir para o dashboard</Link>
          </div>
        </div>
      ) : (
        <section key={atual.id} className="cartao anim-subir flex max-w-[920px] flex-wrap gap-7 p-6 sm:p-7">
          <div className="flex w-full flex-col items-center gap-3 sm:w-[220px]">
            <FotoAdmin jovem={atual} tamanho={150} onEnviada={(caminho) => salvar(atual.id, { foto_url: caminho })} />
          </div>
          <div className="flex min-w-0 flex-[999_1_380px] flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-muted">Cadastro {pos + 1} de {fila.length}</span>
              <Link to={`/admin/jovens/${atual.id}`} className="text-xs font-bold">Abrir ficha completa</Link>
            </div>
            <div>
              <h2 className="m-0 text-2xl">{atual.apelido || atual.nome}</h2>
              {atual.apelido && <span className="block text-sm text-[#D6DDEA]">{atual.nome}</span>}
              <span className="text-sm text-muted">
                {atual.inconsistencias.includes('NASCIMENTO_INVALIDO') ? 'Idade inválida' : `${idade(atual.data_nascimento)} anos`}
              </span>
            </div>
            <BlocoInconsistencias codigos={atual.inconsistencias} />
            {valores && <CamposAdmin valores={valores} onChange={setValores} inconsistencias={atual.inconsistencias} completo={false} prefixo="q" />}
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className="btn-primario" disabled={salvando} onClick={() => decidir('validado')}>
                Validar e próximo <Icone nome="seta" largura={2.4} />
              </button>
              <button type="button" className="btn-perigo" disabled={salvando} onClick={() => decidir('inconsistente')}>Marcar inconsistente</button>
              <button type="button" className="btn-secundario" disabled={salvando} onClick={proximo}>Pular</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
