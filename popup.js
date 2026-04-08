// ポップアップのメインロジック

let currentData = null;

// DOM要素
const states = {
  idle: document.getElementById("state-idle"),
  loading: document.getElementById("state-loading"),
  error: document.getElementById("state-error"),
  result: document.getElementById("state-result"),
};

const el = {
  btnFetch: document.getElementById("btn-fetch"),
  btnRetry: document.getElementById("btn-retry"),
  btnReset: document.getElementById("btn-reset"),
  btnCopyText: document.getElementById("btn-copy-text"),
  btnCopyTimestamped: document.getElementById("btn-copy-timestamped"),
  errorMessage: document.getElementById("error-message"),
  videoTitle: document.getElementById("video-title"),
  langSelect: document.getElementById("lang-select"),
  transcriptContainer: document.getElementById("transcript-container"),
};

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  showState("idle");

  el.btnFetch.addEventListener("click", fetchTranscript);
  el.btnRetry.addEventListener("click", fetchTranscript);
  el.btnReset.addEventListener("click", () => showState("idle"));
  el.btnCopyText.addEventListener("click", copyPlainText);
  el.btnCopyTimestamped.addEventListener("click", copyTimestampedText);
  el.langSelect.addEventListener("change", onLanguageChange);
});

function showState(name) {
  Object.entries(states).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
}

async function fetchTranscript() {
  showState("loading");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes("youtube.com/watch")) {
      throw new Error("YouTubeの動画ページを開いてください");
    }

    // コンテンツスクリプトが読み込まれているか確認し、必要なら注入
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "getTranscript",
    });

    if (!response?.success) {
      throw new Error(response?.error || "文字起こしの取得に失敗しました");
    }

    currentData = response.data;
    renderResult(currentData);
    showState("result");
  } catch (err) {
    el.errorMessage.textContent = err.message || "エラーが発生しました";
    showState("error");
  }
}

function renderResult(data) {
  el.videoTitle.textContent = data.title;
  el.videoTitle.title = data.title;

  // 言語セレクトを更新
  el.langSelect.innerHTML = "";
  data.languages.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang.baseUrl;
    option.textContent = lang.name;
    option.selected = lang.code === data.language;
    el.langSelect.appendChild(option);
  });

  renderSegments(data.segments);
}

function renderSegments(segments) {
  el.transcriptContainer.innerHTML = "";

  segments.forEach((seg) => {
    const div = document.createElement("div");
    div.className = "segment";

    const time = document.createElement("span");
    time.className = "timestamp";
    time.textContent = formatTime(seg.start);

    const text = document.createElement("span");
    text.className = "segment-text";
    text.textContent = seg.text;

    div.appendChild(time);
    div.appendChild(text);
    el.transcriptContainer.appendChild(div);
  });
}

async function onLanguageChange() {
  const url = el.langSelect.value;
  if (!url || !currentData) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "getTranscriptByUrl",
      url,
    });

    if (response?.success) {
      currentData.segments = response.segments;
      renderSegments(response.segments);
    }
  } catch {
    // 言語変更失敗は無視
  }
}

function copyPlainText() {
  if (!currentData?.segments) return;
  const text = currentData.segments.map((s) => s.text).join("\n");
  copyToClipboard(text, "テキストをコピーしました");
}

function copyTimestampedText() {
  if (!currentData?.segments) return;
  const text = currentData.segments
    .map((s) => `[${formatTime(s.start)}] ${s.text}`)
    .join("\n");
  copyToClipboard(text, "タイムスタンプ付きでコピーしました");
}

async function copyToClipboard(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showFlash(message);
  } catch {
    // フォールバック
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    showFlash(message);
  }
}

function showFlash(message) {
  let flash = document.querySelector(".copy-flash");
  if (!flash) {
    flash = document.createElement("div");
    flash.className = "copy-flash";
    document.body.appendChild(flash);
  }
  flash.textContent = message;
  flash.classList.add("show");
  setTimeout(() => flash.classList.remove("show"), 2000);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
