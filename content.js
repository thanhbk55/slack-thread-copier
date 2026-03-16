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
        top: 26px;
        right: 10px;
        display: flex;
        gap: 6px;
        opacity: 0;
        transition: opacity 0.15s ease;
        pointer-events: none;
        z-index: 20;
      }

      [data-qa="message_container"]:hover .${BUTTON_WRAP},
      [data-qa="message_container"]:focus-within .${BUTTON_WRAP},
      [data-qa="virtual-list-item"]:hover .${BUTTON_WRAP},
      [data-qa="virtual-list-item"]:focus-within .${BUTTON_WRAP} {
        opacity: 1;
        pointer-events: auto;
      }

      .stcp-btn {
        appearance: none;
        border: 1.5px solid rgba(97, 31, 105, 0.5);
        background: rgba(255, 255, 255, 0.95);
        color: #611f69;
        border-radius: 999px;
        font-size: 11px;
        line-height: 1;
        padding: 5px 10px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        backdrop-filter: blur(4px);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
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
        border: none;
        background: linear-gradient(135deg, #611f69 0%, #8b2fc9 100%);
        color: #fff;
        border-radius: 999px;
        font-size: 13px;
        line-height: 1;
        padding: 9px 18px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(97, 31, 105, 0.45);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        position: relative;
        overflow: hidden;
        transition: box-shadow 0.15s ease, transform 0.1s ease;
      }

      .stcp-header-btn::after {
        content: "";
        position: absolute;
        top: 0;
        left: -100%;
        width: 60%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
        animation: stcp-shimmer 2.4s ease-in-out infinite;
      }

      @keyframes stcp-shimmer {
        0%   { left: -60%; }
        50%  { left: 110%; }
        100% { left: 110%; }
      }

      .stcp-header-btn:hover {
        box-shadow: 0 6px 24px rgba(97, 31, 105, 0.65);
        transform: translateY(-1px);
      }

      .stcp-header-btn:active {
        transform: translateY(0);
      }

      .stcp-header-btn.stcp-success {
        background: linear-gradient(135deg, #2eb67d 0%, #1a9462 100%);
        box-shadow: 0 4px 16px rgba(46, 182, 125, 0.45);
      }

      .stcp-header-btn.stcp-success::after {
        animation: none;
      }

      .stcp-header-btn:disabled {
        opacity: 0.7;
        cursor: default;
        transform: none;
      }

      .stcp-header-btn:disabled::after {
        animation: none;
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
    const text = merged.join("\n\n").trim();

    // Emoji-only messages: Slack renders custom/unicode emoji as <img>, so
    // innerText is empty.  Fall back to extracting emoji alt text.
    if (!text) {
      const emojis = Array.from(
        container.querySelectorAll('[data-qa="message-text"] img[data-stringify-emoji]')
      )
        .map((img) => img.getAttribute("alt") || img.getAttribute("data-stringify-emoji") || "")
        .filter(Boolean);
      if (emojis.length) return emojis.join(" ");
    }
    return text;
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
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // Fallback for when the document loses focus (e.g. during long scroll)
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  function showToast(message, duration = 1400) {
    let toast = document.querySelector(".stcp-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "stcp-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("stcp-show");
    clearTimeout(showToast._timer);
    if (duration > 0) {
      showToast._timer = setTimeout(() => toast.classList.remove("stcp-show"), duration);
    }
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

  // Find the scrollable container — prefer Slack-specific selectors, fallback to DOM walk
  function findScrollContainer(root) {
    // Slack thread message list has a specific scrollable wrapper
    const candidates = [
      '[data-qa="slack_kit_scrollbar"]',
      '[data-qa="virtual-list-scroll-container"]',
      ".c-scrollbar__hider",
      ".p-threads_flexpane__body",
    ];
    for (const sel of candidates) {
      const el = root.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 10) return el;
    }
    // Generic walk: find the deepest scrollable with the tallest scrollHeight
    let best = null;
    const walk = (el, depth) => {
      if (depth > 15) return;
      try {
        const oy = window.getComputedStyle(el).overflowY;
        if ((oy === "scroll" || oy === "auto") && el.scrollHeight > el.clientHeight + 10) {
          if (!best || el.scrollHeight > best.scrollHeight) best = el;
        }
      } catch (_) {}
      for (const child of el.children) walk(child, depth + 1);
    };
    walk(root, 0);
    return best || root;
  }

  function getMessageKey(container) {
    // Use Slack's unique message timestamp — guaranteed unique per message.
    // From DOM: <div data-qa="message_container" data-msg-ts="1770260212.754949">
    return container.getAttribute("data-msg-ts") || null;
  }

  // Parse expected message count from the virtual list's aria-label.
  // e.g. aria-label="formrun_engineer のスレッド (チャンネル, 69 件の返信)"
  function getExpectedMessageCount(pane) {
    const list = pane.querySelector('[data-qa="slack_kit_list"]');
    if (!list) return null;
    const label = list.getAttribute("aria-label") || "";
    // Japanese: "69 件の返信"
    const matchJa = label.match(/(\d+)\s*件の返信/);
    if (matchJa) return parseInt(matchJa[1], 10) + 1; // +1 for original message
    // English: "69 replies"
    const matchEn = label.match(/(\d+)\s*repl(?:y|ies)/i);
    if (matchEn) return parseInt(matchEn[1], 10) + 1;
    return null;
  }

  // Scroll through the entire thread pane to capture all messages (virtual scroll).
  // Captures raw data (not DOM refs) since virtual scroll recycles nodes.
  // After collection: sorts by timestamp and resolves adjacent senders.
  async function collectAllThreadMessages(copyFormat, onProgress) {
    const pane = getThreadPane();
    if (!pane) return [];

    const scroller = findScrollContainer(pane);
    const seen = new Map(); // data-msg-ts → { ts, sender, text }

    // Use Slack's aria-label to know expected total message count
    const expectedCount = getExpectedMessageCount(pane);

    const collect = () => {
      let added = 0;
      getMessageContainers(pane).forEach((c) => {
        const ts = c.getAttribute("data-msg-ts");
        if (!ts || seen.has(ts)) return;
        // Capture data NOW — the DOM node may be recycled by virtual scroll later
        const sender = getSender(c);
        const text = getMessageText(c);
        seen.set(ts, { ts: parseFloat(ts), sender, text });
        added++;
      });
      return added;
    };

    // Poll until scrollHeight stabilises (Slack may resize during virtual render)
    const waitForSettle = async () => {
      let prev = -1;
      for (let i = 0; i < 6; i++) {
        await sleep(50);
        const cur = scroller.scrollHeight;
        if (cur === prev) break;
        prev = cur;
      }
    };

    const savedTop = scroller.scrollTop;

    // ── Phase 1: Scroll to the very top ──────────────────────────────────
    for (let i = 0; i < 15; i++) {
      scroller.scrollTo({ top: 0, behavior: "instant" });
      await sleep(80);
      if (scroller.scrollTop < 5) break;
    }
    await waitForSettle();
    await sleep(150);
    collect();

    // ── Phase 2: Step down ───────────────────────────────────────────────
    let dryStreak = 0;
    const MAX_DRY = expectedCount ? 5 : 3;

    for (;;) {
      // Early exit: we already collected all expected messages
      if (expectedCount && seen.size >= expectedCount) break;

      const prevScrollTop = scroller.scrollTop;
      // 75% viewport per step — balance between speed and render time
      const step = Math.max(scroller.clientHeight * 0.75, 200);

      scroller.scrollTo({ top: prevScrollTop + step, behavior: "instant" });

      await sleep(300);
      await waitForSettle();

      // Two-pass poll to catch late renders
      let added = collect();
      await sleep(80);
      added += collect();

      if (onProgress) onProgress(seen.size);

      const newScrollTop = scroller.scrollTop;
      const scrollAdvanced = Math.abs(newScrollTop - prevScrollTop) > 8;

      if (!scrollAdvanced && added === 0) {
        if (++dryStreak >= MAX_DRY) break;
      } else {
        dryStreak = 0;
      }
    }

    // ── Phase 3: Final pass at absolute bottom ───────────────────────────
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "instant" });
    await sleep(300);
    await waitForSettle();
    collect();

    // ── Phase 4: Restore scroll position ─────────────────────────────────
    scroller.scrollTo({ top: savedTop, behavior: "instant" });

    // ── Phase 5: Sort by timestamp and resolve adjacent senders ──────────
    // Adjacent messages (same sender, consecutive) have no sender element.
    // getSender() returns "Unknown" for those.  Fill from previous message.
    const sorted = Array.from(seen.values()).sort((a, b) => a.ts - b.ts);

    let lastKnownSender = "";
    for (const msg of sorted) {
      if (msg.sender && msg.sender !== "Unknown") {
        lastKnownSender = msg.sender;
      } else if (lastKnownSender) {
        msg.sender = lastKnownSender;
      }
    }

    // Format the messages
    return sorted
      .filter((msg) => msg.text)
      .map((msg) => {
        if (copyFormat === "plain") {
          const cleanText = msg.text.replace(/```\n?/g, "").trim();
          return `[${msg.sender}]\n${cleanText || "(no text)"}`;
        }
        return `**${msg.sender}**\n${msg.text || "_No text found_"}`;
      });
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
        setBtnText(button, "Copying\u2026");
        button.disabled = true;
      }

      const { copyFormat, copyPrefix } = await getSettings();

      const messages = await collectAllThreadMessages(copyFormat);

      if (!messages.length) {
        showToast("No thread content found");
        return;
      }

      const separator = copyFormat === "plain" ? "\n\n" : "\n\n---\n\n";
      const body = messages.join(separator);
      const text = copyPrefix ? copyPrefix + "\n\n" + body : body;
      await writeClipboard(text);
      showToast("✓ Copied!");

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
    if (!container || !container.isConnected) return;

    // If marked but button wrap is gone (Slack recycled the DOM node), re-inject.
    if (
      container.getAttribute(MARK_ATTR) === "true" &&
      !container.querySelector("." + BUTTON_WRAP)
    ) {
      container.removeAttribute(MARK_ATTR);
    }

    if (container.getAttribute(MARK_ATTR) === "true") return;

    const text = getMessageText(container);
    if (!text) return;

    container.setAttribute(MARK_ATTR, "true");
    if (window.getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    const wrap = document.createElement("div");
    wrap.className = BUTTON_WRAP;

    const copyMsg = createPillButton(SVG_COPY, "Copy", (btn) => handleCopyMessage(container, btn));
    wrap.appendChild(copyMsg);

    // Messages in the main channel (not inside a thread pane) also get "Full Thread"
    const inThreadPane = !!container.closest(
      '[data-qa="thread-pane"], [data-qa="threads_flexpane"], [aria-label*="Thread"]'
    );
    if (!inThreadPane) {
      const copyThread = createPillButton(SVG_THREAD, "Full Thread", (btn) => handleCopyThread(btn));
      wrap.appendChild(copyThread);
    }

    container.appendChild(wrap);
  }

  function ensureAllMessageButtons() {
    getMessageContainers().forEach(ensureMessageButtons);
  }

  function isContextValid() {
    try {
      // Accessing chrome.runtime.id throws if the extension context is invalidated
      return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  }

  function ensureHeaderButton() {
    let pane;
    try {
      pane = getThreadPane();
    } catch (_) {
      return;
    }
    if (!pane || !pane.isConnected) return;
    if (pane.querySelector(`#${HEADER_BUTTON}`)) return;

    let header;
    try {
      header =
        pane.querySelector("header") ||
        pane.querySelector('[data-qa="thread_header"]') ||
        pane.firstElementChild;
    } catch (_) {
      return;
    }

    if (!header || !header.isConnected) return;

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
      // Stop everything if the extension was reloaded/updated
      if (!isContextValid()) {
        observer.disconnect();
        return;
      }
      try {
        ensureAllMessageButtons();
        ensureHeaderButton();
      } catch (_) {
        // Ignore transient DOM errors during rapid mutations
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  boot();
})();
