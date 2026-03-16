(() => {
  const STYLE_ID = "stcp-style";
  const BUTTON_WRAP = "stcp-button-wrap";
  const HEADER_BUTTON = "stcp-copy-thread-header";
  const MARK_ATTR = "data-stcp-enhanced";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Read settings fresh from storage every time — avoids stale cache issues
  function getSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.sync.get({ copyFormat: "plain", copyPrefix: "" }, (res) => {
          resolve({ copyFormat: res.copyFormat, copyPrefix: res.copyPrefix || "" });
        });
      } else {
        resolve({ copyFormat: "plain", copyPrefix: "" });
      }
    });
  }

  const SVG_COPY = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="5.5" y="1.5" width="9" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="1.5" y="4.5" width="9" height="11" rx="1.5" fill="currentColor"/></svg>`;

  const SVG_THREAD = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 4h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_WRAP} {
        position: absolute;
        top: 24px;
        right: 10px;
        display: flex;
        gap: 6px;
        opacity: 0;
        transform: translateY(-2px);
        transition: opacity 0.16s ease, transform 0.16s ease;
        pointer-events: none;
        z-index: 20;
      }

      [data-qa="message_container"]:hover .${BUTTON_WRAP},
      [data-qa="message_container"]:focus-within .${BUTTON_WRAP},
      [data-qa="virtual-list-item"]:hover .${BUTTON_WRAP},
      [data-qa="virtual-list-item"]:focus-within .${BUTTON_WRAP} {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      .stcp-btn {
        appearance: none;
        border: 1px solid rgba(97, 31, 105, 0.18);
        background: rgba(255, 255, 255, 0.96);
        color: #611f69;
        border-radius: 999px;
        font-size: 11px;
        line-height: 1;
        padding: 5px 9px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
        backdrop-filter: blur(6px);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }

      .stcp-btn:hover {
        background: #611f69;
        color: #fff;
        border-color: #611f69;
      }

      .stcp-btn:active {
        transform: translateY(1px);
      }

      .stcp-btn.stcp-success {
        background: #2eb67d;
        border-color: #2eb67d;
        color: #fff;
      }

      .stcp-btn:disabled {
        opacity: 0.6;
        cursor: default;
        pointer-events: none;
      }

      .stcp-header-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 8px;
        margin-bottom: 4px;
      }

      .stcp-header-btn {
        appearance: none;
        border: 1px solid rgba(97, 31, 105, 0.14);
        background: #ffffff;
        color: #611f69;
        border-radius: 999px;
        font-size: 12px;
        line-height: 1;
        padding: 7px 11px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
      }

      .stcp-header-btn:hover {
        background: #611f69;
        border-color: #611f69;
        color: #fff;
      }

      .stcp-header-btn:disabled {
        opacity: 0.7;
        cursor: default;
      }

      .stcp-toast {
        position: fixed;
        right: 20px;
        bottom: 20px;
        background: #1f2937;
        color: #fff;
        padding: 12px 14px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 10px 30px rgba(0,0,0,0.18);
        z-index: 2147483647;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity .18s ease, transform .18s ease;
      }

      .stcp-toast.stcp-show {
        opacity: 1;
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  function getMessageContainers(scope = document) {
    return Array.from(scope.querySelectorAll('[data-qa="message_container"]'));
  }

  function normalizeText(text) {
    return (text || "").replace(/\u00a0/g, " ").trim();
  }

  function getSender(container) {
    return normalizeText(
      container.querySelector('[data-qa="message_sender"]')?.innerText ||
      container.querySelector('[data-qa="message_sender_name"]')?.innerText ||
      ""
    ) || "Unknown";
  }

  function getTime(container) {
    const timeEl = container.querySelector("time");
    if (!timeEl) return "";
    // Prefer human-readable innerText (e.g. "10:30 AM") over raw datetime attribute
    const visual = normalizeText(timeEl.innerText || "");
    if (visual) return visual;
    // Fallback: parse datetime attribute (may be unix ms or ISO string)
    const dt = timeEl.getAttribute("datetime") || "";
    const ms = parseInt(dt, 10);
    if (!isNaN(ms) && ms > 1e11) {
      return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return dt;
  }

  function getMessageText(container) {
    const blocks = Array.from(container.querySelectorAll('[data-qa="message-text"]'))
      .map((el) => normalizeText(el.innerText))
      .filter(Boolean);

    const codeBlocks = Array.from(container.querySelectorAll("pre"))
      .map((el) => normalizeText(el.innerText))
      .filter(Boolean);

    const merged = [...blocks];
    for (const code of codeBlocks) {
      if (!merged.includes(code)) merged.push("```\n" + code + "\n```");
    }
    return merged.join("\n\n").trim();
  }

  function messageToMarkdown(container) {
    const sender = getSender(container);
    const text = getMessageText(container);
    return `**${sender}**\n${text || "_No text found_"}`;
  }

  function messageToPlainText(container) {
    const sender = getSender(container);
    const text = getMessageText(container).replace(/```\n?/g, "").trim();
    return `[${sender}]\n${text || "(no text)"}`;
  }

  function formatMessage(container, copyFormat) {
    return copyFormat === "plain" ? messageToPlainText(container) : messageToMarkdown(container);
  }

  async function writeClipboard(text) {
    await navigator.clipboard.writeText(text);
  }

  function showToast(message) {
    let toast = document.querySelector(".stcp-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "stcp-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("stcp-show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("stcp-show"), 1400);
  }

  function setBtnText(btn, text) {
    const span = btn.querySelector(".stcp-btn-text");
    if (span) span.textContent = text;
    else btn.textContent = text;
  }

  function getBtnText(btn) {
    const span = btn.querySelector(".stcp-btn-text");
    return span ? span.textContent : btn.textContent;
  }

  async function flashButton(button, label = "\u2713") {
    const prev = getBtnText(button);
    setBtnText(button, label);
    button.classList.add("stcp-success");
    await sleep(900);
    setBtnText(button, prev);
    button.classList.remove("stcp-success");
  }

  function getThreadPane() {
    return document.querySelector('[data-qa="thread-pane"]') ||
           document.querySelector('[data-qa="threads_flexpane"]') ||
           document.querySelector('[aria-label*="Thread"]');
  }

  // Find the scrollable container inside the thread pane (handles virtual scroll)
  function findScrollContainer(root) {
    const walk = (el, depth) => {
      if (depth > 12) return null;
      const oy = window.getComputedStyle(el).overflowY;
      if ((oy === "scroll" || oy === "auto") && el.scrollHeight > el.clientHeight + 10) {
        return el;
      }
      for (const child of el.children) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
      return null;
    };
    return walk(root, 0) || root;
  }

  function getMessageKey(container) {
    const sender = getSender(container);
    const time = getTime(container);
    const text = getMessageText(container);
    if (time) return `${sender}::${time}`;
    return `${sender}::${(text || "").slice(0, 100)}`;
  }

  // Scroll through the entire thread pane to capture all messages (virtual scroll)
  async function collectAllThreadMessages(copyFormat, onProgress) {
    const pane = getThreadPane();
    if (!pane) return [];

    const scroller = findScrollContainer(pane);
    const seen = new Set();
    const items = [];

    const collect = () => {
      getMessageContainers(pane)
        .filter((c) => getMessageText(c))
        .forEach((c) => {
          const key = getMessageKey(c);
          if (!seen.has(key)) {
            seen.add(key);
            items.push(formatMessage(c, copyFormat));
          }
        });
    };

    const savedTop = scroller.scrollTop;

    // Start from the very top
    scroller.scrollTop = 0;
    await sleep(500);
    collect();

    let prev = -1;
    let stuck = 0;

    for (;;) {
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 10;

      if (atBottom) {
        collect();
        break;
      }

      scroller.scrollTop += Math.max(scroller.clientHeight * 0.8, 200);
      await sleep(400);
      collect();

      if (onProgress) onProgress(items.length);

      if (scroller.scrollTop === prev) {
        if (++stuck >= 3) break;
      } else {
        stuck = 0;
      }
      prev = scroller.scrollTop;
    }

    // Restore the original scroll position
    scroller.scrollTop = savedTop;
    return items;
  }

  async function handleCopyMessage(container, button) {
    const { copyFormat, copyPrefix } = await getSettings();
    const body = formatMessage(container, copyFormat);
    const text = copyPrefix ? copyPrefix + "\n\n" + body : body;
    await writeClipboard(text);
    showToast("Copied message");
    if (button) flashButton(button);
  }

  async function handleCopyThread(button) {
    const pane = getThreadPane();
    if (!pane) {
      showToast("Open a thread first");
      return;
    }

    const originalText = button ? getBtnText(button) : "";

    try {
      if (button) {
        setBtnText(button, "Collecting\u2026");
        button.disabled = true;
      }

      const { copyFormat, copyPrefix } = await getSettings();

      const messages = await collectAllThreadMessages(copyFormat, (n) => {
        if (button) setBtnText(button, `${n} msgs\u2026`);
      });

      if (!messages.length) {
        showToast("No thread content found");
        return;
      }

      const separator = copyFormat === "plain" ? "\n\n" : "\n\n---\n\n";
      const body = messages.join(separator);
      const text = copyPrefix ? copyPrefix + "\n\n" + body : body;
      await writeClipboard(text);
      showToast(`Copied thread (${messages.length} msgs)`);

      if (button) {
        setBtnText(button, "\u2713 Copied!");
        button.classList.add("stcp-success");
        await sleep(900);
        button.classList.remove("stcp-success");
      }
    } finally {
      if (button) {
        setBtnText(button, originalText);
        button.disabled = false;
      }
    }
  }

  function createPillButton(svgIcon, text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stcp-btn";
    btn.innerHTML = `${svgIcon}<span class="stcp-btn-text">${text}</span>`;
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await onClick(btn);
      } catch (error) {
        console.error("Slack Thread Copier:", error);
        showToast("Copy failed");
      }
    });
    return btn;
  }

  function ensureMessageButtons(container) {
    if (!container || container.getAttribute(MARK_ATTR) === "true") return;

    const text = getMessageText(container);
    if (!text) return;

    container.setAttribute(MARK_ATTR, "true");
    if (window.getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    const wrap = document.createElement("div");
    wrap.className = BUTTON_WRAP;

    const copyMsg = createPillButton(SVG_COPY, "Copy", (btn) => handleCopyMessage(container, btn));
    const copyThread = createPillButton(SVG_THREAD, "Full Thread", (btn) => handleCopyThread(btn));

    wrap.appendChild(copyMsg);
    wrap.appendChild(copyThread);
    container.appendChild(wrap);
  }

  function ensureAllMessageButtons() {
    getMessageContainers().forEach(ensureMessageButtons);
  }

  function ensureHeaderButton() {
    const pane = getThreadPane();
    if (!pane) return;
    if (pane.querySelector(`#${HEADER_BUTTON}`)) return;

    const header =
      pane.querySelector("header") ||
      pane.querySelector('[data-qa="thread_header"]') ||
      pane.firstElementChild;

    if (!header) return;

    const wrap = document.createElement("div");
    wrap.className = "stcp-header-wrap";

    const button = document.createElement("button");
    button.id = HEADER_BUTTON;
    button.type = "button";
    button.className = "stcp-header-btn";
    button.innerHTML = `${SVG_THREAD}<span class="stcp-btn-text">Copy Full Thread</span>`;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await handleCopyThread(button);
      } catch (error) {
        console.error("Slack Thread Copier:", error);
        showToast("Copy failed");
      }
    });

    wrap.appendChild(button);
    header.appendChild(wrap);
  }

  function boot() {
    ensureStyles();
    ensureAllMessageButtons();
    ensureHeaderButton();

    const observer = new MutationObserver(() => {
      ensureAllMessageButtons();
      ensureHeaderButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  boot();
})();
