# OpenClaw News

> 毎朝、ニュース・決算・ポートフォリオ状況を統合したHTMLメールを送信する。

---

## Step 0: 準備

```bash
cat ~/.openclaw/workspace/memory/watchlist.json
cat ~/.openclaw/workspace/memory/stock-history.json
cat ~/.openclaw/workspace/memory/dca-schedule.json
```

## Step 1: 週間パフォーマンス取得（Yahoo Finance）

保有全銘柄の5日間パフォーマンスを取得する。

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
    print(json.dumps({'ticker': r['meta']['symbol'], 'price': valid[-1], 'changePct': weekly_change}))
"
```

各銘柄を1つずつ取得。各リクエスト間に `sleep 2`。
USD/JPYレートも取得し、米国株の円換算に使用する。

## Step 2: 決算日チェック（Brave Search）

ETF（SPY, URA）と日本株（1326.T, 1542.T）を除く米国個別株について、7日以内の決算予定を検索。

```bash
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/web/search?q={TICKER}+earnings+date+2026&count=3&search_lang=en" \
  --compressed
```

7日以内の決算がある銘柄は「📅 今週の注目日」セクションに含める。
各リクエスト間に `sleep 3`。対象: ETN, IONQ, MDB, NVDA, PLTR, QBTS, RGTI, TSLA, TSM, VRT（最大10リクエスト）

## Step 3: ニュース収集（Brave Search）

以下の8カテゴリを順番に検索する。各リクエスト間に `sleep 3`。

### 3a. 保有銘柄ニュース（主要5銘柄: NVDA, TSLA, TSM, SPY, PLTR）

```bash
curl -s -H "Accept: application/json" \
  -H "Accept-Encoding: gzip" \
  -H "X-Subscription-Token: BSAlseaSif-ZMsqyEqYYLmee9XsGtnE" \
  "https://api.search.brave.com/res/v1/news/search?q={TICKER}+stock&count=3&search_lang=en&freshness=pd" \
  --compressed
```

### 3b. 経済指標・金融政策

`q=economic+data+CPI+jobs+report+FOMC+Fed+this+week&count=5&freshness=pw`

### 3c. 貴金属（金・銀）

`q=gold+silver+price&count=3&freshness=pd`

### 3d. ウラン・原子力

`q=uranium+nuclear+energy&count=3&freshness=pw`

### 3e. AI・半導体

`q=AI+semiconductor+chip+market&count=3&freshness=pd`

### 3f. 地政学・関税・規制

`q=tariff+trade+war+regulation+market+impact&count=3&freshness=pw`

### 3g. 量子コンピューティング

`q=quantum+computing+IONQ+QBTS+RGTI&count=3&freshness=pw`

### 3h. データセンターインフラ

`q=data+center+power+cooling+infrastructure&count=3&freshness=pw`

合計: 5（銘柄）+ 1 + 1 + 1 + 1 + 1 + 1 + 1 = **12ニュースリクエスト**
決算チェック: 最大 **10リクエスト**
合計: 最大 **22リクエスト/回**

## Step 4: パフォーマンスバーチャート生成（QuickChart）

Step 1で取得した週間パフォーマンスデータから、QuickChartで横棒グラフ画像を生成する。
銘柄は**保有額の大きい順**に並べる。

```bash
python3 -c "
import urllib.parse, json

labels = ['NVDA','SPY','TSLA','TSM','PLTR','URA','MDB','VRT','ETN','1326.T','1542.T','IONQ','QBTS','RGTI']
data = [1.2, -0.3, 2.5, -1.1, 3.2, -0.5, -2.1, 1.8, -0.7, 0.8, 1.5, -4.2, 5.1, -3.3]  # Step 1の実データで置き換え

colors = ['#2ecc71' if v >= 0 else '#e74c3c' for v in data]
chart = {
    'type': 'horizontalBar',
    'data': {
        'labels': labels,
        'datasets': [{
            'data': data,
            'backgroundColor': colors,
            'borderWidth': 0,
            'barThickness': 18
        }]
    },
    'options': {
        'legend': {'display': False},
        'scales': {
            'xAxes': [{'ticks': {'callback': '(v) => v + \"%\"'}, 'gridLines': {'color': '#eee'}}],
            'yAxes': [{'gridLines': {'display': False}}]
        },
        'plugins': {
            'datalabels': {
                'anchor': 'end', 'align': 'end', 'color': '#555', 'font': {'size': 11},
                'formatter': '(v) => (v >= 0 ? \"+\" : \"\") + v.toFixed(1) + \"%\"'
            }
        }
    }
}
url = 'https://quickchart.io/chart?w=560&h=320&bkg=white&f=png&c=' + urllib.parse.quote(json.dumps(chart))
print(url)
" > /tmp/chart-url.txt

curl -s -o /tmp/openclaw-performance-bar.png "$(cat /tmp/chart-url.txt)"
```

## Step 5: 分析とフィルタリング

収集した全データを以下の基準で分類する:

### 影響度タグ
- 🔴 **要注意**: ポートフォリオに直接影響（決算、業績、M&A、急な規制変更）
- 🟡 **注視**: 間接影響（金利変動、為替、セクター全体のトレンド）
- 🟢 **参考**: 知っておくと良い背景情報

### KEY DRIVERS（6項目）
以下のドライバーについて、今週の方向性を判定する:
1. AI半導体需要 → NVDA, TSM, PLTR, VRTに影響
2. 米金利見通し → グロース株全体 + 貴金属に逆相関
3. 地政学リスク → TSM（台湾有事）, NVDA（対中規制）, 貴金属
4. 金銀価格 → 1326.T, 1542.T（ポートフォリオの約50%）
5. 量子セクター → IONQ, QBTS, RGTI
6. DCインフラ需要 → VRT, ETN

### ポートフォリオ影響サマリー
全データを踏まえ、ポートフォリオ全体への影響を3-4行で要約する。ヘッジ構造（グロース vs 貴金属）を意識。

### 今週のアクション
- DCAスケジュール（dca-schedule.json参照）
- スポット買い候補（spotBuy条件に近い銘柄があれば）
- 決算前後の注意事項

### セクター別展望（6セクター）
1. 🤖 AI・半導体（NVDA, TSM, PLTR）
2. 🥇 貴金属（1326.T, 1542.T）
3. ☢️ ウラン（URA）
4. 🖥️ DCインフラ（VRT, ETN）
5. ⚛️ 量子コンピューティング（IONQ, QBTS, RGTI）
6. 🚗 テスラ（TSLA）— 必要な場合のみ

## Step 6: HTMLメール生成

以下のテンプレートに厳密に従ってHTMLを生成する。**構造やスタイルを変更してはいけない。**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,'Helvetica Neue',Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:0;color:#333;background:#f0f0f5">
<div style="background:white;border-radius:10px;overflow:hidden">

<!-- ===== HEADER ===== -->
<div style="background:#1a1a2e;color:white;padding:20px 24px">
	<table style="width:100%;border-collapse:collapse">
		<tr>
			<td style="width:40px;vertical-align:middle">
				<img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/openclaw.png" alt="OpenClaw" style="width:36px;height:36px;border-radius:8px">
			</td>
			<td style="padding-left:12px;vertical-align:middle">
				<h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.5px">OpenClaw News</h1>
				<p style="margin:2px 0 0;font-size:13px;opacity:0.7">{YYYY}年{MM}月{DD}日（{曜日}）</p>
			</td>
		</tr>
	</table>
</div>

<!-- ===== PORTFOLIO IMPACT SUMMARY ===== -->
<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:white;padding:20px 24px">
	<div style="font-size:14px;font-weight:700;margin-bottom:14px;opacity:0.9">📌 あなたのポートフォリオへの影響サマリー</div>
	<div style="font-size:13px;line-height:1.8;opacity:0.95">
		{ポートフォリオ影響サマリー: 3-4行。太字で重要ポイントを強調。}
	</div>
</div>

<!-- ===== KEY DRIVERS ===== -->
<div style="background:#16213e;color:white;padding:16px 24px">
	<div style="font-size:12px;font-weight:600;margin-bottom:10px;opacity:0.7;letter-spacing:0.5px">KEY DRIVERS</div>
	<table style="width:100%;border-collapse:collapse;font-size:13px">
		<!-- 各行: ドライバー名 | 方向（色付き） | 短い説明 -->
		<!-- 色: 上昇/強い=#2ecc71  下落/逆風=#e74c3c  警戒=#e67e22 -->
		<tr>
			<td style="padding:4px 0;opacity:0.9">{ドライバー名}</td>
			<td style="padding:4px 0;text-align:right"><span style="color:{色}">▲ {状態}</span></td>
			<td style="padding:4px 0;padding-left:12px;font-size:11px;opacity:0.6">{短い説明}</td>
		</tr>
		<!-- 6行繰り返し -->
	</table>
</div>

<!-- ===== ACTION ITEMS ===== -->
<div style="background:#1a1a2e;color:white;padding:16px 24px">
	<div style="font-size:12px;font-weight:600;margin-bottom:8px;opacity:0.7;letter-spacing:0.5px">💡 今週のアクション</div>
	<div style="font-size:13px;line-height:1.8;opacity:0.95">
		<b>定期積立:</b> {DCAスケジュール}<br>
		<b>スポット買い:</b> {候補と条件}<br>
		<b>{その他注意事項}</b>
	</div>
</div>

<!-- ===== PERFORMANCE CHART ===== -->
<div style="padding:24px 24px 0">
	<div style="font-size:12px;font-weight:600;color:#888;margin-bottom:6px;letter-spacing:0.3px">週間パフォーマンス（保有額順）</div>
</div>
<div style="padding:0 0 24px">
	<img src="cid:performance-bar" width="100%" style="display:block" alt="Weekly Performance">
</div>

<!-- ===== CALENDAR ===== -->
<div style="background:#f5f5ff;padding:20px 24px 24px;margin-bottom:2px">
	<h2 style="font-size:16px;margin:0 0 16px 0;color:#444">📅 今週の注目日</h2>

	<!-- 日付カード: 重要度により border-left の色を変える -->
	<!-- 🔴最重要=#e74c3c  🟡注意=#f39c12  🟢参考=#27ae60 -->
	<div style="border-left:3px solid {色};padding:12px 16px;margin-bottom:12px;background:white;border-radius:0 10px 10px 0">
		<div style="font-size:14px;font-weight:700;color:{色}">{M/D}（{曜}）— {重要度ラベル}</div>
		<div style="font-size:13px;color:#555;margin-top:4px;line-height:1.6">
			{説明。保有銘柄への影響を太字で。}
		</div>
	</div>
	<!-- 日付カードを繰り返し（経済指標 + 決算日） -->
</div>

<!-- ===== 🔴 要注意 ===== -->
<div style="padding:24px 24px 0">
	<h2 style="font-size:16px;border-left:4px solid #e74c3c;padding-left:12px;margin:0 0 16px 0;color:#e74c3c">🔴 要注意</h2>
</div>
<!-- ニュース項目を繰り返し -->
<div style="background:#fef5f5;padding:16px 24px;margin-bottom:2px">
	<div style="font-size:15px;font-weight:600;margin-bottom:6px">
		<a href="{記事URL}" style="color:#333;text-decoration:none">{日本語の見出し}</a>
		<span style="float:right;font-size:12px;font-weight:400"><a href="{ソースURL}" style="color:#aaa;text-decoration:none">{ソース名}</a></span>
	</div>
	<div style="clear:both;font-size:13px;color:#444;line-height:1.7;border-left:3px solid #e74c3c;padding-left:12px;margin-top:8px">
		{ポートフォリオへの影響分析。保有銘柄名と株数を含め、太字で重要ポイントを強調。}
	</div>
</div>

<!-- ===== 🟡 注視 ===== -->
<div style="padding:24px 24px 0">
	<h2 style="font-size:16px;border-left:4px solid #f39c12;padding-left:12px;margin:0 0 16px 0;color:#e67e22">🟡 注視</h2>
</div>
<!-- 背景色: #fffaf0, border-left: #f39c12 -->
<div style="background:#fffaf0;padding:16px 24px;margin-bottom:2px">
	<!-- 同じ構造で繰り返し -->
</div>

<!-- ===== 🟢 参考 ===== -->
<div style="padding:24px 24px 0">
	<h2 style="font-size:16px;border-left:4px solid #27ae60;padding-left:12px;margin:0 0 16px 0;color:#27ae60">🟢 参考</h2>
</div>
<!-- 背景色: #f0faf0, border-left: #27ae60 -->
<div style="background:#f0faf0;padding:16px 24px;margin-bottom:2px">
	<!-- 同じ構造で繰り返し -->
</div>

<!-- ===== SECTOR OUTLOOK ===== -->
<div style="padding:24px 24px 0">
	<h2 style="font-size:16px;color:#444;margin:0 0 16px 0">📊 セクター別展望</h2>
</div>
<!-- セクターごとに異なる背景色 -->
<div style="background:#f8f8ff;padding:16px 24px;margin-bottom:2px">
	<div style="font-size:15px;font-weight:600;margin-bottom:6px">🤖 AI・半導体 <span style="font-size:12px;color:#888;font-weight:400">NVDA, TSM, PLTR</span></div>
	<div style="font-size:13px;color:#555;line-height:1.7">{展望}</div>
</div>
<div style="background:#fffff0;padding:16px 24px;margin-bottom:2px">
	<div style="font-size:15px;font-weight:600;margin-bottom:6px">🥇 貴金属 <span style="font-size:12px;color:#888;font-weight:400">1326.T, 1542.T</span></div>
	<div style="font-size:13px;color:#555;line-height:1.7">{展望}</div>
</div>
<div style="background:#f0fff0;padding:16px 24px;margin-bottom:2px">
	<div style="font-size:15px;font-weight:600;margin-bottom:6px">☢️ ウラン <span style="font-size:12px;color:#888;font-weight:400">URA</span></div>
	<div style="font-size:13px;color:#555;line-height:1.7">{展望}</div>
</div>
<div style="background:#f5f0ff;padding:16px 24px;margin-bottom:2px">
	<div style="font-size:15px;font-weight:600;margin-bottom:6px">🖥️ DCインフラ <span style="font-size:12px;color:#888;font-weight:400">VRT, ETN</span></div>
	<div style="font-size:13px;color:#555;line-height:1.7">{展望}</div>
</div>
<div style="background:#f0f8ff;padding:16px 24px">
	<div style="font-size:15px;font-weight:600;margin-bottom:6px">⚛️ 量子コンピューティング <span style="font-size:12px;color:#888;font-weight:400">IONQ, QBTS, RGTI</span></div>
	<div style="font-size:13px;color:#555;line-height:1.7">{展望}</div>
</div>

<!-- ===== FOOTER ===== -->
<div style="padding:20px 24px;border-top:1px solid #eee">
	<table style="width:100%;font-size:11px;color:#bbb">
		<tr>
			<td>
				<img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/openclaw.png" alt="" style="width:16px;height:16px;border-radius:3px;vertical-align:middle">
				<span style="margin-left:4px">OpenClaw News</span>
			</td>
			<td style="text-align:right">🔴{n} 🟡{n} 🟢{n}</td>
		</tr>
		<tr>
			<td colspan="2" style="padding-top:6px;font-size:10px;color:#ccc">
				Brave Search API: 今回 {N}req · 今月推定 ~{N}/1,000（残 ~{N}）
			</td>
		</tr>
	</table>
</div>

</div>
</body>
</html>
```

⚠️ **テンプレート厳守ルール:**
- 上記のHTMLセクション構成・CSS・色を変更しない
- `{プレースホルダー}` を実データで置き換える
- ニュース項目数は可変だが、各カテゴリの構造は同じ
- セクター展望は常に5セクター（重要なニュースがないセクターでも省略しない）
- ソースが複数ある場合は `&nbsp;·&nbsp;` で繋ぐ

## Step 7: ファイル保存とメール送信

```bash
# HTMLファイル保存
cp /tmp/openclaw-daily-news.html ~/.openclaw/workspace/memory/daily-news-latest.html

# メール送信（パフォーマンスチャート埋め込み）
python3 ~/.openclaw/workspace/scripts/send-email.py \
  --subject "OpenClaw News $(date '+%m/%d')" \
  --html-file /tmp/openclaw-daily-news.html \
  --image performance-bar:/tmp/openclaw-performance-bar.png
```

## Step 8: macOS通知と結果返却

```bash
osascript -e 'display notification "OpenClaw Newsをメール送信しました" with title "📰 OpenClaw News" sound name "Purr"'
```

- 送信成功 → `[OpenClaw News] ニュース{N}件をメール送信（🔴{n1} 🟡{n2} 🟢{n3}）`
- 送信失敗 → `[OpenClaw News] ERROR: メール送信失敗 — {エラー内容}`

## API使用量管理

- 1回の実行: 約22リクエスト（ニュース12 + 決算10）
- 月間（平日22日）: 約484リクエスト
- stock-jp-midday HEARTBEAT: 約0-2リクエスト/日（アラート時のみ）
- 月間合計: 約500-530リクエスト（無料枠1,000回以内）

## 注意事項

1. ニュースの見出しは日本語に翻訳して記載する
2. 影響度タグは保有銘柄・テーマとの関連性で判断する
3. 売買推奨は出さない — 事実と影響度の分類のみ
4. 同じニュースが複数ソースにある場合は1つにまとめる
5. 決算検索で日付が不明な銘柄は省略（無理に推測しない）
6. email-config.json が未設定の場合はファイル保存のみ行い、macOS通知で知らせる
7. HTMLテンプレートの構造・スタイル・色を勝手に変更しない
