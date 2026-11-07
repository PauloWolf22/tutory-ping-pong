# Prova de conceito: avatares realistas (07/11/2026)

**Como ver:** com o `start.bat` aberto, `http://localhost:8787/tests/avatar-poc.html`. No celular, na mesma rede, troque `localhost` pelo endereço mostrado na janela do servidor. Os GLB ficam fora do repositório; para regerar:

```bash
"C:\Program Files\Blender Foundation\blender.exe" -b --python tools/poc_mpfb/build_human.py -- app/assets/avatars-poc male
```

## Catálogo e licenças

- **Base, peles, olhos, cabelos e roupas do sistema:** pacote `makehuman_system_assets`, CC0.
- **Roupas, calçados, óculos, chapéus e barbas:** pacotes `shirts01`, `pants01`, `suits01`, `dress01`, `skirts01`, `shoes01`, `glasses01`, `hats01` e `bodyparts05`, CC0.
- **CC-BY:** 9 peças, conferidas no catálogo oficial dos pacotes (`mpfb/data/packs/*.json`): Elvaerwyn (wavy bob, braided rows, grump hair, micky afro, scruffy beard), punkduck (alpha7 curly e long) e grinsegold (barba cheia e bigode). O crédito está no app, em Regulamento > Créditos dos avatares. Alguns `.mhclo` trazem "AGPL3" no cabeçalho: é o texto padrão antigo do MakeClothes; vale a licença publicada no catálogo (CC0 nesses casos).

**Peças retiradas por peso:** `o4saken_curly01` (55 MB), `elvs_short_side_do` (12 MB) e `culturalibre_male_boots` (5 MB).

## O que foi provado

- Humano com rig, 46 morphs de rosto, corpo, origem e expressão, no navegador.
- Cabelo, sobrancelhas, cílios, dentes e roupa acompanham os morphs.
- 10 cabelos, incluindo black, trança e rabo de cavalo, com cor real por shader.
- 3 peles por gênero, trocadas por textura. Tudo do pacote CC0 do MakeHuman.
- O script gera cada personagem em cerca de 30 segundos, sem abrir a interface do Blender.

## O que falta ou não está bom

- **Peso:** 17 MB por gênero. Separando o cabelo sob demanda, a estimativa é 6 a 8 MB. Não medido.
- **Celular real:** não testado. A tela encaixa em 375 px, mas o desempenho foi medido só nesta GPU.
- **Animação:** só um teste de rebatida feito nos ossos. As animações atuais são de outro esqueleto e não foram adaptadas.
- **Roupa:** uma por gênero. A troca exige máscaras por peça. A camiseta tem a estampa do pacote.
- **Corpo pesado:** a diferença é moderada, e o corpo sob a roupa foi removido.
- **Estilo:** parece jogo de geração anterior, não The Sims atual.
