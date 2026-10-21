# 認証メールの設定（Resend + Supabase）

登録の確認・パスワード再設定などのメールを、Anipolis の名前と日本語の文面で、`anipolis.net` から送るための設定。
Supabase の既定（`noreply@mail.app.supabase.io`・英語・supabase.co 経由のリンク）は、組織のメンバー以外にはほぼ届かず、
届いても Anipolis からのメールに見えない。

## 1. Resend

1. Resend に登録し、Domains → Add Domain で `anipolis.net` を追加する（Region は Tokyo `ap-northeast-1`）
2. 表示される DNS レコードを Cloudflare に追加する（Resend の「Sign in to Cloudflare」で自動追加もできる）
   - MX `send` … 送信のエラー（バウンス）の受け取り
   - TXT `send` … SPF（`v=spf1 include:amazonses.com ~all`）
   - TXT `resend._domainkey` … DKIM
   - どれも `send.` のサブドメインと DKIM 用の名前なので、`contact@anipolis.net` などの受信の設定とはぶつからない
   - Cloudflare では、これらのレコードの Proxy を OFF（DNS only）にする
3. DMARC が無ければ、Cloudflare に TXT `_dmarc` = `v=DMARC1; p=none;` を追加する（迷惑メールと判定されにくくなる）
4. Resend で Verify が通るのを待つ
5. API Keys → Create API Key（Permission: Sending access、Domain: `anipolis.net`）。キーは一度しか表示されないので、すぐに次の手順で使う

## 2. Supabase Dashboard

### SMTP（Authentication → Emails → SMTP Settings）

| 項目 | 値 |
|---|---|
| Enable custom SMTP | ON |
| Sender email | `no-reply@anipolis.net` |
| Sender name | `Anipolis` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend の API キー |

### 送信数の上限（Authentication → Rate Limits）

独自の SMTP を設定すると、メールの送信数の上限を変えられる（既定は1時間に30通前後）。クローズドβの規模なら 100 程度で足りる。

### URL（Authentication → URL Configuration）

- Site URL が `https://anipolis.net` になっていること（テンプレートのリンクは `{{ .SiteURL }}` から作る）

### テンプレート（Authentication → Emails → Templates）

**`/auth/confirm` が本番に入ってから差し替える**（先に差し替えると、本番で登録の確認ができなくなる）。

| テンプレート | 件名 | 本文 |
|---|---|---|
| Confirm signup | `【Anipolis】メールアドレスの確認` | `supabase/templates/confirmation.html` |
| Reset password | `【Anipolis】パスワードの再設定` | `supabase/templates/recovery.html` |
| Change email address | `【Anipolis】メールアドレス変更の確認` | `supabase/templates/email_change.html` |
| Reauthentication | `【Anipolis】確認コード` | `supabase/templates/reauthentication.html` |

- 本文はファイルの中身をそのまま貼る
- Reauthentication は、パスワードを持たない（OAuth だけの）利用者が設定 → アカウント → パスワードで初めてパスワードを作るときの確認コード（リンクではなく6桁のコード `{{ .Token }}`）
- リンクは `https://anipolis.net/auth/confirm?token_hash=…`（確認）・`https://anipolis.net/auth/reset-password?token_hash=…`（再設定）になる。
  Anipolis のサーバーで確認するので、申請したのと別の端末・メールアプリのブラウザで開いても通る
- テンプレートを変えたら、このリポジトリのファイルも同じ内容に直す（Dashboard の内容は Git に残らない）

## 3. 確認

- 新しいメールアドレスで登録 → `no-reply@anipolis.net`（差出人 Anipolis）から日本語の確認メールが届き、リンクで登録が完了する
- パスワード再設定を申請 → 日本語のメールが届き、リンクから新しいパスワードを設定できる
- 届かない場合は Resend の Logs と Supabase の Logs（Auth）を見る
