// Background service worker
console.log('[YTT-BG] service worker started');

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('[YTT-BG] message received:', msg?.type);
  if (msg.type !== 'FETCH_TEXT') return false;

  const url = msg.url;
  console.log('[YTT-BG] fetch:', url.slice(0, 120));

  fetch(url, {
    credentials: 'omit',   // background worker はページ cookie を持たない
    cache: 'no-store',
  })
    .then(async res => {
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      console.log('[YTT-BG] status:', res.status,
                  'Content-Type:', contentType,
                  'body length:', text.length);
      sendResponse({
        ok:          res.ok,
        status:      res.status,
        contentType: contentType,
        text:        text,
      });
    })
    .catch(err => {
      console.error('[YTT-BG] fetch error:', err.message);
      sendResponse({ ok: false, status: 0, contentType: '', text: '', error: err.message });
    });

  return true; // 非同期 sendResponse のためチャネルを保持
});
