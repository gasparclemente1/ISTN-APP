# Teste em dispositivos reais

Os testes automáticos e o emulador cobrem a lógica e o desenho. Isto cobre o que
só um telemóvel real mostra: rede fraca, teclado, calendário, WhatsApp,
instalação. Fazer em **um Android com Chrome** e **um iPhone com Safari**,
idealmente com dados móveis e não Wi-Fi.

Anotar para cada linha: ✅ funciona · ⚠️ funciona com problema (descrever) · ❌ não funciona.

| # | Passo | Resultado esperado | Android | iPhone |
| --- | --- | --- | --- | --- |
| 1 | Abrir o endereço público pela primeira vez, com dados móveis | A página inicial aparece em menos de 5 s; o logótipo e o texto «ELIAS ISTN-SJ» são legíveis sem ampliar | | |
| 2 | Deslizar a página inicial até ao fim | Nada sai para os lados; não há deslocamento horizontal da página | | |
| 3 | Tocar em **Ensinos**, escrever «isaias» devagar | A lista filtra enquanto escreve; o cursor não salta; aparecem pregações de Isaías | | |
| 4 | Tocar no coração de uma pregação, depois em **Guardadas** | A pregação aparece; volta a aparecer depois de fechar e reabrir o browser | | |
| 5 | Tocar em **Partilhar** numa pregação | Abre a folha de partilha do telemóvel (ou o WhatsApp) com o título e o link | | |
| 6 | Abrir uma pregação que diga «Começa aos …» | O YouTube abre nesse minuto | | |
| 7 | **Igrejas** → escolher um país → uma região → abrir uma igreja | O filtro de região só mostra regiões desse país; a página da igreja abre | | |
| 8 | Na igreja, usar o botão **voltar** do telemóvel | Volta à lista, no mesmo ponto onde estava | | |
| 9 | Tocar no telefone da igreja | Abre o marcador com o número | | |
| 10 | Tocar em **Falar com o responsável no WhatsApp** | Abre a conversa com esse número no WhatsApp | | |
| 11 | Tocar em **Esta é a minha ISTN**, voltar ao início | A igreja aparece no início como «A minha ISTN» | | |
| 12 | Copiar um link de uma igreja e abri-lo noutro separador | Abre diretamente essa igreja | | |
| 13 | **Ao vivo** → copiar o ID e a senha | Aparece «copiado»; colar noutra aplicação dá o valor certo | | |
| 14 | **Ao vivo** → **Entrar no Zoom** | Abre a aplicação Zoom (ou a página do Zoom) na reunião certa | | |
| 15 | **Subscrever no calendário** | O calendário do telemóvel pergunta se quer subscrever; as reuniões aparecem nos dias e horas certos, **em hora local do telemóvel** | | |
| 16 | Se o 15 falhar: **descarregue o ficheiro** | O calendário abre o ficheiro e adiciona as reuniões | | |
| 17 | Na véspera de uma reunião, confirmar o alarme | O alarme toca 15 minutos antes | | |
| 18 | Instalar a aplicação (Android: menu → *Instalar*; iPhone: Partilhar → *Adicionar ao ecrã principal*) | O ícone aparece; abre sem barra do browser | | |
| 19 | Na aplicação instalada, tocar longo no ícone (Android) | Aparecem os atalhos Ao vivo, Ensinos, Igrejas | | |
| 20 | Ativar o modo de avião e abrir a aplicação instalada | Abre; o diretório e os ensinos já vistos aparecem; «Ao vivo» diz que não conseguiu carregar e oferece «Tentar de novo» | | |
| 21 | Com o leitor de ecrã ligado (TalkBack / VoiceOver), percorrer o início e pesquisar em Ensinos | Cada botão diz o que faz; ao pesquisar, anuncia «N pregações encontradas» sem reler a página toda | | |
| 22 | Aumentar o tamanho do texto do sistema ao máximo | O texto cresce; nada fica cortado nem sobreposto | | |
| 23 | **Perfil** → criar conta → confirmar email → entrar | Entra; as pregações guardadas e a igreja escolhida continuam lá | | |
| 24 | Entrar com Google (se ativo) | Volta à aplicação já com sessão iniciada, na página Perfil | | |
| 24a | Com uma conta de servo verificado: **Perfil → Mostrar o meu número**, ligar | Em até um minuto, o número aparece junto do nome na página da igreja; ao desligar, desaparece | | |
| 24b | **Anúncios**: abrir um anúncio, tocar em **Amém**, voltar e abrir outra vez | A reação fica marcada e contada |  |  |
| 24c | Com uma conta de servo verificado, escrever um comentário | Aparece na lista com o nome e a função |  |  |
| 24d | Com uma conta sem selo de servo, abrir um anúncio | Explica que comentar é para servos verificados, e deixa reagir |  |  |
| 24e | Com um direito de publicação atribuído no painel: escrever um anúncio com imagem | Publica e aparece no topo; a imagem abre |  |  |
| 25 | Depois de uma nova publicação, abrir a aplicação instalada | Aparece «Há uma nova versão» com o botão **Atualizar**; depois de tocar, tudo funciona | | |

## Painel (computador e telemóvel)

| # | Passo | Resultado esperado | Resultado |
| --- | --- | --- | --- |
| P1 | Entrar em `/admin` com uma conta da equipa central | Aparecem os separadores Reuniões, Diretório, Servos, Pedidos, Histórico | |
| P2 | Editar uma igreja, mudar a morada e acrescentar um horário de sábado sem hora; gravar | Grava; na aplicação, a igreja mostra a morada e «Sábado, hora a confirmar» | |
| P3 | Editar uma igreja, escrever alterações e desligar a internet; gravar | Aparece um erro e **o formulário mantém o que foi escrito** | |
| P4 | Carregar uma fotografia a meio de uma edição | A fotografia muda; os outros campos escritos mantêm-se | |
| P5 | Mudar a hora de uma reunião | Em menos de um minuto, «Ao vivo» mostra a nova hora; o calendário subscrito atualiza-se nas horas seguintes | |
| P6 | Abrir **Histórico** | A alteração do P5 aparece com o nome de quem a fez e a hora antiga → nova | |
| P6a | Abrir um servo no separador Servos | O contacto diz «privado» ou «visível no diretório, por escolha do servo»; não há forma de o tornar público a partir do painel | |
| P8 | Em **Anúncios**, esconder um anúncio e recarregar a aplicação | Sai da aplicação; no painel continua visível e pode ser reposto | |
| P9 | Em **Anúncios → Quem pode publicar**, dar «Só a sua igreja» a um servo verificado | Essa pessoa passa a ver «Escrever um anúncio» na aplicação, e só publica na sua igreja | |
| P7 | Entrar com uma conta de editor local | Só vê a sua igreja e os seus servos; não vê Reuniões, Pedidos nem Histórico | |
