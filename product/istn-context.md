# ISTN-SJ — nomes, estrutura e vocabulário

Contexto do ministério, fornecido pela equipa ISTN-SJ. Serve para que a aplicação
use as palavras certas: quem a constrói não pertence necessariamente à igreja, e
os termos aqui não são intercambiáveis com os do uso comum.

## O projeto

**ISTN-SJ** — Igreja Salvação de Todas as Nações · Sol da Justiça.

O líder fundador é o **Apóstolo Marcelino Mário Bento, Profeta Elias**.

O decreto atual da ISTN-SJ é **Elias é Deus**.

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
- O diretório ainda não distingue igreja de casa de oração. Enquanto não o
  fizer, não deve afirmar que um registo é uma igreja.
- Os nomes dos responsáveis nos dados trazem abreviaturas de função (`Bp.`,
  `Pr.`) que correspondem a esta hierarquia e não devem ser normalizadas nem
  removidas.
