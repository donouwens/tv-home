// Remote-control focus. Rows are the elements marked data-row (teams, videos, dock);
// left/right moves within a row, up/down jumps to the nearest item in the next row.
let current = null;
let rows = [];
let rowOffset = 0;
let userMoved = false; // until the remote is used, focus follows the default as content loads
const VIDEO_VIEW = 1824 - 96; // visible width of the video row, minus the right safe area

function visible(e) {
  return e && e.isConnected && !e.closest('[hidden]') && e.getClientRects().length > 0;
}

function collect() {
  rows = [...document.querySelectorAll('[data-row]')]
    .map(r => [...r.querySelectorAll('.focusable')].filter(visible))
    .filter(r => r.length);
}

function center(e) {
  const r = e.getBoundingClientRect();
  return r.left + r.width / 2;
}

function nearest(row, from) {
  const c = center(from);
  let best = row[0], dist = Infinity;
  for (const e of row) {
    const d = Math.abs(center(e) - c);
    if (d < dist) { dist = d; best = e; }
  }
  return best;
}

function keepInView(e) {
  const list = e.closest('#video-list');
  if (!list) return;
  const li = e.closest('li');
  const left = li.offsetLeft, right = left + li.offsetWidth;
  // Scroll by whole cards, so the row always starts with a full card at the left edge.
  const items = list.children;
  const pitch = items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : li.offsetWidth;
  if (right - rowOffset > VIDEO_VIEW) rowOffset = Math.ceil((right - VIDEO_VIEW) / pitch) * pitch;
  if (left - rowOffset < 0) rowOffset = left;
  list.style.transform = 'translateX(' + (-rowOffset) + 'px)';
}

export function set(e) {
  if (current) current.classList.remove('is-focused');
  current = e || null;
  if (!current) return;
  current.classList.add('is-focused');
  try { current.focus({ preventScroll: true }); } catch (err) { /* older engines */ }
  keepInView(current);
}

export function getCurrent() { return current; }

// Focus an item picked with a mouse, and keep it like a remote move would.
export function pick(e) {
  userMoved = true;
  collect();
  set(e);
}

// Re-scan after a render, keeping focus on the same item (by data-key) when it still exists.
export function refresh(preferKey) {
  collect();
  const key = preferKey || (userMoved && current && current.dataset.key);
  let target = key ? document.querySelector('.focusable[data-key="' + CSS.escape(key) + '"]') : null;
  if (!visible(target)) target = null;
  if (!target) {
    // A live match's watch button first, then the newest video, then the dock.
    const first = sel => [...document.querySelectorAll(sel)].find(visible);
    target = first('[data-row="teams"] .focusable') || first('[data-row="videos"] .focusable') || (rows[0] && rows[0][0]) || null;
  }
  set(target);
  if (!document.querySelector('#video-list .focusable')) rowOffset = 0;
}

export function move(dir) {
  userMoved = true;
  collect();
  if (!current || !visible(current)) return refresh();
  const r = rows.findIndex(row => row.includes(current));
  if (r < 0) return refresh();
  const row = rows[r], i = row.indexOf(current);
  if (dir === 'left' && i > 0) set(row[i - 1]);
  else if (dir === 'right' && i < row.length - 1) set(row[i + 1]);
  else if (dir === 'up' && r > 0) set(nearest(rows[r - 1], current));
  else if (dir === 'down' && r < rows.length - 1) set(nearest(rows[r + 1], current));
}
