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

## Tutory Sports: contas, amistosos e ranking

Camada nova, em `supabase/sports.sql`. Não mexe no campeonato que já está no banco.

1. **Rodar o script:** Supabase > SQL Editor > New query > cole `supabase/sports.sql` inteiro > Run. Deve aparecer "Pronto: Tutory Sports preparado". Pode rodar de novo sem perder dados.
2. **Desligar a confirmação por e-mail:** Authentication > Sign In / Providers > Email > desligue **Confirm email** > Save. O e-mail padrão do Supabase só envia para membros do projeto, então a confirmação travaria o cadastro dos colegas. Quem filtra quem entra é a sua aprovação.
3. **Aprovar contas:** entre como administrador > Painel > **Aprovações**. Contas novas, amistosos pendentes e o envio do campeonato ao ranking ficam ali.

**Pontuação:** vitória 3, derrota 1 (por jogar), título 10, vice 5. Para mudar, edite a tabela `ranking_rules` no Table Editor; o app passa a usar os valores novos sem atualizar o site.

**Limites conhecidos:**
- "Esqueci a senha" não funciona sem um servidor de e-mail próprio (SMTP) configurado no Supabase. Até lá, a pessoa cria outra conta e o administrador bloqueia a antiga.
- O administrador continua sendo a senha do campeonato; as contas de participante não têm poderes de administrador.

## Financeiro do futebol (tabela protegida)

Script `supabase/football-finance.sql`. Rode depois do `schema.sql` e do `sports.sql`.

1. Supabase > SQL Editor > New query > cole `supabase/football-finance.sql` inteiro > Run. Deve aparecer "Pronto: financeiro do futebol protegido." Pode rodar de novo sem perder dados.
2. O que muda: no site online, preço da quadra, rateio, pagamentos e histórico ficam em `private.football_finance`. O site não alcança essa tabela pela API. As funções `sp_fin_get` e `sp_fin_save` só respondem com a sessão do administrador.
3. Antes de rodar o script, o painel de financeiro do site mostra um erro com o botão "Tentar de novo"; o resto do futebol funciona normalmente.
4. No servidor da rede interna (`start.bat`) o financeiro continua no documento do campeonato, que fica só na máquina.
