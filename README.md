# くらし立地

**買ったあと損しにくく、暮らせる立地かを比較する** Webサービスです。

安さだけでなく、次を一覧比較できます。

- 災害時の想定修理費（購入額に対する損失インパクト）
- 最寄り駅・バス停までの徒歩分数
- 地域性（産業タイプ、高齢化率、生活保護・犯罪の相対水準）

## 公開URL

GitHub Pages で公開します。

`https://<your-username>.github.io/kurashi-ritchi/`

## 使い方

1. 住所を入力して候補を追加（または地図クリック）
2. 購入額（万円）を設定
3. 比較リストで並べ替え・詳細を確認
4. 必要なら公式「重ねるハザードマップ」で最終確認

## 地域統計の自動更新

保護・犯罪・高齢化などの市区町村統計は、**e-Stat API（社会・人口統計体系）** から週次で更新できます。

### セットアップ（必須）

1. [e-Stat API](https://www.e-stat.go.jp/api/) でアプリケーションIDを無料発行
2. GitHub リポジトリの **Settings → Secrets and variables → Actions** に  
   `ESTAT_APP_ID` を追加
3. Actions タブで **Update municipal stats** を手動実行（または毎週月曜に自動実行）

更新されると `data/municipalities.stats.json` と `src/data/municipalities.generated.json` がコミットされ、Pages も再デプロイされます。  
指標コードは `scripts/estat-fixed-codes.mjs` に固定しています（名称あいまいマッチは使いません）。  
人手検証値は `data/municipalities.overrides.json` が優先されます。

ローカル手動更新:

```bash
export ESTAT_APP_ID=あなたのID
npm run update:stats
```

## ローカル起動

```bash
npm install
npm run merge:stats
npm run dev
```

## データソース（日本）

| 用途 | 出典 |
|---|---|
| 背景地図・標高・住所検索 | 国土地理院 |
| 公式ハザード確認 | ハザードマップポータル |
| 駅・バス停 | OpenStreetMap / Overpass API |
| 地域性 | 国勢調査・経済センサス等を参考にした市区町村単位の相対指標（MVP） |

## 免責

- 危険度は標高などから推定した**相対指標**です
- 修理費は**目安レンジ**であり、見積や保険の代替ではありません
- 生活保護・犯罪は**自治体単位の相対表示**です
- 本ツールは購入の断定アドバイスを行いません

## 技術

- Vite + React + TypeScript
- Leaflet（国土地理院タイル）
- GitHub Actions → GitHub Pages
