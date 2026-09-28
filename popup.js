const $ = id => document.getElementById(id);
const statusEl = $("status");

const STATE_TEXT = {
  playing: "Playing The Chain.",
  waiting: "Steel Ball Run detected. Waiting for the outro.",
  stopped: "Stopped for this episode. Seek back before the outro to re-arm.",
  "auto-off": "Automatic playback is off.",
  "too-long": "This video is 30 minutes or longer, so it is ignored.",
  "too-short": "This video ends before the outro time, so it is ignored.",
  "no-match": "Video found, but the page doesn't look like Steel Ball Run / JoJo."
};

function activeTab() {
  return new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, t => resolve(t[0])));
}

async function send(msg) {
  const tab = await activeTab();
  if (!tab) return null;
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, msg, res => {
      if (chrome.runtime.lastError) resolve(null); // something to do with frames ig
      else resolve(res);
    });
  });
}

async function refreshStatus() {
  const r = await send({ type: "STATUS" });
  statusEl.textContent = r
    ? (STATE_TEXT[r.state] || "")
    : "No video found on this page. Reload the page after installing the extension.";
}

(async () => {
  const s = await chrome.storage.local.get({ volume: 0.6, auto: true });
  $("volume").value = Math.round(s.volume * 100);
  $("volLabel").textContent = Math.round(s.volume * 100) + "%";
  $("auto").checked = s.auto;
  refreshStatus();
})();

$("volume").addEventListener("input", e => {
  const v = Number(e.target.value);
  $("volLabel").textContent = v + "%";
  chrome.storage.local.set({ volume: v / 100 }); // this might cause errors idk
});

$("auto").addEventListener("change", e => {
  chrome.storage.local.set({ auto: e.target.checked }, refreshStatus);
});

$("stop").addEventListener("click", async () => {
  const r = await send({ type: "STOP" });
  statusEl.textContent = r ? r.message : "No video found on this page.";
});

$("play").addEventListener("click", async () => {
  const r = await send({ type: "PLAY_NOW" });
  statusEl.textContent = r ? r.message : "No video found on this page.";
});

$("options").addEventListener("click", e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
