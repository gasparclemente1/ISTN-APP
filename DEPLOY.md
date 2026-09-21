# Publicar a aplicação ISTN-SJ

A aplicação corre no [Render](https://render.com) a partir de `render.yaml`, e os
dados vivem no Supabase. Cada `push` para `main` é construído (`npm run check &&
npm test`) e publicado.

## 1. Supabase — uma vez por projeto

1. No editor SQL, correr por esta ordem: `supabase/schema.sql`, `supabase/seed.sql`
   e depois cada ficheiro de `supabase/migrations/` por ordem numérica.
2. **Authentication → URL Configuration**:
   - *Site URL*: o endereço público da aplicação, por exemplo
     `https://elias-istn-sj.onrender.com`. O Supabase cria este valor como
     `http://localhost:3000`. Enquanto não for mudado, o link do email de
     confirmação leva a um endereço `localhost` que não abre.
   - *Redirect URLs*: acrescentar `https://ENDEREÇO-PÚBLICO/**`. A aplicação
     pede ao Supabase para voltar a `/perfil` depois da confirmação do email e
     do Google, e o Supabase só aceita endereços desta lista. Um endereço fora
     da lista faz o Supabase usar o *Site URL*.
   - Em **Authentication → Email Templates**, os modelos devem usar
     `{{ .ConfirmationURL }}`, que é o valor por omissão. Se alguém escreveu um
     endereço fixo com `localhost`, tem de o substituir.
3. **Authentication → Providers**: ativar **Google** (além de email), com o
   *Client ID* e o *Client Secret* do Google Cloud. O botão «Continuar com
   Google» aparece sozinho, em até 5 minutos, assim que o Google estiver ativo
   aqui. Desativar Facebook e Zoom, se estiverem ativos: a aplicação só oferece
   o Google.
4. Criar as contas da equipa em **Authentication → Users** e, para cada uma, uma
   linha em `admin_profiles` (`role` = `central`, ou `local` com o `church_id`
   da igreja que essa pessoa edita).

## 2. Render — uma vez

1. **New → Blueprint**, escolher o repositório. O Render lê `render.yaml`.
2. Em **Environment**, preencher:
   - `SUPABASE_URL` — o endereço do projeto, ou só o id;
   - `SUPABASE_PUBLISHABLE_KEY` — a chave pública (*anon*). **Nunca** a
     `service_role`;
   - `SUPABASE_OAUTH_PROVIDERS` — opcional. Só é usado se o servidor não
     conseguir ler as definições do Supabase; nesse caso, `google`.
3. O HTTPS é dado pelo Render. O servidor envia `Strict-Transport-Security`
   quando o pedido chega por HTTPS.

## 3. Cada publicação com migrações novas

Uma alteração que traz um ficheiro novo em `supabase/migrations/` precisa dele
na base de dados **antes** de o código chegar a `main`:

1. Correr a migração nova no editor SQL do Supabase.
2. Fazer merge do pull request. O Render publica em 2–3 minutos.

As migrações podem ser corridas mais do que uma vez sem estragar nada; o
`npm run test:db` confirma isso em cada alteração. Confirma também que cada
migração corre **instrução a instrução**, como o editor SQL do Supabase a
executa: uma migração que dependa de uma tabela temporária, por exemplo, falha
nos testes em vez de falhar no editor.

**Migração `20260920120000_create_church_from_panel` (criar igrejas no
painel).** A equipa central passa a acrescentar igrejas a partir do painel, sem
SQL: a igreja nasce completa — identidade, país, horários — numa só transação.
O identificador é gerado do país e da localidade (`ao-viana-centro`) e passa a
ser o endereço da igreja na aplicação, por isso não muda depois. A modalidade
(presencial ou igreja online) passa também a poder ser mudada: um lugar que
reunia online e arranjou salão deixa de precisar de alguém que escreva SQL.

**Migração `20260920030000_church_country_from_list` (país de uma lista).** O
país de uma igreja passa a ser escolhido no painel a partir da lista de
`src/countries.js` (ISO 3166, nomes em português europeu) e deixa de poder ser
escrito à mão: escrito à mão, o mesmo país chega como «Brasil», «brasil» e
«Brazil», e o diretório mostra três grupos onde há um. A base de dados recusa
qualquer coisa que não seja um código de duas letras. Ao mudar o país de um
lugar, o nome que a lista de origem escrevia («Inglaterra») sai com ele, para
que o nome mostrado venha sempre do código.

**Migração `20260919160000_diretorio_lista_geral` (diretório da lista geral).**
Traz a lista geral de cultos da equipa para a base de dados: 135 linhas da folha
passam a **73 lugares** (63 presenciais e 10 igrejas online, em 18 países), cada
um com todos os seus dias de culto e o endereço quando a folha o indica. Acrescenta
a sede (mundial ou nacional), os outros responsáveis de um lugar e os
identificadores antigos de cada lugar, para que links partilhados e «A minha
ISTN» continuem a funcionar.

1. Antes de correr, rever as sedes propostas em
   [data/importacao-igrejas.md](data/importacao-igrejas.md). Se alguma estiver
   errada, pode corrigi-la depois no painel (Diretório → a igreja → Sede), sem
   voltar a correr nada.
2. Correr o ficheiro no editor SQL. Os registos que eram o mesmo lugar anunciado
   duas vezes (Kifica ao sábado e ao domingo) juntam-se num só; os servos, os
   editores locais, a igreja escolhida pelos membros e os anúncios que apontavam
   para o registo repetido passam para o que fica, antes de ele sair. Nada é
   apagado sem isso.
3. Corre uma só vez: fica registado em `data_imports`, e corrê-lo de novo não
   muda nada — nem desfaz o que a equipa tenha entretanto editado no painel.
4. Fazer merge logo a seguir. Nos 2–3 minutos até o Render publicar, a versão
   antiga ainda não conhece os identificadores novos: um link antigo ou «A
   minha ISTN» podem não abrir até a versão nova chegar, que os reconhece.
   Se o código chegar primeiro, a aplicação mostra a lista a partir de
   `data/igrejas.json` e o painel não grava igrejas até a migração correr.

Para importar uma lista nova no futuro:

```bash
python3 scripts/import_churches.py ~/Downloads/lista.xlsx --migracao supabase/migrations/AAAAMMDDHHMMSS_diretorio.sql
```

Escreve `data/igrejas.json`, `data/importacao-igrejas.md` (as decisões tomadas,
para rever) e uma migração nova, com outro nome. Uma migração que já correu em
produção nunca se reescreve.

**Migração 009 (anúncios).** Cria as publicações, comentários, reações e o
*bucket* `publicacoes`. Depois de a correr, o separador **Anúncios** do painel
passa a funcionar; até lá, mostra um erro.

**Migrações 007 e 008 (esta entrega).** A 007 move os telefones dos servos para
`servo_contacts`, todos privados até cada servo escolher mostrá-lo, e a 008 cria `replace_church_services`. Entre correr as
migrações e o Render terminar de publicar, o painel antigo não consegue gravar
o telefone de um servo. Convém fazê-lo fora das horas das reuniões.

## 4. O domínio próprio — istnsj.org

Registado na Cloudflare a 20 de setembro de 2026. O endereço tem de ficar
decidido **antes** de a aplicação ser partilhada com a igreja: quem a instala
no telemóvel fica preso ao endereço com que a instalou, e mudá-lo depois
obriga cada pessoa a reinstalar.

1. **Render → o serviço → Settings → Custom Domains.** Acrescentar
   `istnsj.org` e `www.istnsj.org`. O Render mostra, para cada um, o registo de
   DNS que espera (em regra um `A` para a raiz e um `CNAME` para o `www`).
2. **Cloudflare → istnsj.org → DNS → Records.** Criar exatamente esses
   registos, com **Proxy status: DNS only** — a nuvem cinzenta. Com a nuvem
   laranja, o Render não consegue emitir o certificado HTTPS.
3. Esperar que o Render verifique e emita o certificado (minutos).
4. **Render → Environment:** `CANONICAL_HOST=istnsj.org`. A partir daí, quem
   chegar pelo endereço antigo `…onrender.com` ou por `www` é reencaminhado
   para o endereço novo, com o caminho que pediu. O exame de saúde
   (`/healthz`), que o Render chama pelo nome do próprio serviço, continua a
   responder 200.
5. **Supabase → Authentication → URL Configuration:** *Site URL*
   `https://istnsj.org` e, em *Redirect URLs*, acrescentar
   `https://istnsj.org/**`. Sem isto, os emails de confirmação de conta
   continuam a levar ao endereço antigo. Manter o endereço antigo na lista
   durante uns dias não faz mal.
6. Verificar:

```bash
curl -sI https://istnsj.org/ | head -1
curl -sI https://ANTIGO.onrender.com/igrejas | grep -i "^location"
```

O primeiro deve responder `HTTP/2 200`; o segundo deve mostrar
`location: https://istnsj.org/igrejas`.

## 5. Verificar depois de publicar

Substituir `APP` pelo endereço público.

```bash
curl -s APP/healthz
```

Deve responder `{"ok":true}`.

```bash
curl -sI APP/ | grep -iE "content-security-policy|strict-transport|x-frame"
```

Deve mostrar os três cabeçalhos, com o endereço do Supabase em `connect-src`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" APP/.git/config
```

Deve responder `404`. O mesmo para `APP/server.mjs` e `APP/supabase/seed.sql`.

```bash
curl -s APP/api/directory | head -c 120
```

Deve começar por `{"churches":[` e ter `"source":"supabase"`. Se disser
`"arquivo"`, o servidor não chegou ao Supabase: rever as variáveis do passo 2.

Depois, no telemóvel: seguir [qa/checklist-dispositivos.md](qa/checklist-dispositivos.md).

## Desenvolvimento local

```bash
cp .env.example .env
```

Preencher `.env` (opcional) e arrancar:

```bash
npm run dev
```

Testes:

```bash
npm test
```

Testes da base de dados (precisa de PostgreSQL 14+ instalado):

```bash
npm run test:db
```

## Nomes das igrejas e gravação do Admin — 19/09/2026

Aplicar `20260919184817_admin_church_names_atomic_save.sql` antes desta versão.
A migração acrescenta `churches.name` e `save_church`, que guarda os dados,
horários e eventual mudança de sede numa única transação. No projeto
`mpylizblfkdrdpkjacdq`, esta migração foi aplicada e verificada em 19/09/2026.
O Admin central pode definir sedes; o editor local só altera a sua igreja.
Um nome vazio mantém a localidade como nome público. A atualização pública
pode demorar até um minuto por causa da cache.

O acervo de Ensinos continua em `data/youtube-teachings.json`; os últimos
vídeos são consultados no YouTube. Fotografias e textos de apresentação são
ficheiros da aplicação. Não são conteúdos editáveis no Admin.

## Comunidades, quem reagiu e ocultar o contacto — 21/09/2026

Aplicar `20260921120000_comunidades_reacoes_contacto.sql` **antes** de publicar
esta versão. Traz três coisas, e nenhuma delas funciona sem ela:

- `communities`, já com ML (Mulher no Lar), Acção Social e Grupo Jovem, e
  `posts.community_id`. As comunidades são de toda a ISTN, não de cada igreja,
  e trabalham como etiqueta: o anúncio continua a ser lido por todos, e os
  filtros em Anúncios mostram um de cada vez. Acrescentar outra comunidade é
  uma linha no editor SQL — `insert into public.communities (slug, name,
  short_name, sort_order) values ('nome-curto', 'Nome', 'Curto', 4);` — e só a
  equipa central lhe pode tocar.
- `post_reaction_people`, a vista que dá nome a quem reagiu. Mostra o mesmo que
  `post_authors` já mostrava — nome, foto, função e selo — e mais nada:
  `app_users` continua fechada.
- `app_users.phone_public`: ocultar ou mostrar o contacto deixa de ser só do
  servo verificado e passa a ser de qualquer conta. A escolha passa a viver na
  conta, e a linha do diretório (`servo_contacts`, migração 007) segue-a por
  gatilho. Quem já tinha escolhido mostrar o número continua a mostrá-lo; um
  número corrigido no painel por outra pessoa volta a privado, como em 007, e
  agora isso é dito também à conta, para que o interruptor no perfil não diga o
  contrário do que o diretório mostra.

Antes de publicar, confirmar no editor SQL que `select slug, name from
public.communities order by sort_order` devolve as três comunidades.

## Orações do Profeta Elias — 21/09/2026

Aplicar `20260921180000_oracoes.sql` **antes** de publicar esta versão. Traz:

- `prayer_themes`, já com os seis temas que a equipa nomeou e pela ordem dela —
  Finanças e portas abertas, Libertação Geral, Câncer & Coma, Doenças, Oração
  geral, Outros — e `prayers`, o catálogo dos áudios.
- O *bucket* `oracoes` no Storage, público para ler, com 25 MB por ficheiro.
  Voz em 64 kbps mono dá meio megabyte por minuto: 25 MB chegam para uma oração
  de quarenta minutos.
- `can_manage_prayers()`: quem acrescenta e corrige orações é a equipa central,
  o Apóstolo, e quem tem autorização para publicar para toda a ISTN. É a mesma
  autorização que o painel já atribui — não há um direito novo para distribuir.

Ler não precisa de conta, como o resto da aplicação.

**Depois da migração**, confirmar no editor SQL que `select name from
public.prayer_themes order by sort_order` devolve os seis temas, e carregar uma
oração pelo painel (separador «Orações») para ver o ficheiro chegar ao Storage.

**Atenção ao tráfego.** Os áudios são servidos pelo Supabase, e cada partilha
custa um download a quem envia — a partir daí o ficheiro viaja pelo WhatsApp,
não pelo projeto. Uma oração guardada não volta a ser descarregada. Ainda
assim, vale a pena ver o consumo do projeto na primeira semana: é a única parte
da aplicação que serve ficheiros pesados.

A política de conteúdo passou a permitir `media-src` do projeto Supabase e de
`blob:` (lib/security.mjs). Sem isso o navegador recusa tocar os áudios — foi
assim que este erro apareceu em testes.
