# 週次ポートフォリオ診断

> 毎週土曜朝に、ポートフォリオの健全性と今週のアクションをHTMLメール + macOS通知で知らせる。

---

## Step 0: データ読み込み

```bash
cat ~/.openclaw/workspace/memory/watchlist.json
cat ~/.openclaw/workspace/memory/stock-history.json
cat ~/.openclaw/workspace/memory/dca-schedule.json
```

## Step 1: 今週の値動きサマリー

stock-history.json の最新データを使い、保有全銘柄の週間パフォーマンスを計算する。

Yahoo Finance で週足データを取得（range=5d）:

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

curl -s -A "$UA" "https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=5d" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
r = d['chart']['result'][0]
closes = r['indicators']['quote'][0]['close']
valid = [c for c in closes if c is not None]
if len(valid) >= 2:
    weekly_change = round((valid[-1] - valid[0]) / valid[0] * 100, 2)
    print(f'{r[\"meta\"][\"symbol\"]}: {valid[-1]:.2f} ({weekly_change:+.2f}%)')
"
```

各銘柄を1つずつ取得。各リクエスト間に `sleep 2`。

## Step 2: ポートフォリオ健全性チェック

以下を分析する:

### 2a. 資産配分バランス
stock-history.json の summary データから:
- 日本株比率、米国株比率、投資信託比率を算出
- 極端な偏り（1カテゴリが70%超）があれば警告

### 2b. 集中リスク
- 単一銘柄がポートフォリオの30%以上を占める場合に警告
- 対象: 全銘柄の評価額を比較

### 2c. 含み損銘柄
- 含み損が10%以上の銘柄をリストアップ

### 2d. DCAスケジュール確認
dca-schedule.json を確認し:
- 来週の積立予定（月初2日、15日、月曜・水曜）を通知
- spotBuyPool の累計残高を概算

## Step 3: 市場トレンド（Brave Search）

主要テーマの週間ニュースをBrave Searchで取得:

```bash
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/news/search?q=stock+market+weekly+outlook&count=3&search_lang=en&freshness=pw" \
  --compressed \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('results', [])[:3]:
    print(r.get('title', ''))
"
```

貴金属（gold silver price）、半導体（semiconductor chip）、ウラン（uranium nuclear）についても各1回ずつ検索。
各リクエスト間に `sleep 3`。

## Step 4: HTMLメール生成

DAILY-NEWS.md と同様のHTML形式でレポートを生成し `/tmp/openclaw-weekly-review.html` に保存する。

含める内容:
- 週間パフォーマンス表（全銘柄の週間騰落率、評価額、損益）
- 資産配分の円グラフ相当データ（日本株/米国株/投信の比率）
- 警告事項（集中リスク、含み損）
- 来週のDCA予定
- 市場トレンドニュース要約

```bash
# HTMLファイル保存
cp /tmp/openclaw-weekly-review.html ~/.openclaw/workspace/memory/weekly-review-latest.html
```

## Step 5: メール送信 + macOS通知

```bash
python3 ~/.openclaw/workspace/scripts/send-email.py \
  --subject "📋 週次レビュー $(date '+%m/%d')" \
  --html-file /tmp/openclaw-weekly-review.html
```

メール送信後、要約をmacOS通知:

```bash
osascript -e 'display notification "📊 週間: 日本株+1.2%, 米国株-0.8%\n⚡ 警告{N}件\n📅 来週: 3/2 銀3口+金1口+SPY1株\n📧 詳細メール送信済" with title "📋 週次レビュー" sound name "Purr"'
```

## Step 6: 結果返却

`[Weekly Review] ポートフォリオ診断完了 — 警告{N}件 — メール送信済`

## 注意事項

1. Brave Search APIの呼び出しは1回の実行で最大4リクエストに抑える
2. 売買判断・推奨は出さない — 事実とリスク指摘のみ
3. macOS通知は要約のみ、詳細はメールで確認
4. email-config.json 未設定時はファイル保存 + macOS通知のみ
