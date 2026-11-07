# Tutory Ping Pong Championship

Plataforma do campeonato interno de tênis de mesa: avatares 3D personalizados, sorteio ao vivo, chaveamento eliminatório, placar em tempo real, modo telão e cerimônia do campeão.

## Como rodar

Dê dois cliques em **`start.bat`**. Não é preciso instalar nada: ele usa o Windows PowerShell que já vem no Windows.

| Quem | Endereço |
|---|---|
| Administrador, neste computador | `http://localhost:8787` |
| Outros aparelhos na mesma rede | o endereço "Na rede local" mostrado na janela do servidor |
| TV ou telão | o mesmo endereço + `/#/telao` |

No primeiro acesso a **Painel**, você cria a senha de administrador. Na primeira vez em rede, o Windows pode perguntar se libera o firewall: é preciso aceitar para celulares e TVs conseguirem entrar.

Para usar outra porta ou apagar a senha esquecida (os dados do campeonato ficam):

```bash
start.bat -Port 9000
```

```bash
start.bat -ResetPassword
```

## Fluxo do campeonato

1. **Painel:** nome, edição, logo e pontuação. **Regulamento:** data, local e regras.
2. **Jogadores:** adicione um a um ou importe a lista.
3. **Avatar:** cada pessoa monta o personagem. Em **Jogadores > Acesso** há o link e o código pessoal para enviar.
4. **Sorteio:** escolha quem entra, as cabeças de chave e o modo. O telão acompanha sozinho.
5. **Partidas:** marque ponto a ponto, digite os games ou informe só o placar final. O vencedor avança.
6. **Campeão:** ao confirmar a final, a cerimônia abre na tela e no telão.

## Os três acessos

| Perfil | Pode | Como entra |
|---|---|---|
| Administrador | tudo | senha, verificada no servidor |
| Participante | ver tudo e alterar o próprio avatar | link + código pessoal de 6 caracteres |
| Telão | só visualizar | `/#/telao`, sem login |

## Onde ficam os dados

`data/tournament.json` guarda o campeonato, com uma cópia anterior em `.bak`. `data/auth.json` guarda a senha em hash. Copie a pasta `data` para fazer backup, ou use **Painel > Backup completo**. Essa pasta não deve ir para repositórios.

## Modo local (sem servidor)

Publicada em hospedagem estática (Vercel, GitHub Pages) sem Supabase configurado, a aplicação passa para o **modo local**: os dados ficam só naquele navegador, o telão só acompanha janelas do mesmo navegador e a senha é apenas uma trava de uso, sem proteção real. A tela avisa quando isso acontece. Para vários aparelhos, use o servidor na rede interna ou o Supabase, descrito em [docs/INTEGRACAO-BANCO.md](docs/INTEGRACAO-BANCO.md).

## Testes

Com o servidor ligado:

- `http://localhost:8787/tests/engine.test.html`: 52 testes do motor (sorteio, BYE, cascata de correção, pontuação, estatísticas).
- `http://localhost:8787/tests/cloud.test.html`: 13 testes do fluxo com Supabase, usando banco simulado.
- `http://localhost:8787/tests/football.test.html`: 27 testes do rodízio do futebol, de 10 a 30 jogadores.
- `http://localhost:8787/tests/presets.html`: todos os personagens remontados. Com `?acc=1`, acessórios, expressões e formatos.

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md): decisões técnicas, estrutura e segurança.
- [docs/AVATARES.md](docs/AVATARES.md): análise do pack, o que foi possível personalizar e como regerar os modelos.
- [docs/TUTORY-SPORTS-PLANO.md](docs/TUTORY-SPORTS-PLANO.md): diagnóstico e plano da evolução para Tutory Sports.
- [docs/INTEGRACAO-BANCO.md](docs/INTEGRACAO-BANCO.md): como usar o campeonato pela internet com Supabase.

## Créditos

Personagens: *Ultimate Animated Character Pack*, de Quaternius (CC0 1.0). Three.js (MIT), Preact e htm (MIT, Apache-2.0).
