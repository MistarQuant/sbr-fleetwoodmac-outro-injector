chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(["volume", "auto", "triggerSeconds"]);
  const init = {};
  if (s.volume === undefined) init.volume = 0.6;
  if (s.auto === undefined) init.auto = true;
  if (s.triggerSeconds === undefined || s.triggerSeconds === 21 * 60 + 37) {
    init.triggerSeconds = 21 * 60 + 37.45; // 21:37.45 (making sure not even a decible of yuki is heard in episode 2)
  }
  if (Object.keys(init).length) await chrome.storage.local.set(init);
});

// background runner
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;
  const key = "m" + tabId;

  if (msg.type === "SET_MATCH" && sender.frameId === 0) {
    chrome.storage.session.set({ [key]: !!msg.matched });
    return;
  }
  if (msg.type === "GET_MATCH") {
    chrome.storage.session
      .get(key)
      .then(r => sendResponse({ matched: !!r[key] }))
      .catch(() => sendResponse({ matched: false }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(id => {
  chrome.storage.session.remove("m" + id);
});
