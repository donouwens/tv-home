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

  var commands = { switchInput: switchInput, launchApp: launchApp, openUrl: openUrl };

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || e.source !== frame.contentWindow) return;
    var d = e.data || {};
    if (d.type === 'tvhome:ready') {
      loaded = true;
      clearTimeout(loadTimer);
      offline.style.display = 'none';
      post({ type: 'tvhome:hello', tizen: hasTizen(), version: '1.0.0' });
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

  registerKeys();
  screenSaverOff();
  load();
})();
