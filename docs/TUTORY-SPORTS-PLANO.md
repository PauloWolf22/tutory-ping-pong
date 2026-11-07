# Tutory Sports: diagnóstico e plano (07/11/2026)

Fase 1 do briefing de evolução. O Football Team Draw (Fase 6) já foi construído; o resto aguarda as decisões abaixo.

## O que o sistema tem hoje

| Item do briefing | Situação |
|---|---|
| Sorteio, chaveamento, placar ao vivo, telão, campeão | Existem e funcionam, só para ping pong |
| Football Team Draw | **Novo, pronto**: engine testado com 10 a 30 jogadores |
| Pausar e corrigir placar ao vivo | Correção existe; pausar não |
| Amistosos, Aprovação de resultados | **Não existem**, embora o briefing peça para "preservar" |
| Masculino e feminino | **Não existe** |
| Multimodalidade | **Não existe**: um campeonato por vez, só ping pong |
| Contas individuais, perfil | **Não existem**: há uma senha de administrador e um código por jogador |
| Rankings permanentes | **Não existem**: as estatísticas valem só para o campeonato atual |

Isso importa porque "amistosos" e "masculino/feminino" são construção nova, não evolução.

## Limite de arquitetura

Hoje todo o campeonato é um único documento JSON, legível por qualquer pessoa com o link. Serve para um torneio, mas não para contas, rankings permanentes e permissões por pessoa. Essa fase precisa de:

- **Supabase Auth** no lugar da senha única, com papel de administrador validado no banco.
- **Tabelas próprias**: usuários, modalidades, competições, partidas, solicitações de resultado, pontos.
- **Regras de acesso (RLS)** em cada tabela, testadas contra o banco real.
- **Migração** do campeonato atual, sem perder dados.

**Não precisa sair do GitHub Pages:** o backend é o Supabase, então o endereço pode continuar.

**Modelo único de modalidade:** Ping Pong, EA FC, Call of Duty, Mortal Kombat, Counter-Strike, futebol e jiu-jitsu são a mesma estrutura (individual ou equipe, formato configurável, campos extras como faixa e método de vitória). Assim, um jogo novo é um cadastro, não uma reconstrução.

## Avatares: análise das referências

Os dois links do Relebook são modelos de estoque em 3ds Max:

| | Homem | Mulher |
|---|---|---|
| Polígonos | 22.311 | 67.936 |
| Formatos | MAX, FBX, OBJ | MAX, FBX, OBJ |
| Pose | Braços abertos | Braços abertos |
| Rig e blendshapes | Não informados na página | Não informados na página |

**Por que não servem como base:**

1. **Licença.** Em mídia interativa, exige formato criptografado ou proprietário que impeça extrair a malha. Um GLB no navegador pode ser extraído. A licença também é por usuário e restringe servidor público.
2. **Personalização.** Cada arquivo é uma pessoa. Sem blendshapes de rosto e corpo, não há como cada colaborador ficar parecido consigo.

Servem como referência visual de nível de realismo. Comprar não resolve nenhum dos dois pontos. Análise feita pela página e pela licença, sem baixar os arquivos.

## Avatares: caminhos

| Caminho | Parecido com a pessoa | Custo | Riscos |
|---|---|---|---|
| **A. MPFB/MakeHuman no Blender** (recomendado testar) | Bom, por sliders de rosto e corpo | Grátis; exports CC0 segundo o FAQ do projeto | Cabelo e roupa exigem curadoria; realismo em tempo real pode parecer estranho; peso no celular |
| **B. Selfie vira avatar** (MetaPerson/Avatar SDK) | O melhor, a partir de foto | Assinatura paga | Fotos de colaboradores são dados sensíveis (LGPD); dependência de fornecedor: Ready Player Me fechou em 31/01/2026 |
| **C. Artista 3D ou Character Creator** | Muito bom | O maior | Prazo e licenças de uso na web a confirmar |
| **D. Manter estilizado e ampliar** | Limitado | Baixo | Não atende "realista" |

**Recomendação:** prova de conceito do caminho A antes de qualquer reconstrução. Um homem e uma mulher com sliders reais de rosto e corpo, no navegador e no celular, para você comparar com o resultado atual e decidir. Se não atingir o nível desejado, avaliar B ou C.

Mesmo no melhor caso, "qualidade The Sims" é resultado de equipes de arte. Dá para chegar a personagens realistas e bastante personalizáveis, mas é provável que cabelos e roupas fiquem abaixo disso sem investimento em arte.

## Futebol: como a fila funciona

Dois times em campo e uma única fila. Quem perde vai para o fim da fila, na ordem do time. O próximo time são os 5 primeiros. As caixas na tela são a fila cortada de 5 em 5. Assim a regra das filas incompletas acontece sem caso especial, e ninguém consegue sumir nem ser ultrapassado.

**Exemplo com 18:** o Time B perde e a Fila 1 entra. A fila passa a ter os 3 que esperavam + os 5 do Time B, o que aparece como dois grupos: 3 + 2 primeiros do Time B, e os outros 3 do Time B.

**Comportamentos definidos que vale confirmar:**

- Empate: não há botão, porque o briefing só prevê vencedor e perdedor.
- Time que vence várias vezes seguidas fica em campo indefinidamente.
- Com exatos 10 jogadores, os mesmos times se repetem, porque não há fila.
- Quem sai no meio do jogo é substituído pelo primeiro da fila.
- A opção de esconder a tela dos participantes vale só na interface: os nomes ainda podem ser lidos pela API até a fase de contas.

## Ordem proposta

1. Football Team Draw: pronto.
2. Prova de conceito dos avatares, em paralelo, por ser prioridade máxima.
3. Contas, papéis e modelo de dados, com migração.
4. Modalidades, rankings, amistosos e aprovação de resultados.
5. Tutory Gaming e Tutory Jiu-Jitsu sobre o mesmo modelo.
6. Masculino e feminino, equipes, Counter-Strike.
7. Melhorias do ao vivo (pausar, finalização).
8. Avatar definitivo em toda a plataforma, refinamento e testes de segurança.
