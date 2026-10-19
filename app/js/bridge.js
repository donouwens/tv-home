// Talks to the TV. On the TV this page runs inside the small Tizen wrapper app
// (tizen/), which owns the Samsung APIs; we ask it to switch inputs, open apps and
// so on with postMessage. If the page itself has the tizen object, we call it directly.
const inFrame = window.parent !== window;
const handlers = {};
let wrapperInfo = null;

window.addEventListener('message', e => {
  if (e.source !== window.parent) return;
  const d = e.data;
  if (!d || typeof d !== 'object' || typeof d.type !== 'string' || d.type.indexOf('tvhome:') !== 0) return;
  if (d.type === 'tvhome:hello') wrapperInfo = d;
  else if (d.type === 'tvhome:key' && handlers.key) handlers.key(d.keyCode);
  else if (d.type === 'tvhome:visibility' && handlers.visibility) handlers.visibility(!!d.hidden);
  else if (d.type === 'tvhome:result' && handlers.result) handlers.result(d);
});

export function on(h) { Object.assign(handlers, h); }

export function ready() {
  if (inFrame) window.parent.postMessage({ type: 'tvhome:ready' }, '*');
  if (window.tizen) direct.screenSaver({}, () => {});
}

export function onTV() { return !!window.tizen || !!wrapperInfo; }

// Whether the TV can do `cmd`. The TV app lists what it can do when it says hello, so a page
// newer than the installed TV app doesn't ask for things it doesn't know yet.
export function can(cmd) {
  if (window.tizen) return !!direct[cmd];
  return !!(wrapperInfo && Array.isArray(wrapperInfo.commands) && wrapperInfo.commands.indexOf(cmd) >= 0);
}

// Returns false when there's no TV to talk to (a desktop browser).
export function send(cmd, args) {
  if (window.tizen && direct[cmd]) {
    direct[cmd](args || {}, res => handlers.result && handlers.result(Object.assign({ cmd }, res)));
    return true;
  }
  if (inFrame && wrapperInfo) {
    window.parent.postMessage({ type: 'tvhome:cmd', cmd, args: args || {} }, '*');
    return true;
  }
  return false;
}

// Same implementations as tizen/js/wrapper.js, for a page loaded straight in a Tizen app.
const direct = {
  switchInput(args, done) {
    try {
      window.tizen.systeminfo.getPropertyValue('VIDEOSOURCE', vs => {
        const src = (vs.connected || []).find(s => s.type === 'HDMI' && Number(s.number) === Number(args.port));
        if (!src) return done({ ok: false, error: 'HDMI ' + args.port + ' isn’t connected' });
        window.tizen.tvwindow.setSource(src, () => {
          done({ ok: true });
          setTimeout(() => { try { window.tizen.application.getCurrentApplication().hide(); } catch (e) { /* ignore */ } }, 300);
        }, err => done({ ok: false, error: err.message }), 'MAIN');
      }, err => done({ ok: false, error: err.message }));
    } catch (e) { done({ ok: false, error: e.message }); }
  },
  launchApp(args, done) {
    try {
      const re = new RegExp(args.match, 'i');
      window.tizen.application.getAppsInfo(apps => {
        const app = apps.find(a => re.test(a.name)) || apps.find(a => re.test(a.id));
        if (!app) return done({ ok: false, error: 'not installed' });
        window.tizen.application.launch(app.id, () => done({ ok: true }), err => done({ ok: false, error: err.message }));
      }, err => done({ ok: false, error: err.message }));
    } catch (e) { done({ ok: false, error: e.message }); }
  },
  openUrl(args, done) {
    try {
      const ctrl = new window.tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', args.url, null, null, null);
      window.tizen.application.launchAppControl(ctrl, null, () => done({ ok: true }), err => done({ ok: false, error: err.message }));
    } catch (e) { done({ ok: false, error: e.message }); }
  },
  appControl(args, done) {
    try {
      const re = new RegExp(args.match, 'i');
      window.tizen.application.getAppsInfo(apps => {
        const app = apps.find(a => re.test(a.name)) || apps.find(a => re.test(a.id));
        if (!app) return done({ ok: false, error: 'not installed' });
        const data = Object.entries(args.data || {}).map(([k, v]) => new window.tizen.ApplicationControlData(k, [].concat(v)));
        const ctrl = new window.tizen.ApplicationControl(args.operation || 'http://tizen.org/appcontrol/operation/view', args.uri || null, null, null, data);
        window.tizen.application.launchAppControl(ctrl, app.id, () => done({ ok: true }), err => done({ ok: false, error: err.message }));
      }, err => done({ ok: false, error: err.message }));
    } catch (e) { done({ ok: false, error: e.message }); }
  },
  screenSaver(args, done) {
    try {
      const ac = window.webapis && window.webapis.appcommon;
      if (ac) ac.setScreenSaver(ac.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
      done({ ok: true });
    } catch (e) { done({ ok: false, error: e.message }); }
  }
};
