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
`npm run test:db` confirma isso em cada alteração.

**Migração `20260919160000_diretorio_lista_geral` (diretório da lista geral).**
Traz a lista geral de cultos da equipa para a base de dados: 135 linhas da folha
passam a **73 lugares** (63 presenciais e 10 igrejas online, em 18 países), cada
um com todos os seus dias de culto e a morada quando a folha a indica. Acrescenta
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

## 4. Verificar depois de publicar

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
