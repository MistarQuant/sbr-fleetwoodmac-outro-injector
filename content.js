(() => {
  if (window.__SBR_CHAIN__) return;
  window.__SBR_CHAIN__ = true;

  const IS_TOP = window.top === window;
  const MAX_EPISODE_SECONDS = 30 * 60; // only videos shorter than 30 min to avoid clash with longer eps idk man just did it 
  const DEFAULT_DURATION = 88.76;      // length of .mp3 custom music from youtube {https://www.youtube.com/watch?v=5W1m6BqvQu4&list=RD5W1m6BqvQu4&start_radio=1}
  const FADE_IN = 3;                   // fading in zappppp
  const FADE_OUT = 5;                  // fading out zappppppp
  const RESYNC_FADE = 1;               // tusk act 2 rotate his balls to infinty spaces
//just making sure its on a page with steel ball run (exceptions might be yt videos talking about sbr jjba longer than 30 mins Hamonbeat prolly)
  const KEYWORDS = new RegExp(
    [
      "steel[\\s\\-_.:]*ball[\\s\\-_.:]*run",
      "jojo",
      "jjba",
      "kimyou\\s*na\\s*bouken",
      "bizzare\\s+adventure",
      "bizarre\\s+adventure",
      "ジョジョ",
      "スティール[・･\\s]*ボール[・･\\s]*ラン",
      "奇妙な冒険"
    ].join("|"),
    "i"
  );

  let settings = { auto: true, volume: 0.6, triggerSeconds: 21 * 60 + 37.45, customStamp: null }; //only for episode 2 tho gotta change this for other episodes
  const settingsReady = chrome.storage.local
    .get({ auto: true, volume: 0.6, triggerSeconds: 21 * 60 + 37.45, customStamp: null })
    .then(s => { settings = s; });

  chrome.storage.onChanged.addListener((changes, area) => { //why not
    if (area !== "local") return;
    for (const k of ["auto", "volume", "triggerSeconds", "customStamp"]) {
      if (changes[k]) settings[k] = changes[k].newValue;
    }
    if (changes.volume) applyVolume();
    if (changes.customStamp) { buf = null; bufKey = null; }
  });

  // ---------------------------------------------------------------- detection
  let localMatch = false;
  let tabMatch = false;
  let lastReported = null;
  let dead = false;

  function collectPageText() {
    const parts = [document.title || ""];
    const metas = [
      'meta[property="og:title"]', 'meta[name="title"]', 'meta[name="twitter:title"]',
      'meta[property="og:description"]', 'meta[name="description"]', 'meta[name="keywords"]',
      'meta[name="twitter:description"]'
    ];
    for (const sel of metas) {
      const m = document.querySelector(sel);
      if (m && m.content) parts.push(m.content);
    }
    document.querySelectorAll("h1, h2, [itemprop='name'], [class*='breadcrumb' i]").forEach((el, i) => {
      if (i < 25) parts.push((el.textContent || "").slice(0, 200));
    });
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s, i) => {
      if (i < 5) parts.push((s.textContent || "").slice(0, 8000));
    });
    return parts.join(" \n ");
  }

  function detect() {
    try {
      localMatch = KEYWORDS.test(collectPageText());
    } catch (_) { localMatch = false; }
    if (IS_TOP && localMatch !== lastReported) {
      lastReported = localMatch;
      safeSend({ type: "SET_MATCH", matched: localMatch });
    }
  }

  async function refreshTabMatch() {
    if (IS_TOP) { tabMatch = localMatch; return; }
    try {
      const r = await chrome.runtime.sendMessage({ type: "GET_MATCH" });
      tabMatch = !!(r && r.matched);
    } catch (_) {}
  }

  const isMatched = () => localMatch || tabMatch;

  function safeSend(msg) {
    try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (_) {}
  }

  // ------------------------------------------------------------------- videos
  function allVideos(root = document, out = []) {
    root.querySelectorAll("video").forEach(v => out.push(v));
    root.querySelectorAll("*").forEach(el => { if (el.shadowRoot) allVideos(el.shadowRoot, out); });
    return out;
  }

  function chooseVideo() {
    const vs = allVideos().filter(v => v.isConnected && Number.isFinite(v.duration) && v.duration > 0);
    if (!vs.length) return null;
    const area = v => { const r = v.getBoundingClientRect(); return r.width * r.height; };
    return vs.find(v => !v.paused && !v.ended && area(v) > 0) ||
           vs.sort((a, b) => area(b) - area(a))[0];
  }

  const eligible = v =>
    v && v.duration < MAX_EPISODE_SECONDS && v.duration > settings.triggerSeconds + 5;

  // -------------------------------------------------------------------- audio ----- mostly just audio functions here
  let ctx = null, volGain = null, muteGain = null;
  let buf = null, bufKey = null, loading = null;
  let src = null;            // starting the src
  let video = null;
  let stopped = false;       // stop
  let manual = false;        // play
  let videoMute = null;      // muted
  let videoAbort = null;
  let toast = null;

  function ensureCtx() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    volGain = ctx.createGain();
    muteGain = ctx.createGain();
    volGain.connect(muteGain);
    muteGain.connect(ctx.destination);
    applyVolume(true);
    return ctx;
  }

  function applyVolume(immediate) {
    if (!ctx) return;
    const v = Math.min(1, Math.max(0, Number(settings.volume)));
    if (immediate) volGain.gain.value = v;
    else volGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }
//here starts the semi complicated shit in case you are reading this its not as hard just take 5 minutes of your time 
  function b64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
//add music convert to buffer bytes yada yada yada
  async function loadBuffer() {
    const key = settings.customStamp ? "custom:" + settings.customStamp : "default";
    if (buf && bufKey === key) return buf;
    if (loading) return loading;
    loading = (async () => {
      ensureCtx();
      let decoded = null;
      if (settings.customStamp) {
        try {
          const { customData } = await chrome.storage.local.get("customData");
          decoded = await ctx.decodeAudioData(b64ToArrayBuffer(customData));
        } catch (_) { decoded = null; } // fall back to the default track
      }
      if (!decoded) {
        const ab = await (await fetch(chrome.runtime.getURL("the-chain.mp3"))).arrayBuffer();
        decoded = await ctx.decodeAudioData(ab);
      }
      buf = decoded;
      bufKey = key;
      return buf;
    })().finally(() => { loading = null; });
    return loading;
  }

  // horse hump music is shut down to perfect seconds
  function holdVideoMuted(v) {
    if (!v || v.muted || v.volume === 0) return false; // user already muted it: leave it alone
    v.muted = true;
    videoMute = { v };
    return true;
  }

  function releaseVideo() {
    if (!videoMute) return;
    try { videoMute.v.muted = false; } catch (_) {}
    videoMute = null;
  }

  function userStop() {
    stopped = true;
    manual = false;
    stopMusic(1.0);
  }

  //pop-up
  function hideToast() {
    if (toast) { try { toast.host.remove(); } catch (_) {} clearTimeout(toast.timer); toast = null; }
  }

  function showToast() {
    hideToast();
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .box{font:13px system-ui,sans-serif;background:rgba(20,20,24,.92);color:#fff;padding:12px 14px;
             border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.45);width:230px}
        .t{font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px}
        .x{background:none;border:0;color:#fff;cursor:pointer;font-size:15px;padding:0}
        .r{display:flex;align-items:center;gap:8px;margin-bottom:8px}
        input{flex:1}
        .s{width:100%;padding:6px;border:0;border-radius:6px;background:#c0392b;color:#fff;cursor:pointer}
      </style>
      <div class="box">
        <div class="t"><span>&#9835; The Chain is playing</span><button class="x" title="Dismiss">&times;</button></div>
        <div class="r"><span>Vol</span><input type="range" min="0" max="100"></div>
        <button class="s">Stop music</button>
      </div>`;
    const vol = root.querySelector("input");
    vol.value = Math.round(Number(settings.volume) * 100);
    vol.addEventListener("input", () => chrome.storage.local.set({ volume: Number(vol.value) / 100 }));
    root.querySelector(".s").addEventListener("click", () => { userStop(); });
    root.querySelector(".x").addEventListener("click", hideToast);
    (document.fullscreenElement || document.documentElement).appendChild(host);
    toast = { host, timer: setTimeout(hideToast, 10000) };
  }

  document.addEventListener("fullscreenchange", () => {
    if (toast && toast.host) (document.fullscreenElement || document.documentElement).appendChild(toast.host);
  });

  // Custom music never plays longer than the default track.
  const playDuration = () => (buf ? Math.min(buf.duration, DEFAULT_DURATION) : DEFAULT_DURATION);

  function startMusic(pos) {
    if (!buf || !ctx) return false;
    const dur = playDuration();
    const remaining = dur - pos;
    if (remaining < 1) return false;
    stopMusic(0);

    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    s.connect(g);
    g.connect(volGain);

    const now = ctx.currentTime;
    const fi = Math.min(pos < 0.5 ? FADE_IN : RESYNC_FADE, remaining / 2);
    const fo = Math.min(FADE_OUT, remaining / 2);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + fi);
    g.gain.setValueAtTime(1, now + remaining - fo);
    g.gain.linearRampToValueAtTime(0, now + remaining);

    s.start(now, pos, remaining);
    const handle = { s, g };
    s.onended = () => { try { s.disconnect(); g.disconnect(); } catch (_) {} if (src === handle) { src = null; releaseVideo(); hideToast(); } };
    src = handle;
    const alreadyMuted = !holdVideoMuted(video);
    muteGain.gain.value = alreadyMuted ? 0 : 1; // video was already muted by the user: stay silent too
    return true;
  }

  function stopMusic(fade = 0.4) {
    releaseVideo();
    hideToast();
    if (!src) return;
    const { s, g } = src;
    src = null;
    try {
      if (ctx.state === "running" && fade > 0) {
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + fade);
        s.stop(now + fade + 0.05);
      } else {
        s.disconnect();
        s.stop();
      }
    } catch (_) {}
  }

  // -------------------------------------------------------------- video hooks
  function attach(v) {
    if (videoAbort) videoAbort.abort();
    if (src) stopMusic(0.3);
    video = v;
    stopped = false;
    manual = false;
    videoAbort = new AbortController();
    const opts = { signal: videoAbort.signal };
    // Any jump in time: drop the current playback; tick() restarts it in sync.
    v.addEventListener("seeked", () => { if (src && !manual) stopMusic(0.15); }, opts);
    v.addEventListener("emptied", () => { stopMusic(0.2); stopped = false; manual = false; }, opts);
    v.addEventListener("ended", () => { if (!manual) stopMusic(0.5); }, opts);
  }

  async function tick() {
    if (!chrome.runtime || !chrome.runtime.id) { dead = true; return; } // extension reloaded
    await settingsReady;

    const v = chooseVideo();
    if (!v) { if (src) stopMusic(0.3); return; }
    if (v !== video) attach(v);

    const paused = v.paused || v.ended;

    // 1) Follow pause / mute while music is active.
    if (src && ctx) {
      if (paused && ctx.state === "running") ctx.suspend().catch(() => {});
      if (!paused && ctx.state === "suspended") ctx.resume().catch(() => {});
      // Keep the page's own audio silent for as long as our track is playing.
      if (videoMute && videoMute.v === v && !v.muted) v.muted = true;
    }

    // something forgot
    if (manual) return;

    const trigger = settings.triggerSeconds;
    const p = v.currentTime - trigger;
    const active = settings.auto && eligible(v);
    if (!active) { if (src) stopMusic(0.5); return; }

    if (!IS_TOP && !localMatch) await refreshTabMatch();
    if (!isMatched()) { if (src) stopMusic(0.5); return; }

    if (p < -2) stopped = false; // seeked back before the outro: re-arm

    // preloading stuff cos no one wants to listen horse hump even for a teenth (breaking bad reference) of a second
    if (p > -45 && !buf) { loadBuffer().catch(() => {}); }

    const dur = playDuration();
    if (src) {
      if (p < 0 || p >= dur) stopMusic(0.4); // outro
      return;
    }

    if (stopped || !buf || paused || p < 0 || p >= dur - 1) return;

    //not sure here maybe triggering audio functions such as mute or something
    ensureCtx();
    if (ctx.state !== "running") { ctx.resume().catch(() => {}); return; } // blocked until a user gesture
    if (startMusic(p) && p < 3) showToast();
  }

  // Autoplay THE CHAIN NO YUKI HORSE HUMPING MUSIC
  for (const ev of ["pointerdown", "keydown", "touchend", "click"]) {
    window.addEventListener(ev, () => {
      if (ctx && ctx.state === "suspended" && video && !video.paused) ctx.resume().catch(() => {});
    }, { capture: true, passive: true });
  }

  // ----------------------------------------------------------------- messages
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const v = video || chooseVideo();
    if (!v) return false;

    if (msg.type === "STOP") {
      userStop();
      sendResponse({ message: "Music stopped for this episode." });
      return false;
    }

    if (msg.type === "STATUS") {
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      let state = "waiting";
      if (src) state = "playing";
      else if (stopped) state = "stopped";
      else if (!settings.auto) state = "auto-off";
      else if (!eligible(v)) state = dur >= MAX_EPISODE_SECONDS ? "too-long" : "too-short";
      else if (!isMatched()) state = "no-match";
      sendResponse({ state, detected: isMatched(), duration: dur });
      return false;
    }

    if (msg.type === "PLAY_NOW") {
      (async () => {
        await settingsReady;
        if (v !== video) attach(v);
        try {
          ensureCtx();
          await loadBuffer();
          manual = true;
          stopped = false;
          try { await ctx.resume(); } catch (_) {}
          if (startMusic(0)) showToast();
          const blocked = ctx.state !== "running" && !v.paused;
          sendResponse({
            message: blocked
              ? "Blocked by the browser: click once inside the video page, then try again."
              : "Playing The Chain."
          });
        } catch (e) {
          sendResponse({ message: "Could not load the audio: " + (e && e.message ? e.message : e) });
        }
      })();
      return true;
    }
    return false;
  });

  // ---------------------------------------------------------------------- go
  detect();
  refreshTabMatch();
  setInterval(() => { detect(); refreshTabMatch(); }, 2000);
  // kinda pre load but not really close to the trigger
  function nextDelay() {
    if (video && Number.isFinite(video.currentTime)) {
      const p = video.currentTime - settings.triggerSeconds;
      if (p > -1 && p < 0.5) return 40;
    }
    return 250;
  }
  function loop() {
    tick().catch(() => {}).finally(() => { if (!dead) setTimeout(loop, nextDelay()); });
  }
  loop();
})();
