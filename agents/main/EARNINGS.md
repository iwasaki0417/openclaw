# 決算・重要イベント ウォッチャー

> 保有銘柄の決算発表日を週次でチェックし、直前にmacOS通知で知らせる。

---

## Step 0: 準備

```bash
cat ~/.openclaw/workspace/memory/watchlist.json
```

`stocks_us` と `spotBuy` の全ティッカーを対象とする。
ETF（SPY, URA）および日本株（1326.T, 1542.T）は決算チェック不要。

対象銘柄リスト:
- stocks_us から: ETN, IONQ, MDB, NVDA, PLTR, QBTS, RGTI, TSLA, TSM, VRT
- spotBuy から: 上記と重複しないものがあれば追加

## Step 1: 決算日の検索

各銘柄について Brave Search で決算予定を検索する。

```bash
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/web/search?q={TICKER}+earnings+date+2026&count=5&search_lang=en" \
  --compressed \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('web', {}).get('results', [])[:5]:
    print(r.get('title', ''))
    desc = r.get('description', '')
    if desc:
        print(f'  {desc[:200]}')
"
```

各リクエスト間に `sleep 3`（レート制限回避）。

検索結果から決算発表日を抽出する。日付が今日から **7日以内** の銘柄を「直近決算」として記録する。

## Step 2: 決算日メモリ更新

検索結果を `~/.openclaw/workspace/memory/earnings-calendar.json` に保存する。

```json
{
  "lastChecked": "2026-02-23",
  "upcoming": [
    {
      "ticker": "NVDA",
      "name": "エヌビディア",
      "earningsDate": "2026-02-26",
      "timing": "after-close",
      "daysUntil": 3,
      "source": "Seeking Alpha"
    }
  ],
  "noDateFound": ["QBTS", "RGTI"]
}
```

- `timing`: "before-open", "after-close", "unknown" のいずれか
- `daysUntil`: 今日から決算日までの日数
- `noDateFound`: 日付を特定できなかった銘柄

## Step 3: 通知

### 7日以内の決算がある場合

```bash
osascript -e 'display notification "NVDA 決算: 2/26（水）引け後\nPLTR 決算: 2/28（金）寄り前\n⚡ 決算前後は値動き注意" with title "📅 今週の決算予定" sound name "Purr"'
```

### 翌営業日に決算がある場合（緊急通知）

```bash
osascript -e 'display notification "明日 NVDA 決算発表（引け後）\n保有: 35株（評価額 ¥1,029,740）\n📊 コンセンサス予想を確認してください" with title "⚠️ 明日決算！" sound name "Glass"'
```

評価額は stock-history.json の直近データから算出する。

### 決算がない場合

通知は出さない。

## Step 4: 結果返却

- 通知あり → `[Earnings] {N}件の決算予定を通知`
- 通知なし → `HEARTBEAT_OK`

## 注意事項

1. Brave Search APIは月1,000回の無料枠。1回の実行で最大10銘柄を検索するため、週1回（月4回 × 10銘柄 = 40リクエスト）程度に抑える
2. 検索結果の日付が曖昧な場合は `timing: "unknown"` とする
3. 売買判断・推奨は出さない — 事実のみ通知
