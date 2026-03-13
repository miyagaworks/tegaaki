# Tegaaki — 漢字辞典

手書きで漢字を調べて楷書で大きく表示できる辞典PWA。

## セットアップ

```bash
npm install
```

### 漢字データベースの構築

KANJIDIC2 XMLをダウンロードしてJSONに変換:

```bash
# 1. XMLをダウンロード
curl -sL -o data/kanjidic2.xml.gz http://www.edrdg.org/kanjidic/kanjidic2.xml.gz
gunzip data/kanjidic2.xml.gz

# 2. JSONに変換（常用漢字2,136字を抽出）
npm run build:kanjidb
```

## 開発

```bash
npm run dev
```

## ビルド

```bash
npm run build
```

`npm run build` 実行時、`src/data/kanjidic.json` が存在しない場合は自動的に変換スクリプトが実行されます。

## ライセンス

MIT

### KANJIDIC2

漢字データは [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) を使用しています（CC BY-SA 3.0、Electronic Dictionary Research and Development Group）。
