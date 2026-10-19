// Builds app/data/feed.json for the TV: YouTube uploads (no Shorts), idle videos,
// the TV guide for your channels and J.LEAGUE International live streams.
// Runs in the GitHub Action every 30 minutes (Node 20+, no dependencies).
//
// Optional env:
//   YT_API_KEY         YouTube Data API key, adds video lengths (RSS feeds don't have them)
//   FEED_FALLBACK_URL  the published feed.json; used for any source that fails this run
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const cfg = JSON.parse(await readFile(new URL('app/config.json', ROOT), 'utf8'));
const KEY = process.env.YT_API_KEY || '';
const FALLBACK = process.env.FEED_FALLBACK_URL || '';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const errors = [];

async function get(url, as = 'text') {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en-GB,en;q=0.9', cookie: 'SOCS=CAI' },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return as === 'json' ? res.json() : res.text();
}

const decode = s => s
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

// YouTube's auto playlists: UULF = long-form uploads only (no Shorts, no streams), UULV = live streams.
export function parseRss(xml) {
  return xml.split('<entry>').slice(1).map(chunk => ({
    id: (chunk.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1],
    title: decode((chunk.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
    published: (chunk.match(/<published>([^<]+)<\/published>/) || [])[1] || null
  })).filter(v => v.id);
}

async function playlist(channelId, kind) {
  return parseRss(await get('https://www.youtube.com/feeds/videos.xml?playlist_id=' + kind + channelId.slice(2)));
}

export function isoSeconds(d) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || '');
  if (!m) return null;
  return ((+m[1] || 0) * 86400) + ((+m[2] || 0) * 3600) + ((+m[3] || 0) * 60) + (+m[4] || 0);
}

async function videoDetails(ids) {
  const out = {};
  if (!KEY || !ids.length) return out;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const d = await get('https://www.googleapis.com/youtube/v3/videos?part=contentDetails,liveStreamingDetails,snippet&id='
      + chunk.join(',') + '&key=' + encodeURIComponent(KEY), 'json');
    for (const it of d.items || []) {
      const ls = it.liveStreamingDetails || {};
      out[it.id] = {
        duration: isoSeconds(it.contentDetails && it.contentDetails.duration) || null,
        live: it.snippet && it.snippet.liveBroadcastContent || 'none',
        start: ls.actualStartTime || ls.scheduledStartTime || null,
        end: ls.actualEndTime || null
      };
    }
  }
  return out;
}

/* ---------- TV guide ---------- */

function ymd(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function tzOffset(ts, tz) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ts))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ts;
}

// "2026-10-19T07:00:00" in Warsaw time -> UTC ISO string
function zonedToUtc(local, tz) {
  const [d, t = '00:00'] = local.split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m, s = 0] = t.split(':').map(Number);
  const wall = Date.UTC(Y, M - 1, D, h, m, s);
  let ts = wall - tzOffset(wall, tz);
  ts = wall - tzOffset(ts, tz);
  return new Date(ts).toISOString();
}

// A guide time in whatever shape the page uses: epoch seconds or ms, ISO with its own
// offset, or a local wall-clock time ("2026-10-19 07:00") in the channel's time zone.
export function toUtc(value, tz) {
  const s = String(value).trim();
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString();
  if (/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(s)) return new Date(s).toISOString();
  return zonedToUtc(s.replace(' ', 'T'), tz);
}

// Every schema.org ItemList entry in a page's JSON-LD (plain, in arrays or in @graph).
export function ldListItems(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { continue; }
    const stack = [data];
    while (stack.length) {
      const d = stack.pop();
      if (!d || typeof d !== 'object') continue;
      if (Array.isArray(d)) { stack.push(...d); continue; }
      if (d['@graph']) stack.push(d['@graph']);
      if (d['@type'] === 'ItemList') for (const it of d.itemListElement || []) out.push(it && it.item ? it.item : it);
    }
  }
  return out;
}

// tv24.lt pages carry the day's schedule as schema.org JSON-LD with UTC times.
export function parseTv24(html, tz) {
  return ldListItems(html)
    .filter(it => it && it.name && it.startDate && it.endDate)
    .map(it => ({ title: decode(String(it.name)), start: toUtc(it.startDate, tz), end: toUtc(it.endDate, tz) }));
}

async function tv24(slug) {
  const tz = cfg.location.timezone;
  const today = ymd(new Date(), tz);
  const tomorrow = ymd(new Date(Date.now() + 864e5), tz);
  const pages = await Promise.allSettled([
    get('https://www.tv24.lt/kanalas/' + slug + '/' + today),
    get('https://www.tv24.lt/kanalas/' + slug + '/' + tomorrow)
  ]);
  const items = [];
  for (const p of pages) if (p.status === 'fulfilled') items.push(...parseTv24(p.value, tz));
  if (!items.length) throw new Error('tv24 ' + slug + ': no schedule found');
  return tidy(items);
}

// filmweb.pl lists times in Polish local time inside each programme block.
export function parseFilmweb(html, tz) {
  const items = [];
  for (const block of html.split('class="tvPageGroupedSeances TvPageGroupedSeances"').slice(1)) {
    const start = (block.match(/data-start-time="([^"]+)"/) || [])[1];
    const end = (block.match(/data-end-time="([^"]+)"/) || [])[1];
    const name = (block.match(/itemprop="name"\s+content="([^"]*)"/) || block.match(/content="([^"]*)"\s+itemprop="name"/)
      || block.match(/itemprop="name"[^>]*>([^<]+)</) || [])[1];
    if (start && end && name) items.push({ title: decode(name.trim()), start: toUtc(start, tz), end: toUtc(end, tz) });
  }
  return items;
}

async function filmweb(id, tz) {
  const items = parseFilmweb(await get('https://www.filmweb.pl/program-tv/' + id), tz);
  if (!items.length) throw new Error('filmweb ' + id + ': no schedule found');
  return tidy(items);
}

function tidy(items) {
  const seen = new Set();
  return items
    .filter(i => { const k = i.start + i.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter(i => new Date(i.end) > Date.now() - 3600e3);
}

/* ---------- build ---------- */

async function attempt(label, fn) {
  try { return await fn(); } catch (e) { errors.push(label + ': ' + e.message); return null; }
}

export async function main() {
  let previous = null;
  if (FALLBACK) previous = await attempt('fallback', () => get(FALLBACK + '?t=' + Date.now(), 'json'));

  const subscriptions = await Promise.all(cfg.youtube.subscriptions.map(async ch => {
    const videos = await attempt('uploads ' + ch.handle, () => playlist(ch.id, 'UULF'));
    const old = previous && (previous.subscriptions || []).find(s => s.id === ch.id);
    return { id: ch.id, name: ch.name, videos: videos || (old ? old.videos : []) };
  }));

  let idle = [];
  for (const ch of cfg.youtube.idle) {
    const vids = await attempt('idle ' + ch.handle, () => playlist(ch.id, 'UULF'));
    const list = vids
      ? vids.map(v => ({ id: v.id, title: v.title, channelId: ch.id, channelName: ch.name, published: v.published }))
      : ((previous && previous.idle) || []).filter(v => v.channelId === ch.id);
    idle = idle.concat(list);
  }

  let streams = [];
  for (const ch of cfg.youtube.liveChannels || []) {
    const vids = await attempt('streams ' + ch.name, () => playlist(ch.id, 'UULV'));
    if (vids) streams = streams.concat(vids.slice(0, 30).map(v => Object.assign({ channelId: ch.id }, v)));
    else if (previous) streams = streams.concat((previous.streams || []).filter(s => s.channelId === ch.id));
  }

  // Lengths (and live status of streams) need the Data API.
  const ids = [].concat(...subscriptions.map(s => s.videos.map(v => v.id)), idle.map(v => v.id), streams.map(s => s.id));
  const details = (await attempt('video details', () => videoDetails([...new Set(ids)]))) || {};
  for (const s of subscriptions) for (const v of s.videos) v.duration = (details[v.id] && details[v.id].duration) || v.duration || null;
  for (const v of idle) v.duration = (details[v.id] && details[v.id].duration) || null;
  for (const s of streams) Object.assign(s, details[s.id] ? { live: details[s.id].live, start: details[s.id].start, end: details[s.id].end } : {});

  const epg = {};
  for (const ch of cfg.tv) {
    const e = ch.epg || {};
    const items = await attempt('guide ' + ch.key, () =>
      e.type === 'tv24' ? tv24(e.slug) : e.type === 'filmweb' ? filmweb(e.id, e.timezone || 'Europe/Warsaw') : Promise.resolve([]));
    epg[ch.key] = items || tidy((previous && previous.epg && previous.epg[ch.key]) || []);
  }

  const feed = { generatedAt: new Date().toISOString(), subscriptions, idle, epg, streams, errors };
  await mkdir(new URL('app/data/', ROOT), { recursive: true });
  await writeFile(new URL('app/data/feed.json', ROOT), JSON.stringify(feed));
  console.log('feed.json:', subscriptions.reduce((n, s) => n + s.videos.length, 0), 'uploads,', idle.length, 'idle videos,',
    Object.entries(epg).map(([k, v]) => k + ' ' + v.length).join(', '), ',', streams.length, 'streams');
  if (errors.length) console.log('Problems:\n  ' + errors.join('\n  '));
}

// Run when called as a script (the GitHub Action); tests import the parsers without building.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
