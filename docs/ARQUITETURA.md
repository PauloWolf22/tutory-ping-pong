# Arquitetura

## Decisão principal: sem etapa de build

O briefing indicava preferência por React, TypeScript, Vite, Tailwind, Framer Motion e React Three Fiber. Esta máquina não tem Node nem npm, e sem eles esse conjunto não compila. A escolha foi manter os mesmos conceitos sem build:

| Preferência do briefing | O que foi usado | Efeito |
|---|---|---|
| React | Preact + htm, em módulos ES | Mesma API de componentes e hooks, sem compilar JSX |
| TypeScript | JavaScript | Sem checagem de tipos; a segurança vem dos testes do motor |
| Tailwind | CSS com variáveis de marca | Tokens em `css/tokens.css` |
| Framer Motion | CSS e Web Animations API | Sem dependência |
| React Three Fiber | Three.js direto (r170) | A API imperativa combina com a cena única por tela |
| Supabase | Servidor local próprio | Funciona sem conta e sem internet; adaptador documentado |

Migrar para Vite no futuro é simples: os componentes já são funções com hooks.

## Estrutura

```
start.bat                 abre o servidor
server/
  server.ps1              compila e inicia o servidor
  TutoryServer.cs         HTTP, autenticação, SSE e persistência (C# 5)
tools/
  build_avatar_library.py gera library.glb + catalog.json a partir do pack
  avatar_catalog.json     curadoria das peças
data/                     criada em tempo de execução: campeonato e senha
app/
  index.html
  css/                    tokens, base e telas
  assets/                 avatares, fontes e marca
  js/
    core/engine.js        regras puras: sorteio, chave, placar, estatísticas
    core/store.js         persistência e sincronização (servidor ou local)
    three/avatars.js      monta avatares e renderiza retratos
    three/stage.js        cenas: editor, mesa, confronto, pote, campeão
    ui/*.js               telas
    vendor/               Three.js e Preact, para funcionar sem internet
  tests/                  testes no navegador
```

## Modelo de dados

Um único documento JSON guarda todo o campeonato: `meta`, `regulation`, `scoring`, `settings`, `players`, `draw`, `bracket`, `matches`, `display` e `audit`. A escala de um campeonato interno não justifica normalização, e o documento único garante que cada gravação seja consistente, sem partidas apontando para estados diferentes.

## Regras do motor (`core/engine.js`)

- **Chave:** a estrutura sempre tem tamanho de potência de 2. O número de BYEs é `tamanho - jogadores`, e eles ficam com os melhores ranqueados na ordem padrão de chaveamento, em que os cabeças 1 e 2 só se encontram na final.
- **BYE e rodada preliminar:** usam a mesma estrutura. Mudam a exibição (preliminar esconde os BYEs) e o nome da primeira fase.
- **Sorteio:** cada bola é sorteada na hora com `crypto.getRandomValues`, sem viés de módulo, a partir do pote restante. Por isso nenhum jogador pode sair duas vezes.
- **Bloqueio:** depois que uma partida real começa, o sorteio não pode ser refeito.
- **Correção:** `propagate` compara o ocupante da vaga seguinte. Se mudou, a partida seguinte é reiniciada em cascata e o administrador vê a lista antes de confirmar. Se o vencedor é o mesmo, nada é tocado.

## Sincronização

```
Painel  -- PUT /api/state?rev=N --> servidor --> grava data/tournament.json
                                       |
Telão, celulares <-- SSE /api/events --+  (avisa a nova revisão; o cliente busca o estado)
```

- **Concorrência:** cada gravação informa a revisão esperada. Se outro administrador salvou antes, o servidor responde 409, a tela recarrega a versão atual e avisa.
- **Reconexão:** `EventSource` reconecta sozinho. A tela mostra um aviso enquanto estiver fora e busca o estado ao voltar.
- **Gravação atômica:** arquivo temporário + `File.Replace`, mantendo uma cópia `.bak`.

## Segurança

- A senha só existe no servidor, em PBKDF2-SHA1 com 120 mil iterações e sal aleatório. Nada sensível vai para o frontend.
- Sessões usam token aleatório de 256 bits, válido por 16 horas e guardado em `sessionStorage`.
- Gravar exige o token; ler é público, porque o telão não tem login.
- O código do participante é um HMAC do id do jogador. Ele só libera `POST /api/avatar` daquele jogador.
- Login e código têm limite de 5 erros por endereço, com bloqueio de 30 segundos.
- A pasta servida é só `app/`: `data/` e `server/` não são acessíveis, e tentativas de sair da pasta recebem 403.

**Limite conhecido:** o servidor usa HTTP puro, pensado para a rede interna. Em uma rede não confiável, a senha trafega sem criptografia. Para expor na internet, coloque um proxy HTTPS na frente.

## Desempenho

- `library.glb` tem 5,6 MB, com 159 peças únicas: normais e pesos quantizados, sem cópias repetidas.
- A geometria é compartilhada entre avatares. Cada avatar custa de 8 a 12 draw calls.
- Cards usam **retratos**, gerados uma vez por configuração em um único renderizador fora da tela. Assim, 32 cards não exigem 32 contextos WebGL.
- Sem WebGL, os retratos viram iniciais e a aplicação continua funcionando.
