# Modelo de dados

Os elementos de que a aplicação precisa, o que já existe e o que falta. O
vocabulário segue [istn-context.md](istn-context.md): diz-se igreja, não
congregação, e uma casa de oração não é uma igreja.

Marcação usada: **existe** está em produção; **falta** ainda não foi construído.

---

## Igreja / casa de oração — `churches` · existe, incompleta

Um lugar onde a ISTN se reúne. Hoje a tabela trata todos os lugares
presenciais como iguais.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | |
| `record_id` | text | Identificador do anúncio de origem. Único. |
| `modality` | text | `physical` ou `online`. |
| `country_code` `country` | text | Código para presenciais, nome livre para online. |
| `region` `locality` | text | |
| `service_day` `service_time_local` | text | Hora local do lugar, não de Luanda. |
| `leader_name` `leader_phone` | text | Nome com a abreviatura da função (`Bp.`, `Pr.`). |
| `note` `source` | text | Proveniência do registo. |
| `verification_status` | text | `needs_review` ou `verified`. |
| `verified_at` `verified_by` | timestamptz, uuid | Quem confirmou, e quando. |

**O que falta.** A distinção entre igreja e casa de oração, que é de estatuto e
não de dimensão:

| Campo a acrescentar | Porquê |
| --- | --- |
| `place_type` | `igreja` ou `casa_de_oracao`. Sem isto a aplicação não pode nomear o lugar sem arriscar chamar igreja ao que ainda não é. |
| `became_church_on` | Data em que a casa de oração passou a igreja, quando aplicável. Uma casa de oração é o estado inicial, não uma categoria separada, e essa passagem é um facto do ministério. |

Enquanto `place_type` não existir, a interface diz «Local presencial».

---

## Reunião — `meetings` · existe

Uma reunião no Zoom, com a sua sala e a sua recorrência. Substituiu a
configuração única que só sabia exprimir um horário semanal.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | |
| `title` | text | |
| `kind` | text | `geral` (convencional) ou `especial`. |
| `zoom_url` `zoom_meeting_id` `zoom_passcode` | text | Cada reunião tem a sua sala. |
| `start_time` | time | Hora de Luanda. Nulo quando não há hora fixa. |
| `time_note` | text | Ocupa o lugar da hora quando não há: «Após a live dos ministros». |
| `recurrence` | text | `weekly`, `monthly_last`, `yearly`, `once`. |
| `weekdays` | smallint[] | Domingo é 0. Vários em `weekly`, um só em `monthly_last`. |
| `event_date` | date | Dia exato em `once`; mês e dia em `yearly`, ano ignorado. |
| `active` | boolean | Deixa de aparecer sem ser apagada. |
| `sort_order` | integer | |

Restrições garantem que o padrão está completo e que existe hora **ou**
explicação. Uma reunião sem hora é listada mas não entra no cálculo da próxima
nem gera lembrete — não se pode pôr num relógio o que não tem hora.

---

## Servo — **falta**

Hoje o responsável de um lugar é texto livre em `leader_name`, com a função
embutida no nome. Isso impede procurar por função, saber quem é ministro, ou
ligar a mesma pessoa a mais do que um lugar.

| Campo | Notas |
| --- | --- |
| `id` | |
| `full_name` | Sem a abreviatura da função. |
| `role` | Da hierarquia: `apostolo`, `bispo`, `bispo_auxiliar`, `pastor`, `pastor_auxiliar`, `discipulo`, `obreiro`, `futuro_obreiro`. |
| `female_role` | `dona`, `obreira`, `futura_obreira`. |
| `phone` | |
| `church_id` | O lugar onde serve. |

Ser ministro é discípulo para cima — deriva de `role`, não se guarda à parte,
para não poder ficar em contradição. As funções femininas são uma lista
própria porque não são níveis da mesma hierarquia.

Enquanto isto não existir, `leader_name` continua a ser a origem, e o nome não
deve ser normalizado: a abreviatura é a única indicação de função que há.

---

## Acervo de pregações — `youtube-teachings.json` · existe, fora da base de dados

379 registos importados da folha Excel editorial por
`scripts/import_youtube_library.py`. Campos: `publishedAt`, `title`,
`biblicalReference`, `service`, `url`, `startsAt`, `endsAt`.

Vive num ficheiro, não na base de dados, e portanto só muda quando alguém corre
o script e publica. Passá-lo para a base de dados daria à equipa o mesmo
controlo que já tem sobre as reuniões — mas é o único elemento cuja edição não
é urgente, porque o passado não muda.

---

## Equipa de administração — `admin_profiles` · existe

| Campo | Notas |
| --- | --- |
| `id` | O mesmo do utilizador em `auth.users`. |
| `full_name` | |
| `role` | `central` ou `local`. |
| `church_id` | Para um editor local, o único lugar que pode editar. |

Não confundir com **Servo**: isto é quem administra a aplicação, não a função
no ministério. Um bispo pode não ter conta; um editor local pode ser obreiro.

---

## Registo de alterações — `audit_log` · existe

Escrito por gatilho, não por código da aplicação, para que nenhum caminho de
edição o consiga contornar. Guarda tabela, registo, ação, autor, momento, e a
linha completa antes e depois.

---

## Utilizador da congregação — **falta**

O perfil na aplicação é hoje um stub: os botões mostram um aviso e nada é
guardado. O que a especificação pede é país, igreja preferida, idioma e
preferências de notificação, sem obrigar a criar conta para navegar.

Implica decidir onde guardar: sem conta, só o próprio dispositivo; com conta,
sincroniza entre dispositivos. A especificação diz que navegar não exige conta,
o que aponta para guardar localmente por omissão e oferecer conta a quem quiser
as preferências em mais do que um telemóvel.

---

## Anúncios — **falta**

A especificação do painel pede anúncios globais da equipa central e anúncios
locais de cada igreja. Nada disto existe. Um anúncio local pertence a um
`church_id`; um global não pertence a nenhum.

---

## `live_config` — obsoleta

Guardava a reunião única e o seu horário. Desde que as reuniões passaram para
`meetings`, a aplicação já não a lê. As colunas continuam lá, sem uso. Remover
é uma decisão a tomar, não um efeito secundário: apagar colunas destrói os
valores que ainda contêm.
