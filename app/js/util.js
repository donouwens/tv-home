// Small helpers shared by the rest of the app.

export function $(sel, root) { return (root || document).querySelector(sel); }

// Build an element: el('div', { class: 'x', text: 'hi' }, child, ...)
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'svg') node.innerHTML = v; // only ever our own static icon markup
    else if (k === 'style') node.setAttribute('style', v);
    else if (k === 'hidden') node.hidden = true;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

let TZ = 'Europe/Vilnius';
const formatters = {};
export function setTimeZone(tz) { if (tz) TZ = tz; }
function fmt(opts) {
  const key = JSON.stringify(opts);
  if (!formatters[key]) formatters[key] = new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: TZ }, opts));
  return formatters[key];
}

export function timeHM(d) { return fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d); }
export function dateLong(d) { return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d).replace(',', ''); }
export function weekdayShort(d) { return fmt({ weekday: 'short' }).format(d); }
export function dayMonth(d) { return fmt({ day: 'numeric', month: 'short' }).format(d); }
function dayKey(d) { return fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }

// "Sat" for the last week, "12 Oct" before that.
export function whenPast(d, now) {
  if (dayKey(d) === dayKey(now)) return 'Today';
  return (now - d) < 6.5 * 864e5 ? weekdayShort(d) : dayMonth(d);
}

// "Today 13:00", "Wed 13:00", "2 Nov 18:45"
export function whenNext(d, now) {
  const t = timeHM(d);
  if (dayKey(d) === dayKey(now)) return 'Today ' + t;
  return ((d - now) < 6.5 * 864e5 ? weekdayShort(d) : dayMonth(d)) + ' ' + t;
}

export function ago(d, now) {
  const mins = Math.max(1, Math.round((now - d) / 60000));
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function fmtDuration(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '';
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = n => String(n).padStart(2, '0');
  return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}

export function initials(name) {
  const words = String(name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function random(min, max) { return min + Math.random() * (max - min); }
