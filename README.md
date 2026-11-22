# 🎮 GAME WORLD — みんなのゲーム広場

個人開発者たちが作ったミニゲームを集めて、共有するためのポータルサイトです。
ビルド不要の静的サイトなので、GitHub Pages にそのまま置けば動きます。

## 機能

- ゲーム一覧（カード表示・NEW バッジ・新着ピックアップ）
- キーワード検索／ジャンル絞り込み／並び替え（新着・古い順・名前・プレイ時間）
- お気に入り登録（ブラウザに保存）
- 詳細モーダル（スペック・おすすめ作品・共有リンク `#game=<id>`）
- サイト内プレイヤー（iframe・全画面・別タブで開く）
- クリエイター一覧（クリックでその人の作品だけ表示）
- **プレイ数の集計と人気ランキング**（「遊ぶ」の回数。同じ端末は6時間に1回）
- **削除依頼**（作者本人なら自動削除、それ以外は管理者承認）
- **サイトからゲームを登録**（URL または HTML / zip ファイル）→ GitHub Issue → 自動チェック → 管理者承認で自動公開
- ライト／ダークモード、スマホ対応

## ファイル構成

```
index.html        サイト本体
games.js          運営が手で管理するゲーム・クリエイター・ジャンル・サイト設定
community.js      サイトから登録・承認されたゲーム（GitHub Actions が自動更新）
assets/vendor/    JSZip（ブラウザで HTML を zip にする）
scripts/game_submission.py           登録内容の検証・公開処理
.github/ISSUE_TEMPLATE/submit-game.yml  登録用 Issue フォーム
.github/workflows/game-submission.yml   自動チェック・自動公開
assets/style.css  デザイン
assets/app.js     動作
games/<id>/       各ゲーム（index.html）
```

## ゲームを登録する（利用者向け）

1. サイトの「＋ 登録」を開き、**URL** か **ファイル（HTML / zip）** を選んでフォームに入力
2. 「GitHub で送信する」→ 入力済みの GitHub Issue 画面が開くので **Create** を押す
   - ファイルの場合は、自動で保存された zip を「ゲームファイル」欄にドラッグ＆ドロップ
   - HTML 1枚のゲームはサイトが自動で zip にします。画像・音声がある場合は `index.html` を含むフォルダごと zip に
3. 数十秒で自動チェック結果がコメントされます（NG なら Issue を編集すると再チェック）
4. 管理者が承認すると自動でサイトに追加され、Issue がクローズされます

※ 送信には無料の GitHub アカウントが必要です。

## 審査と公開（管理者向け）

- 自動チェック OK のコメントが付いた Issue を確認し、**`approved` ラベルを付ける** と公開されます
  - URL 登録 → `community.js` に追加
  - ファイル登録 → zip を検証して `games/<ID>/` に展開し、`community.js` に追加
- ラベルを付けられるのはトリアージ権限以上の人だけです
- 公開をやめる場合は `community.js` から該当エントリを、ファイル登録なら `games/<ID>/` も削除してください
- 自動チェックの内容：ID の形式・重複、必須項目、https の URL、zip のサイズ（20MB / 展開後 50MB）、ファイル数（500）、
  `index.html` の有無、不正なパス・シンボリックリンク・許可されていない拡張子

## 削除依頼

- ゲーム詳細の下の「このゲームの削除を依頼」から、削除依頼の Issue（`[削除依頼]`）が開きます
- **登録したときと同じ GitHub アカウント**（作者本人）、またはリポジトリの管理者（write 以上）からの依頼は **自動で削除** され、Issue が閉じられます
- それ以外の人からの依頼は「受け付けました」とコメントされ、管理者が `approved` ラベルを付けると削除されます
- 削除されるもの：`community.js` の登録データ、ファイル登録の場合は `games/<ID>/`、作品がなくなったクリエイター情報
- `games.js`（運営が手で管理）のゲームは自動削除の対象外です。管理者が手で対応してください
- 処理: `scripts/game_removal.py`、`.github/workflows/game-removal.yml`、`.github/ISSUE_TEMPLATE/remove-game.yml`

## プレイ数とランキング

- 「遊ぶ」を押すと、無料のカウンター API（[Abacus](https://abacus.jasoncameron.dev)）でゲームごとの回数を +1 します
- 同じ端末・同じゲームは 6 時間に 1 回だけ数えます（端末のブラウザに記録。ログインはありません）
- 取得結果はブラウザに 5 分間キャッシュし、API の制限（10 秒に 30 回）を超えないように取得します
- API に接続できないときは、ランキングに「読み込めませんでした」と表示され、他の機能はそのまま使えます
- 設定は `games.js` の `SITE.stats`（`namespace` はサイト固有の名前）。`stats` を消すと集計とランキングを止められます
- 注意：公開 API のため、意図的な水増しは完全には防げません。第三者の無料サービスなので停止する可能性もあります。
  ゲーム数が数十を超える、または厳密さが必要になったら、専用のデータベース（Supabase など）への切り替えをおすすめします

### 初期設定

1. このブランチをリポジトリの **デフォルトブランチ** にマージする（Issue テンプレートとワークフローはデフォルトブランチのものが使われます）
2. Settings → Pages でデフォルトブランチの `/ (root)` を公開
3. Settings → General → Features で **Issues** を有効にする
4. 送信先を変える場合は `games.js` の `SITE.repo` を編集
5. 審査の目安日数は `games.js` の `SITE.reviewDays`（サイトの FAQ・送信後の案内）と、
   Settings → Secrets and variables → Actions → Variables の `REVIEW_DAYS`（自動チェックのコメント）で設定（どちらも既定 3 日）
6. 独自ドメインなどで公開する場合は、同じ画面の Variables に `SITE_URL`（例: `https://games.example.com/`）を設定。
   未設定なら `https://<owner>.github.io/<repo>/` を公開完了コメントのリンクに使います
7. ラベル `game-submission` / `approved` は初回の登録時に自動で作られます

## Pull Request で直接追加する（上級者向け）

1. このリポジトリを Fork する
2. `games/<ゲームID>/index.html` にゲームを置く（外部で公開済みなら URL だけでも可）
3. `games.js` の `GAMES` 配列に 1 件追加し、初投稿なら `CREATORS` にプロフィールを追加
4. Pull Request を送る

```js
{
  id: "my-awesome-game",
  title: "My Awesome Game",
  catch: "ひとことキャッチコピー",
  desc: "どんなゲームか、遊び方",
  author: "your-github-id",
  url: "games/my-awesome-game/index.html",
  genres: ["casual"],          // GENRES のキー
  devices: ["pc", "mobile"],
  minutes: 1,
  langs: ["日本語"],
  added: "2026-11-22",
  emoji: "🚀",                  // サムネイル
  colors: ["#4d9bff", "#ff5a8f"],
},
```

### 投稿ルール

- ブラウザだけで動くこと（HTML / JS / CSS）
- 外部への不正な通信・個人情報の収集をしないこと
- 自分が権利を持つ素材だけを使うこと

## ローカルで確認

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## 公開（GitHub Pages）

リポジトリの Settings → Pages → Branch を選んで `/ (root)` を指定するだけです。
