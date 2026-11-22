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
- 投稿ガイドと登録データのジェネレーター
- ライト／ダークモード、スマホ対応

## ファイル構成

```
index.html        サイト本体
games.js          ゲーム・クリエイター・ジャンルのデータ  ← 投稿時に編集するのはここ
assets/style.css  デザイン
assets/app.js     動作
games/<id>/       各ゲーム（index.html）
```

## ゲームを投稿する

1. このリポジトリを Fork する
2. `games/<ゲームID>/index.html` にゲームを置く（外部で公開済みなら URL だけでも可）
3. `games.js` の `GAMES` 配列に 1 件追加する（サイト下部のジェネレーターでコードを作れます）
4. 初めての投稿なら `CREATORS` に自分のプロフィールを追加する
5. Pull Request を送る

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
  // thumb: "games/my-awesome-game/thumb.png"  // 画像サムネを使う場合
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
