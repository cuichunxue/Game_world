/*
 * GAME WORLD — ゲームカタログ
 * ---------------------------------------------
 * 新しいゲームを追加するときは、下の配列に 1 件追加してください。
 * 詳しくは README.md の「ゲームを投稿する」を参照。
 *
 * id        : 半角英数字とハイフン（URL に使われます）
 * title     : ゲーム名
 * catch     : ひとことキャッチコピー（30字程度）
 * desc      : 説明文
 * author    : クリエイター ID（下の CREATORS のキー）
 * url       : ゲームの URL（このリポジトリ内なら games/<id>/index.html、外部 URL も可）
 * genres    : ジャンル（GENRES のキーから選択、複数可）
 * devices   : "pc" / "mobile"
 * minutes   : 1 プレイの目安（分）
 * langs     : 対応言語
 * added     : 公開日 YYYY-MM-DD
 * emoji     : サムネイル用の絵文字
 * colors    : サムネイル用の 2 色グラデーション
 * thumb     : （任意）画像サムネイルのパス。指定すると emoji より優先
 */

// サイト設定：登録フォームの送信先リポジトリ（owner/repo）
window.SITE = {
  repo: "cuichunxue/Game_world",
};

window.GENRES = {
  action:  { label: "アクション", emoji: "⚡" },
  casual:  { label: "カジュアル", emoji: "🎈" },
  timing:  { label: "タイミング", emoji: "⏱️" },
  party:   { label: "パーティー", emoji: "🎉" },
  puzzle:  { label: "パズル",     emoji: "🧩" },
  comedy:  { label: "おバカ",     emoji: "🤪" },
};

window.CREATORS = {
  cuichunxue: {
    name: "cuichunxue",
    bio: "「KING」シリーズのミニゲームを量産中。短く・バカバカしく・中毒性高め。",
    avatar: "👑",
    color: "#ffc23d",
    link: "https://github.com/cuichunxue",
  },
};

window.GAMES = [
  {
    id: "30-second-panic-king",
    title: "30 SECOND PANIC KING",
    catch: "30秒を信じろ。外したら地獄。",
    desc: "時計が消えた状態で、ぴったり30秒だと思った瞬間に STOP！ バラエティ番組のようなステージで、ライバルたちと体内時計の精度を競う。外せば罰ゲームが待っている。",
    author: "cuichunxue",
    url: "games/30-second-panic-king/index.html",
    genres: ["timing", "party", "comedy"],
    devices: ["pc", "mobile"],
    minutes: 1,
    langs: ["日本語"],
    added: "2026-11-06",
    emoji: "⏱️",
    colors: ["#ff4d6d", "#3a0ca3"],
  },
  {
    id: "golden-egg-chase-king",
    title: "Golden Egg Chase King",
    catch: "牧場を駆けて、金のタマゴを集めまくれ！",
    desc: "柵で囲まれた牧場で、次々と生まれるタマゴをタップしてキャッチ。金のタマゴでスコア大幅アップ、連続キャッチでコンボが伸びる。制限時間内にハイスコアを狙おう。",
    author: "cuichunxue",
    url: "games/golden-egg-chase-king/index.html",
    genres: ["action", "casual"],
    devices: ["pc", "mobile"],
    minutes: 1,
    langs: ["日本語"],
    added: "2026-11-05",
    emoji: "🥚",
    colors: ["#ffc928", "#7cc24a"],
  },
  {
    id: "fart-candle-king",
    title: "Fart Candle King",
    catch: "おならでロウソクを吹き消せ。王になれ。",
    desc: "ためて、ためて……放て！ おならの勢いを調整してロウソクの火を吹き消す、くだらなさ全開のタイミングゲーム。日本語・English・中文の3言語に対応。",
    author: "cuichunxue",
    url: "games/fart-candle-king/index.html",
    genres: ["comedy", "timing", "casual"],
    devices: ["pc", "mobile"],
    minutes: 2,
    langs: ["日本語", "English", "中文"],
    added: "2026-11-04",
    emoji: "🕯️",
    colors: ["#ff5a8f", "#2d1838"],
  },
];
