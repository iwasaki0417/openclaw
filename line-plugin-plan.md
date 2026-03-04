# 独自 LINE プラグイン開発計画

## 背景：ストック LINE プラグインの不具合

### 発生した問題（2026-03-01〜03-03）

LINE Bot が約2日間完全に応答不能になった。

#### 不具合1: Control UI が Webhook POST を横取り（405）

- **場所**: `gateway-cli-*.js` → `handleControlUiHttpRequest`
- **内容**: Gateway の HTTP リクエスト処理で、Control UI ハンドラーがプラグインハンドラーよりも先に呼ばれる。Control UI は GET/HEAD 以外を全て 405 で拒否するため、LINE Webhook の POST がプラグインに到達しない
- **影響**: LINE プラットフォームからの Webhook が全て 405 で失敗

```
リクエスト処理順序:
  1. Canvas Host ハンドラー
  2. Control UI ハンドラー  ← ここで POST が 405 で死ぬ
  3. プラグイン HTTP ハンドラー  ← 到達しない
  4. Probe ハンドラー
```

#### 不具合2: プラグインルートに Gateway 認証を強制（401）

- **場所**: `gateway-cli-*.js` → `shouldEnforceGatewayAuthForPluginPath`
- **内容**: `registerPluginHttpRoute` で登録されたパスに対して、Gateway トークン認証が強制される。LINE プラットフォームからのリクエストには Gateway トークンがないため 401
- **影響**: 不具合1を修正しても、認証で弾かれる

```javascript
// 問題のコード
function shouldEnforceGatewayAuthForPluginPath(registry, pathname) {
  return isProtectedPluginRoutePath(pathname)
    || isRegisteredPluginHttpRoutePath(registry, pathname);
  //    ↑ これが LINE Webhook パスにも true を返す
}
```

#### 不具合3: LINE プロバイダーのクラッシュループ

- **内容**: 上記の不具合により Webhook が機能しないため、LINE プロバイダーが起動→失敗→リトライを繰り返す。10回リトライ後にギブアップし、health-monitor も「3 restarts/hour limit」で復旧不能に
- **影響**: Gateway を手動再起動しない限り復旧しない

#### 不具合4: ngrok トンネルの不安定

- **内容**: 約6分ごとに heartbeat timeout でセッション切断→再接続を繰り返す
- **原因**: ネットワーク環境依存（OpenClaw/LINE の問題ではない）
- **影響**: Webhook の到達が断続的に失敗

### ローカルパッチの脆弱性

- パッチ対象: `~/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/dist/gateway-cli-*.js`
- `openclaw update` で上書きされる
- ファイル名にハッシュが含まれるため、バージョンごとに変わる

---

## なぜ独自プラグインで解決できるか

### ストック LINE プラグイン vs Chatwork プラグインの設計差異

| 項目 | ストック LINE | Chatwork（独自） |
|------|--------------|-----------------|
| Webhook 登録方式 | `registerPluginHttpRoute` | `api.registerHttpHandler` |
| Gateway 認証 | 強制される（バグ） | 対象外 |
| Control UI 干渉 | 受ける（バグ） | 受けない |
| トークン管理 | OpenClaw config + secrets | 設定ファイルから直接読む |
| 署名検証 | OpenClaw コア依存 | 自前で実装 |
| アップデート影響 | OpenClaw 本体と一体 | 独立して管理 |

**核心的な違い**: `registerPluginHttpRoute` vs `api.registerHttpHandler`

- `registerPluginHttpRoute`: Gateway の `httpRoutes` レジストリに登録 → Gateway 認証の対象になる
- `api.registerHttpHandler`: Gateway の `httpHandlers` に登録 → 認証チェックの前に独自で処理できる

Chatwork プラグインは `api.registerHttpHandler` を使っているため、今回のバグの影響を一切受けない。

---

## 開発計画

### ファイル構造（Chatwork をテンプレートに）

```
line/
├── index.ts                  # エントリーポイント
├── openclaw.plugin.json      # プラグイン定義
├── package.json              # パッケージ情報
├── tsconfig.json
└── src/
    ├── channel.ts            # チャネルプラグイン本体
    ├── line-api.ts           # LINE Messaging API クライアント
    ├── formatting.ts         # Markdown → LINE 向けフォーマット
    ├── message.ts            # メッセージ解析
    ├── runtime.ts            # ランタイム保持
    ├── types.ts              # 型定義
    └── webhook.ts            # Webhook 受信・署名検証・処理
```

### 主要な実装ポイント

#### 1. Webhook ハンドラー（最重要）

```typescript
// api.registerHttpHandler で登録 → Gateway 認証を回避
export async function handleLineWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // パスが /line/webhook でなければ false（他のハンドラーに委譲）
  // POST 以外は 405
  // X-Line-Signature で署名検証（自前）
  // events を処理して 200 を返す
}
```

#### 2. 署名検証

```typescript
function verifyLineSignature(body: string, secret: string, signature: string): boolean {
  const hash = crypto.createHmac("SHA256", secret).update(body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}
```

#### 3. LINE Messaging API クライアント

- `replyMessage(replyToken, messages)` — リプライ
- `pushMessage(to, messages)` — プッシュ
- `getBotInfo()` — Bot 情報取得（プローブ用）

#### 4. メッセージ配信

Chatwork と同じ `dispatchReplyWithBufferedBlockDispatcher` パターンを使用。

### 設定例

```json
{
  "channels": {
    "line-custom": {
      "enabled": true,
      "channelAccessToken": "...",
      "channelSecret": "...",
      "webhookPath": "/line-custom/webhook",
      "allowFrom": ["U17a97faba611489cab061d034bfc16ed"]
    }
  },
  "plugins": {
    "entries": {
      "line": { "enabled": false },
      "line-custom": { "enabled": true, "source": "./line" }
    }
  }
}
```

### 移行手順

1. `line/` ディレクトリにプラグインを作成
2. ストックの LINE プラグインを無効化
3. 独自プラグインを有効化
4. LINE Developers の Webhook URL はそのまま（パスを合わせる）
5. Gateway 再起動

### 工数見積もり

Chatwork プラグインをベースにするため、主な作業は LINE API の差し替えのみ。

| 作業 | 見積もり |
|------|---------|
| ファイル構造・設定 | 10分 |
| line-api.ts（API クライアント） | 15分 |
| webhook.ts（署名検証・イベント処理） | 20分 |
| channel.ts（チャネル定義） | 15分 |
| formatting.ts（LINE 向け調整） | 10分 |
| テスト・動作確認 | 15分 |
| **合計** | **約1.5時間** |
