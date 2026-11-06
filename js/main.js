import { html, render, store, useDoc, useRoute, Overlays, useState, useEffect } from './ui/lib.js';
import { HomePage } from './ui/home.js';
import { PlayersPage } from './ui/players.js';
import { EditorPage } from './ui/editor.js';
import { DrawPage } from './ui/draw.js';
import { BracketPage } from './ui/bracket.js';
import { MatchesPage, MatchPage } from './ui/match.js';
import { RegulationPage } from './ui/regulation.js';
import { StatsPage } from './ui/stats.js';
import { AdminPage } from './ui/admin.js';
import { TelaoPage } from './ui/telao.js';
import { ChampionPage } from './ui/champion.js';

const LINKS = [
  ['', 'Central'], ['jogadores', 'Jogadores'], ['sorteio', 'Sorteio'], ['chave', 'Chaveamento'], ['partidas', 'Partidas'],
  ['regulamento', 'Regulamento'], ['estatisticas', 'Estatísticas'],
];
const MOBILE = [['', 'Central'], ['jogadores', 'Jogadores'], ['chave', 'Chave'], ['partidas', 'Partidas'], ['admin', 'Painel']];

function Shell({ route, children }) {
  const doc = useDoc();
  const here = route[0] || '';
  return html`
    <header class="nav">
      <a class="nav-brand" href="#/" aria-label="Central do campeonato">
        <img src=${doc.meta.logo || 'assets/brand/logo-branco.png'} alt=${doc.meta.name} />
      </a>
      <nav class="nav-links" aria-label="Principal">
        ${LINKS.map(([path, label]) => html`<a key=${path} href=${'#/' + path} class=${here === path ? 'on' : ''}>${label}</a>`)}
      </nav>
      <div class="nav-right">
        <a class="btn sm" href="#/telao" target="_blank" rel="noopener">Telão</a>
        <a class=${'btn sm ' + (store.admin ? 'primary' : '')} href="#/admin">${store.admin ? 'Painel' : 'Entrar'}</a>
      </div>
    </header>
    ${store.mode === 'local' && html`<p class="local-bar" role="status">Versão online sem servidor: os dados ficam só neste aparelho. Outros celulares, computadores e TVs não veem este campeonato.</p>`}
    ${children}
    <nav class="bottom-nav" aria-label="Atalhos">
      ${MOBILE.map(([path, label]) => html`<a key=${path} href=${'#/' + path} class=${here === path ? 'on' : ''}>${label}</a>`)}
    </nav>`;
}

function App() {
  const route = useRoute();
  const doc = useDoc();
  const [, tick] = useState(0);
  useEffect(() => { document.title = doc?.meta?.name ? titleCase(doc.meta.name) : 'Campeonato'; }, [doc?.meta?.name]);
  useEffect(() => { tick(1); }, []);
  if (!doc) return html`<div class="boot"><div class="boot-ball"></div><p>Preparando o campeonato…</p></div>`;
  const [page, arg] = route;
  let screen;
  if (page === 'telao') return html`<${TelaoPage} /><${Overlays} />`;
  if (page === 'campeao') return html`<${ChampionPage} /><${Overlays} />`;
  switch (page) {
    case 'jogadores': screen = html`<${PlayersPage} />`; break;
    case 'avatar': screen = html`<${EditorPage} key=${arg} id=${arg} />`; break;
    case 'sorteio': screen = html`<${DrawPage} />`; break;
    case 'chave': screen = html`<${BracketPage} />`; break;
    case 'partidas': screen = html`<${MatchesPage} />`; break;
    case 'partida': screen = html`<${MatchPage} key=${arg} id=${arg} />`; break;
    case 'regulamento': screen = html`<${RegulationPage} />`; break;
    case 'estatisticas': screen = html`<${StatsPage} />`; break;
    case 'admin': screen = html`<${AdminPage} />`; break;
    default: screen = html`<${HomePage} />`;
  }
  return html`<${Shell} route=${route}>${screen}<//>
    ${store.mode === 'server' && !store.online && html`<div class="offline" role="status">Sem conexão com o servidor. Tentando reconectar…</div>`}
    <${Overlays} />`;
}

const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

store.init().then(() => {
  document.getElementById('app').textContent = '';
  render(html`<${App} />`, document.getElementById('app'));
}).catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = '<div class="boot"><p>Não foi possível abrir o campeonato. Verifique se o servidor está ligado e recarregue a página.</p></div>';
});
