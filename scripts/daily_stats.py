#!/usr/bin/env python3
"""GAME WORLD — プレイ数を毎日記録し、節目（100 プレイなど）を作者に通知する。

使い方（GitHub Actions から毎日呼ばれる）:
  python3 scripts/daily_stats.py snapshot   # カウンター API から全ゲームのプレイ数を取得して記録
  python3 scripts/daily_stats.py notify     # snapshot で見つかった節目を登録 Issue にコメント

ファイル:
  data/stats-history.json  {"updated": ISO, "days": [{"date": "YYYY-MM-DD", "plays": {id: n}}]}
                           date は日本時間。その日の 0 時台に記録した「その時点までの累計」
  data/milestones.json     {id: 通知済みの最大の節目}
  data/pending-notifications.json  notify で送るコメント（コミットしない）
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from game_submission import CATALOG, load_community, site_url  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
HISTORY = DATA / "stats-history.json"
MILESTONES = DATA / "milestones.json"
PENDING = DATA / "pending-notifications.json"
JST = timezone(timedelta(hours=9))
KEEP_DAYS = 90
STEPS = [100, 500, 1000, 5000, 10000, 50000, 100000]
BASE = "https://abacus.jasoncameron.dev"


def namespace() -> str:
    m = re.search(r'namespace:\s*"([\w.-]{3,64})"', CATALOG.read_text(encoding="utf-8"))
    if not m:
        raise SystemExit("games.js に SITE.stats.namespace がありません")
    return m.group(1)


def all_games() -> list[dict]:
    text = CATALOG.read_text(encoding="utf-8")
    curated = [{"id": i, "title": t} for i, t in re.findall(r'\bid:\s*"([^"]+)",\s*\n\s*title:\s*"([^"]*)"', text)]
    return curated + load_community()["games"]


def get_count(ns: str, gid: str) -> int | None:
    """プレイ数。まだ一度も数えられていなければ 0、取得できなければ None。"""
    url = f"{BASE}/get/{ns}/{urllib.parse.quote(('g-' + gid)[:64])}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "game-world-stats"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return int(json.load(r).get("value") or 0)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            if e.code in (404, 500) and re.search(r"failed to get data|not found", body, re.I):
                return 0
            if e.code == 429:
                time.sleep(5)
        except Exception:  # noqa: BLE001
            pass
        time.sleep(1.5 * (attempt + 1))
    return None


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def crossed(n: int) -> int:
    return max([s for s in STEPS if n >= s], default=0)


def snapshot() -> int:
    ns = namespace()
    games = all_games()
    hist = load(HISTORY, {"days": []})
    days = hist.get("days", [])
    prev = days[-1]["plays"] if days else {}
    today = datetime.now(JST).date().isoformat()

    plays: dict[str, int] = {}
    failed = []
    for g in games:
        v = get_count(ns, g["id"])
        if v is None:
            failed.append(g["id"])
            if g["id"] in prev:
                plays[g["id"]] = prev[g["id"]]  # 取れなかった日は前回の値を引き継ぐ
        else:
            plays[g["id"]] = max(v, prev.get(g["id"], 0))
        time.sleep(0.5)  # API の制限（10 秒に 30 回）を守る

    if len(failed) == len(games) and games:
        print("カウンター API に接続できませんでした。記録をスキップします。", file=sys.stderr)
        return 1

    days = [d for d in days if d["date"] != today] + [{"date": today, "plays": plays}]
    days = sorted(days, key=lambda d: d["date"])[-KEEP_DAYS:]
    save(HISTORY, {"updated": datetime.now(JST).isoformat(timespec="minutes"), "days": days})

    # 節目の判定（初回はこれまでの分を通知せずに記録だけする）
    first_run = not MILESTONES.exists()
    done: dict[str, int] = load(MILESTONES, {})
    pending = []
    by_id = {g["id"]: g for g in games}
    for gid, n in plays.items():
        step = crossed(n)
        if step <= done.get(gid, 0):
            continue
        g = by_id.get(gid, {})
        if not first_run and g.get("issue") and g.get("author"):
            pending.append({"id": gid, "issue": g["issue"], "title": g.get("title", gid), "author": g["author"], "step": step, "plays": n})
        done[gid] = step
    save(MILESTONES, done)
    save(PENDING, pending)
    print(f"{today}: {len(plays)} 本を記録（取得失敗 {len(failed)} 本）。通知予定 {len(pending)} 件")
    return 0


def notify() -> int:
    pending = load(PENDING, [])
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not pending:
        print("通知する節目はありません")
        return 0
    if not token or not repo:
        print("GITHUB_TOKEN / GITHUB_REPOSITORY がないため通知をスキップします", file=sys.stderr)
        return 0
    site = site_url()
    for p in pending:
        body = (
            f"### 🎉 {p['step']:,} プレイ突破！\n\n"
            f"@{p['author']} さんの **{p['title']}** が、累計 **{p['plays']:,} プレイ**になりました。おめでとうございます！\n\n"
            f"- ▶ ゲーム: {site}#game={urllib.parse.quote(p['id'])}\n"
            f"- 📈 あなたのページ（順位・7日間の推移・リアクション）: {site}#creator={urllib.parse.quote(p['author'])}\n\n"
            "_この通知は節目（100・500・1,000 … プレイ）ごとに自動で届きます。_"
        )
        req = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/issues/{int(p['issue'])}/comments",
            data=json.dumps({"body": body}).encode(),
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "User-Agent": "game-world-stats"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=20):
                print(f"通知しました: {p['id']} {p['step']} → #{p['issue']}")
        except Exception as e:  # noqa: BLE001
            print(f"通知に失敗: {p['id']} #{p['issue']} ({e})", file=sys.stderr)
        time.sleep(1)
    return 0


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "snapshot":
        sys.exit(snapshot())
    if mode == "notify":
        sys.exit(notify())
    sys.exit("usage: daily_stats.py snapshot|notify")
