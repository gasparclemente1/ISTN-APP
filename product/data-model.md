# Modelo de dados

Os elementos de que a aplicação precisa, o que já existe e o que falta. O
vocabulário segue [istn-context.md](istn-context.md): diz-se igreja, não
congregação, e uma casa de oração não é uma igreja.

Marcação usada: **existe** está em produção; **falta** ainda não foi construído;
**a rever** existe mas não na forma abaixo.

Três decisões da equipa atravessam todo o modelo:

1. Usar a aplicação **não exige conta**. Quem não cria conta guarda as suas
   preferências apenas no próprio dispositivo.
2. Um servo **tem de ser aprovado** pela administração. Ninguém se declara
   bispo a si próprio.
3. Contas de servo aprovadas mostram **selo de verificação**, com cor conforme
   a função. As cores ficam por decidir.

---

## Igreja / casa de oração — `churches` · a rever

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | |
| `record_id` | text | Identificador do anúncio de origem. Único. |
| `place_type` | text | **A acrescentar.** `igreja` ou `casa_de_oracao`. |
| `became_church_on` | date | **A acrescentar.** Quando a casa de oração passou a igreja. |
| `modality` | text | `physical` ou `online`. |
| `country_code` | text | Código ISO 3166, **escolhido de uma lista** no painel (`src/countries.js`), nunca escrito. A base de dados só aceita duas letras maiúsculas. |
| `country` | text | O nome do país como a lista de origem o escreveu («Inglaterra»). Vazio: usa-se o nome do código («Reino Unido»). Mudar o país no painel limpa-o, para os dois não se contradizerem. |
| `region` | text | **Manter.** Preenchida em 75 registos; o diretório filtra por ela. |
| `locality` | text | |
| `address` | text | **A acrescentar.** Morada, para quem se desloca. |
| `whatsapp_group_url` | text | **A acrescentar.** Convite para o grupo. Diferente do contacto do líder. |
| `photo_url` | text | **A acrescentar.** Ver nota sobre imagens. |
| `leader_name` `leader_phone` | text | Origem até existir `servos`. Não normalizar: a abreviatura é a única indicação de função. |
| `note` `source` | text | Proveniência. Não apagar — é o que sustenta a regra do README. |
| `verification_status` | text | `needs_review` ou `verified`. |
| `verified_at` `verified_by` | timestamptz, uuid | |
| `updated_at` | timestamptz | |
| `seat` | text | `mundial` ou `nacional`. Uma sede mundial; no máximo uma sede nacional por país. Só a equipa central muda, com `set_church_seat`, que tira a sede ao lugar que a tinha na mesma transação. Um gatilho devolve o valor anterior a quem mais o tentar mudar. |
| `other_leaders` | jsonb | Outros responsáveis, `[{name, phone}]`, como a lista da equipa os publica (Alto Garças tem um bispo e um pastor). O primeiro contacto continua a ser `leader_name`. |
| `former_record_ids` | text[] | Os identificadores que o lugar teve antes de a importação juntar os seus registos (`source_record_001` e `source_record_064` são hoje `ao-kifica`). A aplicação encontra um lugar por eles: links partilhados e «A minha ISTN» antigos continuam a abrir. |

**De onde vem o diretório.** Da lista geral de cultos da equipa (uma folha
Excel com uma linha por culto), importada por `scripts/import_churches.py`: um
registo por lugar, com todos os seus dias de culto. O script escreve
`data/igrejas.json` — a cópia que o servidor usa quando a base de dados não
responde — e a migração que leva a base de dados ao mesmo estado. Cada decisão
tomada (lugares juntados, grafias, números diferentes) fica em
`data/importacao-igrejas.md`. `data_imports` guarda que importações já
correram, para que nenhuma volte a correr por cima de edições do painel.

**Juntar dois registos do mesmo lugar** faz-se com `merge_church_into(fica,
sai)`, só no editor SQL: move servos, editores locais, a igreja dos membros e os
anúncios para o registo que fica, guarda o que a equipa escreveu no outro, e só
então o apaga. `posts.church_id` apaga em cascata; sem isto, os anúncios da
igreja repetida desapareciam com ela.

**Os ministros não são um campo daqui.** É a mesma relação que `servos.church_id`
e, guardada dos dois lados, um dia as duas versões discordam. A igreja pergunta
quem serve ali; não guarda a lista.

**Imagens.** Uma foto ajuda quem chega pela primeira vez a reconhecer o lugar —
que é quando o diretório mais serve. Exige armazenamento e redimensionamento na
importação. As 99 fotografias do Profeta ocupam 63 MB por não terem sido
tratadas; nenhuma imagem deve entrar sem passar por
`scripts/optimize_images.py` ou equivalente.

---

## Horário de culto — `church_services` · existe

Uma igreja pode ter culto ao sábado **e** ao domingo. Hoje há um par de campos
únicos, que só sabe guardar um.

| Campo | Notas |
| --- | --- |
| `id` | |
| `church_id` | |
| `weekday` | Domingo é 0. |
| `start_time` | Hora **local do lugar**, não de Luanda. |
| `label` | Opcional: «Culto dos servos», «Vigília». |

O painel grava a lista inteira com `replace_church_services` (migração 008), numa
só transação: se a gravação falhar, os horários anteriores ficam. Uma linha sem
hora («Domingo, hora por saber») é guardada, não descartada.

Substitui `service_day` e `service_time_local`, que devem ser migrados antes de
saírem.

---

## Reunião — `meetings` · existe

Reunião no Zoom do ministério, com sala e recorrência próprias.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | |
| `title` | text | |
| `kind` | text | `geral` ou `especial`. |
| `zoom_url` `zoom_meeting_id` `zoom_passcode` | text | |
| `start_time` | time | Hora de Luanda. Nulo quando não há hora fixa. |
| `time_note` | text | Ocupa o lugar da hora: «Após a live dos ministros». |
| `recurrence` | text | `weekly`, `monthly_last`, `yearly`, `once`. |
| `weekdays` | smallint[] | Vários em `weekly`, um só em `monthly_last`. |
| `event_date` | date | Dia exato em `once`; mês e dia em `yearly`. |
| `active` `sort_order` | boolean, integer | |

Não confundir com `church_services`: estas são do ministério inteiro, no Zoom;
aquelas são presenciais, de cada lugar.

---

## Servo — `servos` · existe

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | |
| `full_name` | text | **Sem** a abreviatura da função. |
| `gender` | text | `masculino` ou `feminino`. |
| `role` | text | `apostolo`, `bispo`, `bispo_auxiliar`, `pastor`, `pastor_auxiliar`, `discipulo`, `obreiro`, `futuro_obreiro`, `dona`, `obreira`, `futura_obreira`. |
| `is_minister` | boolean | **Coluna gerada.** Verdadeira de discípulo para cima. |
| `phone` | text | **Em `servo_contacts`** desde a migração 007. Privado por omissão: a equipa lê-o; o público só o vê se o próprio servo ligar «Mostrar o meu número» (`phone_public`) na sua conta verificada. A equipa não pode tornar um número público, e um número mudado pela equipa volta a ser privado. |
| `church_id` | uuid | Onde serve. |
| `photo_url` | text | |
| `created_at` | timestamptz | |

**`is_minister` é calculado, não escrito.** Se fosse editável, um dia teria
função «Obreiro» e `is_minister` verdadeiro ao mesmo tempo, e a base de dados
estaria a afirmar duas coisas contraditórias. Como coluna gerada lê-se como
qualquer outra e nunca pode divergir da função.

**A abreviatura é derivada, não guardada.** O nome mostrado é «Bp. Rufino
Boaz», mas o que está na coluna é «Rufino Boaz». Guardar o prefixo junto do
nome faria com que uma promoção deixasse o tratamento errado até alguém o
corrigir à mão. As abreviaturas estão em `src/roles.js`: Ap., Bp., Bp. Aux.,
Pr., Pr. Aux., Disc., Obr., Fut. Obr. e Dona.

**A regra do ministério é imposta pela base de dados.** Uma restrição garante
que `dona`, `obreira` e `futura_obreira` só existem com `gender = 'feminino'`,
e que de discípulo para cima só com `masculino`. A estrutura recusa o erro em
vez de o registar.

---

## Utilizador — `app_users` · **falta**

Um membro que criou conta. Quem não criou continua a usar tudo; as preferências
ficam no dispositivo.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | O mesmo de `auth.users`. |
| `display_name` | text | |
| `phone` | text | Opcional. |
| `country_code` | text | |
| `home_church_id` | uuid | «A minha ISTN». |
| `language` | text | `pt` por omissão. |
| `meeting_reminders` | boolean | |
| `photo_url` | text | Carregada pelo próprio; reduzida no telemóvel antes do envio. |
| `gender` | text | `masculino` ou `feminino`. Determina as funções que se podem pedir. |
| `city` | text | |
| `claimed_role` | text | A função pedida. Tem de corresponder ao género; Apóstolo não se pede. |
| `servo_id` | uuid | **Só a equipa central escreve.** Preenchido ao aprovar. |
| `servo_claim_status` | text | `nenhum`, `pendente`, `aprovado`, `recusado`. Só a equipa central escreve. |
| `created_at` | timestamptz | |

E `favorites` (utilizador, pregação, data), que a especificação pede em P1.

### Aprovação e selo

O selo é um sinal de confiança: se o próprio o pudesse atribuir, não valeria
nada. Por isso `servo_id` e `servo_claim_status` **não são escritos pelo
utilizador**, mesmo sendo a sua própria linha. Um utilizador pede; a equipa
central liga a conta a um registo de `servos` e o pedido passa a aprovado.

Isto é uma permissão ao nível da coluna, não da linha — o utilizador pode
alterar o seu nome e as suas preferências na mesma linha onde não pode tocar
nestes dois campos.

A cor do selo deriva de `servos.role`. Nada de cor se guarda aqui: é
apresentação, e guardá-la permitiria que divergisse da função.

### Pedir uma função

O membro indica género, função e igreja, e o pedido fica `pendente`. Enquanto
estiver pendente ou aprovado, a função e o género não mudam — a equipa aprovaria
algo diferente do que leu. O membro pode retirar um pedido pendente.

A equipa central trata os pedidos no separador **Pedidos** do painel.
`approve_servo_claim` cria o registo em `servos` (ou liga a conta a um que já
exista, para não duplicar) e marca o pedido como aprovado **numa só transação**;
`reject_servo_claim` recusa. Ambas recusam quem não for da equipa central.

### Onde a conta é oferecida

A página inicial convida a entrar ou a registar-se. O convite **não bloqueia**:
quem o ignora continua a ver ensinos, reuniões e o diretório na mesma, porque
usar a aplicação não exige conta. O que a conta acrescenta é o que não cabe num
só dispositivo — preferências em mais do que um telemóvel, favoritos, e o
pedido de verificação de servo.

O convite deve dizer o que se ganha, não apenas «criar conta». Um membro que
não percebe o que muda não se regista, e um que se regista sem perceber fica
com uma conta que não usa.

### Privacidade

A política destas linhas **não é a das igrejas e reuniões**. Ali a equipa
central lê tudo, e faz sentido. Aqui não: um membro da congregação não deve
ficar visível para a administração por omissão. Cada pessoa lê e escreve a sua
linha; a equipa central vê apenas o que precisa para tratar pedidos de
verificação.

---

## Acervo de pregações — `youtube-teachings.json` · existe, fora da base de dados

379 registos importados da folha Excel por
`scripts/import_youtube_library.py`. Campos: `publishedAt`, `title`,
`biblicalReference`, `service`, `url`, `startsAt`, `endsAt`.

Só muda quando alguém corre o script e publica. É o único elemento cuja edição
não é urgente — o passado não muda.

---

## Equipa de administração — `admin_profiles` · existe

| Campo | Notas |
| --- | --- |
| `id` | O mesmo de `auth.users`. |
| `full_name` | |
| `role` | `central` ou `local`. |
| `church_id` | Para um editor local, o único lugar que pode editar. |

**Não confundir com `servos`.** Isto é quem administra a aplicação; aquilo é a
função no ministério. Um bispo pode não ter conta; um editor local pode ser
obreiro. São três identidades distintas — `admin_profiles`, `servos`,
`app_users` — e uma pessoa pode ter as três, uma ou nenhuma.

---

## Registo de alterações — `audit_log` · existe

A equipa central consulta-o no separador **Histórico** do painel. As linhas de
`app_users` não aparecem ali, pela mesma razão de privacidade descrita acima.

Escrito por gatilho, não por código da aplicação, para que nenhum caminho de
edição o consiga contornar. Guarda tabela, registo, ação, autor, momento, e a
linha completa antes e depois.

---

## Anúncios e publicações — `posts` · existe

Um anúncio pertence a uma igreja (`church_id`) ou a toda a ISTN (`church_id`
nulo). Pode ser **destacado**, com ou sem data de fim: `highlight_until` faz o
destaque terminar sozinho, sem ninguém se lembrar de o retirar.

| Campo | Notas |
| --- | --- |
| `author_id` | Escrito pelo gatilho a partir de quem está autenticado. Nunca vem do pedido. |
| `church_id` | Nulo: toda a ISTN. |
| `title` `body` | O título é opcional; o corpo não pode ficar vazio. |
| `highlighted` `highlight_until` | Destaque, e até quando. |
| `hidden` `hidden_by` `hidden_at` | Moderação. Esconder é reversível; eliminar não. |

E ainda `post_images` (imagens, por ordem, só `https://`), `post_comments`
(comentários, também com `hidden`) e `post_reactions` (uma reação por pessoa e
por anúncio).

### Quem pode o quê

| Ação | Quem |
| --- | --- |
| Ler | Qualquer pessoa, com ou sem conta. |
| Publicar | Equipa central e Apóstolo (toda a ISTN), editor local (a sua igreja), e contas a quem a equipa central der `app_users.publish_scope` = `igreja` ou `global`. |
| Comentar | Só servos verificados (decisão da equipa). |
| Reagir | Qualquer conta, na sua própria linha. |
| Esconder / eliminar | O autor, no que é seu; a equipa central em tudo; o editor local na sua igreja. |

`publish_scope` **só a equipa central escreve** — um gatilho devolve o valor
anterior a quem tentar mudá-lo, incluindo na sua própria linha. Um anúncio
escondido continua visível ao autor e a quem modera, para poder ser reposto.

**A vista `post_authors`** mostra ao público apenas o nome, a fotografia, a
função e o selo de quem escreveu. `app_users` continua privada: nem email, nem
telefone, nem cidade, nem igreja.

**Imagens** vão para o *bucket* `publicacoes`, cada pessoa na sua pasta, com no
máximo 5 MB por ficheiro; o telemóvel reduz a imagem a 1600 px antes de enviar.

---

## `live_config` — obsoleta

Guardava a reunião única e o seu horário. A aplicação já não a lê. As colunas
continuam lá, sem uso. Remover é uma decisão a tomar, não um efeito secundário:
apagar colunas destrói os valores que ainda contêm.
