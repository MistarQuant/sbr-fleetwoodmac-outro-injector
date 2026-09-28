const $ = id => document.getElementById(id);
const msg = t => { $("msg").textContent = t; };
const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_DURATION = 88.76;

$("cap").textContent = `${Math.floor(DEFAULT_DURATION / 60)}:${String(Math.floor(DEFAULT_DURATION % 60)).padStart(2, "0")}`;

const fmt = s => {
  const m = Math.floor(s / 60);
  const sec = Math.round((s - m * 60) * 100) / 100;
  const str = (sec % 1 ? sec.toFixed(2).replace(/0$/, "") : String(sec)).replace(/^(\d)(\.|$)/, "0$1$2");
  return `${m}:${str}`;
};

async function load() {
  const s = await chrome.storage.local.get({ customName: null, triggerSeconds: 1297.45 });
  $("current").textContent = s.customName || "Default (The Chain)";
  $("time").value = fmt(s.triggerSeconds);
}
load();

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

$("file").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_BYTES) { msg("File is too large (max 25 MB)."); return; }
  try {
    // Make sure the browser can actually decode it before saving.
    const ac = new AudioContext();
    await ac.decodeAudioData(await file.arrayBuffer());
    ac.close();
    const data = await fileToBase64(file);
    await chrome.storage.local.set({ customData: data, customName: file.name, customStamp: Date.now() });
    msg("Custom music saved.");
    load();
  } catch (err) {
    msg("That file couldn't be read as audio. Try an MP3, M4A, WAV or OGG file.");
  }
  e.target.value = "";
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.local.remove(["customData", "customName", "customStamp"]);
  msg("Back to the default track.");
  load();
});

$("saveTime").addEventListener("click", async () => {
  const parts = $("time").value.trim().split(":").map(Number);
  let secs = NaN;
  if (parts.length === 2 && parts.every(Number.isFinite)) secs = parts[0] * 60 + parts[1];
  if (!Number.isFinite(secs) || secs < 0 || secs >= 30 * 60) { msg("Use MM:SS or MM:SS.ss, under 30:00 (e.g. 21:37.45)."); return; }
  await chrome.storage.local.set({ triggerSeconds: secs });
  msg("Saved.");
});
