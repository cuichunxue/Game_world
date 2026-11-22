(() => {
  "use strict";

  const COMMUNITY = window.COMMUNITY || { games: [], creators: {} };
  const GAMES = [...(window.GAMES || []), ...(COMMUNITY.games || [])];
  const GENRES = window.GENRES || {};
  const CREATORS = { ...(COMMUNITY.creators || {}), ...(window.CREATORS || {}) };
  const REPO = (window.SITE && window.SITE.repo) || "";
  const REVIEW_DAYS = (window.SITE && window.SITE.reviewDays) || 3;
  const $ = (s, r = document) => r.querySelector(s);
  const NEW_DAYS = 30;

  /* ---------- storage (best effort) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let favs = new Set(store.get("gw:favs", []));

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const creatorOf = (g) => CREATORS[g.author] || { name: g.author, avatar: "🙂", color: "#ddd" };
  const isNew = (g) => (Date.now() - new Date(g.added).getTime()) / 864e5 <= NEW_DAYS;
  const fmtDate = (d) => { const t = new Date(d); return isNaN(t) ? d : `${t.getFullYear()}.${t.getMonth() + 1}.${t.getDate()}`; };
  const isExternal = (g) => {
    try { return new URL(g.url, location.href).origin !== location.origin; } catch { return false; }
  };
  const deviceLabel = (ds = []) => ds.map((d) => (d === "pc" ? "💻 PC" : d === "mobile" ? "📱 スマホ" : d)).join(" / ");

  function thumbHTML(g, { title = true } = {}) {
    const [c1, c2] = g.colors || ["#ffc928", "#ff5a8f"];
    const img = g.thumb ? `<img src="${esc(g.thumb)}" alt="" loading="lazy">` : `<span class="em">${esc(g.emoji || "🎮")}</span>`;
    return `<div class="thumb" style="--c1:${esc(c1)};--c2:${esc(c2)}">${img}${title && !g.thumb ? `<span class="ttl">${esc(g.title)}</span>` : ""}</div>`;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }

  /* ---------- play counts & reactions (shared, best effort) ---------- */
  const REACTIONS = [["lol", "😂", "笑った"], ["fire", "🔥", "熱い"], ["good", "👍", "よかった"]];
  const Stats = (() => {
    const cfg = (window.SITE && window.SITE.stats) || {};
    const BASE = "https://abacus.jasoncameron.dev";
    const ns = cfg.namespace;
    const enabled = cfg.provider === "abacus" && /^[\w.-]{3,64}$/.test(ns || "");
    const counts = new Map(); // abacus key -> number
    const listeners = new Set();
    const CACHE = "gw:stats2", HITS = "gw:hits", REACTED = "gw:reacted";
    const TTL = 5 * 60 * 1000, HIT_GAP = 6 * 60 * 60 * 1000;
    let status = enabled ? "idle" : "off"; // プレイ数の読み込み状態: idle | loading | ready | error | off
    const playKey = (id) => `g-${id}`.slice(0, 64);
    const reactKey = (id, r) => `r-${r}-${id}`.slice(0, 64);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const emit = () => listeners.forEach((fn) => fn());

    // キャッシュ: { key: [値, 取得時刻] }
    const cache = store.get(CACHE, {}) || {};
    const fresh = (k) => cache[k] && Date.now() - cache[k][1] < TTL;
    const remember = (k, v) => { counts.set(k, v); cache[k] = [v, Date.now()]; store.set(CACHE, cache); };
    Object.entries(cache).forEach(([k, [v]]) => counts.set(k, v));

    // API の制限（10秒に30回）を超えないよう、全リクエストを1本の列で2並列・間隔を空けて送る
    const queue = [];
    let running = 0;
    function pump() {
      while (running < 2 && queue.length) {
        const { path, resolve } = queue.shift();
        running++;
        call(path).then(resolve).finally(() => setTimeout(() => { running--; pump(); }, 700));
      }
    }
    const request = (path) => new Promise((resolve) => { queue.push({ path, resolve }); pump(); });

    // 返り値: 数値 / 0（未計測） / null（取得失敗）
    async function call(path) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch(`${BASE}/${path}`, { cache: "no-store" });
          if (r.ok) { const j = await r.json(); return Number(j.value) || 0; }
          if (r.status === 404 || r.status === 500) {
            const j = await r.json().catch(() => ({}));
            if (/failed to get data|not found/i.test(j.error || "")) return 0; // まだ一度も数えられていないキー
          }
          if (r.status === 429) await sleep(4000);
        } catch {}
        await sleep(800);
      }
      return null;
    }

    async function fetchKeys(keys) {
      const need = keys.filter((k) => !fresh(k));
      let ok = keys.length - need.length;
      await Promise.all(need.map(async (k) => {
        const v = await request(`get/${ns}/${k}`);
        if (v !== null) { remember(k, v); ok++; }
      }));
      return ok;
    }

    async function loadPlays(ids) {
      if (!enabled || !ids.length) return;
      if (ids.every((id) => fresh(playKey(id)))) { status = "ready"; return emit(); }
      status = "loading";
      emit();
      const ok = await fetchKeys(ids.map(playKey));
      status = ok ? "ready" : "error";
      emit();
    }

    async function loadReactions(ids) {
      if (!enabled || !ids.length) return;
      await fetchKeys(ids.flatMap((id) => REACTIONS.map(([r]) => reactKey(id, r))));
      emit();
    }

    async function hit(id) {
      if (!enabled) return;
      const hits = store.get(HITS, {});
      if (hits[id] && Date.now() - hits[id] < HIT_GAP) return; // 同じ端末の連続プレイは数えない
      hits[id] = Date.now();
      store.set(HITS, hits);
      const v = await request(`hit/${ns}/${playKey(id)}`);
      if (v !== null) {
        remember(playKey(id), v);
        if (status !== "loading") status = "ready";
        emit();
      }
    }

    const reactedMap = () => store.get(REACTED, {}) || {};
    async function react(id, r) {
      if (!enabled) return false;
      const m = reactedMap();
      if (m[`${id}:${r}`]) return false; // 1つの端末から各リアクション1回まで
      m[`${id}:${r}`] = Date.now();
      store.set(REACTED, m);
      counts.set(reactKey(id, r), (counts.get(reactKey(id, r)) || 0) + 1); // 先に画面へ反映
      emit();
      const v = await request(`hit/${ns}/${reactKey(id, r)}`);
      if (v !== null) remember(reactKey(id, r), v);
      emit();
      return v !== null;
    }

    return {
      enabled, hit, react, loadPlays, loadReactions,
      plays: (id) => counts.get(playKey(id)),
      reaction: (id, r) => counts.get(reactKey(id, r)),
      reactions: (id) => REACTIONS.reduce((a, [r]) => a + (counts.get(reactKey(id, r)) || 0), 0),
      reacted: (id, r) => !!reactedMap()[`${id}:${r}`],
      status: () => status,
      onChange: (fn) => listeners.add(fn),
    };
  })();
  const fmtNum = (n) => (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, "") + "万" : n.toLocaleString("ja-JP"));
  const totalPlays = () => GAMES.reduce((a, g) => a + (Stats.plays(g.id) || 0), 0);
  // 同じ回数は同じ順位（1, 2, 2, 4 …）
  function rankOf(id) {
    const mine = Stats.plays(id);
    if (mine == null || Stats.status() === "off") return null;
    const ranked = GAMES.filter((g) => Stats.plays(g.id) != null);
    return { rank: 1 + ranked.filter((g) => Stats.plays(g.id) > mine).length, total: ranked.length };
  }
  const rankText = (id) => { const r = rankOf(id); return r ? `全 ${r.total} 本中 ${r.rank} 位` : "—"; };

  /* ---------- daily history (data/stats-history.json, recorded by GitHub Actions) ---------- */
  const History = (() => {
    let days = []; // [{date, plays:{id:n}}] 古い順。date（日本時間）の 0 時台の累計
    let loaded = false;
    const DAY = 864e5;
    const jst = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
    const shift = (date, n) => jst(Date.parse(date + "T00:00:00+09:00") + n * DAY);
    const snap = (date) => days.find((d) => d.date === date)?.plays;
    async function load() {
      try {
        const r = await fetch("data/stats-history.json", { cache: "no-cache" });
        if (r.ok) days = ((await r.json()).days || []).sort((a, b) => a.date.localeCompare(b.date));
      } catch {}
      loaded = true;
    }
    // その日のプレイ数（翌日の記録 − その日の記録。今日は現在値 − 今日の記録）
    function dayCount(id, date) {
      const s = snap(date);
      if (!s) return null;
      const base = s[id] ?? 0;
      const next = date === jst() ? Stats.plays(id) : snap(shift(date, 1))?.[id];
      return next == null ? null : Math.max(0, next - base);
    }
    function last7(id) {
      const today = jst();
      return Array.from({ length: 7 }, (_, i) => {
        const date = shift(today, i - 6);
        return { date, n: dayCount(id, date), today: date === today };
      });
    }
    // 今週（直近7日）のプレイ数。記録が7日分ない間は、ある分だけで計算
    function weekBase() {
      const from = shift(jst(), -6);
      return days.find((d) => d.date >= from) || null;
    }
    function week(id) {
      const b = weekBase(), now = Stats.plays(id);
      if (!b || now == null) return null;
      return Math.max(0, now - (b.plays[id] ?? 0));
    }
    const weekDays = () => { const b = weekBase(); return b ? Math.round((Date.parse(jst()) - Date.parse(b.date)) / DAY) + 1 : 0; };
    return {
      load, last7, week, weekDays, dayCount,
      today: (id) => dayCount(id, jst()),
      yesterday: (id) => dayCount(id, shift(jst(), -1)),
      has: () => days.length > 0,
      loaded: () => loaded,
    };
  })();
  const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
  function trendHTML(id, { compact = false } = {}) {
    if (!History.has()) return compact ? "" : `<p class="trend-empty">推移グラフは毎日0時の記録がたまると表示されます。</p>`;
    const d = History.last7(id);
    const max = Math.max(1, ...d.map((x) => x.n || 0));
    const bars = d.map((x) => {
      const wd = WEEKDAY[new Date(Date.parse(x.date + "T12:00:00+09:00")).getUTCDay()];
      const h = x.n == null ? 0 : Math.max(x.n ? 8 : 2, (x.n / max) * 100);
      return `<span class="tbar${x.today ? " is-today" : ""}${x.n == null ? " is-none" : ""}" title="${x.date.slice(5).replace("-", "/")}（${wd}）${x.n == null ? " 記録なし" : ` ${x.n}回`}">
        ${compact ? "" : `<em>${x.n == null ? "" : x.n}</em>`}<i style="height:${h}%"></i>${compact ? "" : `<small>${x.today ? "今日" : wd}</small>`}</span>`;
    }).join("");
    const label = d.map((x) => `${x.date.slice(5)} ${x.n == null ? "記録なし" : x.n + "回"}`).join("、");
    return `<div class="trend${compact ? " compact" : ""}" role="img" aria-label="7日間のプレイ数：${label}">${bars}</div>`;
  }
  function deltaText(id) {
    const t = History.today(id), y = History.yesterday(id);
    const parts = [];
    if (t != null) parts.push(`今日 +${fmtNum(t)}`);
    if (y != null) parts.push(`昨日 +${fmtNum(y)}`);
    return parts.join("・");
  }

  /* ---------- state ---------- */
  const state = { q: "", genre: "all", sort: "new", favOnly: false, author: null };

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = GAMES.filter((g) => {
      if (state.genre !== "all" && !(g.genres || []).includes(state.genre)) return false;
      if (state.favOnly && !favs.has(g.id)) return false;
      if (state.author && g.author !== state.author) return false;
      if (!q) return true;
      const hay = [g.title, g.catch, g.desc, creatorOf(g).name, ...(g.genres || []).map((k) => GENRES[k]?.label)].join(" ").toLowerCase();
      return hay.includes(q);
    });
    const by = {
      new: (a, b) => b.added.localeCompare(a.added),
      old: (a, b) => a.added.localeCompare(b.added),
      name: (a, b) => a.title.localeCompare(b.title, "ja"),
      short: (a, b) => (a.minutes || 0) - (b.minutes || 0),
      popular: (a, b) => (Stats.plays(b.id) ?? -1) - (Stats.plays(a.id) ?? -1) || b.added.localeCompare(a.added),
    }[state.sort];
    return list.sort(by);
  }

  /* ---------- render: hero ---------- */
  function countUp(el, to) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || to === 0) { el.textContent = to; return; }
    let n = 0;
    const step = () => { n++; el.textContent = n; if (n < to) setTimeout(step, 400 / to); };
    step();
  }

  function renderTotal() {
    const el = $("#statPlays");
    el.textContent = Stats.status() === "ready" ? fmtNum(totalPlays()) : Stats.status() === "loading" ? "…" : "–";
  }

  function renderHero() {
    countUp($("#statGames"), GAMES.length);
    countUp($("#statCreators"), new Set(GAMES.map((g) => g.author)).size);
    renderTotal();

    const latest = [...GAMES].sort((a, b) => b.added.localeCompare(a.added))[0];
    if (!latest) return;
    const c = creatorOf(latest);
    $("#pick").innerHTML = `
      <article class="pick-card" data-open="${esc(latest.id)}" tabindex="0" role="button" aria-label="${esc(latest.title)} の詳細">
        <span class="pick-label">NEW ARRIVAL</span>
        ${thumbHTML(latest, { title: false })}
        <div class="pick-info">
          <h3>${esc(latest.title)}</h3>
          <p>${esc(latest.catch)}</p>
          <div class="by"><span class="ava" style="--ac:${esc(c.color)}">${esc(c.avatar)}</span>${esc(c.name)}</div>
        </div>
      </article>`;
  }

  /* ---------- render: chips ---------- */
  function renderChips() {
    const counts = {};
    GAMES.forEach((g) => (g.genres || []).forEach((k) => (counts[k] = (counts[k] || 0) + 1)));
    const keys = Object.keys(GENRES).filter((k) => counts[k]);
    $("#genreChips").innerHTML =
      `<button class="chip" type="button" data-genre="all" aria-pressed="${state.genre === "all"}">すべて<span class="n">${GAMES.length}</span></button>` +
      keys.map((k) => `<button class="chip" type="button" data-genre="${k}" aria-pressed="${state.genre === k}">${GENRES[k].emoji} ${esc(GENRES[k].label)}<span class="n">${counts[k]}</span></button>`).join("");
  }

  /* ---------- render: grid ---------- */
  function cardHTML(g) {
    const c = creatorOf(g);
    const fav = favs.has(g.id);
    return `
      <article class="card" data-open="${esc(g.id)}" tabindex="0" role="button" aria-label="${esc(g.title)} の詳細">
        ${isNew(g) ? `<span class="badge-new">NEW</span>` : ""}
        <button class="fav" type="button" data-fav="${esc(g.id)}" aria-pressed="${fav}" aria-label="お気に入り">${fav ? "♥" : "♡"}</button>
        ${thumbHTML(g)}
        <div class="card-body">
          <h3>${esc(g.title)}</h3>
          <p class="catch">${esc(g.catch)}</p>
          <div class="by"><span class="ava" style="--ac:${esc(c.color)}">${esc(c.avatar)}</span>${esc(c.name)}</div>
          <div class="meta">
            ${(g.genres || []).slice(0, 3).map((k) => `<span>${GENRES[k]?.emoji || ""} ${esc(GENRES[k]?.label || k)}</span>`).join("")}
            <span>⏱ ${g.minutes || "?"}分</span>
            ${Stats.plays(g.id) != null ? `<span class="plays" title="プレイ数">▶ ${fmtNum(Stats.plays(g.id))}</span>` : ""}
          </div>
        </div>
      </article>`;
  }

  function renderGrid() {
    const list = filtered();
    const filtering = state.q || state.genre !== "all" || state.favOnly || state.author;
    $("#grid").innerHTML =
      list.map(cardHTML).join("") +
      (!filtering
        ? `<a class="card placeholder" href="#submit"><div><span class="plus">＋</span><h3>あなたのゲームを<br>ここに！</h3><p>投稿方法を見る →</p></div></a>`
        : "");
    $("#empty").hidden = list.length > 0;
    $("#resultCount").textContent = `${list.length} 本のゲーム`;

    const af = $("#activeFilter");
    if (state.author) {
      af.hidden = false;
      af.innerHTML = `クリエイター: ${esc(creatorOf({ author: state.author }).name)} <button type="button" id="clearAuthor">✕ 解除</button>`;
    } else af.hidden = true;
  }

  /* ---------- render: ranking ---------- */
  let rankPeriod = "week";
  function renderRanking() {
    const el = $("#rankList");
    const st = Stats.status();
    if (st === "off") { $("#ranking").hidden = true; return; }
    const weekly = rankPeriod === "week" && History.has();
    document.querySelectorAll("[data-period]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.period === (weekly ? "week" : "all")));
    const wd = History.weekDays();
    $("#rankSub").textContent = weekly
      ? `直近${wd >= 7 ? "7" : wd}日間に「遊ぶ」が押された回数${wd < 7 ? `（記録 ${wd} 日分）` : ""}。同じ端末からは6時間に1回だけ数えます。`
      : "「遊ぶ」が押された回数（累計）。同じ端末からは6時間に1回だけ数えます。";
    if (st === "idle" || (st === "loading" && !GAMES.some((g) => Stats.plays(g.id) != null))) {
      el.innerHTML = `<li class="rank-msg">集計中…</li>`;
      return;
    }
    if (st === "error") {
      el.innerHTML = `<li class="rank-msg">ランキングを読み込めませんでした。時間をおいてページを再読み込みしてください。</li>`;
      return;
    }
    const val = (g) => (weekly ? History.week(g.id) : Stats.plays(g.id));
    const pool = GAMES.filter((g) => val(g) != null);
    const list = pool.sort((a, b) => val(b) - val(a) || (Stats.plays(b.id) || 0) - (Stats.plays(a.id) || 0) || b.added.localeCompare(a.added)).slice(0, 5);
    const max = Math.max(1, ...list.map(val));
    const none = list.every((g) => !val(g));
    el.innerHTML =
      (none ? `<li class="rank-msg">${weekly ? "この期間のプレイはまだありません。" : "まだプレイ記録がありません。"}最初のプレイヤーになろう！</li>` : "") +
      list.map((g, i) => {
        const c = creatorOf(g), n = val(g);
        const no = 1 + pool.filter((x) => val(x) > n).length;
        return `<li class="rank-item r${Math.min(no, 4)}" data-open="${esc(g.id)}" tabindex="0" role="button" aria-label="${no}位 ${esc(g.title)} ${weekly ? "今週" : "累計"}${n}回">
          <span class="rank-no">${no}</span>
          <span class="rank-thumb" style="--c1:${esc((g.colors || [])[0] || "#ffc928")};--c2:${esc((g.colors || [])[1] || "#ff5a8f")}">${esc(g.emoji || "🎮")}</span>
          <span class="rank-main">
            <b>${esc(g.title)}</b>
            <small>${esc(c.avatar)} ${esc(c.name)}${weekly ? `　累計 ${fmtNum(Stats.plays(g.id) || 0)} 回` : ""}</small>
            <span class="rank-bar"><i style="width:${(n / max) * 100}%"></i></span>
          </span>
          <span class="rank-count">${weekly ? "+" : ""}${fmtNum(n)}<small>回</small></span>
        </li>`;
      }).join("");
  }
  document.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => { rankPeriod = b.dataset.period; renderRanking(); }));

  /* ---------- render: creators ---------- */
  function renderCreators() {
    const ids = [...new Set([...Object.keys(CREATORS), ...GAMES.map((g) => g.author)])];
    $("#creatorList").innerHTML =
      ids.map((id) => {
        const c = creatorOf({ author: id });
        const n = GAMES.filter((g) => g.author === id).length;
        return `<button class="creator" type="button" data-creator="${esc(id)}">
          <span class="ava" style="--ac:${esc(c.color)}">${esc(c.avatar)}</span>
          <div><h3>${esc(c.name)}</h3><p>${esc(c.bio || "")}</p><span class="cnt"><b>${n}</b> 作品</span></div>
        </button>`;
      }).join("") +
      `<a class="creator join" href="#submit"><span class="ava" style="--ac:var(--bg-alt)">＋</span><div><h3>次はあなたの番</h3><p>ゲームを作ったら、ここに名前が並びます。</p></div></a>`;
  }

  /* ---------- detail modal ---------- */
  const dlg = $("#detail");
  function openDetail(id) {
    const g = GAMES.find((x) => x.id === id);
    if (!g) return;
    const c = creatorOf(g);
    const more = GAMES.filter((x) => x.id !== g.id && (x.author === g.author || (x.genres || []).some((k) => (g.genres || []).includes(k)))).slice(0, 6);
    const fav = favs.has(g.id);
    $("#detailBody").innerHTML = `
      <button class="icon-btn x" type="button" data-close aria-label="閉じる">✕</button>
      ${thumbHTML(g, { title: false })}
      <div class="d-body">
        <h2 id="dTitle">${esc(g.title)}${isExternal(g) ? `<span class="ext-badge">外部サイト</span>` : ""}</h2>
        <p class="catch">${esc(g.catch)}</p>
        <p class="desc">${esc(g.desc)}</p>
        <dl class="d-specs">
          <div><dt>クリエイター</dt><dd><button class="link-inline" type="button" data-creator="${esc(g.author)}">${esc(c.avatar)} ${esc(c.name)} ›</button></dd></div>
          <div><dt>ジャンル</dt><dd>${(g.genres || []).map((k) => esc(GENRES[k]?.label || k)).join("・")}</dd></div>
          <div><dt>プレイ時間</dt><dd>約 ${g.minutes || "?"} 分</dd></div>
          <div><dt>対応端末</dt><dd>${deviceLabel(g.devices)}</dd></div>
          <div><dt>言語</dt><dd>${esc((g.langs || []).join(" / "))}</dd></div>
          <div><dt>公開日</dt><dd>${fmtDate(g.added)}</dd></div>
          ${Stats.enabled ? `<div><dt>プレイ数</dt><dd id="dPlays">${Stats.plays(g.id) != null ? fmtNum(Stats.plays(g.id)) + " 回" : "—"}</dd></div>
          <div><dt>人気順位</dt><dd id="dRank">${rankText(g.id)}</dd></div>` : ""}
        </dl>
        ${Stats.enabled ? `<div class="trend-box"><div class="trend-head"><h4>7日間のプレイ数</h4><span id="dDelta">${esc(deltaText(g.id))}</span></div><div id="dTrend">${trendHTML(g.id)}</div></div>` : ""}
        <div class="d-actions">
          <button class="btn btn-primary" type="button" data-play="${esc(g.id)}">▶ いますぐ遊ぶ</button>
          ${isExternal(g) ? `<a class="btn" href="${esc(g.url)}" target="_blank" rel="noopener">↗ 新しいタブで遊ぶ</a>` : ""}
          <button class="btn" type="button" data-fav="${esc(g.id)}" aria-pressed="${fav}">${fav ? "♥ お気に入り済み" : "♡ お気に入り"}</button>
          <button class="btn" type="button" data-share="${esc(g.id)}">🔗 共有</button>
        </div>
        ${Stats.enabled ? `<div class="react" id="reactBox" data-game="${esc(g.id)}">${reactHTML(g.id)}</div>` : ""}
        ${REPO ? `<p class="d-report"><a href="${esc(removeURL(g))}" target="_blank" rel="noopener">🗑 このゲームの削除を依頼（作者・権利者の方）</a></p>` : ""}
        ${more.length ? `<div class="d-more"><h4>こちらもおすすめ</h4><div class="mini-list">${more.map((m) => `<button class="mini" type="button" data-open="${esc(m.id)}">${thumbHTML(m, { title: false })}<span>${esc(m.title)}</span></button>`).join("")}</div></div>` : ""}
      </div>`;
    if (cdlg.open) cdlg.close();
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
    history.replaceState(null, "", `#game=${encodeURIComponent(g.id)}`);
    Stats.loadReactions([g.id]);
  }

  /* ---------- reactions ---------- */
  function reactHTML(id) {
    return `<p class="react-q">遊んでみてどうだった？ <small>ワンタップで作者に届きます</small></p>
      <div class="react-btns">${REACTIONS.map(([r, e, label]) => {
        const done = Stats.reacted(id, r), n = Stats.reaction(id, r);
        return `<button class="react-btn" type="button" data-react="${esc(id)}" data-r="${r}" aria-pressed="${done}" ${done ? "disabled" : ""} aria-label="${label}${n != null ? ` ${n}件` : ""}${done ? "（送信済み）" : ""}">
          <span class="e" aria-hidden="true">${e}</span><span class="l">${label}</span><b>${n != null ? fmtNum(n) : "–"}</b></button>`;
      }).join("")}</div>`;
  }
  function refreshDetailStats() {
    const box = $("#reactBox");
    if (!dlg.open || !box) return;
    const id = box.dataset.game;
    box.innerHTML = reactHTML(id);
    const p = $("#dPlays"), r = $("#dRank");
    if (p) p.textContent = Stats.plays(id) != null ? fmtNum(Stats.plays(id)) + " 回" : "—";
    if (r) r.textContent = rankText(id);
    const t = $("#dTrend"), dd = $("#dDelta");
    if (t) t.innerHTML = trendHTML(id);
    if (dd) dd.textContent = deltaText(id);
  }
  async function sendReaction(id, r) {
    const ok = await Stats.react(id, r);
    toast(ok ? "作者に届きました！ ありがとう" : "送信できませんでした。時間をおいてもう一度お試しください");
  }

  /* ---------- creator page ---------- */
  const cdlg = $("#creatorDlg");
  function openCreator(cid) {
    const games = GAMES.filter((g) => g.author === cid);
    if (!games.length && !CREATORS[cid]) return;
    if (dlg.open) dlg.close();
    renderCreatorPage(cid);
    if (!cdlg.open) cdlg.showModal();
    cdlg.scrollTop = 0;
    history.replaceState(null, "", `#creator=${encodeURIComponent(cid)}`);
    Stats.loadReactions(games.map((g) => g.id));
  }
  function renderCreatorPage(cid) {
    const c = creatorOf({ author: cid });
    const games = GAMES.filter((g) => g.author === cid)
      .sort((a, b) => (Stats.plays(b.id) ?? -1) - (Stats.plays(a.id) ?? -1) || b.added.localeCompare(a.added));
    const plays = games.reduce((a, g) => a + (Stats.plays(g.id) || 0), 0);
    const reacts = games.reduce((a, g) => a + Stats.reactions(g.id), 0);
    const best = games.map((g) => rankOf(g.id)?.rank).filter(Boolean).sort((a, b) => a - b)[0];
    const loaded = Stats.status() === "ready";
    const weekSum = History.has() ? games.reduce((a, g) => a + (History.week(g.id) || 0), 0) : null;
    const tile = (label, val) => `<div><dt>${label}</dt><dd>${val}</dd></div>`;
    $("#creatorBody").innerHTML = `
      <button class="icon-btn x" type="button" data-close-creator aria-label="閉じる">✕</button>
      <div class="cp-head">
        <span class="ava cp-ava" style="--ac:${esc(c.color || "#ffc928")}">${esc(c.avatar || "🙂")}</span>
        <div class="cp-id">
          <p class="cp-kicker">クリエイター</p>
          <h2 id="cTitle">${esc(c.name)}</h2>
          ${c.bio ? `<p class="cp-bio">${esc(c.bio)}</p>` : ""}
          ${c.link ? `<a class="cp-link" href="${esc(c.link)}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}
        </div>
      </div>
      <dl class="cp-stats">
        ${tile("作品", games.length)}
        ${Stats.enabled ? tile("合計プレイ", loaded ? fmtNum(plays) : "…") + (weekSum != null ? tile("今週のプレイ", loaded ? `+${fmtNum(weekSum)}` : "…") : "") + tile("リアクション", fmtNum(reacts)) + tile("最高順位", best ? `${best} 位` : "—") : ""}
      </dl>
      <ol class="cp-games">
        ${games.map((g) => {
          const r = rankOf(g.id);
          return `<li class="cp-game">
            <button class="cp-thumb" type="button" data-open="${esc(g.id)}" style="--c1:${esc((g.colors || [])[0] || "#ffc928")};--c2:${esc((g.colors || [])[1] || "#ff5a8f")}" aria-label="${esc(g.title)} の詳細">${esc(g.emoji || "🎮")}</button>
            <div class="cp-main">
              <button class="cp-title" type="button" data-open="${esc(g.id)}">${esc(g.title)}</button>
              <p class="cp-meta">
                ${Stats.enabled ? `<span>▶ ${Stats.plays(g.id) != null ? fmtNum(Stats.plays(g.id)) + " 回" : "—"}</span>
                <span class="${r && r.rank <= 3 ? "hot" : ""}">🏆 ${r ? `全 ${r.total} 本中 ${r.rank} 位` : "—"}</span>
                <span>${REACTIONS.map(([k, e]) => `${e} ${Stats.reaction(g.id, k) ?? "–"}`).join("　")}</span>` : ""}
                <span>📅 ${fmtDate(g.added)}</span>
              </p>
              ${Stats.enabled && History.has() ? `<div class="cp-trend">${trendHTML(g.id, { compact: true })}<span>${esc(deltaText(g.id)) || "今日 —"}</span></div>` : ""}
            </div>
            <button class="btn btn-sm btn-primary" type="button" data-play="${esc(g.id)}">▶ 遊ぶ</button>
          </li>`;
        }).join("") || `<li class="rank-msg">まだ作品がありません</li>`}
      </ol>
      <p class="cp-note">グラフは直近7日間の1日ごとのプレイ数（毎日0時に記録、今日の分はリアルタイム）。プレイ数・順位・リアクションは数分ごとに更新されます。プレイ数は同じ端末から6時間に1回、リアクションは1端末につき各1回まで数えます。</p>
      <div class="cp-actions">
        <button class="btn" type="button" data-share-creator="${esc(cid)}">🔗 このページを共有</button>
        <button class="btn" type="button" data-author="${esc(cid)}">一覧でこの人の作品を見る</button>
      </div>`;
  }
  function closeCreator() { if (cdlg.open) cdlg.close(); }
  cdlg.addEventListener("close", () => {
    if (location.hash.startsWith("#creator=")) history.replaceState(null, "", location.pathname + location.search);
  });
  cdlg.addEventListener("click", (e) => { if (e.target === cdlg) closeCreator(); });
  async function shareCreator(cid) {
    const c = creatorOf({ author: cid });
    const url = `${location.origin}${location.pathname}#creator=${encodeURIComponent(cid)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${c.name} のゲーム｜GAME WORLD`, url });
      else { await navigator.clipboard.writeText(url); toast("リンクをコピーしました"); }
    } catch {}
  }
  function removeURL(g) {
    const p = new URLSearchParams({ template: "remove-game.yml", title: `[削除依頼] ${g.title}`, game_id: g.id });
    return `https://github.com/${REPO}/issues/new?${p}`;
  }
  function closeDetail() {
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener("close", () => {
    if (location.hash.startsWith("#game=")) history.replaceState(null, "", location.pathname + location.search);
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeDetail(); });

  /* ---------- player ---------- */
  const player = $("#player"), frame = $("#frame");
  let lastPlayed = null;
  function play(id) {
    const g = GAMES.find((x) => x.id === id);
    if (!g) return;
    lastPlayed = g.id;
    closeDetail();
    closeCreator();
    $("#playerTitle").textContent = g.title;
    $("#newTab").href = g.url;
    $("#playerHint").hidden = !isExternal(g);
    $("#hintNewTab").href = g.url;
    frame.src = g.url;
    Stats.hit(g.id);
    player.hidden = false;
    document.body.classList.add("locked");
    $("#closePlayer").focus();
  }
  function closePlayer() {
    if (player.hidden) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    frame.src = "about:blank";
    player.hidden = true;
    document.body.classList.remove("locked");
    // 遊び終わったら詳細に戻り、リアクションを促す
    if (lastPlayed && Stats.enabled) {
      openDetail(lastPlayed);
      const box = $("#reactBox");
      if (box) { box.classList.add("pulse"); setTimeout(() => box.scrollIntoView({ block: "center" }), 50); }
    }
  }
  $("#closePlayer").addEventListener("click", closePlayer);
  $("#fsBtn").addEventListener("click", () => {
    const el = player;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => toast("全画面に対応していません"));
    else toast("全画面に対応していません");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !player.hidden) closePlayer(); });

  /* ---------- favorites ---------- */
  function toggleFav(id) {
    favs.has(id) ? favs.delete(id) : favs.add(id);
    store.set("gw:favs", [...favs]);
    toast(favs.has(id) ? "♥ お気に入りに追加しました" : "お気に入りから外しました");
    renderGrid();
    if (dlg.open) openDetail(id);
  }

  async function share(id) {
    const g = GAMES.find((x) => x.id === id);
    const url = `${location.origin}${location.pathname}#game=${encodeURIComponent(id)}`;
    try {
      if (navigator.share) await navigator.share({ title: g.title, text: g.catch, url });
      else { await navigator.clipboard.writeText(url); toast("リンクをコピーしました"); }
    } catch {}
  }

  /* ---------- global delegation ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-fav],[data-play],[data-share],[data-close],[data-open],[data-genre],[data-author],#clearAuthor,[data-react],[data-creator],[data-close-creator],[data-share-creator]");
    if (!t) return;
    if (t.dataset.react) { sendReaction(t.dataset.react, t.dataset.r); return; }
    if (t.dataset.creator) { openCreator(t.dataset.creator); return; }
    if (t.hasAttribute("data-close-creator")) { closeCreator(); return; }
    if (t.dataset.shareCreator) { shareCreator(t.dataset.shareCreator); return; }
    if (t.dataset.fav) { e.stopPropagation(); toggleFav(t.dataset.fav); }
    else if (t.dataset.play) play(t.dataset.play);
    else if (t.dataset.share) share(t.dataset.share);
    else if (t.hasAttribute("data-close")) closeDetail();
    else if (t.dataset.open) openDetail(t.dataset.open);
    else if (t.dataset.genre) { state.genre = t.dataset.genre; renderChips(); renderGrid(); }
    else if (t.dataset.author) { closeCreator(); state.author = t.dataset.author; renderGrid(); $("#games").scrollIntoView(); }
    else if (t.id === "clearAuthor") { state.author = null; renderGrid(); }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[role=button][data-open]")) {
      e.preventDefault();
      openDetail(e.target.dataset.open);
    }
  });

  $("#q").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
  $("#favOnly").addEventListener("click", (e) => {
    state.favOnly = !state.favOnly;
    e.currentTarget.setAttribute("aria-pressed", state.favOnly);
    renderGrid();
  });
  $("#randomBtn").addEventListener("click", () => {
    if (!GAMES.length) return;
    openDetail(GAMES[Math.floor(Math.random() * GAMES.length)].id);
  });

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const savedTheme = store.get("gw:theme", null);
  if (savedTheme) root.dataset.theme = savedTheme;
  $("#themeBtn").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    store.set("gw:theme", root.dataset.theme);
  });

  /* ---------- registration form ---------- */
  const reg = $("#regForm");
  const ID_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
  const MAX_ZIP = 20 * 1024 * 1024;
  let upload = null; // { zipBlob, zipName, converted, ok }

  $("#regGenres").innerHTML = Object.entries(GENRES)
    .map(([k, v]) => `<label><input type="checkbox" name="genres" value="${k}">${v.emoji} ${esc(v.label)}</label>`).join("");

  const source = () => reg.querySelector("[name=source]:checked").value;
  const val = (n) => (reg.elements[n]?.value || "").trim();
  const slugify = (t) => t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  let idTouched = false;
  reg.elements.id.addEventListener("input", () => { idTouched = true; });
  reg.elements.title.addEventListener("input", () => {
    if (!idTouched) reg.elements.id.value = slugify(val("title"));
  });

  function regEntry() {
    const fd = new FormData(reg);
    return {
      id: val("id").toLowerCase(),
      title: val("title") || "ゲーム名",
      catch: val("catch") || "キャッチコピーがここに入ります",
      desc: val("desc"),
      author: "__you__",
      url: "#",
      genres: fd.getAll("genres"),
      devices: fd.getAll("devices"),
      minutes: Number(val("minutes")) || 1,
      langs: val("langs").split(/[,、\s]+/).filter(Boolean),
      added: new Date().toISOString().slice(0, 10),
      emoji: val("emoji") || "🎮",
      colors: [val("c1"), val("c2")],
    };
  }

  function renderPreview() {
    const g = regEntry();
    CREATORS.__you__ = { name: val("creator_name") || "あなた", avatar: val("creator_avatar") || "🙂", color: val("c1") };
    $("#regPreview").innerHTML = cardHTML(g).replace(/data-open="[^"]*"|data-fav="[^"]*"|tabindex="0"|role="button"/g, "");
    delete CREATORS.__you__;
  }

  reg.querySelectorAll("[name=source]").forEach((r) => r.addEventListener("change", () => applySource()));

  /* file handling */
  let jszipPromise = null;
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    jszipPromise ||= new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "assets/vendor/jszip.min.js";
      s.onload = () => res(window.JSZip);
      s.onerror = () => { jszipPromise = null; rej(new Error("JSZip load failed")); };
      document.head.appendChild(s);
    });
    return jszipPromise;
  }
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  function fileStatus(cls, html) {
    const el = $("#fileStatus");
    el.hidden = false;
    el.className = "file-status " + cls;
    el.innerHTML = html;
  }

  async function handleFile(file) {
    upload = null;
    if (!file) return;
    const name = file.name.toLowerCase();
    if (file.size > MAX_ZIP) return fileStatus("ng", `❌ ${esc(file.name)} は 20MB を超えています`);
    fileStatus("", "⏳ チェック中…");
    try {
      const JSZip = await loadJSZip();
      const base = (val("id") || slugify(file.name.replace(/\.[^.]+$/, "")) || "my-game");
      if (name.endsWith(".html") || name.endsWith(".htm")) {
        const zip = new JSZip();
        zip.file("index.html", file);
        const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        upload = { zipBlob: blob, zipName: `${base}.zip`, converted: true, ok: true };
        fileStatus("ok", `✅ ${esc(file.name)}（${kb(file.size)}）<small>送信時に <b>${esc(upload.zipName)}</b> として zip に変換して保存します</small>`);
      } else if (name.endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const files = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith("__MACOSX/"));
        const names = files.map((f) => f.name);
        const tops = new Set(names.map((n) => n.split("/")[0]));
        const hasIndex = names.includes("index.html") || (tops.size === 1 && names.includes(`${[...tops][0]}/index.html`));
        if (!hasIndex) {
          return fileStatus("ng", `❌ zip の中に <code>index.html</code> が見つかりません<small>一番上か、フォルダ1つの直下に置いてください</small>`);
        }
        upload = { zipBlob: file, zipName: file.name, converted: false, ok: true };
        fileStatus("ok", `✅ ${esc(file.name)}（${kb(file.size)}・${files.length} ファイル）<small>index.html を確認しました</small>`);
      } else {
        fileStatus("ng", "❌ HTML か zip ファイルを選んでください");
      }
    } catch (e) {
      fileStatus("ng", "❌ ファイルを読み込めませんでした（zip が壊れているか、通信エラーです）");
    }
  }
  const fileInput = $("#fileInput"), drop = $("#drop");
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  /* draft (best effort, per browser) */
  const DRAFT_KEY = "gw:draft";
  const DRAFT_FIELDS = ["source", "url", "title", "id", "catch", "desc", "minutes", "langs", "emoji", "c1", "c2", "creator_name", "creator_avatar", "creator_bio"];
  let draftTimer = 0;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const fd = new FormData(reg);
      const d = { genres: fd.getAll("genres"), devices: fd.getAll("devices"), idTouched };
      DRAFT_FIELDS.forEach((n) => (d[n] = fd.get(n) ?? ""));
      store.set(DRAFT_KEY, d);
      const t = new Date();
      $("#draftState").textContent = `下書きを保存しました（${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}）`;
    }, 400);
  }
  function applySource() {
    reg.querySelectorAll(".src-panel").forEach((p) => (p.hidden = p.dataset.src !== source()));
  }
  function restoreDraft() {
    const d = store.get(DRAFT_KEY, null);
    if (!d || !Object.values(d).some((v) => (Array.isArray(v) ? v.length : v && v !== true))) return false;
    DRAFT_FIELDS.forEach((n) => {
      if (n === "source") {
        const r = reg.querySelector(`[name=source][value="${d.source === "file" ? "file" : "url"}"]`);
        if (r) r.checked = true;
      } else if (reg.elements[n] && d[n] != null && d[n] !== "") reg.elements[n].value = d[n];
    });
    reg.querySelectorAll("[name=genres]").forEach((c) => (c.checked = (d.genres || []).includes(c.value)));
    if (Array.isArray(d.devices)) reg.querySelectorAll("[name=devices]").forEach((c) => (c.checked = d.devices.includes(c.value)));
    idTouched = !!d.idTouched;
    applySource();
    if (d.source === "file") fileStatus("", "📎 下書きにはファイルは保存されません。もう一度ファイルを選んでください");
    $("#draftState").textContent = "前回の下書きを復元しました";
    return true;
  }
  $("#clearDraft").addEventListener("click", () => {
    reg.reset();
    store.set(DRAFT_KEY, null);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    idTouched = false;
    upload = null;
    fileInput.value = "";
    $("#fileStatus").hidden = true;
    $("#formErrors").hidden = true;
    $("#nextSteps").hidden = true;
    reg.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    applySource();
    renderPreview();
    $("#draftState").textContent = "入力をクリアしました";
  });

  /* validation */
  function validateReg() {
    const errs = [];
    const mark = (n, bad) => reg.elements[n]?.setAttribute("aria-invalid", bad ? "true" : "false");
    const id = val("id").toLowerCase();
    const idBad = !ID_RE.test(id) || GAMES.some((g) => g.id === id);
    mark("id", idBad);
    if (!ID_RE.test(id)) errs.push("ゲームID は半角英小文字・数字・ハイフンで 3〜40 文字にしてください");
    else if (GAMES.some((g) => g.id === id)) errs.push(`ゲームID「${id}」はすでに使われています`);
    for (const [n, label] of [["title", "ゲーム名"], ["catch", "キャッチコピー"], ["desc", "説明文"]]) {
      mark(n, !val(n));
      if (!val(n)) errs.push(`${label}を入力してください`);
    }
    if (source() === "url") {
      const bad = !/^https:\/\/[^\s"'<>]+$/.test(val("url"));
      mark("url", bad);
      if (bad) errs.push("ゲームURL は https:// から始まる URL を入力してください");
    } else if (!upload?.ok) errs.push("HTML または zip ファイルを選んでください");
    if (!new FormData(reg).getAll("genres").length) errs.push("ジャンルを1つ以上選んでください");
    if (!reg.elements.agree.checked) errs.push("投稿ルールへの同意にチェックしてください");
    return errs;
  }

  function issueURL() {
    const fd = new FormData(reg);
    const p = new URLSearchParams({
      template: "submit-game.yml",
      title: `[ゲーム登録] ${val("title")}`,
      game_id: val("id").toLowerCase(),
      game_title: val("title"),
    });
    const fields = {
      catch: val("catch"),
      desc: val("desc"),
      source: source() === "url" ? "URL" : "ファイル",
      game_url: source() === "url" ? val("url") : "",
      genres: fd.getAll("genres").join(", "),
      minutes: String(Number(val("minutes")) || 1),
      devices: fd.getAll("devices").join(", "),
      langs: val("langs"),
      emoji: val("emoji"),
      colors: `${val("c1")}, ${val("c2")}`,
      creator_name: val("creator_name"),
      creator_avatar: val("creator_avatar"),
      creator_bio: val("creator_bio"),
    };
    for (const [k, v] of Object.entries(fields)) if (v) p.set(k, v);
    return `https://github.com/${REPO}/issues/new?${p.toString()}`;
  }

  function saveBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function ghMock(isFile) {
    const mk = (n) => `<span class="mk" aria-hidden="true">${n}</span>`;
    let n = 0;
    return `
      <div class="gh-guide">
        <p class="cap">GitHub の画面ではここだけ操作します</p>
        <div class="gh-mock" role="img" aria-label="GitHub の登録画面の見本。${isFile ? "ゲームファイル欄に zip をドロップし、" : ""}投稿ルールにチェックして、緑の Create ボタンを押します">
          <div class="gh-top"><i></i>${esc(REPO)} · New issue</div>
          <div class="gh-f"><b>Add a title</b><span class="ok">[ゲーム登録] ${esc(val("title"))}</span></div>
          <div class="gh-f"><b>ゲームID</b><span class="ok">${esc(val("id"))}</span></div>
          <div class="gh-f gh-dim"><b>ゲーム名・説明文・ジャンル…</b><span class="ok">入力済み（さわらなくて OK）</span></div>
          ${isFile ? `<div class="gh-f gh-drop"><b>ゲームファイル${mk(++n)}</b><span>⬇ ${esc(upload.zipName)} をここにドロップ</span></div>` : ""}
          <div class="gh-f chk"><b>投稿ルール${mk(++n)}</b><span>☑ ブラウザだけで動き…<br>☑ 自分が権利を持つ…</span></div>
          <span class="gh-btn">Create</span>${mk(++n)}
        </div>
      </div>`;
  }

  function showNext(url) {
    const isFile = source() === "file";
    const box = $("#nextSteps");
    box.hidden = false;
    box.innerHTML = `
      <h4>📮 あと少しで送信完了！</h4>
      <p class="hint" style="margin-bottom:10px">新しいタブで GitHub の登録画面が開きました。入力内容は自動で入っています。${isFile && upload.converted ? `zip は <b>ダウンロードフォルダ</b> に保存しました。` : ""}</p>
      ${ghMock(isFile)}
      <ol>
        ${isFile ? `<li><b>${esc(upload.zipName)}</b> を「ゲームファイル」欄にドラッグ＆ドロップ</li>` : ""}
        <li>「投稿ルール」の2つにチェック</li>
        <li>緑の <b>Create</b> ボタンを押す</li>
      </ol>
      <p class="hint" style="margin-bottom:12px">数十秒で自動チェックの結果がコメントされます。審査の目安は <b>${REVIEW_DAYS} 日以内</b>です。ログイン画面が出たら、ログイン後に元の画面へ戻ります。</p>
      <a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">GitHub の画面をもう一度開く ↗</a>
      ${isFile && upload.converted ? `<button class="btn" type="button" id="dlAgain">⬇ zip をもう一度保存</button>` : ""}`;
    $("#dlAgain")?.addEventListener("click", () => saveBlob(upload.zipBlob, upload.zipName));
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  reg.addEventListener("input", () => { renderPreview(); saveDraft(); });
  reg.addEventListener("change", () => { renderPreview(); saveDraft(); });
  reg.addEventListener("submit", (e) => {
    e.preventDefault();
    const errs = validateReg();
    const box = $("#formErrors");
    if (errs.length) {
      box.hidden = false;
      box.innerHTML = `入力内容を確認してください<ul>${errs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    box.hidden = true;
    if (!REPO) return toast("送信先リポジトリが設定されていません");
    const url = issueURL();
    if (source() === "file" && upload.converted) saveBlob(upload.zipBlob, upload.zipName);
    window.open(url, "_blank", "noopener");
    showNext(url);
  });

  /* ---------- deep link ---------- */
  function fromHash() {
    const m = location.hash.match(/^#game=(.+)$/);
    if (m) return openDetail(decodeURIComponent(m[1]));
    const c = location.hash.match(/^#creator=(.+)$/);
    if (c) openCreator(decodeURIComponent(c[1]));
  }
  window.addEventListener("hashchange", fromHash);

  /* ---------- init ---------- */
  Stats.onChange(() => {
    renderTotal();
    renderRanking();
    renderGrid();
    refreshDetailStats();
    if (cdlg.open) { const m = location.hash.match(/^#creator=(.+)$/); if (m) renderCreatorPage(decodeURIComponent(m[1])); }
  });
  renderHero();
  renderRanking();
  renderChips();
  renderGrid();
  renderCreators();
  document.querySelectorAll("[data-review-days]").forEach((el) => (el.textContent = REVIEW_DAYS));
  restoreDraft();
  renderPreview();
  fromHash();
  Stats.loadPlays(GAMES.map((g) => g.id));
  History.load().then(() => {
    if (!History.has()) rankPeriod = "all";
    renderRanking();
    refreshDetailStats();
    if (cdlg.open) { const m = location.hash.match(/^#creator=(.+)$/); if (m) renderCreatorPage(decodeURIComponent(m[1])); }
  });
})();
