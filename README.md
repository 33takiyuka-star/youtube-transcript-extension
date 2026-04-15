# YouTube Transcript Extension

YouTubeの動画から文字起こし（字幕）をワンクリックで取得・コピーできるChrome拡張機能です。

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 概要

YouTubeには多くの動画に自動生成または手動作成の字幕が付いています。この拡張機能を使うと、動画を再生しながらその字幕テキストをすばやく取得し、クリップボードにコピーすることができます。

**APIキー不要** — YouTubeページ内のデータを直接参照するため、外部APIへの登録は一切不要です。

---

## 機能

| 機能 | 説明 |
|------|------|
| 字幕の自動取得 | 動画ページを開いてボタンを押すだけで字幕を取得 |
| 言語の自動選択 | 日本語 → 英語 → 利用可能な言語の順で自動選択 |
| 言語切替 | 複数の字幕トラックがある場合はドロップダウンで切替可能 |
| プレーンテキストコピー | 字幕テキストのみをコピー |
| タイムスタンプ付きコピー | `[0:00] テキスト` 形式でコピー |
| ダークテーマUI | YouTubeのデザインに合わせたダークテーマ |

---

## 技術スタック

- **Chrome Extensions Manifest V3**
- **Vanilla JavaScript**（フレームワーク不使用）
- **Content Scripts** — YouTubeページの `ytInitialPlayerResponse` から字幕URLを取得
- **YouTube Internal API** — 字幕XMLをフェッチ・パース

---

## インストール方法

### 開発者モードでインストール（ローカル）

1. このリポジトリをクローンまたはダウンロードします

```bash
git clone https://github.com/33takiyuka-star/youtube-transcript-extension.git
```

2. Chromeで `chrome://extensions/` を開きます

3. 右上の **「デベロッパーモード」** をオンにします

4. **「パッケージ化されていない拡張機能を読み込む」** をクリックします

5. クローンしたフォルダを選択します

6. 拡張機能が追加され、ツールバーにアイコンが表示されます

---

## 使い方

### 基本的な使い方

1. YouTubeで字幕付きの動画を開きます
2. ブラウザのツールバーにある拡張機能アイコンをクリックします
3. **「文字起こしを取得」** ボタンを押します
4. 字幕が一覧表示されます

### コピー方法

| ボタン | コピー形式 |
|--------|------------|
| テキストをコピー | 字幕テキストのみ（改行区切り） |
| タイムスタンプ付きコピー | `[1:23] テキスト` 形式 |

**タイムスタンプ付きコピーの例：**

```
[0:00] こんにちは、今日はChromeの拡張機能について話します
[0:05] まず最初に、Manifest V3について説明します
[0:12] ...
```

### 言語の切替

複数の字幕言語がある動画では、ポップアップ上部のドロップダウンから言語を選択できます。

---

## ファイル構成

```
youtube-transcript-extension/
├── manifest.json   # 拡張機能の設定（Manifest V3）
├── content.js      # コンテンツスクリプト（字幕データ取得）
├── popup.html      # ポップアップのHTML
├── popup.css       # スタイルシート
├── popup.js        # ポップアップのロジック
└── icons/          # 拡張機能アイコン
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 動作の仕組み

```
[ポップアップ]
    ↓ メッセージ送信
[コンテンツスクリプト]
    ↓ window.ytInitialPlayerResponse を参照
[字幕トラックURL取得]
    ↓ fetch
[YouTube字幕XML]
    ↓ DOMParser でパース
[字幕セグメント一覧]
    ↓ メッセージ返信
[ポップアップに表示]
```

YouTube動画ページには `ytInitialPlayerResponse` というグローバル変数が埋め込まれており、その中に字幕トラックのURLが含まれています。コンテンツスクリプトがこのURLを取得・フェッチし、XMLをパースして字幕テキストを抽出します。

---

## 注意事項

- 字幕（自動生成含む）が存在しない動画では使用できません
- YouTubeの仕様変更により動作しなくなる可能性があります
- 個人利用・学習目的を想定しています

---

## ライセンス

[MIT License](LICENSE)
