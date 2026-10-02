# Participar na mesma reunião Zoom dentro da App

## Implementado e por ativar

A página «Ao vivo» oferece «Participar aqui na App» nas salas autorizadas pelo
servidor. A sala abre em `/sala.html`, pede o nome e carrega o Zoom Meeting SDK
6.5.0 apenas após a pessoa escolher entrar. Usa Client View, suportado também
em telemóveis. Não abre uma segunda conversa: são os mesmos participantes do Zoom.

O pedido de palavra é o controlo «Levantar a mão» do Zoom. O responsável vê os
pedidos no painel de participantes do Zoom e pode pedir à pessoa para ligar o
microfone, silenciá-la, parar o vídeo ou removê-la. Esta versão usa a interface
do Zoom na sala; não implementa um palco personalizado idêntico ao TikTok.

O responsável inicia e modera a reunião na aplicação Zoom, com a sua conta.
A App só emite entradas de participante (`role: 0`), nunca entradas de anfitrião.

## Configuração da conta e do servidor

1. Na conta Zoom da igreja que organiza as reuniões, criar/configurar uma app
   com Meeting SDK no Zoom App Marketplace. Configurar os domínios de produção
   exigidos pelo Zoom e usar as credenciais adequadas ao ambiente.
2. Guardar `ZOOM_CLIENT_ID` e `ZOOM_CLIENT_SECRET` nas variáveis privadas do
   servidor. Não colocar o segredo em ficheiros públicos, mensagens ou commits.
3. No painel existente da App, conferir o ID numérico, senha real da reunião e
   ligação Zoom. O parâmetro `pwd` de um convite não substitui a senha real.
4. Em ambiente de teste, adicionar o número Zoom a `ZOOM_MEETING_IDS`.
   Aceita vários números separados por vírgulas. Só reuniões ativas e publicadas
   na App, cujo número esteja nesta lista, recebem uma assinatura.
5. Reiniciar o servidor e executar o ensaio abaixo antes de autorizar a sala
   de produção. Servir a App por HTTPS (localhost funciona para desenvolvimento).

Sem estas três variáveis, a entrada integrada não é anunciada e as ligações
existentes para abrir o Zoom mantêm-se. Para desativar, retirar o número da lista
e reiniciar. As assinaturas já emitidas expiram em cerca de uma hora; retirar
um número não expulsa participantes já ligados. Para isso, usar os controlos Zoom.

## Moderação obrigatória para o fluxo de pedidos de palavra

Na reunião Zoom, configurar e verificar:

- Sala de espera e admissão pelo responsável, se pretendida.
- Silenciar participantes ao entrar.
- Desativar a possibilidade de os participantes reativarem o próprio microfone.
- Vídeo dos participantes desligado ao entrar; ajustar a permissão para iniciar
  vídeo de acordo com a condução da live.
- Partilha de ecrã apenas pelo anfitrião, se essa for a regra da igreja.

O responsável acompanha as mãos levantadas, pede ao participante escolhido para
ativar o microfone e volta a silenciá-lo no fim. O participante confirma o uso
do seu microfone/câmara. A App não altera estas definições de anfitrião: o controlo
de quem pode falar é aplicado pelo Zoom, não por esconder botões no navegador.

## Ensaio antes da ativação

Com uma reunião de teste na mesma conta:

1. Anfitrião entra no Zoom num dispositivo; participante entra pela App noutro.
2. Verificar admissão, receção de áudio/vídeo e entrada sem transmitir áudio.
3. Participante levanta a mão; anfitrião vê o pedido e autoriza a fala.
4. Verificar áudio nos dois sentidos, consentimento, vídeo, silenciar e remover.
5. Testar sair e voltar, reunião terminada, ligação interrompida e permissões
   de microfone/câmara recusadas. Confirmar a alternativa «Abrir no Zoom».
6. Repetir em Safari/iPhone e Chrome/Android atuais, além de computador.

Este ensaio depende das credenciais reais e não foi executado durante a
implementação. Não considerar a funcionalidade pronta para produção sem ele.

## Limites desta primeira integração

- Reuniões comuns da conta da igreja, sem inscrição prévia nem autenticação
  Zoom obrigatória. Reuniões com esses requisitos precisam de tokens adicionais
  e integração específica; usar o acesso externo entretanto.
- Webinars, reuniões de outras contas e início de reuniões pela App não estão
  configurados nesta versão. Reuniões externas exigem revisão da app e autorização
  adicional do Zoom (ZAK/OBF).
- Capacidade e duração continuam sujeitas à licença Zoom da igreja.
- O horário da App é indicativo; o Zoom determina se a sala está aberta.
- As permissões de microfone/câmara e a política de conteúdo do SDK aplicam-se
  apenas ao documento da sala. As assinaturas não são guardadas em cache.

## Referências oficiais

- [Meeting SDK para web](https://developers.zoom.us/docs/meeting-sdk/web/)
- [Autorização e assinaturas](https://developers.zoom.us/docs/meeting-sdk/auth/)
- [Suporte de navegadores e CSP](https://developers.zoom.us/docs/meeting-sdk/web/browser-support/)
- [Client View e isolamento de estilos](https://developers.zoom.us/docs/meeting-sdk/web/client-view/import/)
