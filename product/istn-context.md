# ISTN-SJ — nomes, estrutura e vocabulário

Contexto do ministério, fornecido pela equipa ISTN-SJ. Serve para que a aplicação
use as palavras certas: quem a constrói não pertence necessariamente à igreja, e
os termos aqui não são intercambiáveis com os do uso comum.

## O projeto

**ISTN-SJ** — Igreja Salvação de Todas as Nações · Sol da Justiça.

O líder fundador é o **Apóstolo Marcelino Mário Bento, Profeta Elias**.

O decreto atual da ISTN-SJ é **Elias é Deus**.

## O nome da aplicação

A aplicação chama-se **ISTN-SJ** — não «ELIAS», nem «ISTN Elias». O nome
escreve-se em capitais romanas (a fonte Cinzel), como uma inscrição; o
logótipo é o sol por trás do globo.

## Como se chamam os lugares

Na ISTN **não se diz «congregação»**. Diz-se **igreja**.

Existem dois tipos de lugar presencial:

| Termo | O que é |
| --- | --- |
| **Igreja** | O lugar estabelecido. |
| **Casa de oração** | Menor que uma igreja. |

Em geral uma igreja começa como casa de oração e torna-se igreja depois. A
distinção é de estatuto, não de mera dimensão, e por isso não deve ser apagada
na interface: chamar «igreja» a uma casa de oração é dizer-lhe algo que ela
ainda não é.

Onde ainda não há um lugar presencial, a igreja reúne-se online (sobretudo
pelo WhatsApp): diz-se **igreja online**.

### Sedes

A ISTN-SJ tem uma **sede mundial**, e cada país pode ter a sua **sede
nacional**. Na lista das igrejas, a sede mundial vem em destaque e cada sede vem
primeiro no seu país, com um selo. A lista da equipa não diz quais são; a
equipa central indica-as no painel.

## Hierarquia dos servos

Do topo para a base:

1. Apóstolo
2. Bispos
3. Bispos Auxiliares
4. Pastores
5. Pastores Auxiliares
6. Discípulos
7. Obreiros
8. Futuros Obreiros

De **Discípulo para cima** são chamados **ministros**. Obreiros e Futuros
Obreiros não são ministros — é por isso que «Live dos Ministros» não é uma
reunião aberta a todos os servos.

## Funções femininas

| Termo | O que é |
| --- | --- |
| **Donas** | Esposas de ministros. |
| **Obreiras** | |
| **Futuras obreiras** | |

Não existem ministras na ISTN: da função de discípulo para cima, apenas homens.
Registado aqui como descrição da estrutura do ministério, para que a aplicação
não invente funções nem presuma equivalências que não existem.

## Consequências para a aplicação

- Usar **igreja**, nunca «congregação», em texto visível ao utilizador.
- Nunca chamar **ministério** à igreja. «Ministério» é individual: é o de uma
  pessoa. Os canais do YouTube são «Canais do YouTube», não «do ministério».
- Um lugar cujo tipo ninguém confirmou aparece como «Presencial», não como
  igreja: o painel distingue igreja de casa de oração, e só depois de a equipa o
  indicar a aplicação o diz.
- Os nomes dos responsáveis trazem a abreviatura da função (`Bp.`, `Pr.`), que
  corresponde a esta hierarquia e não se remove. A lista da equipa escreve a
  mesma função de várias formas («Bispo», «Bp.»); a importação usa sempre a
  abreviatura de `src/roles.js`.
