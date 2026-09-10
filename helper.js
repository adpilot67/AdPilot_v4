// gmail-content.js
function tryExtractGmailInfo() {
  const btn = document.querySelector('a[aria-label*="Google Account"]');
  if (!btn) return null;
  const label = btn.getAttribute('aria-label') || '';
  const match = label.match(/Google Account:\s*(.+?)\s*\((.+?)\)/);
  if (!match) return null;
  return { name: match[1].trim(), email: match[2].trim() };
}

function extractThreadId(row) {
  const jslog = row.getAttribute('jslog') || '';
  const m = jslog.match(/1:([A-Za-z0-9+/=]+)/);
  if (!m) return null;
  try {
    const decoded = atob(m[1]);
    const t = decoded.match(/thread-f:(\d+)/);
    return t ? t[1] : null;
  } catch { return null; }
}

function extractSubject(row) {
  const el = row.querySelector('.bog');
  return el?.textContent?.trim() || '';
}

function extractInboxMessages(max = 20) {
  const rows = document.querySelectorAll('tr.zA');
  const messages = [];
  for (let i = 0; i < rows.length && messages.length < max; i++) {
    const row = rows[i];
    const senderEl  = row.querySelector('.yW span[email]');
    const subjectEl = row.querySelector('.bog');
    const snippetEl = row.querySelector('.y2');

    const senderName  = senderEl?.getAttribute('name') || senderEl?.textContent?.trim() || '';
    const senderEmail = senderEl?.getAttribute('email') || '';
    const subject     = subjectEl?.textContent?.trim() || '(no subject)';
    const snippet     = snippetEl?.textContent?.trim() || '';
    const threadId    = extractThreadId(row);

    if (!senderName && !subject) continue;
    messages.push({ senderName, senderEmail, subject, snippet, threadId });
  }
  return messages;
}

async function waitFor(predicate, timeoutMs = 30000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = predicate();
    if (v) return v;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

function simulateRealClick(el) {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = {
    bubbles: true, cancelable: true, view: window,
    clientX: x, clientY: y, screenX: x, screenY: y, button: 0
  };
  el.dispatchEvent(new MouseEvent('mouseover', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
}

function simulateRightClick(el) {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = {
    bubbles: true, cancelable: true, view: window,
    clientX: x, clientY: y, screenX: x, screenY: y, button: 2, buttons: 2
  };
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('contextmenu', opts));
}

function findButtonByLabels(labels) {
  const all = document.querySelectorAll('[role="button"], button, [data-tooltip], [aria-label]');
  for (const el of all) {
    const t = (el.getAttribute('data-tooltip') || '').toLowerCase().trim();
    const a = (el.getAttribute('aria-label') || '').toLowerCase().trim();
    for (const label of labels) {
      const L = label.toLowerCase();
      if (t === L || a === L) return el;
    }
  }
  for (const el of all) {
    const t = (el.getAttribute('data-tooltip') || '').toLowerCase();
    const a = (el.getAttribute('aria-label') || '').toLowerCase();
    for (const label of labels) {
      const L = label.toLowerCase();
      if (t.includes(L) || a.includes(L)) return el;
    }
  }
  return null;
}

function findContextMenuItem(labels) {
  const menus = document.querySelectorAll('[role="menu"], .J-M');
  for (const menu of menus) {
    if (menu.offsetParent === null) continue;
    const items = menu.querySelectorAll('[role="menuitem"], .J-N');
    for (const item of items) {
      const txt = (item.textContent || '').trim().toLowerCase();
      for (const label of labels) {
        if (txt === label.toLowerCase() || txt.includes(label.toLowerCase())) return item;
      }
    }
  }
  return null;
}

function findConfirmButton() {
  const sels = [
    'div[role="dialog"] button',
    'div[role="alertdialog"] button',
    '[role="button"][data-mdc-dialog-action="ok"]',
    '.Kj-JD-Jl button',
    '.bAq button'
  ];
  for (const s of sels) {
    const btns = document.querySelectorAll(s);
    for (const b of btns) {
      const txt = (b.textContent || '').trim().toLowerCase();
      if (txt === 'ok' || txt === 'delete forever' || txt === 'yes' || txt === 'confirm') return b;
    }
  }
  return null;
}

async function findRow(threadId, subject, timeoutMs = 20000) {
  return await waitFor(() => {
    const rows = document.querySelectorAll('tr.zA');
    for (const r of rows) {
      if (threadId && extractThreadId(r) === String(threadId)) return r;
    }
    if (subject) {
      for (const r of rows) {
        if (extractSubject(r) === subject) return r;
      }
    }
    return null;
  }, timeoutMs, 500);
}

async function moveToTrash(threadId, subject) {
  if (!location.href.includes("#inbox")) {
    location.hash = "#inbox";
    await new Promise(r => setTimeout(r, 2500));
  }

  const row = await findRow(threadId, subject, 10000);
  if (!row) return { ok: false, step: "trash", error: "Row not found in inbox" };

  const checkbox = row.querySelector('[role="checkbox"]');
  if (checkbox && checkbox.getAttribute('aria-checked') !== 'true') {
    simulateRealClick(checkbox);
    await new Promise(r => setTimeout(r, 900));
  }

  const trashBtn = findButtonByLabels(["delete", "move to trash"]);
  if (!trashBtn) return { ok: false, step: "trash", error: "Trash button not found" };

  simulateRealClick(trashBtn);
  await new Promise(r => setTimeout(r, 2500));

  const stillThere = Array.from(document.querySelectorAll('tr.zA'))
    .some(r => extractThreadId(r) === String(threadId) || extractSubject(r) === subject);
  if (!stillThere) return { ok: true, step: "trash" };

  simulateRealClick(trashBtn);
  await new Promise(r => setTimeout(r, 2500));

  const stillThere2 = Array.from(document.querySelectorAll('tr.zA'))
    .some(r => extractThreadId(r) === String(threadId) || extractSubject(r) === subject);
  return stillThere2
    ? { ok: false, step: "trash", error: "Trash clicked but row still present" }
    : { ok: true, step: "trash" };
}

async function deleteFromTrash(threadId, subject) {
  console.log("[gmail] navigating to trash");
  location.href = "https://mail.google.com/mail/u/0/#trash";
  await new Promise(r => setTimeout(r, 5000));

  const anyRow = await waitFor(() => {
    const rows = document.querySelectorAll('tr.zA');
    return rows.length > 0 ? rows : null;
  }, 25000, 500);

  if (!anyRow) return { ok: false, step: "permanent", error: "Trash view never rendered rows" };

  console.log("[gmail] trash rows visible:", document.querySelectorAll('tr.zA').length);
  const row = await findRow(threadId, subject, 20000);
  if (!row) return { ok: false, step: "permanent", error: "Row not found in trash" };

  console.log("[gmail] right-clicking row");
  simulateRightClick(row);

  const menuItem = await waitFor(() => {
    return findContextMenuItem(["delete forever", "delete permanently"]);
  }, 5000, 200);

  if (!menuItem) {
    document.querySelectorAll('[role="menu"]').forEach(m => {
      m.querySelectorAll('[role="menuitem"]').forEach(i => {
        console.log("  menu item:", (i.textContent || "").trim());
      });
    });
    return { ok: false, step: "permanent", error: "Delete forever not in context menu" };
  }

  console.log("[gmail] clicking context item:", menuItem.textContent.trim());
  simulateRealClick(menuItem);

  await new Promise(r => setTimeout(r, 1000));
  const confirmBtn = findConfirmButton();
  if (confirmBtn) {
    simulateRealClick(confirmBtn);
    await new Promise(r => setTimeout(r, 2000));
  }

  await new Promise(r => setTimeout(r, 1500));

  const stillThere = Array.from(document.querySelectorAll('tr.zA'))
    .some(r => extractThreadId(r) === String(threadId) || extractSubject(r) === subject);
  if (!stillThere) return { ok: true, step: "permanent" };

  return { ok: false, step: "permanent", error: "Row still in trash after delete forever" };
}

async function deleteGmailMessage(threadId, subject) {
  console.log("[gmail] delete request for thread:", threadId, "subject:", subject);

  const trashResult = await moveToTrash(threadId, subject);
  console.log("[gmail] trash result:", trashResult);
  if (!trashResult.ok) return trashResult;

  const permResult = await deleteFromTrash(threadId, subject);
  console.log("[gmail] permanent result:", permResult);
  if (permResult.ok) return { ok: true, method: "trash + permanent" };

  return { ok: false, step: "permanent", error: permResult.error };
}

// ---------- LISTENERS ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "deleteGmailMessage") {
    deleteGmailMessage(msg.threadId, msg.subject)
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.action === "rescrapeInbox") {
    (async () => {
      const info = tryExtractGmailInfo();
      if (!info) { sendResponse({ ok: false }); return; }
      const rowsFound = await waitFor(() => {
        const rows = document.querySelectorAll('tr.zA');
        return rows.length > 0 ? rows : null;
      }, 15000);
      const messages = rowsFound ? extractInboxMessages(20) : [];
      chrome.runtime.sendMessage({
        action: "gmailAccountInfo",
        name: info.name, email: info.email, messages
      });
      sendResponse({ ok: true, count: messages.length });
    })();
    return true;
  }

  if (msg.action === "clearInbox") {
    (async () => {
      location.hash = "#inbox";
      await new Promise(r => setTimeout(r, 3000));

      const selectAll = document.querySelector('[data-tooltip="Select all"]') ||
                        document.querySelector('[aria-label="Select all"]');
      if (!selectAll) { sendResponse({ ok: false, error: "Select all not found" }); return; }
      simulateRealClick(selectAll);
      await new Promise(r => setTimeout(r, 1500));

      const trashBtn = findButtonByLabels(["delete", "move to trash"]);
      if (trashBtn) {
        simulateRealClick(trashBtn);
        await new Promise(r => setTimeout(r, 2500));
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "Trash button not found" });
      }
    })();
    return true;
  }

  if (msg.action === "restoreTrash") {
    (async () => {
      location.href = "https://mail.google.com/mail/u/0/#trash";
      await new Promise(r => setTimeout(r, 5000));

      const selectAll = document.querySelector('[data-tooltip="Select all"]') ||
                        document.querySelector('[aria-label="Select all"]');
      if (!selectAll) { sendResponse({ ok: false, error: "Select all not found" }); return; }
      simulateRealClick(selectAll);
      await new Promise(r => setTimeout(r, 1500));

      const restoreBtn = findButtonByLabels(["move to inbox", "restore"]);
      if (restoreBtn) {
        simulateRealClick(restoreBtn);
        await new Promise(r => setTimeout(r, 2000));
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "Restore button not found" });
      }
    })();
    return true;
  }
});

// ---------- INITIAL SCRAPE ----------
(async () => {
  console.log("[gmail] content script loaded");

  const info = await waitFor(() => tryExtractGmailInfo(), 30000);
  if (!info) {
    chrome.runtime.sendMessage({
      action: "gmailAccountInfo", name: null, email: null, messages: []
    });
    return;
  }

  const rowsFound = await waitFor(() => {
    const rows = document.querySelectorAll('tr.zA');
    return rows.length > 0 ? rows : null;
  }, 30000);

  const messages = rowsFound ? extractInboxMessages(20) : [];
  console.log("[gmail] scraped:", messages.length, "messages");

  chrome.runtime.sendMessage({
    action: "gmailAccountInfo",
    name: info.name,
    email: info.email,
    messages
  });
})();
