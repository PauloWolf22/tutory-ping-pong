# Avatares 3D

## O que veio no pack

*Ultimate Animated Character Pack*, de Quaternius (CC0 1.0). São 52 personagens, cada um em `.blend`, `.fbx`, `.gltf` e `.obj`.

| Item | Encontrado |
|---|---|
| Esqueleto | **O mesmo nos 52**: 23 ossos, mesmas matrizes de bind |
| Animações | 17 clipes compartilhados: Idle, Walk, Run, Jump, Victory, Defeat, Death, SwordSlash, Punch, PickUp, Roll, RecieveHit, SitDown, StandUp, Shoot_OneHanded, Walk_Carry, Run_Carry |
| Materiais | Cores chapadas por região (`Skin`, `Shirt`, `Hair`, `Hat`...). Nenhuma textura |
| Malha | Uma malha por personagem, dividida em primitivas por material |
| Shape keys | Nenhuma |
| Raquetes, calçados | Não existem no pack |

**A descoberta que definiu a arquitetura:** como o esqueleto é idêntico, qualquer peça de qualquer personagem encaixa em qualquer outro. O cabelo da Bruxa funciona na roupa do Cowboy sem ajuste. Por isso existe um editor de combinações, e não apenas uma lista de 52 personagens.

## O que foi possível personalizar

| Pedido no briefing | Situação | Como funciona |
|---|---|---|
| Cabelo | Completo | 18 cabelos reais do pack |
| Cor do cabelo | Completo | Cor do material |
| Tom de pele | Completo | Cor do material, com olhos claros ou escuros conforme o contraste |
| Camisetas, uniformes | Completo | 24 roupas, com cada região colorível |
| Cores das roupas | Completo | Paleta da marca + seletor livre |
| Chapéus, capacetes | Completo | 12 peças separadas do pack |
| Olhos e sobrancelhas | Completo | 6 estilos, cores independentes. Olhos e sobrancelhas foram separados por ilhas de geometria |
| Barba e bigode | Parcial | 2 bigodes soltos; os demais vêm junto de 4 cabelos do pack (Para trás com bigode, Grisalho com bigode, Moicano com barba, Barba cheia) |
| Formato do rosto | **Limitado** | O pack não traz formas de rosto. Há 5 proporções de cabeça via escala do osso, além de cabeças alternativas (goblin, zumbi, elmos, vaca, pug) |
| Calçados | **Limitado** | Não há calçados no pack. Os pés foram separados da pele para virar um calçado pintado; o formato não muda |
| Expressões | **Criado no projeto** | Sem shape keys, as 5 expressões movem olhos e sobrancelhas por código. São sutis |
| Raquetes | **Criado no projeto** | Não existem no pack: 4 modelos gerados em Three.js, presos ao osso da mão |
| Acessórios extras | **Criado no projeto** | Óculos, munhequeira, medalha e escudo no peito também são gerados por código |
| Poses | Completo | 11 animações originais no editor |

Os personagens originais continuam disponíveis em **Personagem**, recompostos das peças com as cores originais. Nenhum foi trocado por modelo genérico.

## Pipeline

```
glTF do pack (52 arquivos)
   |  tools/build_avatar_library.py  (Python embutido no Blender)
   |    separa cabeça / corpo / pés / olhos / sobrancelhas
   |    elimina repetições por hash de conteúdo
   |    quantiza normais e pesos; remove trilhas de escala
   v
app/assets/avatars/library.glb + catalog.json
   |  js/three/avatars.js
   v
Avatar: clona os ossos e liga as peças escolhidas
```

O script **não altera a geometria original**: só separa, remove repetições e reduz a precisão de normais e pesos. Ele roda no Python do Blender, mas não abre a cena: lê o glTF diretamente, o que é mais rápido e não depende de versão de operadores.

## Como regerar

Extraia o zip do pack e rode, a partir da pasta do projeto:

```bash
"C:\Program Files\Blender Foundation\blender.exe" -b --factory-startup --python tools/build_avatar_library.py -- "CAMINHO\DO\PACK\glTF" app/assets/avatars
```

Para adicionar uma peça ao editor, inclua em `tools/avatar_catalog.json` uma referência no formato `Personagem/Material`, com os sufixos `.head`, `.feet`, `.eyes` ou `.brows` quando for o caso. Rode o comando de novo: se a referência não existir, o script para e aponta qual é. Com `--raw`, ele gera a lista de todas as peças disponíveis, sem curadoria.

## Formato salvo por jogador

```json
{
  "v": 1, "outfit": "casual", "head": "human", "headShape": "normal",
  "hair": "short", "hairColor": "#3b2518", "hat": null, "facial": null,
  "face": "lashes", "expression": "neutral", "skin": "#d9a07a",
  "eyeColor": null, "browColor": null, "shoes": "#ffffff",
  "colors": { "casual:Camiseta": "#0040c8" },
  "glasses": null, "wrist": null, "medal": null, "badge": "tutory",
  "racket": { "style": "classic", "color": "#c0262d" }, "pose": "Idle"
}
```

## Limites conhecidos

- **Cabelo e chapéu podem se atravessar** em certas combinações, porque o pack desenhou cada peça para um personagem específico. A liberdade de combinar foi mantida de propósito.
- **As cabeças de vaca, pug e capuz ninja** têm rosto próprio, sem escolha de estilo.
