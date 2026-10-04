# Idiomas e tradução de publicações

Base: `origin/main` em `cadd5d9fc8f251a7c6daee705887a45f01a3c8a1` (inclui PR #39).
Branch: `codex/idiomas-pt-en-fr-es`.

## Comportamento

- Interface pública em português, inglês, francês e espanhol; seletor disponível antes de entrar na conta.
- Prioridade: escolha manual guardada neste dispositivo > idioma do perfil > primeiro idioma suportado da lista do navegador > português. Variantes como fr-CA, es-MX e pt-BR são reconhecidas. Alterações do idioma do dispositivo são acompanhadas apenas sem preferência manual/perfil.
- Nome bíblico: Elias / Elijah / Élie / Elías. Nome completo da igreja traduzido, mantendo a sigla ISTN-SJ. Nomes pessoais dos membros não são alterados.
- Publicações no início, anúncios e perfis têm “Ver tradução” / “Ver original”. A IA deteta o idioma original e traduz título e mensagem para o idioma atual da interface. Indicação de tradução automática e falhas recuperáveis; o original permanece disponível.
- Editar, partilhar, moderar, links, vídeos, autores, imagens e comentários continuam a usar os dados originais. Texto dentro de imagens e comentários não é traduzido nesta entrega.
- Navegação de Orações, comunidades, moderação e Zoom existentes no main preservados. Painel administrativo e traduções de áudio ao vivo não fazem parte desta entrega.

## Ativar tradução das publicações

1. Configurar `OPENAI_API_KEY` apenas no servidor/Render (nunca no código, PR, navegador ou `/api/config`).
2. Modelo predefinido `gpt-4.1-mini-2025-04-14`, alterável por `OPENAI_TRANSLATION_MODEL` para um modelo compatível com Responses + Structured Outputs.
3. Publicar a aplicação e abrir um anúncio. Mudar idioma, selecionar “Ver tradução”, verificar título/mensagem e voltar ao original.
4. Editar a mensagem original e repetir: a revisão anterior não deve reaparecer. Testar também sem ligação, erro do fornecedor e troca de idioma durante um pedido.

Apenas título/mensagem de publicações públicas carregadas pelo servidor são enviados à OpenAI. Sem credencial, os quatro idiomas da interface continuam disponíveis e o botão informa que a tradução ainda não está disponível.

O endpoint aceita POST da mesma origem, ID de publicação e um dos quatro idiomas; não aceita texto livre ou URLs do cliente. Recusa publicações indisponíveis/ocultas e dados marcados como antigos. A leitura pública mantém a cache existente de até um minuto. Usa `store: false`, limite de duração, validação de resposta e escape HTML na apresentação.

Cache de traduções por conteúdo e idioma por 24 horas, até 500 entradas; pedidos simultâneos iguais partilham o trabalho. Limite de 120 novos pedidos/hora e 4 simultâneos por processo. Reinícios limpam cache/contadores; múltiplas instâncias têm limites independentes. Configurar também o orçamento do projeto OpenAI antes de ativar produção.

## Verificação em 4 de outubro de 2026

- Testes automáticos completos e verificação de sintaxe (resultados finais registados no PR).
- Testes com fornecedor simulado: contrato da API, conteúdo público, revisão/cache, concorrência duplicada, limites, falhas/recusas, alternância por idioma, XSS e preservação do original.
- Navegador: francês/inglês/espanhol com nomes e marca corretos; navegação de Orações do main presente. Espanhol em 390 × 844 sem deslocamento horizontal.
- Botão “Voir la traduction” e erro localizado verificados sem chave; original mantido.
- Endpoint real local: GET → 405; origem externa → 403; sem chave → 503 controlado.
- Nenhuma chamada paga à OpenAI nem teste de qualidade com fornecedor real: falta configurar credencial. Nenhuma migração ou publicação em produção realizada.

## Referências

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

![Início em espanhol](inicio-es.jpg)
![Publicação com opção de tradução](publicacao-es.jpg)
