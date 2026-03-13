# Tegaaki — 漢字辞典 PWA 仕様書

## 概要

広告なし・即起動・オフライン動作を実現した、手書きで漢字を調べてすぐに楷書で大きく確認できる辞典PWA。  
「新・筆順辞典」（NOWPRODUCTION）の代替として個人利用を目的に開発する。

### アプリ名称

| 用途 | 表記 |
|------|------|
| 正式名称 | 漢字辞典「Tegaaki」 |
| PWA ホーム画面アイコン下部 | `Tegaaki` |
| タイトルバー表示 | `Tegaaki` |
| HTML `<title>` | `Tegaaki — 漢字辞典` |

---

## 技術スタック

| 役割 | 採用技術 | バージョン |
|------|---------|-----------|
| フレームワーク | React | 18.x |
| ビルドツール | Vite | 5.x |
| 言語 | TypeScript | 5.x |
| PWA | vite-plugin-pwa | 最新安定版 |
| 手書き認識 | TensorFlow.js | 4.x |
| 漢字データ | KANJIDIC2 | CC BY-SA 3.0 |
| 楷書フォント | Noto Serif JP | Google Fonts |

---

## 機能一覧

### MVP（初回リリース）

| 機能 | 内容 |
|------|------|
| 手書き検索 | Canvas に指/ペンで描画 → TF.js 推論 → 候補最大10件表示 |
| キーボード検索 | 漢字1文字の直接入力 または ひらがなで読み検索 |
| 漢字詳細表示 | 楷書大表示・音読み・訓読み・画数・異体字/旧字体 |
| PWA 基盤 | Service Worker・オフライン動作・ホーム画面追加対応 |

### 後フェーズ（スコープ外）

- 筆順アニメーション（KanjiVG + hanzi-writer）
- ブックマーク機能
- なぞり練習
- 音声検索

### 非対応（意図的に省いた機能）

- カタカナ検索
- 熟語検索
- 部首索引
- 画数索引
- 閲覧履歴
- 広告

---

## 画面仕様

### レイアウト概要

```
┌─────────────────────┐
│  タイトルバー         │
├──────────┬──────────┤
│ 手書き   │ キーボード │  ← タブ（2つのみ）
├─────────────────────┤
│                     │
│   検索エリア         │
│                     │
├─────────────────────┤
│  候補ボタン一覧       │
├─────────────────────┤
│                     │
│   漢字詳細           │
│                     │
└─────────────────────┘
```

ボトムナビなし。タブ2つのシンプルな縦スクロール1画面構成。

---

### 手書きタブ

#### キャンバス

- サイズ: 画面幅いっぱい、高さ 200px 固定
- 背景: オフホワイト（#fffef9）
- ガイド: 中心十字線 + 対角線（薄いグレー）
- 描画色: `#1a1a1a`、線幅 3px、`lineCap: round`
- 対応入力: `pointer` イベント（マウス・タッチ・Apple Pencil 統一）
- クリアボタン: キャンバス右下に常時表示

#### 認識トリガー

- 描画停止から **500ms** 後に自動で推論を実行
- 推論中は「認識中…」インジケーターを表示
- クリア操作で推論タイマーをリセット

#### 候補表示

- 推論結果を確率順に最大 **10件** ボタンとして横スクロール表示
- ボタンサイズ: 50×50px、楷書フォント 26px
- 選択中ボタンはアクセントカラーでハイライト

---

### キーボードタブ

#### 入力ルール

| 入力内容 | 動作 |
|---------|------|
| 漢字 1 文字 | 即座に詳細表示 |
| ひらがな（読み） | 同音の漢字候補一覧を表示 |
| カタカナ | 非対応（何も表示しない） |
| 2 文字以上の漢字・熟語 | 非対応（何も表示しない） |

- リアルタイム検索（`oninput` で毎回実行）
- 入力クリアボタン（✕）を右端に配置

---

### 漢字詳細表示

候補選択後、キャンバス/入力欄の直下にインライン展開する。

#### 表示項目

| 項目 | 表示形式 | 備考 |
|------|---------|------|
| 楷書大表示 | 96×96px ボックス、Noto Serif JP 68px | 中央揃え |
| 音読み | テキスト | カタカナ表記 |
| 訓読み | テキスト | ひらがな表記、送り仮名は括弧 |
| 画数 | バッジ（例: `13画`） | |
| 異体字・旧字体 | 文字ボタン横並び | データが存在する場合のみ表示 |

#### 異体字・旧字体

- 存在する場合のみセクションを表示（存在しない場合は非表示）
- タップするとその文字の詳細に切り替え

---

## 手書き認識 — 技術方針

### 採用方針

**方針B: TF.js CNN ブラウザ内推論**

- Canvas 描画データを **grayscale 64×64px** にリサイズ
- TensorFlow.js でブラウザ内推論（サーバー通信なし）
- 初回アクセス時に Service Worker がモデルをキャッシュ → 以降オフライン動作

### モデル候補（実装時に選定）

1. `tegaki.js` 同梱モデル（〜7MB、Apache 2.0）
2. MediaPipe Handwriting Recognition（無料・オフライン対応）

### 認識対象

初期リリースは **常用漢字 2,136 字** に限定し、軽量モデルで対応。  
精度よりもオフライン動作・起動速度を優先する。

### モック実装（開発初期）

TF.js モデル組み込み前は、ランダムな漢字候補を返すモック関数で UI 開発を進める。

```typescript
// src/lib/recognizer.ts
export async function recognize(canvas: HTMLCanvasElement): Promise<string[]> {
  // TODO: TF.js モデルに差し替える
  return ['漢', '語', '字', '書', '道', '山', '川', '花', '水', '木'];
}
```

---

## データ仕様

### 漢字データソース

**KANJIDIC2**（CC BY-SA 3.0、Electronic Dictionary Research and Development Group）

- 収録文字数: 常用漢字・人名用漢字を含む 13,000 字以上
- 取得先: https://www.edrdg.org/wiki/index.php/KANJIDIC_Project
- 形式: XML → ビルド時に JSON に変換してバンドル

### 使用フィールド

```typescript
interface KanjiEntry {
  kanji: string;          // 漢字本体
  on: string[];           // 音読み（カタカナ）
  kun: string[];          // 訓読み（ひらがな、送り仮名は.区切り）
  strokes: number;        // 総画数
  variants?: string[];    // 異体字・旧字体（任意）
}
```

---

## PWA 設定

### manifest.json

```json
{
  "name": "Tegaaki",
  "short_name": "Tegaaki",
  "description": "漢字辞典 Tegaaki — 手書きで引ける漢字辞典",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fafaf8",
  "theme_color": "#fafaf8",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker キャッシュ戦略

| リソース | 戦略 |
|---------|------|
| HTML / JS / CSS | Cache First |
| Noto Serif JP フォント | Cache First（Google Fonts） |
| TF.js モデルファイル | Cache First（初回のみ通信） |
| 漢字 JSON データ | Cache First（バンドル済み） |

---

## プロジェクト構成（想定）

```
tegaaki/
├── public/
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   ├── components/
│   │   ├── DrawTab.tsx          # 手書きタブ
│   │   ├── KeyboardTab.tsx      # キーボードタブ
│   │   ├── CandidateList.tsx    # 候補ボタン一覧
│   │   └── KanjiDetail.tsx      # 漢字詳細表示
│   ├── lib/
│   │   ├── recognizer.ts        # TF.js 手書き認識（モック→本実装）
│   │   └── kanjidb.ts           # KANJIDIC2 検索ユーティリティ
│   ├── data/
│   │   └── kanjidic.json        # ビルド時生成
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── scripts/
│   └── build-kanjidb.ts         # KANJIDIC2 XML → JSON 変換スクリプト
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## デザイントークン

```css
:root {
  --ink:          #1a1a1a;
  --ink2:         #555555;
  --ink3:         #999999;
  --surface:      #fafaf8;
  --surface2:     #f2f0ec;
  --border:       rgba(0, 0, 0, 0.10);
  --border2:      rgba(0, 0, 0, 0.18);
  --accent:       #2d5a8e;
  --accent-light: #e8f0f9;
  --canvas-bg:    #fffef9;
  --font-serif:   'Noto Serif JP', serif;
  --font-sans:    'Noto Sans JP', sans-serif;
}
```

---

## 開発フェーズ

| フェーズ | 内容 |
|---------|------|
| Phase 1 | プロジェクト初期化・PWA 基盤・UIスケルトン |
| Phase 2 | KANJIDIC2 データ変換・キーボード検索実装 |
| Phase 3 | 手書きキャンバス UI・モック認識エンジン接続 |
| Phase 4 | TF.js モデル選定・本番認識エンジン組み込み |
| Phase 5 | 動作確認・パフォーマンス最適化・アイコン作成 |
| Phase 6 | （後回し）筆順アニメーション実装 |

---

## 参考・ライセンス

| リソース | ライセンス | URL |
|---------|-----------|-----|
| KANJIDIC2 | CC BY-SA 3.0 | https://www.edrdg.org/wiki/index.php/KANJIDIC_Project |
| KanjiVG（筆順、後フェーズ） | CC BY-SA 3.0 | https://kanjivg.tagaini.net/ |
| Noto Serif JP | SIL OFL 1.1 | https://fonts.google.com/noto/specimen/Noto+Serif+JP |
| TensorFlow.js | Apache 2.0 | https://www.tensorflow.org/js |
