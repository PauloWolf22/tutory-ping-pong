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
import { FootballPage } from './ui/football.js';
import { AccountPage, RankingPage, FriendliesPage, ApprovalsPage, useSports } from './ui/sports.js';
import { sports } from './core/sports.js';

const LINKS = [
  ['', 'Central'], ['jogadores', 'Jogadores'], ['sorteio', 'Sorteio'], ['chave', 'Chave'], ['partidas', 'Partidas'],
  ['ranking', 'Ranking'], ['amistosos', 'Amistosos'], ['futebol', 'Futebol'], ['regulamento', 'Regulamento'], ['estatisticas', 'Estatísticas'],
];
const MOBILE = [['', 'Central'], ['partidas', 'Partidas'], ['ranking', 'Ranking'], ['amistosos', 'Amistosos'], ['futebol', 'Futebol'], ['conta', 'Conta']];

function Shell({ route, children }) {
  useSports();
  const doc = useDoc();
  const here = route[0] || '';
  return html`
    <header class="nav">
      <a class="nav-brand" href="#/" aria-label="Tutory Sports: início">
        <img src=${doc.meta.logo || 'assets/brand/logo-branco.png'} alt="Tutory Sports" />
      </a>
      <nav class="nav-links" aria-label="Principal">
        ${LINKS.map(([path, label]) => html`<a key=${path} href=${'#/' + path} class=${here === path ? 'on' : ''}>${label}</a>`)}
      </nav>
      <div class="nav-right">
        <a class="btn sm" href="#/telao" target="_blank" rel="noopener">Telão</a>
        <a class=${'btn sm ' + (sports.user ? '' : 'primary')} href="#/conta">${sports.user ? (sports.profile?.nick || 'Minha conta') : 'Entrar'}</a>
        ${store.admin && html`<a class="btn sm" href="#/admin">Painel</a>`}
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
  useEffect(() => { document.title = 'Tutory Sports'; }, []);
  useEffect(() => { tick(1); }, []);
  if (!doc) return html`<div class="boot"><div class="boot-ball"></div><p>Carregando a Tutory Sports…</p></div>`;
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
    case 'futebol': screen = html`<${FootballPage} />`; break;
    case 'ranking': screen = html`<${RankingPage} />`; break;
    case 'amistosos': screen = html`<${FriendliesPage} />`; break;
    case 'conta': screen = html`<${AccountPage} key=${arg || 'conta'} mode=${arg} />`; break;
    case 'meu-avatar': screen = html`<${MyAvatar} />`; break;
    case 'aprovacoes': screen = html`<${ApprovalsPage} />`; break;
    case 'regulamento': screen = html`<${RegulationPage} />`; break;
    case 'estatisticas': screen = html`<${StatsPage} />`; break;
    case 'admin': screen = html`<${AdminPage} />`; break;
    default: screen = html`<${HomePage} />`;
  }
  return html`<${Shell} route=${route}>${screen}<//>
    ${store.remote && !store.online && html`<div class="offline" role="status">Sem conexão. Tentando reconectar…</div>`}
    <${Overlays} />`;
}


store.init().then(() => {
  sports.init().catch(() => {});
  document.getElementById('app').textContent = '';
  render(html`<${App} />`, document.getElementById('app'));
}).catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = '<div class="boot"><p>Não foi possível abrir o campeonato. Verifique a conexão e recarregue a página. Detalhe: ' + (e.message || 'erro desconhecido') + '</p></div>';
});

// O editor monta a cena 3D na primeira renderização: só entra quando o perfil já chegou.
function MyAvatar() {
  const s = useSports();
  if (!s.ready) return html`<main class="page"><div class="skeleton" style="height:320px;border-radius:20px"></div></main>`;
  if (!s.profile) return html`<main class="page narrow"><div class="glass card empty"><h3>Entre na sua conta</h3><p class="muted">O avatar da conta aparece no ranking e nos amistosos.</p><a class="btn primary" href="#/conta">Entrar ou criar conta</a></div></main>`;
  return html`<${EditorPage} key=${s.profile.id} account />`;
}
