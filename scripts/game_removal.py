#!/usr/bin/env python3
"""GAME WORLD — Issue からの削除依頼を処理する。

使い方（GitHub Actions から呼ばれる）:
  python3 scripts/game_removal.py check  <comment.md>   # 依頼の確認（AUTHORIZED=true なら即削除してよいか判定）
  python3 scripts/game_removal.py remove <comment.md>   # 削除を実行（community.js と games/<id>/）

環境変数:
  AUTHORIZED   "true" のとき依頼者はリポジトリの管理者（write 以上）
  APPROVED     "true" のとき管理者が approved ラベルで承認済み

出力（GITHUB_OUTPUT）:
  action = remove | wait | reject
  game_id
"""
from __future__ import annotations

import os
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from game_submission import (  # noqa: E402
    CATALOG,
    GAMES_DIR,
    ID_RE,
    clip,
    event,
    load_community,
    output,
    save_community,
)

LABELS = {"ゲームID": "id", "削除理由": "reason", "詳細": "detail"}


def parse(body: str) -> dict[str, str]:
    out: dict[str, str] = {}
    parts = re.split(r"^###\s+(.+?)\s*$", body.replace("\r\n", "\n"), flags=re.M)
    for i in range(1, len(parts) - 1, 2):
        key = LABELS.get(parts[i].strip())
        if key:
            val = parts[i + 1].strip()
            out[key] = "" if val in ("_No response_", "None") else val
    return out


def curated_ids() -> set[str]:
    return set(re.findall(r'\bid:\s*"([^"]+)"', CATALOG.read_text(encoding="utf-8")))


def decide(form: dict[str, str], login: str) -> tuple[str, str, dict | None]:
    """(action, message, entry) を返す。"""
    gid = form.get("id", "").strip().lower()
    if not ID_RE.match(gid):
        return "reject", "**ゲームID** が正しくありません。サイトのゲーム詳細にある「削除を依頼」から開き直すか、Issue を編集して正しい ID を入力してください。", None

    entry = next((g for g in load_community()["games"] if g["id"] == gid), None)
    if entry is None:
        if gid in curated_ids():
            return "wait", f"`{gid}` は運営が管理しているゲームです。管理者が内容を確認して対応します。", None
        return "reject", f"ゲームID `{gid}` は見つかりませんでした（すでに削除済みの可能性があります）。", None

    authorized = os.environ.get("AUTHORIZED") == "true"
    approved = os.environ.get("APPROVED") == "true"
    is_author = entry.get("author", "").lower() == login.lower()
    if is_author or authorized or approved:
        who = "作者ご本人" if is_author else "管理者"
        return "remove", who, entry
    return "wait", (
        f"**{entry['title']}**（`{gid}`）の削除依頼を受け付けました。\n\n"
        "作者ご本人以外からの依頼のため、管理者が内容を確認します。"
        "管理者が `approved` ラベルを付けると自動で削除されます。"
    ), entry


def remove(entry: dict) -> list[str]:
    data = load_community()
    data["games"] = [g for g in data["games"] if g["id"] != entry["id"]]
    author = entry.get("author")
    if author and not any(g.get("author") == author for g in data["games"]):
        data.get("creators", {}).pop(author, None)
    save_community(data)
    removed = ["community.js から登録データ"]
    folder = GAMES_DIR / entry["id"]
    if str(entry.get("url", "")).startswith(f"games/{entry['id']}/") and folder.is_dir():
        shutil.rmtree(folder)
        removed.append(f"`games/{entry['id']}/` のゲームファイル")
    return removed


def main() -> int:
    mode, comment_path = sys.argv[1], Path(sys.argv[2])
    issue = event()["issue"]
    login = issue["user"]["login"]
    form = parse(issue.get("body") or "")
    action, msg, entry = decide(form, login)

    output("game_id", entry["id"] if entry else "")
    if action == "reject":
        comment_path.write_text(f"### ❌ 削除依頼を処理できませんでした\n\n{msg}", encoding="utf-8")
        output("action", "reject")
        return 0
    if action == "wait":
        comment_path.write_text(f"### 📨 削除依頼を受け付けました\n\n{msg}", encoding="utf-8")
        output("action", "wait")
        return 0

    # action == remove
    if mode == "check":
        output("action", "remove")
        comment_path.write_text("", encoding="utf-8")
        return 0
    removed = remove(entry)
    reason = clip(form.get("reason", ""), 60)
    comment_path.write_text(
        f"### 🗑 削除しました\n\n**{entry['title']}**（`{entry['id']}`）を GAME WORLD から削除しました（依頼者: {msg}）。\n\n"
        + "\n".join(f"- {r}" for r in removed)
        + (f"\n\n削除理由: {reason}" if reason else "")
        + "\n\nサイトから消えるまで数分かかることがあります。これまで公開いただきありがとうございました。",
        encoding="utf-8",
    )
    output("action", "remove")
    return 0


if __name__ == "__main__":
    sys.exit(main())
