// The feed is built every half hour by a GitHub Action (scripts/build-feed.mjs) and
// published next to the app as data/feed.json: YouTube uploads, idle videos, TV guide
// and J.LEAGUE live streams. Sources without CORS headers are read there, not on the TV.
import { getJSON } from './net.js';

const MONTH = 30 * 864e5;

// sample: the checked-in example feed, for trying the page without the Action (?mock=1)
export function loadFeed(sample) {
  return getJSON(sample ? 'data/feed.sample.json' : 'data/feed.json?t=' + Date.now());
}

// One card per channel: its newest upload from the past month that isn't in `seen` (videos
// already watched), newest first. PSV posts ~10 clips a week, so this keeps one busy channel
// from filling the row. caughtUp counts channels whose recent videos have all been watched.
export function videoCards(feed, cfg, now, seen) {
  const skip = new Set(seen || []);
  const subs = (feed && feed.subscriptions) || [];
  const byId = new Map(subs.map(s => [s.id, s]));
  const t = now.getTime();
  const cards = [];
  let caughtUp = 0;
  for (const ch of cfg.youtube.subscriptions) {
    const s = byId.get(ch.id);
    if (!s || !s.videos) continue;
    const recent = s.videos
      .map(v => Object.assign({}, v, { t: new Date(v.published).getTime() }))
      .filter(v => v.t <= t + 60000 && t - v.t < MONTH)
      .sort((a, b) => b.t - a.t);
    const pick = recent.find(v => !skip.has(v.id));
    if (pick) cards.push({ id: pick.id, title: pick.title, duration: pick.duration || null, published: pick.t, channel: ch.name, channelId: ch.id });
    else if (recent.length) caughtUp++;
  }
  cards.sort((a, b) => b.published - a.published);
  return { cards, caughtUp };
}

export function idlePool(feed) {
  return ((feed && feed.idle) || []).filter(v => !v.duration || v.duration >= 600);
}

export function epgNow(feed, key, now) {
  const items = (feed && feed.epg && feed.epg[key]) || [];
  const t = now.getTime();
  for (let i = 0; i < items.length; i++) {
    const s = new Date(items[i].start).getTime(), e = new Date(items[i].end).getTime();
    if (s <= t && t < e) {
      return { title: items[i].title, start: s, end: e, progress: (t - s) / (e - s), next: items[i + 1] || null };
    }
  }
  return null;
}

// J.LEAGUE International streams a few J1 games a round; find the one for this match.
export function findStream(feed, watch, kickoff) {
  const re = new RegExp(watch.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const streams = ((feed && feed.streams) || []).filter(s => s.channelId === watch.channelId && re.test(s.title));
  const near = s => {
    const t = new Date(s.start || s.published).getTime();
    return Math.abs(t - kickoff) < 6 * 3600e3;
  };
  const hit = streams.find(s => s.live === 'live') || streams.find(near);
  return hit ? hit.id : null;
}
