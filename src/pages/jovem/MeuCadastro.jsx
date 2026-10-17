import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { formatarTelefone, isoParaData, idade, precisaCompletar, SEXOS } from '../../lib/formato';
import { Titulo, Aviso } from '../../components/Visual';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';

function Linha({ rotulo, valor }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/[0.07] py-3.5">
      <span className="text-xs font-bold text-muted">{rotulo}</span>
      <span className="text-[15px] font-semibold">{valor || <span className="text-muted">Não informado</span>}</span>
    </div>
  );
}

export default function MeuCadastro() {
  const { jovem, sair, admin, lidera } = useAuth();
  const { state } = useLocation();
  if (!jovem) return <Navigate to="/inicio" replace />;
  if (precisaCompletar(jovem)) return <Navigate to="/completar" replace />;

  const anos = idade(jovem.data_nascimento);
  const faltaFoto = !jovem.foto_url;

  return (
    <div className="flex min-h-[100dvh] flex-col gap-[18px] px-6 pb-8 pt-11">
      <div className="flex items-end justify-between">
        <Titulo inicio="Meu cadas" destaque="tro" className="text-[32px]" />
        <button type="button" onClick={sair} className="btn-texto px-0"><Icone nome="sair" tamanho={16} /> Sair</button>
      </div>

      {(admin || lidera) && (
        <nav aria-label="Áreas" className="flex flex-wrap gap-2">
          {lidera && <Link to="/minha-rede" className="chip no-underline"><Icone nome="pessoas" tamanho={15} /> {jovem.papel === 'lideranca' ? 'Minha rede' : 'Meus discípulos'}</Link>}
          {admin && <Link to="/admin" className="chip no-underline"><Icone nome="painel" tamanho={15} /> Painel administrativo</Link>}
        </nav>
      )}
      {state?.salvo && <Aviso tipo="ok">Alterações salvas.</Aviso>}
      {jovem.status === 'pendente_validacao' && (
        <Aviso tipo="alerta"><strong className="text-warning">Pendente de validação.</strong> A liderança ainda vai conferir seus dados.</Aviso>
      )}
      {jovem.status === 'validado' && <Aviso tipo="ok"><strong>Cadastro validado</strong> pela liderança.</Aviso>}
      {jovem.status === 'inconsistente' && (
        <Aviso tipo="erro">A liderança encontrou algo para corrigir. Revise seus dados ou fale com a liderança.</Aviso>
      )}

      <div className="cartao flex items-center gap-4 p-4">
        <div className="rounded-full p-[3px]" style={{ background: 'var(--gradient)' }}>
          <Avatar caminho={jovem.foto_url} nome={jovem.nome} tamanho={70} borda={false} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-[17px] font-extrabold leading-tight">{jovem.nome}</span>
          {faltaFoto && <span className="text-xs font-semibold text-warning">Falta sua foto</span>}
        </div>
      </div>

      <div className="flex flex-col">
        <Linha rotulo="Apelido" valor={jovem.apelido} />
        <Linha rotulo="Sexo" valor={SEXOS[jovem.sexo]} />
        <Linha rotulo="E-mail" valor={jovem.email} />
        <Linha rotulo="Telefone / WhatsApp" valor={formatarTelefone(jovem.telefone)} />
        <Linha rotulo="Nascimento" valor={jovem.data_nascimento && `${isoParaData(jovem.data_nascimento)} · ${anos} anos`} />
        {(anos < 14 || jovem.responsavel_nome) && (
          <Linha rotulo="Responsável"
            valor={jovem.responsavel_nome && `${jovem.responsavel_nome}${jovem.responsavel_telefone ? ` · ${formatarTelefone(jovem.responsavel_telefone)}` : ''}`} />
        )}
      </div>

      <Link to="/cadastro" state={{ editar: true }} className="btn-primario mt-auto">
        <Icone nome="lapis" /> {faltaFoto ? 'Adicionar foto e editar' : 'Editar meus dados'}
      </Link>
    </div>
  );
}
