# Campeonato pela internet com Supabase

Com o Supabase, todos os aparelhos veem o mesmo campeonato em qualquer rede. O app escolhe o modo sozinho ao abrir:

1. Servidor local respondendo (`start.bat`): usa o servidor.
2. Sem servidor, com `app/js/config.js` preenchido: usa o Supabase.
3. Sem nenhum dos dois: modo local, com os dados só naquele aparelho.

## Preparar o banco

1. Crie um projeto em [supabase.com](https://supabase.com). A região South America (São Paulo) dá a menor latência.
2. Abra **SQL Editor > New query** e cole `supabase/schema.sql` inteiro.
3. Na última linha, troque `TROQUE-ESTA-SENHA` pela senha de administrador e clique em **Run**. O resultado esperado é "Pronto: banco preparado e senha definida."
4. Em **Project Settings > API**, copie a Project URL e a chave `anon`. Preencha `app/js/config.js`.

**Nunca use a chave `service_role` no app.** Ela ignora todas as regras de segurança.

Para trocar uma senha esquecida, rode no SQL Editor:

```sql
select private.set_admin_password('NOVA-SENHA');
```

## Como a segurança funciona

- A chave `anon` é pública e só lê o campeonato. Gravação direta nas tabelas é negada.
- Toda escrita passa pelas funções `pp_*`, que conferem a sessão ou o código do jogador.
- Senha (bcrypt), sessões e segredo dos códigos ficam no schema `private`, fora da API.
- Sessões usam token aleatório de 256 bits, salvo só como hash, com validade de 16 horas.
- São 5 erros de senha ou código por endereço, com bloqueio de 30 segundos.
- A senha é definida pelo script. Por isso, nenhum visitante do link consegue criá-la primeiro.

O campeonato é legível por qualquer pessoa com o link, inclusive nomes e apelidos dos participantes. Isso é necessário para o telão funcionar sem login.

## Sincronização

As gravações usam a revisão esperada: se outro administrador salvou antes, a tela recarrega a versão atual e avisa. Os aparelhos recebem o aviso pelo Realtime e, como reforço, conferem a revisão a cada 15 segundos.

## Levar um campeonato do servidor local para a nuvem

No servidor local, use **Painel > Backup completo**. No site publicado, entre como administrador e use **Restaurar backup**.

## Limites do plano gratuito

Projetos sem uso por cerca de 7 dias são pausados, e o site para de carregar até você reativar no painel do Supabase. Abra o projeto nos dias anteriores ao campeonato para confirmar que está ativo.

## Testes

`tests/cloud.test.html` cobre o fluxo do app com um banco simulado (login, conflito, sessão expirada, queda de conexão). Ele não executa o SQL: as regras do banco só são validadas contra um projeto real.
