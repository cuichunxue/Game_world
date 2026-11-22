#!/usr/bin/env python3
"""GAME WORLD — Issue からのゲーム登録を処理する。

使い方（GitHub Actions から呼ばれる）:
  python3 scripts/game_submission.py validate <comment.md>
  python3 scripts/game_submission.py publish  <comment.md>

Issue の本文は誰でも書ける＝信頼できない入力なので、すべて検証してから使う。
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import date
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
GAMES_DIR = ROOT / "games"
CATALOG = ROOT / "games.js"
COMMUNITY = ROOT / "community.js"

GENRES = {"action", "casual", "timing", "party", "puzzle", "comedy"}
DEVICES = {"pc", "mobile"}
ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
ATTACH_RE = re.compile(
    r"https://github\.com/(?:user-attachments/files/\d+/[^\s)\]]+?\.zip"
    r"|[\w.-]+/[\w.-]+/files/\d+/[^\s)\]]+?\.zip)"
)

MAX_ZIP = 20 * 1024 * 1024
MAX_TOTAL = 50 * 1024 * 1024
MAX_FILES = 500
ALLOWED_EXT = {
    ".html", ".htm", ".js", ".mjs", ".css", ".json", ".txt", ".md", ".xml", ".map",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".avif", ".bmp",
    ".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac", ".opus", ".mp4", ".webm",
    ".woff", ".woff2", ".ttf", ".otf", ".wasm", ".data", ".bin", ".glb", ".gltf",
    ".atlas", ".fnt", ".csv", ".tsv",
}

LABELS = {
    "ゲームID": "id",
    "ゲーム名": "title",
    "キャッチコピー": "catch",
    "説明文": "desc",
    "登録方法": "source",
    "ゲームURL": "url",
    "ゲームファイル": "file",
    "ジャンル": "genres",
    "プレイ時間（分）": "minutes",
    "対応端末": "devices",
    "対応言語": "langs",
    "サムネ絵文字": "emoji",
    "サムネ色": "colors",
    "クリエイター表示名": "creator_name",
    "アバター絵文字": "creator_avatar",
    "自己紹介": "creator_bio",
}


class Invalid(Exception):
    pass


# ---------------------------------------------------------------- parsing
def parse_form(body: str) -> dict[str, str]:
    """Issue Forms の `### ラベル\n\n値` 形式を辞書にする。"""
    out: dict[str, str] = {}
    parts = re.split(r"^###\s+(.+?)\s*$", body.replace("\r\n", "\n"), flags=re.M)
    for i in range(1, len(parts) - 1, 2):
        key = LABELS.get(parts[i].strip())
        if not key:
            continue
        val = parts[i + 1].strip()
        if val in ("_No response_", "None"):
            val = ""
        out[key] = val
    return out


def csv(v: str) -> list[str]:
    return [x.strip() for x in re.split(r"[,、，\s]+", v or "") if x.strip()]


def clip(s: str, n: int) -> str:
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", s or "").strip()
    return s[:n]


def load_community() -> dict:
    if not COMMUNITY.exists():
        return {"games": [], "creators": {}}
    text = COMMUNITY.read_text(encoding="utf-8")
    start = text.index("=", text.index("window.COMMUNITY")) + 1
    return json.loads(text[start:].strip().rstrip(";"))


def save_community(data: dict) -> None:
    COMMUNITY.write_text(
        "/* 自動生成ファイル：サイトの「ゲームを登録」から承認されたゲーム。\n"
        " * GitHub Actions (scripts/game_submission.py) が更新します。手で編集する場合は JSON の形を崩さないでください。 */\n"
        "window.COMMUNITY = "
        + json.dumps(data, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )


def existing_ids() -> set[str]:
    ids = set(re.findall(r'\bid:\s*"([^"]+)"', CATALOG.read_text(encoding="utf-8")))
    ids |= {g["id"] for g in load_community()["games"]}
    if GAMES_DIR.exists():
        ids |= {p.name for p in GAMES_DIR.iterdir() if p.is_dir()}
    return ids


# ---------------------------------------------------------------- validation
def build_entry(form: dict[str, str], login: str, issue_no: int) -> tuple[dict, dict, list[str]]:
    errors: list[str] = []
    gid = form.get("id", "").strip().lower()
    if not ID_RE.match(gid):
        errors.append("**ゲームID** は半角英小文字・数字・ハイフンで 3〜40 文字にしてください（先頭と末尾は英数字）。")
    elif gid in existing_ids():
        errors.append(f"ゲームID `{gid}` はすでに使われています。別の ID にしてください。")

    title = clip(form.get("title", ""), 60)
    catch = clip(form.get("catch", ""), 60)
    desc = clip(form.get("desc", ""), 600)
    if not title:
        errors.append("**ゲーム名** を入力してください。")
    if not catch:
        errors.append("**キャッチコピー** を入力してください。")
    if not desc:
        errors.append("**説明文** を入力してください。")

    source = form.get("source", "").strip()
    url = ""
    attach = ""
    if source == "URL":
        url = form.get("url", "").strip()
        if not re.match(r"^https://[^\s\"'<>]+$", url) or len(url) > 300:
            errors.append("**ゲームURL** は `https://` から始まる URL を入力してください。")
    elif source == "ファイル":
        m = ATTACH_RE.search(form.get("file", ""))
        if not m:
            errors.append("**ゲームファイル** 欄に zip ファイルが添付されていません。Issue を編集して zip をドラッグ＆ドロップしてください。")
        else:
            attach = m.group(0)
            url = f"games/{gid}/index.html"
    else:
        errors.append("**登録方法** を選んでください。")

    genres = [g for g in (x.lower() for x in csv(form.get("genres", ""))) if g in GENRES]
    if not genres:
        errors.append("**ジャンル** を1つ以上指定してください（" + ", ".join(sorted(GENRES)) + "）。")
    devices = [d for d in (x.lower() for x in csv(form.get("devices", ""))) if d in DEVICES] or ["pc", "mobile"]
    try:
        minutes = max(1, min(120, int(re.sub(r"\D", "", form.get("minutes", "")) or 1)))
    except ValueError:
        minutes = 1
    langs = [clip(x, 20) for x in csv(form.get("langs", ""))][:6] or ["日本語"]
    emoji = clip(form.get("emoji", ""), 8) or "🎮"
    colors = [c for c in csv(form.get("colors", "")) if COLOR_RE.match(c)][:2]
    if len(colors) < 2:
        colors = ["#4d9bff", "#ff5a8f"]

    entry = {
        "id": gid,
        "title": title,
        "catch": catch,
        "desc": desc,
        "author": login,
        "url": url,
        "genres": genres[:4],
        "devices": devices,
        "minutes": minutes,
        "langs": langs,
        "added": date.today().isoformat(),
        "emoji": emoji,
        "colors": colors,
        "issue": issue_no,
    }
    creator = {
        "name": clip(form.get("creator_name", ""), 30) or login,
        "bio": clip(form.get("creator_bio", ""), 120),
        "avatar": clip(form.get("creator_avatar", ""), 8) or "🙂",
        "color": colors[0],
        "link": f"https://github.com/{login}",
    }
    entry["_attach"] = attach
    return entry, creator, errors


# ---------------------------------------------------------------- zip handling
def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "game-world-bot"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read(MAX_ZIP + 1)
    if len(data) > MAX_ZIP:
        raise Invalid("zip ファイルが 20MB を超えています。")
    return data


def inspect_zip(data: bytes) -> tuple[zipfile.ZipFile, list[tuple[zipfile.ZipInfo, str]]]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise Invalid("zip ファイルとして開けませんでした。")
    infos = [i for i in zf.infolist() if not i.is_dir()]
    infos = [i for i in infos if not (i.filename.startswith("__MACOSX/") or PurePosixPath(i.filename).name in (".DS_Store", "Thumbs.db"))]
    if not infos:
        raise Invalid("zip が空です。")
    if len(infos) > MAX_FILES:
        raise Invalid(f"ファイル数が多すぎます（最大 {MAX_FILES}）。")
    if sum(i.file_size for i in infos) > MAX_TOTAL:
        raise Invalid("展開後のサイズが 50MB を超えています。")

    names = [i.filename.replace("\\", "/") for i in infos]
    # index.html が 1 階層下にある場合（my-game/index.html）はその階層を外す
    prefix = ""
    if "index.html" not in names:
        tops = {n.split("/", 1)[0] for n in names}
        if len(tops) == 1 and f"{next(iter(tops))}/index.html" in names:
            prefix = next(iter(tops)) + "/"
        else:
            raise Invalid("zip の一番上（またはフォルダ1つの直下）に `index.html` が必要です。")

    out = []
    for info, name in zip(infos, names):
        rel = name[len(prefix):] if prefix and name.startswith(prefix) else name
        p = PurePosixPath(rel)
        if p.is_absolute() or ".." in p.parts or not rel or rel.startswith("/"):
            raise Invalid(f"不正なパスが含まれています: `{name}`")
        if (info.external_attr >> 16) & 0o170000 == 0o120000:
            raise Invalid(f"シンボリックリンクは使えません: `{name}`")
        if p.suffix.lower() not in ALLOWED_EXT:
            raise Invalid(f"使えない種類のファイルが含まれています: `{name}`")
        out.append((info, rel))
    return zf, out


def extract(zf: zipfile.ZipFile, items, dest: Path) -> int:
    dest.mkdir(parents=True, exist_ok=False)
    for info, rel in items:
        target = (dest / rel).resolve()
        if dest.resolve() not in target.parents:
            raise Invalid(f"不正なパスが含まれています: `{rel}`")
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src, open(target, "wb") as dst:
            dst.write(src.read(MAX_TOTAL))
    return len(items)


# ---------------------------------------------------------------- main
def event() -> dict:
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as f:
        return json.load(f)


def output(key: str, val: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{key}={val}\n")


def review_days() -> str:
    v = (os.environ.get("REVIEW_DAYS") or "").strip()
    return v if v.isdigit() and 0 < int(v) < 100 else "3"


def site_url() -> str:
    """公開サイトの URL。リポジトリ変数 SITE_URL があれば優先、なければ GitHub Pages の URL を推定。"""
    v = (os.environ.get("SITE_URL") or "").strip()
    if re.match(r"^https://[^\s\"'<>]+$", v):
        return v if v.endswith("/") else v + "/"
    owner, _, repo = (os.environ.get("GITHUB_REPOSITORY") or "owner/repo").partition("/")
    host = f"{owner.lower()}.github.io"
    return f"https://{host}/" if repo.lower() == host else f"https://{host}/{repo}/"


def share_block(entry: dict) -> str:
    url = f"{site_url()}#game={urllib.parse.quote(entry['id'])}"
    text = f"「{entry['title']}」を GAME WORLD で公開しました！ {entry['catch']} #GAMEWORLD #個人開発 #ミニゲーム".replace("`", "'")
    intent = "https://twitter.com/intent/tweet?" + urllib.parse.urlencode({"text": text, "url": url})
    return (
        f"▶ **遊ぶ・共有する:** {url}\n\n"
        f"[𝕏 でシェアする]({intent})\n\n"
        "シェア用の文面（コピーして使えます）:\n\n"
        f"```\n{text}\n{url}\n```"
    )


def preview(entry: dict) -> str:
    rows = [
        ("ゲームID", f"`{entry['id']}`"),
        ("ゲーム名", entry["title"]),
        ("キャッチコピー", entry["catch"]),
        ("ジャンル", ", ".join(entry["genres"])),
        ("プレイ時間", f"{entry['minutes']} 分"),
        ("対応端末", ", ".join(entry["devices"])),
        ("登録方法", "ファイル（zip）" if entry["_attach"] else f"URL: {entry['url']}"),
    ]
    return "| 項目 | 内容 |\n|---|---|\n" + "\n".join(f"| {k} | {str(v).replace('|', '／')} |" for k, v in rows)


def main() -> int:
    mode, comment_path = sys.argv[1], Path(sys.argv[2])
    ev = event()
    issue = ev["issue"]
    login = issue["user"]["login"]
    form = parse_form(issue.get("body") or "")
    entry, creator, errors = build_entry(form, login, issue["number"])

    if not errors and entry["_attach"]:
        try:
            zf, items = inspect_zip(download(entry["_attach"]))
            entry["_files"] = len(items)
            if mode == "publish":
                extract(zf, items, GAMES_DIR / entry["id"])
        except Invalid as e:
            errors.append(str(e))
        except Exception as e:  # noqa: BLE001 network etc.
            errors.append(f"zip ファイルを取得できませんでした（{type(e).__name__}）。")

    if errors:
        comment_path.write_text(
            "### ❌ 登録内容に問題があります\n\n"
            + "\n".join(f"- {e}" for e in errors)
            + "\n\nIssue を **編集** して修正すると、自動で再チェックされます。",
            encoding="utf-8",
        )
        output("ok", "false")
        return 0

    files_note = f"\n\nzip の中身: {entry.get('_files', 0)} ファイル（`index.html` あり）" if entry["_attach"] else ""
    if mode == "validate":
        comment_path.write_text(
            "### ✅ 自動チェックOK\n\n" + preview(entry) + files_note
            + "\n\n管理者が内容を確認して `approved` ラベルを付けると、サイトに自動で公開されます。"
            + f"\n\n⏳ **審査の目安: {review_days()} 日以内**（混み合っている場合は少し遅れることがあります）。"
            + "公開されるとこの Issue にコメントが付き、GitHub から通知が届きます。",
            encoding="utf-8",
        )
        output("ok", "true")
        return 0

    # publish
    data = load_community()
    clean = {k: v for k, v in entry.items() if not k.startswith("_")}
    data["games"].append(clean)
    data.setdefault("creators", {}).setdefault(login, creator)
    save_community(data)
    output("ok", "true")
    output("game_id", entry["id"])
    comment_path.write_text(
        f"### 🎉 公開しました！\n\n**{entry['title']}** を GAME WORLD に追加しました。"
        "\nサイトに反映されるまで数分かかることがあります。登録ありがとうございました！\n\n"
        + share_block(entry)
        + f"\n\n📈 **あなたのページ:** {site_url()}#creator={urllib.parse.quote(login)}\n"
        "作品ごとのプレイ数・全体での順位・プレイヤーからのリアクション（😂 🔥 👍）をここでいつでも確認できます。ブックマークしておくと便利です。",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
