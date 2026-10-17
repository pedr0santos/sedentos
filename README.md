# Sedentos · Sistema de cadastro de jovens

Sistema web (celular primeiro) para o ministério jovem **Sedentos**, com cadastro de jovens, Rede de discipulado e Chamada dos cultos:

- **Jovem:** entra só com o e-mail (código de 6 dígitos ou link mágico, sem senha). Antes do formulário, encontra o próprio cadastro antigo pelo **telefone + data de nascimento**. Depois completa os dados e envia a foto, que é recortada e comprimida.
- **Painel administrativo:** dashboard, lista com filtros, ficha com histórico, fila de validação, tela de duplicados com mesclagem e exportação em Excel e CSV.
- **Base antiga:** os 200 jovens entram como *Pendente de validação*, com as inconsistências marcadas. Nada é corrigido automaticamente.

Stack: React + Vite + Tailwind no front, Supabase (Auth por e-mail, Postgres com RLS, Storage privado) no back.

---

## Estrutura

```
supabase/migrations/   → banco completo (tabelas, regras, segurança, fotos)
supabase/tests/        → testes do banco (rodam num Postgres comum)
scripts/importar.mjs   → importação reutilizável + admin inicial
scripts/gerar_csv_importacao.py → planilha original → CSV de importação (opcional)
dados/                 → base de 200 jovens (CSV) e a planilha original
src/                   → aplicativo React
  styles/index.css     → TODAS as cores e fontes (variáveis --primary, --secondary…)
  pages/jovem/         → login, vinculação, cadastro, sucesso, meu cadastro
  pages/admin/         → dashboard, lista, ficha, validação, duplicados
```

---

## Passo a passo do deploy (cerca de 30 minutos)

### 1. Criar o projeto no Supabase
1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo. A região **São Paulo** é a melhor opção para o Brasil.
2. Em **SQL Editor › New query**, cole todo o arquivo `supabase/migrations/20261017000000_sedentos.sql` e clique **Run**.
   Isso cria as tabelas, as regras de inconsistência, a segurança e o bucket privado `fotos`.
3. Em seguida, rode também `supabase/migrations/20261018000000_rede_discipulado.sql` (Rede de discipulado) e `supabase/migrations/20261019000000_chamada_cultos.sql` (Chamada dos cultos).

### 2. Configurar o login por e-mail
Em **Authentication**:

1. **Sign In / Providers › Email:** deixe ativado. Em *Email OTP Length*, use **6**.
2. **URL Configuration:**
   - *Site URL*: o endereço final do site (ex.: `https://sedentos.vercel.app`).
   - *Redirect URLs*: adicione `https://sedentos.vercel.app/**` e, para testes, `http://localhost:5173/**`.
3. **Emails › Templates:** edite **Magic Link** e **Confirm signup** para mostrar o código. Sugestão:

   Assunto: `Seu código de acesso · Sedentos`
   ```html
   <h2>Seu código: {{ .Token }}</h2>
   <p>Digite esse código no site para entrar. Ele vale por alguns minutos.</p>
   <p>Ou toque aqui para entrar direto: <a href="{{ .ConfirmationURL }}">Entrar no Sedentos</a></p>
   ```
4. **SMTP próprio (importante):** o e-mail padrão do Supabase envia **pouquíssimos e-mails por hora**. Num culto com muitos jovens entrando ao mesmo tempo, o login vai travar.
   Configure um SMTP em **Authentication › Emails › SMTP Settings**. [Resend](https://resend.com) e [Brevo](https://brevo.com) têm plano gratuito.
   Depois, em **Rate Limits**, aumente o limite de e-mails por hora.

### 3. Importar a base e criar o primeiro admin
No seu computador (precisa do [Node.js](https://nodejs.org) 18 ou superior):

```bash
npm install
cp .env.example .env      # e preencha (veja abaixo)
npm run importar -- dados/base_jovens_importacao.csv
```

No `.env`, preencha os dados que estão em **Project Settings › API**:
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (a chave **service_role**, que é secreta)
- `ADMIN_EMAIL`: o e-mail de quem será o primeiro administrador

O script mostra no final a contagem de cada inconsistência. Para a base atual, o resultado deve ser:
`EMAIL_AUSENTE 200 · FOTO_AUSENTE 87 · FOTO_LINK_EXTERNO 68 · FOTO_ARQUIVO_NAO_ENVIADO 45 · TELEFONE_AUSENTE 22 · TELEFONE_DUPLICADO 6 · NOME_INCOMPLETO 6 · NOME_CAIXA_BAIXA 6 · NASCIMENTO_INVALIDO 3 · POSSIVEL_DUPLICADO 2 · TELEFONE_FORMATO_INVALIDO 1`.

Você pode rodar o script de novo sem problema, porque registros já importados são ignorados.

> ⚠️ A chave `service_role` dá acesso total ao banco. Use só no seu computador e **nunca** a coloque no site, na Vercel ou no GitHub.

### 4. Publicar o site (Vercel)
1. Suba esta pasta para um repositório no GitHub. O `.env` já está no `.gitignore`.
2. Em [vercel.com](https://vercel.com), clique em **Add New › Project**, importe o repositório e use o framework **Vite**.
3. Em **Environment Variables**, adicione só estas duas:
   - `VITE_SUPABASE_URL`: a URL do projeto
   - `VITE_SUPABASE_ANON_KEY`: a chave **anon/public**
4. Clique em **Deploy** e depois coloque o endereço final no *Site URL* do Supabase (passo 2).

O `vercel.json` já faz as rotas funcionarem. Na **Netlify**, use build `npm run build` e pasta `dist`; o arquivo `public/_redirects` cuida das rotas.

### 5. Testar no computador (opcional)
```bash
npm run dev     # abre em http://localhost:5173
```

---

## Administradores

O admin entra pelo mesmo site, com o próprio e-mail, e vai direto para o painel.

**Adicionar ou remover admins:** pelo painel, em **Acessos › Administradores** (veja a seção "Acessos" no fim deste arquivo).
O **primeiro** admin ainda é criado pelo script (`ADMIN_EMAIL=... npm run importar`) ou pelo SQL Editor:
```sql
insert into public.admins (email) values ('nova.lider@exemplo.com');
```

---

## Importar uma nova planilha no futuro
O script aceita dois formatos:
- **Planilha original (.xlsx)** com as colunas `Nome | Telefone | Data de nascimento | Foto`
- **CSV de importação**, no mesmo formato de `dados/base_jovens_importacao.csv`

Nos dois formatos, estas colunas são **opcionais**: `Apelido`, `Sexo` (aceita `F`, `M`, `Feminino` ou `Masculino`, em maiúsculas ou minúsculas), `Nome do responsável` e `Telefone do responsável`. Quando não vierem, o registro entra com as inconsistências correspondentes (*Sem apelido*, *Sexo não informado*, *Menor de 14 sem responsável*).

```bash
npm run importar -- "caminho/da/nova planilha.xlsx" --simular   # só confere, não grava
npm run importar -- "caminho/da/nova planilha.xlsx"             # importa
```
Os registros entram como *Pendente de validação*. As inconsistências e os duplicados com quem já está na base são calculados sozinhos.

---

## Regras importantes (como o sistema se comporta)

| Situação | O que acontece |
|---|---|
| Jovem procura o cadastro antigo | Precisa acertar **telefone e nascimento juntos**. Só aparece o primeiro nome até ele confirmar. |
| Apelido e sexo | **Obrigatórios** no cadastro do jovem. Depois de preenchidos, ele pode trocar, mas não apagar. |
| Menor de 14 anos | Nome e telefone do responsável são **obrigatórios**. O telefone pode ser o mesmo do jovem (não conta como repetido). |
| 14 anos ou mais | O bloco do responsável não aparece para o jovem; o admin ainda pode preencher pela ficha. |
| Conta antiga sem apelido, sexo ou responsável (< 14) | Ao entrar, vê a tela **Complete seu cadastro**, com só o que falta. Não dá para pular (vale também para discipuladores e liderança). |
| Jovem edita um cadastro já validado | O cadastro volta para *Pendente de validação* |
| Jovem tenta mudar status, e-mail ou observações | O banco ignora; só admins podem |
| Qualquer edição | As inconsistências são recalculadas, inclusive as dos outros jovens com o mesmo telefone ou nome |
| Duplicados | Nunca são mesclados sozinhos. A liderança escolhe campo a campo ou marca "São pessoas diferentes" |
| Fotos | Ficam em bucket **privado**, com links temporários de 1 hora. Cada jovem só acessa a própria foto. |
| Telefone estrangeiro | O jovem só cadastra número BR. O admin pode digitar com `+DDI` (ex.: o número de Portugal). |

Todas as alterações ficam no **histórico** da ficha, com quem alterou, o quê e quando.

---

## Fonte Nexa
O sistema usa **Montserrat**, que é gratuita, porque a Nexa é paga. Para trocar:
1. Coloque `Nexa-Book.woff2` e `Nexa-XBold.woff2` em `public/fonts/`.
2. Em `src/styles/index.css`, descomente o bloco `@font-face` e mude `--font` para `'Nexa', sans-serif`.

---

## Testes do telefone/WhatsApp
```bash
npm test
```
Conferem `formatarTelefone`, `linkWhatsApp`, a leitura do telefone pelo importador (inclusive a recusa de valores em notação científica ou com casas decimais) e se o CSV e a planilha original dão o mesmo telefone para cada jovem. Todas as telas usam só `formatarTelefone` e `linkWhatsApp`, de `src/lib/formato.js`.

---

## Testes do banco
Os testes conferem as contagens da base real, as travas de segurança do jovem, a vinculação, a mesclagem e o storage. Precisa do PostgreSQL 15 ou superior instalado:
```bash
createdb sed_teste
psql -d sed_teste -f supabase/tests/00_shim_supabase.sql
psql -d sed_teste -f supabase/migrations/20261017000000_sedentos.sql
psql -d sed_teste -f supabase/migrations/20261018000000_rede_discipulado.sql
psql -d sed_teste -f supabase/migrations/20261019000000_chamada_cultos.sql
psql -d sed_teste -f supabase/migrations/20261020000000_apelido_sexo_responsavel.sql
psql -d sed_teste -f supabase/migrations/20261021000000_acessos_secretarios.sql
psql -d sed_teste -f supabase/tests/01_testes.sql     # deve terminar com "TODOS OS TESTES PASSARAM"
psql -d sed_teste -f supabase/tests/02_rede.sql       # deve terminar com "TODOS OS TESTES DA REDE PASSARAM"
psql -d sed_teste -f supabase/tests/03_chamada.sql    # deve terminar com "TODOS OS TESTES DA CHAMADA PASSARAM"
psql -d sed_teste -f supabase/tests/04_apelido_sexo.sql # deve terminar com "TODOS OS TESTES DO APELIDO/SEXO PASSARAM"
psql -d sed_teste -f supabase/tests/06_acessos.sql    # deve terminar com "TODOS OS TESTES DE ACESSOS PASSARAM"
```
(Não existe `05`: os testes da correção de telefones estão no `01` e no `npm test`.)

---

## Pendências da base atual
- **113 fotos** existem só como referência: 68 links do Drive e 45 nomes de arquivo. Elas podem ser enviadas pela ficha ou pela fila de validação, ou em lote se você tiver as pastas.
- **3 grupos de possíveis duplicados** aguardam decisão na tela Duplicados: Giovanna, Matheus Gabriel, e Enzo/Ismael.

---

## Modo demonstração
`npm run build:demo` gera em `dist-demo/` uma versão que roda sem Supabase. Ela usa os dados de `src/demo/dados.json` em memória, com os telefones reais da planilha (por isso, não compartilhe o link da demonstração), e mostra uma faixa com atalhos para entrar como jovem ou como liderança. Serve para mostrar o sistema antes do deploy. Nada é salvo.

---

## Rede de discipulado

Instale a segunda migração, `supabase/migrations/20261018000000_rede_discipulado.sql`, pelo **SQL Editor**, depois da primeira. Ela não altera a migração inicial.

### Papéis
| Papel | É cuidado por | Entra em |
|---|---|---|
| **Liderança** (cargo opcional, ex.: "Líder de jovens") | ninguém | Minha rede: os seus discipuladores e os discípulos de cada um |
| **Discipulador** | uma pessoa da Liderança | Meus discípulos |
| **Jovem** (padrão para todos) | um Discipulador | Meu cadastro |

Os administradores (tabela `admins`) continuam indo para o **Painel administrativo**. Quem é admin e também discipulador ou liderança tem um seletor no topo para trocar de área.

### Como classificar
- **Uma pessoa:** na ficha, use o bloco **Rede de discipulado** para escolher o papel e quem cuida dela. A busca só mostra quem tem o papel certo.
- **Várias de uma vez:** em **Jovens**, marque as caixas e use **Definir papel** ou **Atribuir discipulador**. O sistema aplica em todos e lista quem ficou de fora e por quê.
- **Árvore:** na página **Rede de discipulado**, arraste um jovem para outro discipulador, ou um discipulador para outra liderança. No celular, use o botão de transferir.
- **Mudar o papel de quem tem pessoas ligadas:** o sistema bloqueia e oferece **Transferir os X discípulos para…** antes.

### Como dar acesso a um discipulador ou líder
1. Na ficha da pessoa, preencha o **e-mail** dela e salve.
2. No bloco Rede, use **Copiar link de acesso** ou **Enviar no WhatsApp**.
3. A pessoa entra com esse e-mail e o código de 6 dígitos. O cadastro é ligado ao login automaticamente e ela cai direto na área dela.

Quem ainda não tem e-mail aparece em **Pendências da rede**.

### Quem vê o quê
| | Dados de cadastro | Inconsistências, status, observações, histórico | Anotações |
|---|---|---|---|
| Admin | todos, e edita | sim | todas; pode apagar qualquer uma |
| Liderança | só leitura: a sua rede (nome, foto, telefone, nascimento, papel; responsável sempre que preenchido) | não | todas da sua rede; escreve sobre qualquer pessoa da rede |
| Discipulador | só leitura: os seus discípulos (mesmos campos) | não | só as que **ele** escreveu sobre os discípulos **atuais** |
| Jovem | os próprios dados | não | **nunca** vê anotações sobre ele |

- O autor pode editar ou apagar uma anotação por 24 horas. Depois disso, ela fica fixa.
- Se o jovem trocar de discipulador, as anotações continuam no registro dele, e o discipulador antigo perde o acesso.
- O botão **Avisar a liderança sobre dado incorreto** cria uma anotação do tipo "Correção de cadastro", que aparece nas pendências da Rede.
- O **limite de sobrecarga** (padrão 12 discípulos) é ajustado na página da Rede e vale para todos os admins.

Os testes da rede estão em `supabase/tests/02_rede.sql` (veja a seção "Testes do banco").

---

## Chamada dos cultos

Rode a terceira migração, `supabase/migrations/20261019000000_chamada_cultos.sql`, no **SQL Editor**, depois das outras duas. Ela já liga o **Realtime** nas tabelas da chamada (presenças, avisos e cultos).

### Antes da primeira chamada
1. Classifique a rede (quem é discipulador e quem cuida de quem).
2. Em cada ficha, use **Marcar como inativo** para quem não frequenta mais (mudou de igreja ou de cidade).
   Inativos ficam fora da chamada e das estatísticas. Sem isso, a primeira chamada dá falta para todo mundo que está na base.

### No sábado
1. Abra o menu **Chamada** e toque em **Fazer chamada** no card do próximo culto. Os sábados das próximas 8 semanas aparecem sozinhos.
2. Busque pelo nome (2 ou 3 letras bastam) e **toque no cartão** para marcar presente. Outro toque desmarca.
3. Para **justificar** uma falta, segure o cartão ou toque em **⋯** e escreva o motivo.
4. Duas pessoas podem fazer a chamada ao mesmo tempo, porque a lista se atualiza sozinha.
5. Se a internet cair, continue marcando. As marcações ficam guardadas no celular e são enviadas quando a conexão voltar.

### Fechar
- No fim do culto, toque em **Fechar chamada**. O sistema mostra quantas pessoas ficarão com falta, quantos discipuladores serão avisados e a lista para uma última conferência.
- Os avisos saem **uma única vez**, nesse momento. Fechar de novo não duplica nada.
- Um culto **cancelado** (botão "Cancelar culto") não conta em nenhuma estatística. Também é possível criar um **culto extra** em outra data.

### Corrigir
Abra o culto fechado (**Ver resumo e corrigir**), toque na pessoa e escolha presente, falta ou justificada.
- Se uma falta virar presença ou justificada, o aviso some da lista do discipulador.
- Toda correção fica no **histórico** da ficha.

### Como funcionam os avisos
| Quem faltou | Quem recebe o aviso |
|---|---|
| Jovem com discipulador | o discipulador |
| Jovem com **2 faltas seguidas** ou mais | o discipulador e a liderança acima dele |
| Discipulador | a liderança dele |
| Jovem (ou discipulador) sem vínculo | os admins, num **resumo único por culto** (em Pendências da rede) |
| Liderança | ninguém (aparece só nos relatórios) |

Regras da sequência de faltas:
- Uma falta **justificada** ou uma presença zera a sequência.
- Um culto cancelado não interrompe nem conta.
- O número de faltas seguidas (padrão 2) fica em `config_rede.faltas_seguidas_alerta`.

Para o discipulador:
- O sino mostra os avisos e a contagem dos pendentes; "Meus discípulos" mostra uma faixa no topo.
- Cada aviso tem os botões **Mandar mensagem**, **Já falei com ele** e **Registrar retorno**.
  - **Mandar mensagem** abre o WhatsApp com o texto pronto. Para menores de 14 anos, aparecem dois botões: **WhatsApp do jovem** e **WhatsApp do responsável** (cada um com o texto certo).
  - **Registrar retorno** cria uma anotação de discipulado já com o texto inicial.
- O aviso só sai de "Pendentes" quando o contato é marcado; ler não basta.

A liderança vê o painel **Cuidado da rede**: quantos avisos cada discipulador recebeu e quantos já respondeu.

O jovem **não vê** a própria frequência nem os avisos.

### Ativar o e-mail
1. Crie uma conta no [Resend](https://resend.com), verifique o seu domínio e gere uma chave de API.
2. Em **Supabase › Edge Functions › Secrets**, cadastre:
   - `RESEND_API_KEY`
   - `EMAIL_REMETENTE` (ex.: `Sedentos <avisos@seudominio.com>`)
   - `SITE_URL` (ex.: `https://sedentos.vercel.app`)
3. Publique a função:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJETO
   npx supabase functions deploy avisar-faltas
   ```

A função `avisar-faltas` é chamada ao fechar a chamada. Ela manda **um e-mail por discipulador** com a lista de quem faltou e um botão para os avisos. Sem a configuração, os avisos continuam funcionando no sistema; só o e-mail não sai.

### Ativar o push (celular)
1. Gere as chaves: `npx web-push generate-vapid-keys`.
2. Cadastre-as nos segredos da função:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_CONTATO` (ex.: `mailto:lideranca@seudominio.com`)
3. Na Vercel, adicione `VITE_VAPID_PUBLIC_KEY` (a chave pública) e publique de novo.
4. O discipulador abre **Avisos › Ativar notificações no celular**.
   - **Android:** funciona direto no navegador.
   - **iPhone:** só com o site instalado na tela inicial (Compartilhar › Adicionar à Tela de Início) e iOS 16.4 ou mais recente.

O site agora é um **PWA**: pode ser instalado na tela inicial e abre mesmo com a internet fraca.

> O envio automático **pelo WhatsApp** não está nesta versão, porque exige a API paga do WhatsApp Business. A função `enviarWhatsApp` dentro de `avisar-faltas` já está separada para ser ligada no futuro.

### Geração automática dos sábados (opcional)
Os cultos são gerados ao abrir a tela de Chamada. Se quiser gerar mesmo sem ninguém abrir a tela:
1. Ative a extensão **pg_cron** no Supabase.
2. Rode no SQL Editor:
   ```sql
   select cron.schedule('gerar-cultos', '0 9 * * 1', $$ select public.garantir_cultos(); $$);
   ```
Isso roda toda segunda às 6h de Brasília.

Os testes da chamada estão em `supabase/tests/03_chamada.sql` (veja a seção "Testes do banco").

---

## Apelido, sexo e responsável

**Novos campos:** `apelido` (até 30 caracteres; é como a pessoa gosta de ser chamada) e `sexo` (Feminino / Masculino). O apelido aparece em destaque na lista, na chamada, na área da rede e nos aniversariantes, e entra nas mensagens prontas do WhatsApp. Sem apelido, o sistema usa o primeiro nome.

**Regra dos 14 anos:** abaixo de 14, nome e telefone do responsável são obrigatórios no formulário e no banco. A antiga regra dos 12 anos e o "recomendado de 12 a 17" saíram. O responsável aparece para a rede sempre que estiver preenchido, em qualquer idade.

**Migração:** rode `supabase/migrations/20261020000000_apelido_sexo_responsavel.sql` (SQL Editor). Ela recalcula as inconsistências de todos; ninguém que já estava validado volta para pendente.

### Como completar a base importada
1. **Sexo em massa:** em *Jovens*, filtre *Sexo › Não informado*, marque todos e use **Definir sexo**. O sistema sugere pelo primeiro nome; confira linha por linha (ou use "Todos Feminino/Masculino") e clique em **Aplicar**.
2. **Menores sem responsável:** use o filtro **Menores de 14 sem responsável** (ou o card no Dashboard) e preencha pela ficha.
3. **Apelido:** pode ficar para o próprio jovem, porque ele completa na tela *Complete seu cadastro* ao entrar. Se quiser adiantar, a **Fila de validação** já tem Apelido, Sexo e Responsável editáveis na mesma tela.
4. O Dashboard mostra Feminino / Masculino, **Cadastros incompletos (sem apelido ou sexo)** e o gráfico de faixa etária com a opção **Separar por sexo**. A exportação ganhou as colunas Apelido e Sexo.

---

## Acessos

Aba **Acessos** no painel (só admin). Toda criação, desativação ou remoção de acesso fica no **Registro de acessos**, no fim da aba.

| Acesso | Como entra | O que vê |
|---|---|---|
| **Administrador** | e-mail + código de 6 dígitos | Tudo: painel, jovens, rede, anotações, chamada, relatórios, Acessos |
| **Liderança / Discipulador** | e-mail + código | A própria rede (área "Minha rede"), avisos de falta e anotações da rede |
| **Secretário(a) da chamada** | **usuário + senha** | Só a Chamada: foto, nome e apelido dos jovens e o estado da presença |
| **Jovem** | e-mail + código | "Meu cadastro" |

### O secretário(a) só faz a chamada
- Pode: abrir a chamada, marcar presente, desmarcar, justificar falta, fechar (os avisos saem normalmente para os discipuladores), corrigir depois de fechada, cancelar e reativar culto.
- Não vê: telefone, e-mail, nascimento, idade, sexo, responsável, rede, discipulador, anotações, avisos, frequência, relatórios, dashboard, lista de jovens. O **motivo** de uma justificada só aparece se foi ele(a) quem registrou.
- Não pode: criar culto extra, editar jovem, ver ou criar acessos.
- Isso é garantido **no banco**: o secretário não tem nenhuma permissão nas tabelas `jovens`, `presencas`, `notificacoes`, anotações etc. Ele só lê pela função `lista_chamada` (7 colunas). O teste `supabase/tests/06_acessos.sql` prova isso tabela por tabela.
- Secretário é uma conta separada: não tem cadastro de jovem e não fica ligado a ninguém da rede.

### Instalar (uma vez)
1. Rode `supabase/migrations/20261021000000_acessos_secretarios.sql` no **SQL Editor**.
2. Publique a função que cria os logins com senha (ela usa a chave de serviço, que nunca vai para o site):
   ```bash
   npx supabase functions deploy gerenciar-secretarios
   ```
3. Em **Authentication › Providers › Email**, deixe **Email** ligado (é o que permite usuário + senha) e **Confirm email** ligado (padrão). Isso impede que alguém crie uma conta com senha usando o e-mail de outra pessoa.
4. (Opcional) O login do secretário usa um e-mail técnico `usuario@chamada.sedentos.app` que nunca recebe mensagens. Para trocar o domínio, defina o mesmo valor em `VITE_SECRETARIO_DOMINIO` (site) e no segredo `SECRETARIO_DOMINIO` da função.

### Criar um secretário(a)
1. **Acessos › Secretários › Novo secretário**.
2. Digite o **nome**. O **usuário** é sugerido (ex.: `maria.silva`) e pode ser trocado. A **senha** já vem gerada (fácil de ditar); pode trocar, mínimo de 8 caracteres.
3. Na tela de sucesso, use **Copiar mensagem** ou **Enviar no WhatsApp**: vai o link do site, o usuário e a senha. A senha não aparece de novo.
4. A pessoa abre o link, toca em **"Sou secretário(a) da chamada"** e entra. Cai direto na Chamada.

Em cada secretário: **Desativar/Reativar**, **Editar nome**, **Trocar senha** (esqueceu a senha? crie uma nova aqui) e **Remover**. Desativar ou remover corta o acesso **na hora**: a próxima ação dele já é recusada.

### Administradores pela tela
**Acessos › Administradores › Novo administrador**: digite o e-mail e confirme que entende que administradores veem **todos** os dados, inclusive as anotações de discipulado. A pessoa entra pelo código no e-mail. **Remover** fica bloqueado para você mesmo e para o último administrador (o banco também impede).

### Rede (somente leitura)
Lista quem entra por ser Liderança ou Discipulador, com o e-mail e o último acesso. Quem aparece com **"sem e-mail, não consegue entrar"** precisa ter o e-mail preenchido na ficha. Para mudar o papel, toque na pessoa e use a ficha.

---

## Faixas etárias

O ministério começa aos **12 anos**. O Dashboard, o filtro de faixa da lista e a exportação usam as mesmas faixas, definidas num lugar só (`FAIXAS` em `src/lib/formato.js`, espelhando `public.faixa_etaria()` no banco):

Abaixo de 12 (em destaque: ainda é da salinha) · 12 a 14 · 15 a 17 · 18 e 19 · 20 e 21 · 22 e 23 · 24 e 25 · 26 e 27 · 28 e 29 · 30+ · Sem data válida.

O gráfico conta só jovens **ativos**, pode separar por sexo e cada faixa abre a lista filtrada.

Ao lado fica o gráfico **"Até 19 × 20+"**: uma barra dividida em dois grupos, com o número e a % de cada um (só ativos; quem não tem data válida fica fora e aparece contado embaixo). O mesmo "Separar por sexo" mostra Feminino/Masculino dentro de cada grupo, e tocar num grupo abre a lista filtrada. O corte de 20 anos é `IDADE_CORTE_GRUPO`, em `src/lib/formato.js`, junto das faixas. A lista de jovens ganhou as opções "Até 19" e "20+" no filtro de faixa etária. Para mudar as faixas, altere os dois lugares e rode `npm test` (o teste confere que não há sobreposição).
