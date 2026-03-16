const PREVIEWS = {
  markdown: `**John Doe**\nHello team, please review this PR.\n\n---\n\n**Jane Smith**\nLGTM! Approved.`,
  plain:    `[John Doe]\nHello team, please review this PR.\n\n[Jane Smith]\nLGTM! Approved.`,
};

const preview     = document.getElementById("preview");
const btnMd       = document.getElementById("btn-md");
const btnPlain    = document.getElementById("btn-plain");
const prefixInput = document.getElementById("prefix-input");

let state = { copyFormat: "plain", copyPrefix: "" };

function renderPreview() {
  const body = PREVIEWS[state.copyFormat] || PREVIEWS.plain;
  preview.textContent = state.copyPrefix ? state.copyPrefix + "\n\n" + body : body;
}

function applyState() {
  btnMd.classList.toggle("active", state.copyFormat === "markdown");
  btnPlain.classList.toggle("active", state.copyFormat === "plain");
  prefixInput.value = state.copyPrefix || "";
  renderPreview();
}

chrome.storage.sync.get({ copyFormat: "plain", copyPrefix: "" }, (res) => {
  state = res;
  applyState();
});

document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.copyFormat = btn.dataset.value;
    chrome.storage.sync.set({ copyFormat: state.copyFormat });
    applyState();
  });
});

prefixInput.addEventListener("input", () => {
  state.copyPrefix = prefixInput.value;
  chrome.storage.sync.set({ copyPrefix: state.copyPrefix });
  renderPreview();
});
