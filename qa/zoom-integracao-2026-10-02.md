# Integração Zoom — verificação local

- 84 testes automáticos passaram, incluindo assinatura HMAC, papel fixo de
  participante, reuniões autorizadas, origem do pedido e permissões da sala.
- 60 ficheiros passaram a verificação de sintaxe.
- Chrome: sala verificada a 390 × 844, sem deslocamento horizontal.
- Nome e reunião transmitidos ao SDK num ensaio com SDK simulado; formulário
  ocultado na entrada e recuperado em erro, com alternativa para abrir no Zoom.
- Acesso sem reunião mostra orientação para voltar à programação.
- SDK oficial 6.5.0 e tradução portuguesa carregados no Chrome, incluindo a
  dependência `react-redux` e os estilos carregados pelo próprio SDK.

Não foram usadas credenciais Zoom reais nem foi iniciada/alterada uma reunião.
Áudio/vídeo, sala de espera, moderação e compatibilidade em dispositivos móveis
reais ainda precisam do ensaio descrito em [zoom-setup.md](../live/zoom-setup.md).
A funcionalidade não foi publicada nem ativada em produção nesta tarefa.
