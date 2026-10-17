// Explicação de cada código de inconsistência, em português, com o que fazer.

export const INCONSISTENCIAS = {
  EMAIL_AUSENTE: {
    titulo: 'Sem e-mail',
    explicacao: 'Este cadastro ainda não está ligado a um e-mail.',
    acao: 'O e-mail entra sozinho quando o jovem fizer login e confirmar o cadastro. Se preferir, preencha aqui.',
  },
  FOTO_AUSENTE: {
    titulo: 'Sem foto',
    explicacao: 'Não existe nenhuma foto deste jovem.',
    acao: 'Peça uma foto ao jovem ou envie você mesmo pelo botão "Enviar foto".',
  },
  FOTO_LINK_EXTERNO: {
    titulo: 'Foto só no Google Drive',
    explicacao: 'A foto existe apenas como link do Drive e não está guardada no sistema.',
    acao: 'Abra o link, baixe a imagem e envie pelo botão "Enviar foto".',
  },
  FOTO_ARQUIVO_NAO_ENVIADO: {
    titulo: 'Arquivo de foto não enviado',
    explicacao: 'A planilha cita o nome de um arquivo de imagem, mas ele não foi enviado.',
    acao: 'Procure o arquivo com esse nome e envie pelo botão "Enviar foto".',
  },
  TELEFONE_AUSENTE: {
    titulo: 'Sem telefone',
    explicacao: 'O telefone está vazio ou com "-".',
    acao: 'Peça o WhatsApp ao jovem e preencha o campo.',
  },
  TELEFONE_DUPLICADO: {
    titulo: 'Telefone repetido',
    explicacao: 'Outro jovem tem o mesmo telefone.',
    acao: 'Pode ser a mesma pessoa ou o telefone de um responsável. Confira na tela Duplicados.',
  },
  TELEFONE_FORMATO_INVALIDO: {
    titulo: 'Telefone fora do padrão',
    explicacao: 'O número não tem 11 dígitos no padrão brasileiro (DDD + 9 + número).',
    acao: 'Confirme o número. Se for de outro país, mantenha e anote nas observações.',
  },
  NOME_INCOMPLETO: {
    titulo: 'Nome incompleto',
    explicacao: 'Só tem o primeiro nome.',
    acao: 'Complete com o sobrenome.',
  },
  NOME_CAIXA_BAIXA: {
    titulo: 'Nome em minúsculas',
    explicacao: 'O nome está todo em letras minúsculas.',
    acao: 'Corrija as maiúsculas (ex.: "Maria da Silva").',
  },
  POSSIVEL_DUPLICADO: {
    titulo: 'Nome repetido na base',
    explicacao: 'Existe outro cadastro com exatamente o mesmo nome.',
    acao: 'Confira na tela Duplicados e mescle se for a mesma pessoa.',
  },
  NASCIMENTO_INVALIDO: {
    titulo: 'Nascimento inválido',
    explicacao: 'A data está vazia, no futuro ou dá menos de 5 anos de idade.',
    acao: 'Provavelmente o ano foi digitado errado. Confirme com o jovem e corrija.',
  },
  APELIDO_AUSENTE: {
    titulo: 'Sem apelido',
    explicacao: 'Ainda não sabemos como esta pessoa gosta de ser chamada.',
    acao: 'Preencha o apelido aqui ou espere: o jovem completa ao entrar no sistema.',
  },
  SEXO_AUSENTE: {
    titulo: 'Sexo não informado',
    explicacao: 'O campo sexo está vazio.',
    acao: 'Escolha aqui ou use a ação em massa "Definir sexo" na lista de jovens.',
  },
  RESPONSAVEL_AUSENTE: {
    titulo: 'Menor de 14 sem responsável',
    explicacao: 'Tem menos de 14 anos e falta o nome ou o telefone do responsável.',
    acao: 'Peça o contato de um dos pais ou responsável e preencha o bloco "Responsável".',
  },
};

export const CODIGOS = Object.keys(INCONSISTENCIAS);
export const tituloInconsistencia = (c) => INCONSISTENCIAS[c]?.titulo ?? c;

export const STATUS = {
  pendente_validacao: { rotulo: 'Pendente de validação', curto: 'Pendente', classe: 'text-warning bg-warning/15' },
  validado: { rotulo: 'Validado', curto: 'Validado', classe: 'text-success bg-success/15' },
  inconsistente: { rotulo: 'Inconsistente', curto: 'Inconsistente', classe: 'text-danger bg-danger/15' },
};

export const ORIGEM = {
  importacao_planilha: 'Planilha antiga',
  autocadastro: 'Autocadastro',
};

export const ROTULO_CAMPO = {
  nome: 'Nome', apelido: 'Apelido', sexo: 'Sexo', email: 'E-mail', telefone: 'Telefone', data_nascimento: 'Nascimento',
  foto_url: 'Foto', foto_origem: 'Foto (referência antiga)', status: 'Status',
  observacoes_admin: 'Observações', responsavel_nome: 'Responsável', responsavel_telefone: 'Telefone do responsável',
  papel: 'Papel na rede', cargo_lideranca: 'Cargo', discipulado_por: 'Discipulado por', login: 'Acesso', ativo: 'Situação',
};

export const ACAO_HISTORICO = {
  importacao: 'importou da planilha antiga',
  cadastro: 'fez o cadastro',
  edicao: 'alterou',
  vinculacao: 'vinculou o acesso ao cadastro',
  mesclagem: 'mesclou com um registro duplicado',
  presenca: 'corrigiu a presença',
};
