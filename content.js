// YouTubeページから字幕データを取得するコンテンツスクリプト

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTranscript") {
    getTranscript()
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "getTranscriptByUrl") {
    fetch(request.url)
      .then((res) => res.text())
      .then((xml) => {
        const segments = parseTranscriptXml(xml);
        sendResponse({ success: true, segments });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function getTranscript() {
  // ytInitialPlayerResponse から字幕トラックのURLを取得
  const playerResponse = window.ytInitialPlayerResponse;

  if (!playerResponse) {
    throw new Error("YouTubeの動画ページを開いてください");
  }

  const captionTracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error("この動画には字幕がありません");
  }

  // 日本語字幕を優先、なければ英語、それ以外は最初のトラックを使用
  const preferredTrack =
    captionTracks.find((t) => t.languageCode === "ja") ||
    captionTracks.find((t) => t.languageCode === "en") ||
    captionTracks[0];

  const videoTitle = playerResponse?.videoDetails?.title || "不明なタイトル";

  const response = await fetch(preferredTrack.baseUrl);
  if (!response.ok) {
    throw new Error("字幕の取得に失敗しました");
  }

  const xmlText = await response.text();
  const segments = parseTranscriptXml(xmlText);

  const languages = captionTracks.map((t) => ({
    code: t.languageCode,
    name: t.name?.simpleText || t.languageCode,
    baseUrl: t.baseUrl,
  }));

  return {
    title: videoTitle,
    language: preferredTrack.languageCode,
    languageName: preferredTrack.name?.simpleText || preferredTrack.languageCode,
    languages,
    segments,
  };
}

function parseTranscriptXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const textNodes = doc.querySelectorAll("text");

  return Array.from(textNodes).map((node) => {
    const start = parseFloat(node.getAttribute("start") || "0");
    const dur = parseFloat(node.getAttribute("dur") || "0");
    const text = decodeHtmlEntities(node.textContent || "");
    return { start, end: start + dur, text: text.trim() };
  });
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n/g, " ");
}
