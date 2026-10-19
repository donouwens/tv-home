// Results, fixtures, standings and live state for your teams.
// PSV and FC Tokyo come from ESPN's public JSON; FC Seoul's K League games come from
// TheSportsDB (ESPN only has FC Seoul's AFC games, which are merged in).
import { getJSON } from './net.js';
import { ordinal, whenPast, whenNext } from './util.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer/';
const TSDB = 'https://www.thesportsdb.com/api/v1/json/123/';
const LIVE_WINDOW = 135 * 60 * 1000;

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') v = v.displayValue !== undefined ? v.displayValue : v.value;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function espnEvent(e, teamId) {
  const c = e.competitions && e.competitions[0];
  if (!c) return null;
  const me = c.competitors.find(x => String(x.team.id) === String(teamId));
  const them = c.competitors.find(x => String(x.team.id) !== String(teamId));
  if (!me || !them) return null;
  const status = (c.status && c.status.type) || {};
  return {
    id: 'espn:' + e.id,
    date: new Date(e.date).getTime(),
    state: status.state || 'pre',
    home: me.homeAway === 'home',
    opponent: them.team.shortDisplayName || them.team.displayName,
    my: status.state === 'pre' ? null : num(me.score),
    their: status.state === 'pre' ? null : num(them.score),
    clock: status.state === 'in' ? (status.shortDetail === 'HT' ? 'HT' : (c.status.displayClock || null)) : null,
    league: e.league ? e.league.slug : null
  };
}

// A team's matches, plus its crest when ESPN has one.
async function espnSchedule(teamId, fixtures) {
  const d = await getJSON(ESPN + 'all/teams/' + teamId + '/schedule' + (fixtures ? '?fixture=true' : ''));
  return {
    events: (d.events || []).map(e => espnEvent(e, teamId)).filter(Boolean),
    logo: (d.team && d.team.logo) || null
  };
}

const eventsOf = r => (r.status === 'fulfilled' && r.value ? r.value.events : []);

async function espnStanding(slug, teamId) {
  const d = await getJSON(ESPN_STANDINGS + slug + '/standings');
  const groups = d.children || [];
  for (const g of groups) {
    const entry = ((g.standings && g.standings.entries) || []).find(x => String(x.team.id) === String(teamId));
    if (entry) {
      const stat = name => { const s = entry.stats.find(x => x.name === name); return s ? Number(s.value) : null; };
      return { rank: stat('rank'), points: stat('points') };
    }
  }
  return null;
}

function tsdbState(status, hasScore, date, now) {
  const s = String(status || '').trim();
  if (/^(FT|AET|PEN|AP|Match Finished|FT_PEN|After Pen\.?)$/i.test(s)) return 'post';
  if (/^(1H|HT|2H|ET|BT|P|LIVE|INT|In Progress|Live)$/i.test(s)) return 'in';
  if (/^(PST|CANC|ABD|SUSP|Postponed|Cancelled)$/i.test(s)) return 'off';
  if (hasScore && date < now) return 'post';
  return 'pre';
}

function tsdbEvent(e, teamId, now) {
  let ts = e.strTimestamp || (e.dateEvent && e.strTime ? e.dateEvent + 'T' + e.strTime : e.dateEvent);
  if (!ts) return null;
  if (!/Z$|[+-]\d\d:?\d\d$/.test(ts)) ts += 'Z';
  const date = new Date(ts).getTime();
  const home = String(e.idHomeTeam) === String(teamId);
  const hs = num(e.intHomeScore), as = num(e.intAwayScore);
  const state = tsdbState(e.strStatus, hs !== null && as !== null, date, now);
  if (state === 'off') return null;
  return {
    id: 'tsdb:' + e.idEvent,
    date,
    state,
    home,
    opponent: home ? e.strAwayTeam : e.strHomeTeam,
    my: home ? hs : as,
    their: home ? as : hs,
    clock: state === 'in' && /^HT$/i.test(e.strStatus) ? 'HT' : null,
    league: e.strLeague || null
  };
}

async function loadEspnTeam(team) {
  const [past, upcoming, standing] = await Promise.allSettled([
    espnSchedule(team.espnId, false),
    espnSchedule(team.espnId, true),
    espnStanding(team.leagueSlug, team.espnId)
  ]);
  if (past.status === 'rejected' && upcoming.status === 'rejected') throw past.reason;
  return {
    events: dedupe(eventsOf(past).concat(eventsOf(upcoming))),
    standing: standing.value || null,
    logo: (past.value && past.value.logo) || (upcoming.value && upcoming.value.logo) || null,
    at: Date.now()
  };
}

async function loadTsdbTeam(team) {
  const now = Date.now();
  const year = new Date().getFullYear();
  const [last, next, table, afc, info] = await Promise.allSettled([
    getJSON(TSDB + 'eventslast.php?id=' + team.tsdbId),
    getJSON(TSDB + 'eventsnext.php?id=' + team.tsdbId),
    getJSON(TSDB + 'lookuptable.php?l=' + team.tsdbLeague + '&s=' + year),
    team.espnId ? espnSchedule(team.espnId, true) : Promise.resolve(null),
    getJSON(TSDB + 'lookupteam.php?id=' + team.tsdbId)
  ]);
  if (last.status === 'rejected' && next.status === 'rejected') throw last.reason;
  const events = []
    .concat(((last.value && last.value.results) || []).map(e => tsdbEvent(e, team.tsdbId, now)))
    .concat(((next.value && next.value.events) || []).map(e => tsdbEvent(e, team.tsdbId, now)))
    .concat(eventsOf(afc))
    .filter(Boolean);
  let standing = null;
  const row = ((table.value && table.value.table) || []).find(r => String(r.idTeam) === String(team.tsdbId));
  if (row) standing = { rank: num(row.intRank), points: num(row.intPoints) };
  const t = info.value && info.value.teams && info.value.teams[0];
  return { events: dedupe(events), standing, logo: (t && t.strBadge) || (afc.value && afc.value.logo) || null, at: now };
}

function dedupe(events) {
  const seen = new Map();
  for (const e of events) {
    const prev = seen.get(e.id);
    // Prefer the record that knows more (a live or finished state beats "pre").
    if (!prev || (prev.state === 'pre' && e.state !== 'pre')) seen.set(e.id, e);
  }
  return [...seen.values()].sort((a, b) => a.date - b.date);
}

export function loadTeam(team) {
  return team.source === 'thesportsdb' ? loadTsdbTeam(team) : loadEspnTeam(team);
}

// Turn raw data into the strings the cards show.
export function teamView(team, data, now) {
  const view = {
    key: team.key, name: team.name, badge: team.badge, leagueName: team.leagueName,
    watch: team.watch || null, live: null, last: null, next: null, standing: null, loading: !data,
    // A crest set in config.json wins; otherwise the one the data source gives us.
    logo: (team.badge && team.badge.logo) || (data && data.logo) || null
  };
  if (!data) return view;
  const t = now.getTime();
  const events = (data.events || []).slice().sort((a, b) => a.date - b.date);
  const live = events.find(e => e.state === 'in')
    || events.find(e => e.state === 'pre' && t >= e.date && t - e.date < LIVE_WINDOW);
  const past = events.filter(e => e.state === 'post' && e.date <= t && e !== live);
  const last = past[past.length - 1];
  const next = events.find(e => e !== live && e.state === 'pre' && e.date > t);

  if (live) {
    const known = live.my !== null && live.their !== null;
    view.live = {
      id: live.id,
      kickoff: live.date,
      score: known ? live.my + '–' + live.their : null,
      opponent: live.opponent,
      venue: live.home ? 'vs' : 'at',
      minute: live.clock || null
    };
  }
  if (last && last.my !== null && last.their !== null) {
    view.last = {
      letter: last.my > last.their ? 'W' : last.my < last.their ? 'L' : 'D',
      word: last.my > last.their ? 'Won' : last.my < last.their ? 'Lost' : 'Drew',
      score: last.my + '–' + last.their,
      opponent: (last.home ? 'vs ' : 'at ') + last.opponent,
      when: whenPast(new Date(last.date), now)
    };
  }
  // Opponent and time are separate so a long club name can be shortened without losing the kick-off time.
  if (next) view.next = { opponent: (next.home ? 'vs ' : 'at ') + next.opponent, when: whenNext(new Date(next.date), now) };
  if (data.standing && data.standing.rank) {
    view.standing = ordinal(data.standing.rank) + ' in ' + team.leagueName
      + (data.standing.points !== null ? ' · ' + data.standing.points + ' pts' : '');
  }
  view.nextKickoff = next ? next.date : null;
  return view;
}
