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
