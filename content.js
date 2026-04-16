/* YouTube Transcript Viewer — content.js
   - manifest matches: https://www.youtube.com/*  (全ページ注入)
   - /watch ページ遷移を検知して UI を動的生成・再利用
   - 字幕取得: YouTubeネイティブ「文字起こし」ボタンの DOM クリックのみ
   - fetch / background.js は一切使わない                         */

console.log('[YTT] content.js loaded', location.href);

// ── スクリプトは1回だけ実行 ──────────────────────────────────────
if (window.__ytt_init) {
  // 2回目以降の注入は無視（HMR等の安全策）
  console.log('[YTT] already initialised, skip');
} else {
  window.__ytt_init = true;
  main();
}

// ===================================================================
function main() {
  console.log('[YTT] main()');

  // ── 状態 ──────────────────────────────────────────────────────────
  let currentVideoId = null;
  let currentData    = null;
  let loaded         = false;
  let isOpen         = false;
  let timeListener   = null;

  // ── ユーティリティ ─────────────────────────────────────────────────
  const isWatchPage = () =>
    location.pathname === '/watch' && Boolean(new URLSearchParams(location.search).get('v'));

  const getVideoId = () =>
    new URLSearchParams(location.search).get('v') || null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  function hms(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
      : `${m}:${String(r).padStart(2,'0')}`;
  }

  function tsToMs(str) {
    const p = str.trim().split(':').map(Number);
    if (p.length === 3) return (p[0]*3600 + p[1]*60 + p[2]) * 1000;
    if (p.length === 2) return (p[0]*60   + p[1])       * 1000;
    return 0;
  }

  function msgHtml(text, color) {
    return `<div style="padding:40px 20px;text-align:center;` +
           `color:${color||'#888'};font-size:13px;line-height:1.7;">${text}</div>`;
  }

  // ── UI 要素の取得（存在しない場合は作成） ──────────────────────────
  function ensureUI() {
    // トグルボタン
    if (!document.getElementById('ytt-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'ytt-toggle';
      btn.textContent = '字幕';
      btn.title = '字幕・文字起こし';
      btn.addEventListener('click', onToggle);
      document.body.appendChild(btn);
      console.log('[YTT] toggle button created');
    }

    // サイドパネル
    if (!document.getElementById('ytt-sidebar')) {
      const sb = document.createElement('div');
      sb.id = 'ytt-sidebar';
      sb.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;' +
        'padding:13px 14px;border-bottom:1px solid #333;flex-shrink:0;">' +
          '<span style="font-size:15px;font-weight:600;">字幕・文字起こし</span>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<button id="ytt-reload" title="再読み込み" ' +
            'style="all:unset;cursor:pointer;color:#aaa;padding:4px 6px;font-size:16px;">↺</button>' +
            '<button id="ytt-copy" title="全文コピー" ' +
            'style="all:unset;cursor:pointer;color:#aaa;padding:4px 6px;font-size:14px;">📋</button>' +
            '<button id="ytt-close" title="閉じる" ' +
            'style="all:unset;cursor:pointer;color:#aaa;padding:4px 8px;font-size:17px;">✕</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:10px 14px;border-bottom:1px solid #333;flex-shrink:0;">' +
          '<input id="ytt-search" type="search" placeholder="検索…" autocomplete="off"' +
          ' style="width:100%;box-sizing:border-box;background:#222;color:#f1f1f1;' +
          'border:1px solid #555;border-radius:20px;padding:7px 14px;font-size:13px;outline:none;"/>' +
        '</div>' +
        '<div id="ytt-body"></div>';
      document.body.appendChild(sb);

      document.getElementById('ytt-close').addEventListener('click', hideSidebar);
      document.getElementById('ytt-copy').addEventListener('click', copyAll);
      document.getElementById('ytt-reload').addEventListener('click', forceReload);
      document.getElementById('ytt-search').addEventListener('input', e => {
        if (currentData) renderTranscript(currentData, e.target.value.trim());
      });
      console.log('[YTT] sidebar created');
    }
  }

  // ── watch ページに来たときの処理 ───────────────────────────────────
  function onWatchPage() {
    const vid = getVideoId();
    console.log('[YTT] onWatchPage vid:', vid, 'prev:', currentVideoId);

    ensureUI();

    // 動画が変わった場合だけリセット
    if (vid && vid !== currentVideoId) {
      currentVideoId = vid;
      loaded = false;
      currentData = null;
      if (document.getElementById('ytt-search'))
        document.getElementById('ytt-search').value = '';
      setBody(msgHtml('「字幕」ボタンをクリックすると読み込みます'));
      // パネルが開いていれば自動取得
      if (isOpen) loadCaptions();
    }
  }

  // watch 以外のページに来たら UI を隠す
  function onNonWatchPage() {
    const toggle = document.getElementById('ytt-toggle');
    const sb     = document.getElementById('ytt-sidebar');
    if (toggle) toggle.classList.remove('active'), toggle.style.display = 'none';
    if (sb)     hideSidebar();
  }

  // ── SPA ナビゲーション監視 ─────────────────────────────────────────
  // 1) YouTube 公式イベント
  document.addEventListener('yt-navigate-finish', () => {
    console.log('[YTT] yt-navigate-finish', location.href);
    setTimeout(() => {
      if (isWatchPage()) onWatchPage();
      else               onNonWatchPage();
    }, 600); // YouTube が DOM を更新し終えるまで少し待つ
  });

  // 2) URL 変化の MutationObserver フォールバック
  let _prevHref = location.href;
  new MutationObserver(() => {
    if (location.href !== _prevHref) {
      console.log('[YTT] URL changed', _prevHref, '->', location.href);
      _prevHref = location.href;
      setTimeout(() => {
        if (isWatchPage()) onWatchPage();
        else               onNonWatchPage();
      }, 600);
    }
  }).observe(document.documentElement, { subtree: true, childList: true });

  // 3) setInterval 最終フォールバック（稀なケース向け）
  setInterval(() => {
    if (location.href !== _prevHref) {
      console.log('[YTT] interval URL change detected');
      _prevHref = location.href;
      setTimeout(() => {
        if (isWatchPage()) onWatchPage();
        else               onNonWatchPage();
      }, 600);
    }
  }, 1000);

  // ── 初回チェック ────────────────────────────────────────────────────
  // ページ読み込み時点で /watch なら即 UI 作成
  if (isWatchPage()) {
    const doInit = () => { onWatchPage(); };
    if (document.body) doInit();
    else document.addEventListener('DOMContentLoaded', doInit, { once: true });
  }

  // ===================================================================
  // 開閉
  // ===================================================================

  function showSidebar() {
    const sb  = document.getElementById('ytt-sidebar');
    const btn = document.getElementById('ytt-toggle');
    if (!sb || !btn) return;
    isOpen = true;
    sb.classList.add('open');
    btn.classList.add('active');
    // toggle を念のため再表示
    btn.style.display = '';
    console.log('[YTT] sidebar open, computed display:', getComputedStyle(sb).display);
  }

  function hideSidebar() {
    const sb  = document.getElementById('ytt-sidebar');
    const btn = document.getElementById('ytt-toggle');
    isOpen = false;
    if (sb)  sb.classList.remove('open');
    if (btn) btn.classList.remove('active');
  }

  function onToggle() {
    if (isOpen) { hideSidebar(); return; }
    showSidebar();
    if (!loaded) loadCaptions();
  }

  function forceReload() {
    loaded = false; currentData = null;
    loadCaptions();
  }

  // ===================================================================
  // 字幕取得 ── YouTubeネイティブ文字起こしパネルを DOM で操作
  // ===================================================================

  // -- ① 文字起こしボタンを探す --

  const BTN_SELECTORS = [
    'ytd-video-description-transcript-section-renderer button',
    'ytd-video-description-transcript-section-renderer ytd-button-renderer',
    'button[aria-label="文字起こしを表示"]',
    'button[aria-label="Show transcript"]',
    'button[aria-label*="transcript" i]',
    'button[aria-label*="文字起こし"]',
    'yt-button-shape button[aria-label*="transcript" i]',
    'yt-button-shape button[aria-label*="文字起こし"]',
  ];

  async function findTranscriptButton(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const sel of BTN_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) { console.log('[YTT] button found:', sel); return el; }
      }
      // 説明欄が折りたたまれていれば展開
      const expander = document.querySelector(
        '#expand.ytd-text-inline-expander, ' +
        'ytd-text-inline-expander tp-yt-paper-button, ' +
        'tp-yt-paper-button#expand'
      );
      if (expander && expander.offsetParent) {
        console.log('[YTT] expanding description');
        expander.click();
      }
      await sleep(400);
    }
    // デバッグ: 見つからなかった場合に現在の aria-label を列挙
    const allBtns = [...document.querySelectorAll('button[aria-label]')]
      .map(b => b.getAttribute('aria-label')).slice(0, 20);
    console.log('[YTT] button not found. aria-labels on page:', allBtns);
    return null;
  }

  // -- ② パネルとセグメントを待つ --

  const PANEL_SELECTORS = [
    'ytd-engagement-panel-section-list-renderer' +
      '[target-id="engagement-panel-searchable-transcript"]',
    'ytd-transcript-renderer',
  ];
  const SEG_SELECTORS = [
    'ytd-transcript-segment-renderer',
    '[class*="TranscriptSegment"]',
  ];

  async function waitForSegments(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const ps of PANEL_SELECTORS) {
        const panel = document.querySelector(ps);
        if (!panel) continue;
        for (const ss of SEG_SELECTORS) {
          const segs = panel.querySelectorAll(ss);
          if (segs.length > 0) {
            console.log('[YTT] segments found:', segs.length, 'selector:', ss);
            return segs;
          }
        }
      }
      await sleep(300);
    }
    return null;
  }

  // -- ③ セグメント DOM からデータを抽出 --

  function extractSegments(segs) {
    const result = [];
    for (const seg of segs) {
      const timeEl = seg.querySelector(
        '.segment-timestamp, [class*="timestamp"]'
      );
      const textEl = seg.querySelector(
        '.segment-text, [class*="segment-text"], yt-formatted-string'
      );
      const rawText = (textEl || seg).textContent.replace(/\s+/g, ' ').trim();
      if (!rawText) continue;

      const rawTime = timeEl ? timeEl.textContent.trim() : '';
      const timeMatch = rawTime || (seg.textContent.match(/\d+:\d+(?::\d+)?/) || [''])[0];
      result.push({ ms: tsToMs(timeMatch), text: rawText });
    }
    console.log('[YTT] extracted:', result.length,
      result[0] ? `"${result[0].text.slice(0,30)}"` : '');
    return result;
  }

  // -- ④ ネイティブパネルを閉じる --

  function closeNativePanel() {
    // 閉じるボタンを探す
    for (const ps of PANEL_SELECTORS) {
      const panel = document.querySelector(ps);
      if (!panel) continue;
      const closeBtn = panel.querySelector(
        'button[aria-label="閉じる"], button[aria-label="Close"], ' +
        'button.yt-icon-button[class*="close"]'
      );
      if (closeBtn) { closeBtn.click(); console.log('[YTT] native panel closed'); return; }
    }
    // 属性で非表示
    const panel = document.querySelector(PANEL_SELECTORS[0]);
    if (panel) {
      panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    }
  }

  // -- ⑤ loadCaptions エントリポイント --

  async function loadCaptions() {
    setBody(msgHtml('「文字起こし」ボタンを探しています…'));
    loaded = false;

    try {
      // ① ボタンを見つける
      const btn = await findTranscriptButton(8000);
      if (!btn) {
        throw new Error(
          '「文字起こし」ボタンが見つかりません。\n' +
          'この動画には字幕がない可能性があります。'
        );
      }

      // ② クリックしてパネルを開く
      setBody(msgHtml('パネルを開いています…'));
      btn.click();

      // ③ セグメントを待つ
      const segs = await waitForSegments(8000);
      if (!segs || segs.length === 0) {
        throw new Error('文字起こしパネルのセグメントが取得できませんでした。');
      }

      // ④ データ抽出
      const data = extractSegments(segs);
      if (data.length === 0) {
        throw new Error('セグメントのテキストを読み取れませんでした。');
      }

      // ⑤ ネイティブパネルを閉じる
      await sleep(80);
      closeNativePanel();

      // ⑥ 表示
      currentData = data;
      loaded = true;
      renderTranscript(data, '');
      attachTimeHighlight();

    } catch (e) {
      console.error('[YTT] loadCaptions error:', e);
      setBody(msgHtml(esc(e.message).replace(/\n/g,'<br>'), '#f77'));
    }
  }

  // ===================================================================
  // 描画
  // ===================================================================

  function setBody(html) {
    const el = document.getElementById('ytt-body');
    if (el) el.innerHTML = html;
  }

  function renderTranscript(data, query) {
    if (!data || data.length === 0) { setBody(msgHtml('データが空です')); return; }
    const q = (query || '').toLowerCase();
    const html = data.map(e => {
      let t = esc(e.text);
      if (q) t = t.replace(
        new RegExp('(' + escRe(esc(q)) + ')', 'gi'),
        '<mark style="background:#f9ca24;color:#000;border-radius:2px;">$1</mark>'
      );
      const hide = q && !e.text.toLowerCase().includes(q) ? 'none' : 'flex';
      return (
        `<div data-t="${e.ms}" style="display:${hide};gap:10px;padding:7px 14px;` +
        `margin:1px 6px;border-radius:5px;cursor:pointer;line-height:1.55;">` +
        `<span style="flex-shrink:0;color:#3ea6ff;font-size:12px;font-weight:500;` +
        `min-width:42px;">${hms(e.ms)}</span>` +
        `<span style="color:#e0e0e0;font-size:14px;word-break:break-word;">${t}</span>` +
        `</div>`
      );
    }).join('');
    setBody(html);

    document.querySelectorAll('#ytt-body [data-t]').forEach(el => {
      el.addEventListener('click', () => {
        const v = document.querySelector('video');
        if (v) { v.currentTime = parseInt(el.dataset.t, 10) / 1000; v.play().catch(()=>{}); }
      });
    });
  }

  // ===================================================================
  // 再生位置ハイライト
  // ===================================================================

  function attachTimeHighlight() {
    const v = document.querySelector('video');
    if (!v) return;
    if (timeListener) v.removeEventListener('timeupdate', timeListener);
    timeListener = () => {
      if (!isOpen) return;
      const t = v.currentTime * 1000;
      const items = [...document.querySelectorAll('#ytt-body [data-t]')]
        .filter(el => el.style.display !== 'none');
      let active = null;
      for (const el of items) {
        if (parseInt(el.dataset.t, 10) <= t) active = el;
        else break;
      }
      const prev = document.querySelector('#ytt-body [data-cur="1"]');
      if (prev === active) return;
      if (prev) {
        prev.removeAttribute('data-cur');
        prev.style.background = '';
        prev.style.borderLeft = '';
      }
      if (active) {
        active.setAttribute('data-cur', '1');
        active.style.background = '#1a2744';
        active.style.borderLeft = '3px solid #3ea6ff';
        if (!active.matches(':hover'))
          active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    v.addEventListener('timeupdate', timeListener);
  }

  // ===================================================================
  // コピー
  // ===================================================================

  function copyAll() {
    if (!currentData) return;
    navigator.clipboard.writeText(
      currentData.map(e => `[${hms(e.ms)}] ${e.text}`).join('\n')
    ).catch(() => {});
  }

} // end main()
