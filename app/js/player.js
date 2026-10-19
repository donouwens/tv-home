// One YouTube player for everything: the muted background, the idle screen and
// full-screen watching. Embeds need a real https page as referrer, which is why the
// app is hosted (GitHub Pages) and the TV wrapper only frames it.
let player = null;
let readyResolve;
const ready = new Promise(r => { readyResolve = r; });
let handlers = { ended() {}, error() {}, playing() {} };
let apiFailed = false;

export function initPlayer(mount, h) {
  Object.assign(handlers, h || {});
  const create = () => {
    player = new window.YT.Player(mount, {
      host: 'https://www.youtube-nocookie.com',
      width: '1920',
      height: '1080',
      playerVars: {
        autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
        modestbranding: 1, rel: 0, playsinline: 1, enablejsapi: 1, origin: location.origin
      },
      events: {
        onReady: () => readyResolve(),
        onStateChange: e => {
          if (e.data === window.YT.PlayerState.ENDED) handlers.ended();
          if (e.data === window.YT.PlayerState.PLAYING) handlers.playing();
        },
        onError: e => handlers.error(e.data)
      }
    });
  };
  if (window.YT && window.YT.Player) { create(); return; }
  window.onYouTubeIframeAPIReady = create;
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => { apiFailed = true; handlers.error('api'); };
  document.head.appendChild(s);
}

export function available() { return !apiFailed; }

export async function play(videoId, opts) {
  const o = opts || {};
  await ready;
  if (o.muted) player.mute(); else { player.unMute(); player.setVolume(100); }
  player.loadVideoById({ videoId, startSeconds: Math.floor(o.start || 0) });
}

export async function setMuted(muted) {
  await ready;
  if (muted) player.mute(); else { player.unMute(); player.setVolume(100); }
}

export async function toggle() {
  await ready;
  if (player.getPlayerState() === 1) player.pauseVideo(); else player.playVideo();
}

export async function pause() { await ready; player.pauseVideo(); }
export async function resume() { await ready; player.playVideo(); }

export async function seek(delta) {
  await ready;
  player.seekTo(Math.max(0, player.getCurrentTime() + delta), true);
}

// -1 not started, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued; null before the player is ready.
export function state() {
  try { return player && player.getPlayerState ? player.getPlayerState() : null; } catch (e) { return null; }
}

export function position() {
  if (!player || !player.getCurrentTime) return { time: 0, duration: 0, paused: false };
  return { time: player.getCurrentTime() || 0, duration: player.getDuration() || 0, paused: player.getPlayerState() === 2 };
}

// A channel's current live stream, used when the feed hasn't picked up the video id yet.
export function playChannelLive(host, channelId) {
  host.textContent = '';
  const f = document.createElement('iframe');
  f.src = 'https://www.youtube.com/embed/live_stream?channel=' + encodeURIComponent(channelId) + '&autoplay=1&controls=0&rel=0';
  f.allow = 'autoplay; encrypted-media';
  host.appendChild(f);
  host.hidden = false;
}

export function closeChannelLive(host) {
  host.textContent = '';
  host.hidden = true;
}
