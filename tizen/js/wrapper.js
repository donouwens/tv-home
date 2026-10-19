/* TV Home wrapper: frames the hosted home screen and does the Samsung-only jobs for it
   (remote keys, switching HDMI inputs, opening apps and links, keeping the screen awake).
   Written in plain ES5 so it runs on older Tizen versions too. */
(function () {
  'use strict';

  var APP_URL = window.TVHOME_URL;
  var ORIGIN = APP_URL.replace(/^(https?:\/\/[^\/]+).*$/, '$1');
  var frame = document.getElementById('app');
  var offline = document.getElementById('offline');
  var loaded = false;
  var loadTimer = 0;

  function hasTizen() { return typeof window.tizen !== 'undefined'; }

  // Fill the screen even if the stylesheet doesn't load (styles set from script are allowed).
  function fillScreen() {
    var fill = function (el) { el.style.margin = '0'; el.style.width = '100%'; el.style.height = '100%'; el.style.overflow = 'hidden'; };
    fill(document.documentElement);
    fill(document.body);
    document.body.style.background = '#05080F';
    var f = frame.style;
    f.position = 'absolute'; f.left = '0'; f.top = '0'; f.width = '100%'; f.height = '100%'; f.border = '0'; f.display = 'block';
  }

  function post(msg) {
    try { frame.contentWindow.postMessage(msg, ORIGIN); } catch (e) { /* frame not ready */ }
  }

  function focusFrame() {
    try { frame.focus(); frame.contentWindow.focus(); } catch (e) { /* ignore */ }
  }

  function load() {
    loaded = false;
    offline.style.display = 'none';
    frame.src = APP_URL + (APP_URL.indexOf('?') < 0 ? '?' : '&') + 'tv=1&t=' + Date.now();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(function () { if (!loaded) offline.style.display = 'flex'; }, 25000);
  }

  function registerKeys() {
    if (!hasTizen() || !tizen.tvinputdevice) return;
    var wanted = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
      'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'];
    try {
      var supported = tizen.tvinputdevice.getSupportedKeys().map(function (k) { return k.name; });
      wanted.forEach(function (name) {
        if (supported.indexOf(name) >= 0) { try { tizen.tvinputdevice.registerKey(name); } catch (e) { /* ignore */ } }
      });
    } catch (e) { /* ignore */ }
  }

  function screenSaverOff() {
    try {
      var ac = window.webapis && window.webapis.appcommon;
      if (ac) ac.setScreenSaver(ac.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
    } catch (e) { /* ignore */ }
  }

  /* ---------- commands from the home screen ---------- */

  function switchInput(args, done) {
    tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (vs) {
      var list = vs.connected || [];
      var src = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].type === 'HDMI' && Number(list[i].number) === Number(args.port)) src = list[i];
      }
      if (!src) { done({ ok: false, error: 'HDMI ' + args.port + ' isn’t connected' }); return; }
      tizen.tvwindow.setSource(src, function () {
        done({ ok: true });
        // Step aside so the TV shows the input full screen, with its own remote handling.
        setTimeout(function () { try { tizen.application.getCurrentApplication().hide(); } catch (e) { /* ignore */ } }, 300);
      }, function (err) { done({ ok: false, error: err.message }); }, 'MAIN');
    }, function (err) { done({ ok: false, error: err.message }); });
  }

  function launchApp(args, done) {
    var re = new RegExp(args.match, 'i');
    tizen.application.getAppsInfo(function (apps) {
      var app = null;
      for (var i = 0; i < apps.length && !app; i++) if (re.test(apps[i].name)) app = apps[i];
      for (var j = 0; j < apps.length && !app; j++) if (re.test(apps[j].id)) app = apps[j];
      if (!app) { done({ ok: false, error: 'not installed' }); return; }
      tizen.application.launch(app.id, function () { done({ ok: true }); }, function (err) { done({ ok: false, error: err.message }); });
    }, function (err) { done({ ok: false, error: err.message }); });
  }

  function openUrl(args, done) {
    if (!/^https?:\/\//.test(args.url || '')) { done({ ok: false, error: 'bad link' }); return; }
    var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', args.url, null, null, null);
    tizen.application.launchAppControl(ctrl, null, function () { done({ ok: true }); }, function (err) { done({ ok: false, error: err.message }); });
  }

  // Opens an installed app with an app control, e.g. a video in the YouTube app. The page decides
  // the details, so how a deep link is built can change without reinstalling this app.
  function appControl(args, done) {
    var re = new RegExp(args.match, 'i');
    tizen.application.getAppsInfo(function (apps) {
      var app = null;
      for (var i = 0; i < apps.length && !app; i++) if (re.test(apps[i].name)) app = apps[i];
      for (var j = 0; j < apps.length && !app; j++) if (re.test(apps[j].id)) app = apps[j];
      if (!app) { done({ ok: false, error: 'not installed' }); return; }
      var data = [];
      var d = args.data || {};
      for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) data.push(new tizen.ApplicationControlData(k, [].concat(d[k])));
      var ctrl = new tizen.ApplicationControl(args.operation || 'http://tizen.org/appcontrol/operation/view', args.uri || null, null, null, data);
      tizen.application.launchAppControl(ctrl, app.id, function () { done({ ok: true }); }, function (err) { done({ ok: false, error: err.message }); });
    }, function (err) { done({ ok: false, error: err.message }); });
  }

  // A DIAL launch, the way phones open a video in the TV's YouTube app. Only to this TV
  // (or another address on the home network), never out to the internet.
  var LOCAL_HOST = /^(127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;

  function dialLaunch(args, done) {
    var host = args.host || '127.0.0.1';
    if (!LOCAL_HOST.test(host)) { done({ ok: false, error: 'bad host' }); return; }
    if (!/^[A-Za-z0-9._-]+$/.test(args.app || '')) { done({ ok: false, error: 'bad app name' }); return; }
    var url = 'http://' + host + ':8080/ws/apps/' + args.app;
    var body = String(args.body || '');
    var finished = false;
    var finish = function (res) { if (!finished) { finished = true; done(res); } };
    setTimeout(function () { finish({ ok: false, error: 'no answer' }); }, 8000);
    if (window.fetch) {
      // The TV's DIAL server doesn't send CORS headers, so the reply can't be read: any reply
      // counts as sent, and only a refused or timed-out connection counts as a failure.
      window.fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: body })
        .then(function () { finish({ ok: true }); }, function () { finish({ ok: false, error: 'no answer' }); });
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'text/plain');
    xhr.onload = function () { finish(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, error: 'HTTP ' + xhr.status }); };
    xhr.onerror = function () { finish({ ok: false, error: 'no answer' }); };
    xhr.send(body);
  }

  var commands = { switchInput: switchInput, launchApp: launchApp, openUrl: openUrl, appControl: appControl, dialLaunch: dialLaunch };

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || e.source !== frame.contentWindow) return;
    var d = e.data || {};
    if (d.type === 'tvhome:ready') {
      loaded = true;
      clearTimeout(loadTimer);
      offline.style.display = 'none';
      post({ type: 'tvhome:hello', tizen: hasTizen(), version: '1.1.0', commands: hasTizen() ? Object.keys(commands) : [] });
      focusFrame();
    } else if (d.type === 'tvhome:cmd') {
      var fn = commands[d.cmd];
      var reply = function (res) { post({ type: 'tvhome:result', cmd: d.cmd, ok: !!res.ok, error: res.error || null }); };
      if (!fn || !hasTizen()) { reply({ ok: false, error: 'not available' }); return; }
      try { fn(d.args || {}, reply); } catch (err) { reply({ ok: false, error: err.message }); }
    }
  });

  // Keys that land here instead of in the home screen (focus slipped out of the frame).
  document.addEventListener('keydown', function (e) {
    if (offline.style.display === 'flex') {
      if (e.keyCode === 13) load();
      return;
    }
    if (e.keyCode === 10009) e.preventDefault();
    post({ type: 'tvhome:key', keyCode: e.keyCode });
    focusFrame();
  });

  document.addEventListener('visibilitychange', function () {
    post({ type: 'tvhome:visibility', hidden: document.hidden });
    if (!document.hidden) { screenSaverOff(); focusFrame(); }
  });

  fillScreen();
  registerKeys();
  screenSaverOff();
  load();
})();
