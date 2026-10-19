import { $, el, setTimeZone, timeHM, dateLong, ago, fmtDuration, initials, random } from './util.js';
import { getJSON, cache } from './net.js';
import { icons } from './icons.js';
import { loadWeather, weatherLabel, weatherIcon } from './weather.js';
import { loadTeam, teamView } from './football.js';
import { loadFeed, videoCards, idlePool, epgNow, findStream } from './feed.js';
import * as nav from './nav.js';
import * as player from './player.js';
import * as bridge from './bridge.js';

const params = new URLSearchParams(location.search);
const MOCK = params.has('mock');      // sample data, for testing in a desktop browser
const FROZEN = params.get('now');     // freeze the clock, e.g. ?now=2026-10-19T08:52:00Z

const S = {
  cfg: null, feed: null, weather: null, teams: {}, mock: null,
  mode: 'home', bg: null, recent: [], muted: true, watching: null, bgErrors: 0,
  idleTimer: 0, teamTimer: 0, osdTimer: 0, toastTimer: 0
};

const KEYS = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter',
  10009: 'back', 27: 'back', 8: 'back',
  10252: 'playpause', 415: 'play', 19: 'pause', 413: 'stop', 417: 'ff', 412: 'rw', 32: 'playpause'
};

const now = () => (FROZEN ? new Date(FROZEN) : new Date());

/* ---------- layout ---------- */

function fitStage() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  $('#stage').style.transform = Math.abs(s - 1) < 0.001 ? '' : 'scale(' + s + ')';
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

function setMode(m) {
  S.mode = m;
  const st = $('#stage');
  st.classList.remove('mode-home', 'mode-idle', 'mode-watch');
  st.classList.add('mode-' + m);
}

/* ---------- clock and weather ---------- */

function renderClock() {
  const n = now();
  $('#time').textContent = timeHM(n);
  $('#date').textContent = dateLong(n);
}

function renderWeather() {
  const w = S.weather;
  const box = $('#weather');
  if (!w) { box.hidden = true; return; }
  box.hidden = false;
  $('#weather-icon').innerHTML = weatherIcon(w.code, w.isDay);
  $('#weather-temp').textContent = Math.round(w.temp) + '°';
  $('#weather-main').textContent = S.cfg.location.name + ' · ' + weatherLabel(w.code);
  $('#weather-sub').textContent = 'Feels like ' + Math.round(w.feels) + '° · High ' + Math.round(w.max) + '°';
}

/* ---------- teams ---------- */

function badge(b) {
  const style = 'background:' + b.bg + ';color:' + b.fg + ';' + (b.ring ? 'box-shadow:inset 0 0 0 3px ' + b.ring + ';' : '');
  return el('span', { class: 'badge', 'aria-hidden': 'true', style }, b.text);
}

function teamViews() {
  const n = now();
  return S.cfg.teams.map(t => teamView(t, S.teams[t.key], n));
}

// "at Kashiwa Reysol · Wed 13:00": only the club name is cut short when space runs out.
function fixture(cls, prefix, opponent, when) {
  return el('span', { class: cls },
    prefix ? el('span', { class: 'keep' }, prefix + ' ') : null,
    el('span', { class: 'clip' }, opponent),
    el('span', { class: 'keep' }, ' · ' + when));
}

function teamCard(v) {
  const result = v.last
    ? el('span', { class: 'team-result' },
        el('span', { class: 'result-letter result-' + v.last.letter, 'aria-hidden': 'true' }, v.last.letter),
        el('span', { class: 'sr' }, v.last.word),
        el('span', { class: 'team-score' }, v.last.score),
        fixture('team-where', '', v.last.opponent, v.last.when))
    : el('span');
  return el('li', { class: 'team' }, badge(v.badge),
    el('div', { class: 'team-grid' },
      el('span', { class: 'team-name' }, v.name),
      result,
      el('span', { class: 'team-standing' }, v.standing || (v.loading ? 'Loading…' : '')),
      v.next ? fixture('team-next', 'Next:', v.next.opponent, v.next.when) : el('span')));
}

function liveCard(v) {
  const pill = el('span', { class: 'live-pill' }, v.live.minute ? 'Live · ' + v.live.minute : 'Live');
  const score = el('p', { class: 'live-score' },
    v.live.score ? el('span', { class: 'live-score-big' }, v.live.score) : null,
    el('span', { class: 'live-score-opp clip' }, v.live.venue + ' ' + v.live.opponent));
  const watch = v.watch
    ? el('button', {
        class: 'btn-watch focusable', 'data-key': 'watch:' + v.key, 'data-action': 'watch', 'data-team': v.key,
        'aria-label': 'Watch ' + v.name + ' ' + v.live.venue + ' ' + v.live.opponent + ' live, ' + v.watch.label.replace(/^Watch /, '')
      }, el('span', { svg: icons.playSolid }), v.watch.label)
    : null;
  return el('li', { class: 'team is-live' }, badge(v.badge),
    el('div', { class: 'live-col' },
      el('div', { class: 'live-row' }, el('div', { class: 'live-left' }, el('span', { class: 'team-name' }, v.name), pill), score),
      el('div', { class: 'live-row' }, el('span', { class: 'team-standing' }, v.standing || ''), watch)));
}

// Idle screen: just the live score, one chip per match that's on.
function renderLiveChips(live) {
  const box = $('#live-chip');
  box.textContent = '';
  box.hidden = !live.length;
  for (const v of live) {
    box.append(el('div', { class: 'live-chip' }, badge(v.badge), el('div', { class: 'live-chip-col' },
      el('p', { class: 'live-chip-score' },
        el('span', { class: 'live-chip-team' }, v.name),
        el('span', { class: v.live.score ? 'live-chip-big' : 'live-chip-opp' }, v.live.score || v.live.venue),
        el('span', { class: 'live-chip-opp clip' }, v.live.opponent)),
      el('p', { class: 'live-chip-meta' },
        el('span', { class: 'live-pill' }, v.live.minute ? 'Live · ' + v.live.minute : 'Live'),
        el('span', { class: 'live-chip-league' }, v.leagueName)))));
  }
}

function renderTeams() {
  const views = teamViews();
  const list = $('#team-list');
  list.textContent = '';
  views.filter(v => v.live).concat(views.filter(v => !v.live))
    .forEach(v => list.append(v.live ? liveCard(v) : teamCard(v)));
  renderLiveChips(views.filter(v => v.live));
  nav.refresh();
  return views;
}

/* ---------- videos ---------- */

function tint(id) {
  const hues = [210, 260, 20, 160, 330, 45];
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 'hsl(' + hues[h % hues.length] + ', 35%, 28%)';
}

function renderVideos() {
  const list = $('#video-list');
  const { cards, weekCount } = videoCards(S.feed, S.cfg, now());
  const pill = $('#new-count');
  pill.hidden = !weekCount;
  pill.textContent = weekCount + ' new this week';
  list.textContent = '';
  if (!cards.length) {
    list.append(el('li', { class: 'videos-empty' }, S.feed ? 'Nothing new this month' : 'Loading your channels…'));
    nav.refresh();
    return;
  }
  const n = now();
  for (const c of cards) {
    const img = el('img', { src: 'https://i.ytimg.com/vi/' + c.id + '/mqdefault.jpg', alt: '' });
    const thumb = el('span', { class: 'vthumb' }, img, c.duration ? el('span', { class: 'vdur' }, fmtDuration(c.duration)) : null);
    img.addEventListener('error', () => {
      img.remove();
      thumb.prepend(el('span', { class: 'vthumb-fallback', style: 'background:' + tint(c.channelId) }, initials(c.channel)));
    });
    list.append(el('li', {}, el('button', {
      class: 'vcard focusable', 'data-key': 'video:' + c.id, 'data-action': 'video',
      'data-id': c.id, 'data-title': c.title, 'data-channel': c.channel
    }, thumb, el('span', { class: 'vbody' },
      el('span', { class: 'vtitle' }, c.title),
      el('span', { class: 'vmeta' }, el('span', { class: 'vchan' }, c.channel), el('span', { class: 'vage' }, '· ' + ago(new Date(c.published), n)))))));
  }
  nav.refresh();
}

/* ---------- dock ---------- */

function renderDock() {
  const n = now();
  const tv = $('#tv-list');
  tv.textContent = '';
  for (const ch of S.cfg.tv) {
    const epg = epgNow(S.feed, ch.key, n);
    const label = epg ? ch.name + ' · till ' + timeHM(new Date(epg.end)) : ch.name;
    const title = epg ? epg.title : 'Telia · HDMI ' + ch.hdmi;
    tv.append(el('li', {}, el('button', {
      class: 'tile tile-tv focusable', 'data-key': 'tv:' + ch.key, 'data-action': 'input',
      'data-port': ch.hdmi, 'data-label': 'Telia', 'aria-label': ch.name + ': ' + title
    }, el('span', { class: 'tile-col' },
      el('span', { class: 'tile-label' }, label),
      el('span', { class: 'tile-title' }, title),
      el('span', { class: 'tile-progress' }, el('span', { style: 'width:' + Math.round((epg ? epg.progress : 0) * 100) + '%' }))))));
  }
  const inputs = $('#input-list');
  inputs.textContent = '';
  for (const i of S.cfg.inputs) {
    inputs.append(el('li', {}, el('button', {
      class: 'tile tile-input focusable', 'data-key': 'in:' + i.key, 'data-action': i.app ? 'app' : 'input',
      'data-port': i.hdmi || '', 'data-app': i.app || '', 'data-label': i.name
    }, el('span', { class: 'tile-icon', svg: icons[i.icon] || icons.screen }),
       el('span', { class: 'tile-col' },
         el('span', { class: 'tile-title' }, i.name),
         el('span', { class: 'tile-label' }, i.hdmi ? 'HDMI ' + i.hdmi : 'App')))));
  }
  nav.refresh();
}

/* ---------- background video, idle and watching ---------- */

function renderCaption() {
  const v = S.bg;
  const cap = $('#caption');
  if (!v) { cap.hidden = true; return; }
  cap.hidden = false;
  $('#caption-badge').textContent = initials(v.channelName);
  $('#caption-channel').textContent = v.channelName;
  $('#caption-title').textContent = v.title;
  const sound = $('#caption-sound');
  sound.innerHTML = S.muted ? icons.muted : icons.sound;
  sound.append(document.createTextNode(S.muted ? 'Muted · OK for sound' : 'Sound on · OK to mute'));
}

function nextBackground() {
  const pool = idlePool(S.feed);
  if (!pool.length) return;
  let choices = pool.filter(v => S.recent.indexOf(v.id) < 0);
  if (!choices.length) choices = pool;
  const v = choices[Math.floor(Math.random() * choices.length)];
  S.recent = [v.id].concat(S.recent).slice(0, Math.max(1, Math.min(12, Math.floor(pool.length / 2))));
  S.bg = v;
  // Start somewhere in the middle so the same opening doesn't repeat.
  const start = v.duration ? random(0.05, 0.6) * v.duration : random(60, 900);
  player.play(v.id, { start, muted: S.muted });
  renderCaption();
}

function initBackground() {
  player.initPlayer($('#player'), {
    playing() { S.bgErrors = 0; $('#player-host').classList.add('is-playing'); },
    ended() { if (S.mode === 'watch') stopWatching(); else nextBackground(); },
    error(code) {
      if (code === 'api') return; // YouTube unreachable: keep the drawn background
      if (S.mode === 'watch') { toast('This video can’t play here'); stopWatching(); return; }
      if (++S.bgErrors < 5) nextBackground();
    }
  });
  nextBackground();
}

function armIdle() {
  clearTimeout(S.idleTimer);
  if (S.mode !== 'home') return;
  S.idleTimer = setTimeout(() => { if (S.mode === 'home') setMode('idle'); }, (S.cfg.idleMinutes || 5) * 60000);
}

function leaveIdle() {
  if (!S.muted) { S.muted = true; player.setMuted(true); renderCaption(); }
  setMode('home');
  nav.refresh();
  armIdle();
}

function youtubeDown() {
  if (player.available()) return false;
  toast('YouTube can’t be reached right now');
  return true;
}

function watchVideo(id, title, channel) {
  if (youtubeDown()) return;
  clearTimeout(S.idleTimer);
  S.watching = { id, title, channel, live: false };
  setMode('watch');
  player.play(id, { start: 0, muted: false });
  showOsd();
}

function watchLive(teamKey) {
  const team = S.cfg.teams.find(t => t.key === teamKey);
  const view = teamViews().find(v => v.key === teamKey);
  if (!team || !team.watch || !view || !view.live) return;
  if (team.watch.type === 'url') {
    if (bridge.send('openUrl', { url: team.watch.url })) toast('Opening K League TV…');
    else toast('Open tv.kleague.com to watch');
    return;
  }
  if (youtubeDown()) return;
  clearTimeout(S.idleTimer);
  const id = findStream(S.feed, team.watch, view.live.kickoff);
  S.watching = { id, title: team.name + ' ' + view.live.venue + ' ' + view.live.opponent, channel: 'J.LEAGUE International', live: true };
  setMode('watch');
  if (id) player.play(id, { muted: false });
  else { player.pause(); player.playChannelLive($('#live-host'), team.watch.channelId); }
  showOsd();
}

function stopWatching() {
  player.closeChannelLive($('#live-host'));
  S.watching = null;
  S.muted = true;
  hideOsd();
  setMode('home');
  nav.refresh();
  nextBackground();
  armIdle();
}

function updateOsd() {
  const bar = $('#osd-progress');
  if (S.watching && S.watching.live) { $('#osd-time').textContent = 'Live'; bar.style.width = '100%'; return; }
  const p = player.position();
  bar.style.width = p.duration ? (p.time / p.duration * 100) + '%' : '0%';
  $('#osd-time').textContent = fmtDuration(p.time) + ' / ' + fmtDuration(p.duration) + (p.paused ? ' · Paused' : '');
}

function showOsd() {
  if (!S.watching) return;
  $('#osd-channel').textContent = S.watching.channel || '';
  $('#osd-title').textContent = S.watching.title || '';
  // A channel's live page can't be paused from here; a live stream can be paused but not skipped.
  $('#osd-hint').textContent = !$('#live-host').hidden ? 'Back to home'
    : S.watching.live ? 'OK pause · Back to home' : 'OK pause · ◀ ▶ 10 s · Back to home';
  updateOsd();
  $('#osd').hidden = false;
  clearTimeout(S.osdTimer);
  S.osdTimer = setTimeout(hideOsd, 4000);
}

function hideOsd() { $('#osd').hidden = true; }

/* ---------- actions and keys ---------- */

function activate(e) {
  const a = e.dataset.action;
  if (a === 'video') watchVideo(e.dataset.id, e.dataset.title, e.dataset.channel);
  else if (a === 'watch') watchLive(e.dataset.team);
  else if (a === 'input') {
    const ok = bridge.send('switchInput', { port: Number(e.dataset.port) });
    toast(ok ? 'Switching to ' + e.dataset.label + '…' : e.dataset.label + ' is on HDMI ' + e.dataset.port);
  } else if (a === 'app') {
    const ok = bridge.send('launchApp', { match: e.dataset.app });
    toast(ok ? 'Opening ' + e.dataset.label + '…' : 'Open ' + e.dataset.label + ' from the TV’s apps');
  }
}

function onResult(r) {
  if (r.ok) return;
  if (r.cmd === 'switchInput') toast('Couldn’t switch input: ' + r.error);
  else if (r.cmd === 'launchApp' || r.cmd === 'openUrl') toast('Couldn’t open it: ' + r.error);
}

function handleKey(k) {
  if (S.mode === 'idle') {
    if (k === 'enter' || k === 'playpause') { S.muted = !S.muted; player.setMuted(S.muted); renderCaption(); }
    else if (k === 'right' || k === 'ff') nextBackground();
    else leaveIdle();
    return;
  }
  if (S.mode === 'watch') {
    const channelLive = !$('#live-host').hidden;
    if (k === 'back' || k === 'stop') { stopWatching(); return; }
    if (!channelLive) {
      if (k === 'enter' || k === 'playpause' || k === 'play' || k === 'pause') player.toggle();
      else if ((k === 'left' || k === 'rw') && !S.watching.live) player.seek(-10);
      else if ((k === 'right' || k === 'ff') && !S.watching.live) player.seek(10);
    }
    showOsd();
    return;
  }
  armIdle();
  if (k === 'enter') { const f = nav.getCurrent(); if (f) activate(f); }
  else if (k === 'left' || k === 'right' || k === 'up' || k === 'down') nav.move(k);
}

function onKeyDown(e) {
  const k = KEYS[e.keyCode];
  if (!k) return;
  e.preventDefault();
  handleKey(k);
}

// Mouse or touchpad, mainly for trying the page in a desktop browser.
function onClick(e) {
  if (S.mode === 'idle') { leaveIdle(); return; }
  if (S.mode === 'watch') { handleKey('enter'); return; }
  const f = e.target.closest && e.target.closest('.focusable');
  if (!f) return;
  nav.pick(f);
  armIdle();
  activate(f);
}

// Settings and new versions are picked up by reloading: when the TV comes back to the app
// after half a day, or at 4:00 if the idle screen has been running since the evening.
const BOOTED = Date.now();
const STALE = 12 * 3600e3;

function onVisibility(hidden) {
  if (hidden) { player.pause(); return; }
  if (!FROZEN && Date.now() - BOOTED > STALE) { location.reload(); return; }
  if (S.mode !== 'watch') player.resume();
}

function nightlyReload() {
  if (!FROZEN && S.mode === 'idle' && Date.now() - BOOTED > STALE && new Date().getHours() === 4) location.reload();
}

/* ---------- data ---------- */

function mockTeam(key) {
  const data = JSON.parse(JSON.stringify(S.mock.teams[key]));
  data.events.forEach(e => { e.date = new Date(e.date).getTime(); });
  if ((params.get('live') || '').split(',').indexOf(key) >= 0) {
    const ev = data.events.find(e => e.state === 'pre');
    if (ev) Object.assign(ev, { date: now().getTime() - 63 * 60000, state: 'in', my: 1, their: 0, clock: key === 'seoul' ? null : "63'" });
  }
  return data;
}

async function refreshFeed() {
  try { S.feed = await loadFeed(MOCK); if (!MOCK) cache.set('feed', S.feed); } catch (e) { console.warn('feed', e); }
  renderVideos();
  renderDock();
}

async function refreshWeather() {
  try {
    S.weather = MOCK ? S.mock.weather : await loadWeather(S.cfg.location);
    if (!MOCK) cache.set('weather', S.weather);
  } catch (e) { console.warn('weather', e); }
  renderWeather();
}

async function refreshTeams() {
  clearTimeout(S.teamTimer);
  await Promise.all(S.cfg.teams.map(async t => {
    try { S.teams[t.key] = MOCK ? mockTeam(t.key) : await loadTeam(t); } catch (e) { console.warn('team', t.key, e); }
  }));
  if (!MOCK) cache.set('teams', S.teams);
  const views = renderTeams();
  // Every minute while a match is on; otherwise every 15 minutes, or just after the next kick-off.
  let wait = views.some(v => v.live) ? 60000 : 15 * 60000;
  const untilKickoff = Math.min.apply(null, views.map(v => v.nextKickoff || Infinity)) - Date.now();
  if (untilKickoff > 0 && untilKickoff < wait) wait = untilKickoff + 30000;
  if (!FROZEN) S.teamTimer = setTimeout(refreshTeams, wait);
}

async function boot() {
  fitStage();
  window.addEventListener('resize', fitStage);
  S.cfg = await getJSON('config.json');
  setTimeZone(S.cfg.location.timezone);
  document.documentElement.style.setProperty('--accent', S.cfg.accent || '#F2B33D');
  if (MOCK) S.mock = await getJSON('data/mock.json');
  else {
    S.feed = cache.get('feed');
    S.weather = cache.get('weather');
    S.teams = cache.get('teams') || {};
  }

  renderClock();
  renderWeather();
  renderTeams();
  renderVideos();
  renderDock();

  setInterval(renderClock, 1000);
  setInterval(() => { renderTeams(); renderVideos(); renderDock(); }, 60000);
  setInterval(() => { if (!$('#osd').hidden) updateOsd(); }, 1000);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', () => onVisibility(document.hidden));
  bridge.on({ key: code => { const k = KEYS[code]; if (k) handleKey(k); }, visibility: onVisibility, result: onResult });
  bridge.ready();

  await refreshFeed();
  refreshWeather();
  refreshTeams();
  initBackground();
  setInterval(refreshFeed, 15 * 60000);
  setInterval(refreshWeather, 15 * 60000);
  setInterval(nightlyReload, 10 * 60000);

  if (params.has('idle')) setMode('idle'); else armIdle();
}

boot().catch(e => { console.error(e); toast('The home screen couldn’t load. Check the internet connection.'); });
