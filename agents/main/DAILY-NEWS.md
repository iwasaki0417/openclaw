# デイリーニュースダイジェスト

> 毎朝、株式投資に影響するニュースを世界中から収集し、HTMLメールで送信する。

---

## Step 0: 準備

```bash
cat ~/.openclaw/workspace/memory/watchlist.json
cat ~/.openclaw/workspace/memory/dca-schedule.json
```

## Step 1: ニュース収集（Brave Search）

以下の8カテゴリを順番に検索する。各リクエスト間に `sleep 3`。

### 1a. 保有銘柄ニュース（主要5銘柄のみ、API節約）

評価額上位の主要銘柄: NVDA, TSLA, TSM, SPY, PLTR

```bash
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/news/search?q={TICKER}+stock&count=3&search_lang=en&freshness=pd" \
  --compressed \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for r in d.get('results', [])[:3]:
    print(json.dumps({'title': r.get('title',''), 'url': r.get('url',''), 'source': r.get('source',''), 'age': r.get('age','')}, ensure_ascii=False))
"
```

### 1b. 経済指標・金融政策

```bash
# 検索クエリ: "economic data OR CPI OR jobs report OR FOMC OR Fed OR BOJ this week"
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/news/search?q=economic+data+CPI+jobs+report+FOMC+Fed+this+week&count=5&search_lang=en&freshness=pw" \
  --compressed
```

### 1c. 貴金属（金・銀）

```bash
# 検索クエリ: "gold silver price"
curl -s ... "https://api.search.brave.com/res/v1/news/search?q=gold+silver+price&count=3&search_lang=en&freshness=pd" --compressed
```

### 1d. ウラン・原子力

```bash
# 検索クエリ: "uranium nuclear energy"
curl -s ... "https://api.search.brave.com/res/v1/news/search?q=uranium+nuclear+energy&count=3&search_lang=en&freshness=pw" --compressed
```

### 1e. AI・半導体

```bash
# 検索クエリ: "AI semiconductor chip market"
curl -s ... "https://api.search.brave.com/res/v1/news/search?q=AI+semiconductor+chip+market&count=3&search_lang=en&freshness=pd" --compressed
```

### 1f. 地政学・関税・規制

```bash
# 検索クエリ: "tariff trade war sanctions regulation market impact"
curl -s ... "https://api.search.brave.com/res/v1/news/search?q=tariff+trade+war+regulation+market+impact&count=3&search_lang=en&freshness=pw" --compressed
```

### 1g. 量子コンピューティング

IONQ, QBTS, RGTI は超ハイボラ銘柄。政府予算・契約・技術ブレイクスルーで一晩20-30%動くため個別監視が必要。

```bash
# 検索クエリ: "quantum computing IONQ QBTS RGTI"
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/news/search?q=quantum+computing+IONQ+QBTS+RGTI&count=3&search_lang=en&freshness=pw" \
  --compressed
```

### 1h. データセンターインフラ

VRT（冷却）、ETN（電力管理）はAIデータセンター建設ブームの恩恵銘柄。AI半導体とは別軸の需要動向を監視。

```bash
# 検索クエリ: "data center power cooling infrastructure"
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/news/search?q=data+center+power+cooling+infrastructure&count=3&search_lang=en&freshness=pw" \
  --compressed
```

合計: 5（銘柄） + 1（経済） + 1（貴金属） + 1（ウラン） + 1（AI） + 1（地政学） + 1（量子） + 1（DC） = **11リクエスト**

## Step 2: ニュースフィルタリングと分析

収集した全ニュースから、以下の基準で **株価に影響しそうなものだけ** をピックアップする:

- **直接影響**: 保有銘柄の決算、業績、M&A、訴訟
- **間接影響**: 金利変動、為替、セクター全体の規制
- **テーマ影響**: 保有テーマ（AI、貴金属、ウラン、量子コンピューティング、DCインフラ）の構造的変化
- **マクロ影響**: 雇用統計、CPI、FOMC、日銀会合の結果・予想

ノイズ（芸能人の投資話、暗号通貨の宣伝、無関係な企業ニュース）は除外する。

各ニュースに **影響度タグ** を付ける:
- 🔴 **要注意**: ポートフォリオに直接影響する可能性が高い
- 🟡 **注視**: 間接的に影響する可能性がある
- 🟢 **参考**: 知っておくと良い背景情報

## Step 3: HTMLメール生成とファイル保存

以下のフォーマットでHTMLを生成し、まずファイルに保存する:

```bash
cat > /tmp/openclaw-daily-news.html << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background: #f9f9f9;">

<div style="background: #1a1a2e; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
  <h1 style="margin: 0; font-size: 18px;">📰 OpenClaw デイリーニュース</h1>
  <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.8;">YYYY年MM月DD日（曜日）</p>
</div>

<div style="background: white; padding: 20px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

  <h2 style="font-size: 15px; border-left: 4px solid #e74c3c; padding-left: 10px; margin-top: 0;">🔴 要注意</h2>
  <ul style="padding-left: 20px;">
    <li><strong>NVDA 決算が来週水曜</strong> — アナリスト予想EPS $0.89<br>
      <span style="font-size: 12px; color: #888;">Source: Seeking Alpha</span></li>
  </ul>

  <h2 style="font-size: 15px; border-left: 4px solid #f39c12; padding-left: 10px;">🟡 注視</h2>
  <ul style="padding-left: 20px;">
    <li><strong>FRB 3月FOMC議事要旨</strong> — 利下げ据え置き観測<br>
      <span style="font-size: 12px; color: #888;">Source: Reuters</span></li>
    <li><strong>金先物が最高値更新</strong> — $2,950突破<br>
      <span style="font-size: 12px; color: #888;">Source: Bloomberg</span></li>
  </ul>

  <h2 style="font-size: 15px; border-left: 4px solid #27ae60; padding-left: 10px;">🟢 参考</h2>
  <ul style="padding-left: 20px;">
    <li><strong>ウラン市場</strong> — カザフスタンの供給不安が継続<br>
      <span style="font-size: 12px; color: #888;">Source: World Nuclear News</span></li>
  </ul>

  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

  <h2 style="font-size: 15px; color: #555;">📅 今週の経済指標</h2>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr style="background: #f5f5f5;">
      <td style="padding: 6px 10px;">月/日（曜日）</td>
      <td style="padding: 6px 10px;">指標名</td>
      <td style="padding: 6px 10px;">予想</td>
    </tr>
  </table>

  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="font-size: 11px; color: #999; text-align: center;">
    Powered by OpenClaw | Brave Search API | Yahoo Finance
  </p>
</div>

</body>
</html>
HTMLEOF
```

上記はテンプレート。実際の内容で置き換えてHTMLを生成する。

同時にMarkdownバージョンも保存する:

```bash
# 日付付きで保存（過去のレポートも残す）
cp /tmp/openclaw-daily-news.html ~/.openclaw/workspace/memory/daily-news-latest.html
```

## Step 4: メール送信

```bash
python3 ~/.openclaw/workspace/scripts/send-email.py \
  --subject "📰 デイリーニュース $(date '+%m/%d')" \
  --html-file /tmp/openclaw-daily-news.html
```

送信成功を確認してからmacOS通知:

```bash
osascript -e 'display notification "デイリーニュースをメール送信しました" with title "📰 OpenClaw" sound name "Purr"'
```

## Step 5: 結果返却

- 送信成功 → `[Daily News] ニュース{N}件をメール送信（🔴{n1} 🟡{n2} 🟢{n3}）`
- 送信失敗 → `[Daily News] ERROR: メール送信失敗 — {エラー内容}`

## API使用量管理

- 1回の実行: 約11リクエスト
- 月間（平日のみ22日）: 約242リクエスト
- 既存ジョブと合計: 約930リクエスト/月（無料枠1,000回以内）

## 注意事項

1. ニュースの見出しは日本語に翻訳して記載する
2. 影響度タグは保有銘柄・テーマとの関連性で判断する
3. 売買推奨は出さない — 事実と影響度の分類のみ
4. 同じニュースが複数ソースにある場合は1つにまとめる
5. email-config.json が未設定の場合はファイル保存のみ行い、macOS通知で知らせる
