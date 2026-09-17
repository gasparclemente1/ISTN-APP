# Publicar a ELIAS — ISTN-SJ

A aplicação corre no [Render](https://render.com) a partir de `render.yaml`, e os
dados vivem no Supabase. Cada `push` para `main` é construído (`npm run check &&
npm test`) e publicado.

## 1. Supabase — uma vez por projeto

1. No editor SQL, correr por esta ordem: `supabase/schema.sql`, `supabase/seed.sql`
   e depois cada ficheiro de `supabase/migrations/` por ordem numérica.
2. **Authentication → URL Configuration**: definir o *Site URL* como o endereço
   público da aplicação (por exemplo `https://elias-istn-sj.onrender.com`) e
   acrescentar o mesmo endereço às *Redirect URLs*. Sem isto, entrar com Google
   devolve um erro.
3. **Authentication → Providers**: ativar **Google** (além de email). Desativar
   Facebook e Zoom, se estiverem ativos: a aplicação só oferece o Google.
4. Criar as contas da equipa em **Authentication → Users** e, para cada uma, uma
   linha em `admin_profiles` (`role` = `central`, ou `local` com o `church_id`
   da igreja que essa pessoa edita).

## 2. Render — uma vez

1. **New → Blueprint**, escolher o repositório. O Render lê `render.yaml`.
2. Em **Environment**, preencher:
   - `SUPABASE_URL` — o endereço do projeto, ou só o id;
   - `SUPABASE_PUBLISHABLE_KEY` — a chave pública (*anon*). **Nunca** a
     `service_role`;
   - `SUPABASE_OAUTH_PROVIDERS` — `google`. Qualquer outro valor é ignorado.
3. O HTTPS é dado pelo Render. O servidor envia `Strict-Transport-Security`
   quando o pedido chega por HTTPS.

## 3. Cada publicação com migrações novas

Uma alteração que traz um ficheiro novo em `supabase/migrations/` precisa dele
na base de dados **antes** de o código chegar a `main`:

1. Correr a migração nova no editor SQL do Supabase.
2. Fazer merge do pull request. O Render publica em 2–3 minutos.

As migrações podem ser corridas mais do que uma vez sem estragar nada; o
`npm run test:db` confirma isso em cada alteração.

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
