# Tutory Sports: auditoria (Fase 1) e correções críticas (Fase 2)

Data: 07/11/2026. Base: commit `92d7250` (contas, amistosos e ranking).

## Arquitetura atual

| Camada | Como é | Observação |
|---|---|---|
| Interface | Preact + htm, sem build, módulos ES | Leve; nada para compilar |
| 3D | Three.js r170, avatares MPFB por peça (GLB) | Carrega só as peças usadas |
| Campeonato | Um documento JSON no Supabase (`tournament`) | Revisão para evitar sobrescrita; Realtime |
| Contas e ranking | Tabelas no Supabase (`supabase/sports.sql`) | **Ainda não rodado no banco real** |
| Admin | Senha única (bcrypt) com sessão de 16 h | Validado no banco, não só na tela |
| Participante | Supabase Auth (e-mail e senha) + aprovação | Conta pendente não lança nada |
| Publicação | GitHub Pages pelo `publicar-github.bat` | Site estático; o banco é o Supabase |

**Backup:** o painel tem exportação do campeonato (JSON). O Supabase gratuito não guarda backups automáticos acessíveis: antes de cada mudança de banco, exportar o campeonato e, no Supabase, Database > Backups (planos pagos) ou um `pg_dump`. Os scripts SQL são idempotentes e não apagam dados.

## Por que o avatar não salvava

1. **Foto grande demais no iPhone.** O retrato era gerado em WEBP. Safari antigo e alguns iPhones não geram WEBP e devolvem PNG, até 10 vezes maior; o banco recusava como "dados inválidos" (limite de 20 KB). **Corrigido:** sem WEBP vira JPEG e reduz até caber (teste automatizado).
2. **Botão travado.** "Salvar" ficava desligado enquanto o 3D carregava; sem WebGL ou com uma peça que falhou, nunca liberava. **Corrigido.**
3. **Código pessoal obrigatório.** Sem conta, o participante só salvava com o código entregue pelo administrador. **Corrigido:** jogador ligado a uma conta salva na conta, sem código, e o avatar aparece igual em qualquer aparelho e no campeonato.

Também entrou: indicador de salvamento, "Salvo ✓", aviso de alterações não salvas, confirmação ao sair da tela ou fechar a aba, e "Desfazer alterações" (volta à última versão salva).

## Tela cheia no celular

O telão escondia os botões após 3 segundos e só os mostrava de volta com movimento de mouse, que não existe no toque: quem entrava ficava sem saída. **Corrigido:** toque, clique ou tecla trazem os botões; o botão alterna "Tela cheia"/"Sair da tela cheia"; novo "Voltar ao app". iPhone (Safari) não oferece tela cheia em páginas: aparece um aviso em vez de falhar calado.

## Acesso

- Cabeçalho: **Entrar** leva à conta do participante; **Painel** só aparece para o administrador.
- Tela de conta com duas escolhas claras, **CRIAR CONTA** e **ENTRAR**, mais "Esqueci a senha" e "Sou administrador".
- **Nova senha sem servidor de e-mail:** a pessoa pede pelo e-mail; o pedido aparece em Aprovações; o administrador gera uma senha provisória para entregar. O pedido não revela se o e-mail tem conta.

## Nome

TUTORY SPORTS nos títulos, cabeçalho, tela inicial e telão. O campeonato salvo como "TUTORY PING PONG CHAMPIONSHIP" passa a se chamar "Campeonato de Ping Pong" (o administrador pode renomear no Painel).

## Testado

- 110 testes automatizados (motor, futebol, nuvem simulada, Tutory Sports).
- Telas: conta e telão em 375 px; editor com aviso e desfazer; telão com toque.

## Não testado ainda

- Banco real: depende de rodar `supabase/sports.sql` e desligar "Confirm email".
- iPhone e Android de verdade (tela cheia, salvamento com JPEG).
- Tela cheia real: o navegador de testes não permite entrar em tela cheia por script.

---

# Prompt de evolução e finalização: Fase 2, Futebol (07/11/2026)

## O que mudou
- **FIFO rigoroso.** Os 10 primeiros presentes continuam sorteados entre Time A e Time B. A fila agora segue a ordem de chegada; antes ela era embaralhada.
- **"Essa pessoa não quer mais jogar".** Tocar no nome (em campo, na fila ou na lista) abre um menu com essa ação, com confirmação.
  - O nome fica riscado, com a marca "Desistiu", e sai das filas e das próximas escalações.
  - Se a pessoa estava em campo, o primeiro da fila entra na mesma vaga; o resto da fila não muda de ordem. Sem ninguém na fila, o time fica incompleto e mostra a contagem real.
  - O placar e as rodadas anteriores não mudam. A troca fica registrada na rodada em andamento.
  - "Voltar a jogar" desfaz a desistência: a pessoa entra no fim da fila.
  - "Remover" só existe para nome digitado errado. Quem já jogou não pode ser removido, só marcado como desistente.
- **Rodadas como fotografias.**
  - Cada jogo registra os dois times completos, o vencedor, a hora e as substituições.
  - A lista vai da Rodada 01 para baixo; a rodada em campo fica destacada no fim. Verde para quem venceu e ficou, vermelho para quem perdeu e foi para a fila.
  - Refazer o sorteio mantém as rodadas. Reiniciar a sessão e "Nova terça" levam o dia para "Terças anteriores", em vez de apagar.
- **Estatísticas do dia.** Por pessoa: jogos, vitórias, derrotas, em que time jogou cada rodada, situação (em campo, na fila, ainda não jogou, ausente, desistiu) e substituições. Tudo calculado das rodadas registradas. Sem ranking individual, como pedido.
- **Financeiro** (só o administrador vê):
  - Preço por hora × duração, dividido por quem está no rateio. Por padrão entra quem está presente ou já jogou; dá para tirar e incluir pessoas.
  - Valores em centavos, com a soma das cotas igual ao total. Exemplo: R$ 360 por 23 pessoas dá cotas de R$ 15,65 e R$ 15,66.
  - "Marcar pago" mostra PAGO em verde. O resumo traz total, recebido, pendente, pagos e pendentes.
  - Toda alteração entra no histórico. Ao começar uma nova terça, os pagamentos vão para o arquivo do dia.

## Testado
- 39 testes do futebol (27 antigos e 12 novos), cobrindo FIFO, desistência em campo e na fila, reposição, rodadas imutáveis, estatísticas, financeiro, serialização e documento antigo.
- Regressão: motor 52, nuvem 13, Tutory Sports 18. Total de 122, todos passando.
- Tela com banco simulado no desktop e em 375 px, sem rolagem lateral. Testados o menu, a confirmação, a reposição e a gravação.

## Financeiro protegido (08/11/2026)
O Paulo escolheu tabela protegida. No site online o financeiro não fica mais no documento público: vive em `private.football_finance`, lido e gravado só com a sessão do administrador (`supabase/football-finance.sql`, ainda **não rodado** no banco real). Gravação com número de revisão: se outro aparelho alterou antes, o app recarrega e avisa. "Nova terça" fecha o financeiro (resumo guardado nas terças anteriores) antes de limpar a lista. O arquivo público das terças não leva dados de pagamento. Financeiro que tenha ficado no documento é movido para a tabela e apagado do documento na primeira abertura.

Testes: futebol 40 e regressão 83, todos passando. Na tela, com banco simulado, foram testados: salvar valores, marcar pago, conflito entre aparelhos, nova terça e documento sem dados de pagamento.

---

# Fase 3: Rankings e resultados (08/11/2026)

## O que mudou
- **Pontuação por modalidade** (Painel > Pontuação). A tabela `ranking_points` tem uma linha padrão `*` e linhas próprias por modalidade.
  - Pontos para vitória e derrota em campeonato, vitória e derrota em amistoso, participação, campeão, vice, 3º lugar e conquista.
  - Cada modalidade tem um peso no ranking geral, de 0 a 10.
  - A linha padrão herda os valores antigos: vitória 3, derrota 1, título 10, vice 5.
- **Rankings separados:**
  - Uma aba por modalidade: Ping Pong, Jiu-Jitsu, EA FC, Call of Duty, Mortal Kombat, Counter-Strike e as novas.
  - Cada uma filtra Todos, Masculino ou Feminino.
- **Geral e TUTORY Gaming normalizados.** Em cada modalidade o líder tem nota 100 e os demais ficam proporcionais; a nota é multiplicada pelo peso da modalidade. Assim, unidades diferentes não são somadas direto. TUTORY Gaming soma só os jogos individuais. Futebol continua sem ranking individual.
- **Jiu-Jitsu por faixa.**
  - A pessoa informa a faixa e o administrador valida (Aprovações > filtro Faixas > Validar faixa).
  - Só faixa validada entra no ranking por faixa. Trocar a faixa no perfil tira a validação.
- **Counter-Strike por equipe.** No amistoso a pessoa marca a própria equipe e a adversária (até 5 em cada lado), e cada integrante ganha ou perde no ranking. A mesma pessoa não pode estar nas duas equipes.
- **Campeonato → ranking:**
  - Escolha da modalidade e da categoria (masculino, feminino ou misto).
  - Entram os jogos com a data real, além de campeão, vice, participação de quem jogou e 3º lugar. O 3º lugar só entra quando o campeonato tiver a disputa de 3º, que é da fase 6.
  - Reenviar não duplica nem altera o que já está igual. O ping pong mantém o mesmo identificador das versões anteriores.
- **Amistosos** contam com pontuação própria. Um amistoso repetido (mesmo dia, mesma dupla, mesmo placar e mesmo vencedor, lançado por qualquer um dos lados) é recusado.
- **Conquistas manuais** (Painel > Pontuação): valem os pontos de "conquista" da modalidade. Não duplicam e podem ser removidas.
- **Modalidades futuras:** o administrador cria, ativa e desativa. Desativar esconde a modalidade das telas sem apagar resultados.
- **Auditoria:** um gatilho no banco registra toda mudança em resultados, colocações, pontuação, modalidades e status ou faixa de contas, com quem fez (administrador ou a conta). A lista aparece no Painel > Pontuação.

## Banco
Tudo em `supabase/sports.sql`, que pode ser rodado de novo sem perder dados. **Rode o script antes de publicar o site**: a versão nova do app lê a tabela `ranking_points` e a função `sp_ranking_general`.

## Testado
- Tutory Sports: 27 testes (antes 18), cobrindo:
  - pontuação por modalidade;
  - faixa validada;
  - equipe;
  - amistoso repetido;
  - ranking geral normalizado e com peso;
  - TUTORY Gaming e filtro por categoria;
  - conquistas;
  - 3º lugar, participação e categoria vindos do campeonato;
  - auditoria, incluindo quem fez cada ação;
  - modalidade nova e desativada.
- Total: motor 52, futebol 40, nuvem 13, Tutory Sports 27, todos passando.
- Telas com banco simulado: abas do ranking, filtro por faixa, amistoso de Counter-Strike por equipe, Pontuação, Aprovações. Em 375 px não há rolagem lateral da página; as abas do ranking rolam dentro da própria faixa.
- **Não testado:** o SQL no banco real, que depende do Paulo rodar o script. O teste com o banco simulado segue as mesmas regras, mas não substitui o banco real.

---

# Fase 4: Avatares 3D, estrutura do modelo-base (08/11/2026)

## Causas encontradas (medidas, não suposições)
1. **Roupa e cabelo ignoravam todos os controles de corpo.** Ao vestir uma peça, o app criava a malha nova sem os nomes dos morphs. Peso, músculo e pescoço mexiam só no corpo, e o corpo atravessava o tecido. Isso acontecia desde a primeira versão dos avatares realistas.
2. **Cinco peças masculinas não escondiam a pele por baixo** (suéter, polo, camiseta justa, calça cargo e calça social; nas femininas, várias também). O pacote do MakeHuman não traz o grupo de "pele escondida" para elas, então a pele furava o tecido mesmo parada.
3. **Controles além do modelo.** O editor ia até 160% de cada morph, e o MakeHuman extrapola e deforma o corpo.
4. **Esqueleto fixo.** Medidas que mudam onde ficam as articulações (ombro, braço, perna, tronco) não moviam o esqueleto: o corpo dobraria no lugar errado.
5. **Dava para tirar toda a roupa** ("Nenhum" nos conjuntos), e o corpo aparecia sem roupa enquanto as peças carregavam.

## Correções
- **Morphs nas peças** (`avatars.js > attachPart`): a malha nova herda os nomes. Agora roupa, cabelo, barba e chapéu acompanham cada controle.
- **Cobertura geométrica** (`build_human.py`):
  - Para cada peça e cada vértice da pele, um raio sai pela normal. Se encontra o tecido por cima a menos de 4 cm, ou o tecido entrou no corpo, aquela pele fica escondida quando a peça está vestida.
  - O teste é feito no corpo base e em 9 extremos (pesado, musculoso, magro, ombros, tórax, barriga, quadril, braços e pernas).
  - Cabeça, pescoço e mãos ficam fora, para gola e punho não abrirem buraco no rosto ou na mão.
- **Esqueleto que acompanha o corpo:**
  - Para cada morph, o MPFB reajusta o esqueleto ao corpo deformado e o deslocamento de cada articulação vai para `human_<gênero>.json` (`joints`, `ground`).
  - O app soma os deslocamentos com o peso de cada controle e recalcula a pose de repouso e o encaixe (bind) de cada malha.
  - Perna mais longa levanta o corpo para os pés continuarem no chão.
  - Teste automático: sem morph, o reajuste não muda nada (diferença 0).
- **Controles novos de corpo** (medidas reais do MakeHuman): ombros, tórax, cintura, quadril, barriga, tronco, espessura e comprimento de braços e pernas, e testa (no Rosto).
  - Tipos de corpo como ponto de partida: Padrão, Magro, Atlético, Musculoso e Maior.
  - Os comprimentos usam 50 a 60% do intervalo do modelo, porque perna longa no máximo do MakeHuman soma 17 cm.
- **Intervalo real:** cada controle vai de 0 a 1 (antes ia até 1,6). Avatares já salvos acima de 1 são limitados a 1 ao abrir.
- **Vestimenta obrigatória em todas as etapas:**
  - Sem opção "Nenhum" em conjuntos, partes de cima e de baixo.
  - Escolher só a parte de cima completa a de baixo com a peça básica, e vice-versa.
  - Peça inexistente ou que falhou ao carregar vira a roupa básica.
  - Na troca, a peça nova carrega antes de a antiga sair.
  - O avatar fica invisível até a roupa estar no lugar.
  - Camada básica pintada na pele, na área que toda roupa cobre (regata e bermuda escuras). Ela só aparece se nenhuma peça carregar.
- **Editor:**
  - Desfazer passo a passo (arrastar um controle conta como um passo).
  - "Restaurar salvo".
  - Câmeras Frente, Lado e Costas, além de Rosto, Busto e Corpo.

## Testado
- `tests/avatar-stress.html?g=male|female&pose=...&view=front|side|back`: 16 combinações por gênero, montadas com o avatar real e fotografadas. Cobre:
  - corpo base, magro, pesado, musculoso, atlético e maior;
  - ombro largo com braço longo, perna longa, perna curta com tronco longo, pesado com musculoso, quadril largo e magro com braço fino;
  - roupa ausente, só a parte de cima, peça inexistente e morph salvo em 1,6.
  - Checagens automáticas: sempre vestido, nenhum morph acima de 1, reajuste do esqueleto neutro. Todas passaram nos dois gêneros.
  - Conferido visualmente nas poses Em guarda e Vitória: sem pele atravessando o tecido nem peça desalinhada nas combinações acima.
- `tools/avatar_audit.py`: auditoria no Blender (roupa dentro da pele visível, deslocamento de articulações por morph).
- Editor no app: tipo de corpo, Costas, Desfazer e a aba Roupas sem "Nenhum". Sem erros no console.
- Regressão: motor 52, futebol 40, nuvem 13, Tutory Sports 27, todos passando.

## Limites e peso
- O corpo base passou de 6,9 MB para 9,1 MB (68 morphs), e `app/assets/humans` foi para cerca de 231 MB. O app baixa só o corpo e as peças em uso.
- Não testado em celular real nem com poses fora das prontas (Rebatida, Pulo, Derrota).
- As roupas são as do pacote do MakeHuman: uniformes, kimono, acessórios novos e a logo TUTORY entram na próxima etapa da fase 4, como peças modeladas no Blender.

## Fase 4, parte 2: peças TUTORY, logo, faixa, acessórios e miniaturas (08/11/2026)
- **Peças próprias** (`tools/build_custom_clothes.py`): kimono de jiu-jitsu, camisa esportiva e bermuda, para o corpo masculino e o feminino.
  - O kimono tem casaco com lapela e decote em V, saia do casaco, calça e faixa, tudo numa malha só.
  - Cada peça é modelada a partir do corpo do MakeHuman (tronco, braços e os "ajudantes" de saia e calça) e gravada como roupa do MPFB (.mhclo).
  - Com isso, as peças passam pelo mesmo ajuste das outras: acompanham cada medida do corpo e o esqueleto, e escondem a pele por baixo.
- **Logo TUTORY** (arquivo oficial `assets/brand/logo-branco.png`):
  - Aplicada pelo shader em regiões da textura, sem distorção, mantendo a proporção do arquivo.
  - Posições: peito, costas e manga, cada uma com liga/desliga, tamanho (50 a 160%) e altura.
  - Cor automática: azul em tecido claro e branca em tecido escuro. Também dá para fixar branca ou azul.
- **Kimono branco, azul ou preto** (cor livre). A **faixa segue a graduação validada pelo administrador**:
  - O editor não escolhe a faixa.
  - O banco grava a faixa validada ao salvar o avatar (`sp_save_my_avatar`).
  - Quando o administrador valida ou corrige a faixa (`sp_admin_set_belt`), o kimono do avatar já passa a usá-la.
  - Sem validação, a faixa é branca.
- **Acessórios** (`three/accessories.js`):
  - Brincos (ponto, argola, argola grande); piercing (nariz em argola ou ponto, lábio, sobrancelha); corrente fina, corrente grossa e colar com pingente; pulseira simples, dupla ou de tecido; relógio esportivo ou clássico; boné TUTORY (com a logo), boné de aba reta e boné com aba para trás; óculos escuros aviador, esportivo e redondo.
  - Metal dourado, prateado ou preto.
  - A posição de cada um vem da malha do próprio avatar já com os morphs (orelha, nariz, boca, olhos, pescoço, punho, topo da cabeça), e o acessório fica preso ao osso.
  - O boné substitui o chapéu e os óculos escuros substituem os óculos do catálogo.
- **Miniaturas** no editor (Roupas e Cabelo): uma foto do próprio avatar com cada opção. São geradas uma a uma e é possível ligar e desligar.

**Banco:** `supabase/sports.sql` mudou (faixa no avatar). Rode de novo antes de publicar.

## Acesso ADM e vídeo da home (08/11/2026)
- **Botão ADM fixo no topo** (vira "Painel ADM" depois de entrar). Na tela de participantes, quem não está como administrador vê "Entrar como ADM para adicionar".
- **Vídeo de abertura da home** (`tools/home_video/build_edit.py`):
  - 13 cortes reais de jiu-jitsu, ping pong, futebol, tênis e TUTORY Gaming, com troféu e comemoração no final.
  - Os clipes vêm do Pexels (licença livre para uso comercial, sem atribuição). A lista dos IDs está em `tools/home_video/clips/lista.txt`.
  - Cor unificada em todos os cortes, legenda por esporte, abertura e fechamento com a logo TUTORY.
  - 24,5 s em loop. Arquivos: MP4 1080p (6 MB), 720p para celular (4,9 MB) e imagem de capa.
  - O vídeo toca sempre, mudo, com botão de pausar. Só quem ativou economia de dados vê a capa.
  - A primeira tentativa, 3D renderizada no Blender, foi recusada e ficou em `docs/video/` só como registro.
  - Limites conhecidos: o clipe de ping pong é caseiro (garagem), e no clipe da faixa preta aparece um pequeno patch de federação de judô.
- **Camisa TUTORY:** a gola agora é careca, com curva suave na frente. Antes havia um recorte em degrau que abria uma fresta entre o pescoço e a gola.
- **Peças TUTORY no corpo feminino (erro da fase 4, achado agora):**
  - O problema: a camisa e o kimono femininos ficavam com ombros quadrados, uns 4 cm acima do corpo, com buracos de pele nas costas e a logo na gola.
  - A causa: o script modelava as peças sobre a malha neutra do MakeHuman, mas o MPFB encaixa a roupa no corpo já com as formas de gênero e proporção aplicadas (até 10 cm de diferença no feminino).
  - A correção: as peças agora nascem do corpo com as formas aplicadas, nos dois gêneros. A altura da logo no tronco feminino segue a proporção do corpo.
  - Os testes de combinações passaram, 16 por gênero, sem falhas automáticas.
  - Limite que continua: o decote em V do kimono feminino é fundo e tem a borda irregular.
