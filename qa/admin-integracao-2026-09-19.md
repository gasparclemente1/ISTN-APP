# Verificação do Admin e da aplicação — 19/09/2026

Base: `origin/main` 80cfa96. Projeto Supabase: ISTN-APP (`mpylizblfkdrdpkjacdq`).

## Alterações

- Nome próprio da igreja, independente da localidade. Aparece no diretório,
  pesquisa, perfil, seleção de igreja e Admin.
- Sedes nacionais/mundial mantêm as regras existentes: só a equipa central
  altera; uma mundial e uma nacional por país.
- Dados, horários e sede guardados numa transação. Uma falha reverte tudo.
- Retirar todos os horários limpa também o horário antigo de compatibilidade.
- Impedida gravação se os horários ainda não carregaram.
- Conta sem perfil administrativo recebe erro de acesso.
- Novas fotografias fornecidas pelo utilizador no início e em Ensinos.
  Citação existente em Igrejas reduzida. Sem novos slogans.

## Validação

- 80 testes JavaScript e 57 verificações de sintaxe passaram.
- PostgreSQL temporário: esquema e todas as migrações executadas duas vezes;
  testes de permissões, mudança de sede e reversão de gravações passaram.
- Pré-visualização ligada ao Supabase real: `/api/directory` devolveu 73 igrejas,
  `/api/meetings` 5 reuniões e `/api/posts` 1 anúncio, todos com `source=supabase`
  e sem dados antigos em cache.
- Verificação visual do início, Ensinos e Igrejas a 390 × 844 e do início em desktop.
- Migração de nome e gravação conjunta aplicada ao projeto ativo; chamada
  anónima não tem permissão de execução. Nenhum nome ou sede real foi alterado
  durante os testes. A edição autenticada foi validada na base temporária;
  não houve sessão administrativa real no navegador.

## Limites e pontos existentes

- O acervo de 379 ensinos é um ficheiro importado; vídeos recentes vêm do
  YouTube. Fotos/textos de apresentação são ficheiros. Não são geridos no Admin.
- O servidor guarda o diretório por um minuto. Ao regressar à aplicação,
  esta atualiza os dados quando passou esse intervalo.
- Os avisos de segurança preexistentes do Supabase continuam: `post_authors`
  é uma vista com privilégios do proprietário (projeção pública de nomes,
  fotografias e função; a tabela de perfis permanece privada); funções de
  autorização/triggers usam SECURITY DEFINER; `stamp_updated_at` não fixa
  search_path; proteção contra palavras-passe comprometidas está desativada.
  `data_imports` não tem políticas por ser um registo interno, inacessível à API.
  A nova função de gravação usa SECURITY INVOKER e permissões explícitas.
  Esta revisão não equivale a uma auditoria de segurança completa.

Referência dos avisos: https://supabase.com/docs/guides/database/database-linter
