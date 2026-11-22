(() => {
  "use strict";

  const GAMES = window.GAMES || [];
  const GENRES = window.GENRES || {};
  const CREATORS = window.CREATORS || {};
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

  function renderHero() {
    countUp($("#statGames"), GAMES.length);
    countUp($("#statCreators"), new Set(GAMES.map((g) => g.author)).size);
    countUp($("#statGenres"), new Set(GAMES.flatMap((g) => g.genres || [])).size);

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

  /* ---------- render: creators ---------- */
  function renderCreators() {
    const ids = [...new Set([...Object.keys(CREATORS), ...GAMES.map((g) => g.author)])];
    $("#creatorList").innerHTML =
      ids.map((id) => {
        const c = creatorOf({ author: id });
        const n = GAMES.filter((g) => g.author === id).length;
        return `<button class="creator" type="button" data-author="${esc(id)}">
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
        <h2 id="dTitle">${esc(g.title)}</h2>
        <p class="catch">${esc(g.catch)}</p>
        <p class="desc">${esc(g.desc)}</p>
        <dl class="d-specs">
          <div><dt>クリエイター</dt><dd>${esc(c.avatar)} ${esc(c.name)}</dd></div>
          <div><dt>ジャンル</dt><dd>${(g.genres || []).map((k) => esc(GENRES[k]?.label || k)).join("・")}</dd></div>
          <div><dt>プレイ時間</dt><dd>約 ${g.minutes || "?"} 分</dd></div>
          <div><dt>対応端末</dt><dd>${deviceLabel(g.devices)}</dd></div>
          <div><dt>言語</dt><dd>${esc((g.langs || []).join(" / "))}</dd></div>
          <div><dt>公開日</dt><dd>${fmtDate(g.added)}</dd></div>
        </dl>
        <div class="d-actions">
          <button class="btn btn-primary" type="button" data-play="${esc(g.id)}">▶ いますぐ遊ぶ</button>
          <button class="btn" type="button" data-fav="${esc(g.id)}" aria-pressed="${fav}">${fav ? "♥ お気に入り済み" : "♡ お気に入り"}</button>
          <button class="btn" type="button" data-share="${esc(g.id)}">🔗 共有</button>
        </div>
        ${more.length ? `<div class="d-more"><h4>こちらもおすすめ</h4><div class="mini-list">${more.map((m) => `<button class="mini" type="button" data-open="${esc(m.id)}">${thumbHTML(m, { title: false })}<span>${esc(m.title)}</span></button>`).join("")}</div></div>` : ""}
      </div>`;
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
    history.replaceState(null, "", `#game=${encodeURIComponent(g.id)}`);
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
  function play(id) {
    const g = GAMES.find((x) => x.id === id);
    if (!g) return;
    closeDetail();
    $("#playerTitle").textContent = g.title;
    $("#newTab").href = g.url;
    frame.src = g.url;
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
    const t = e.target.closest("[data-fav],[data-play],[data-share],[data-close],[data-open],[data-genre],[data-author],#clearAuthor");
    if (!t) return;
    if (t.dataset.fav) { e.stopPropagation(); toggleFav(t.dataset.fav); }
    else if (t.dataset.play) play(t.dataset.play);
    else if (t.dataset.share) share(t.dataset.share);
    else if (t.hasAttribute("data-close")) closeDetail();
    else if (t.dataset.open) openDetail(t.dataset.open);
    else if (t.dataset.genre) { state.genre = t.dataset.genre; renderChips(); renderGrid(); }
    else if (t.dataset.author) { state.author = t.dataset.author; renderGrid(); $("#games").scrollIntoView(); }
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

  /* ---------- submission generator ---------- */
  const form = $("#genForm");
  $("#genGenres").innerHTML = Object.entries(GENRES)
    .map(([k, v]) => `<label><input type="checkbox" name="genres" value="${k}">${v.emoji} ${esc(v.label)}</label>`).join("");
  function genOutput() {
    const fd = new FormData(form);
    const id = (fd.get("id") || "my-awesome-game").toString().trim();
    const today = new Date().toISOString().slice(0, 10);
    const entry = {
      id,
      title: fd.get("title") || "My Awesome Game",
      catch: fd.get("catch") || "ひとことで魅力を！",
      desc: fd.get("desc") || "どんなゲーム？ 遊び方は？",
      author: fd.get("author") || "your-github-id",
      url: fd.get("url") || `games/${id}/index.html`,
      genres: fd.getAll("genres").length ? fd.getAll("genres") : ["casual"],
      devices: ["pc", "mobile"],
      minutes: Number(fd.get("minutes")) || 1,
      langs: ["日本語"],
      added: today,
      emoji: fd.get("emoji") || "🎮",
      colors: ["#4d9bff", "#ff5a8f"],
    };
    const json = JSON.stringify(entry, null, 2).replace(/"(\w+)":/g, "$1:");
    $("#genOut").textContent = `// games.js の GAMES 配列に追加\n${json},`;
  }
  form.addEventListener("input", genOutput);
  form.addEventListener("submit", (e) => e.preventDefault());
  $("#copyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#genOut").textContent); toast("コピーしました！"); }
    catch { toast("コピーできませんでした"); }
  });

  /* ---------- deep link ---------- */
  function fromHash() {
    const m = location.hash.match(/^#game=(.+)$/);
    if (m) openDetail(decodeURIComponent(m[1]));
  }
  window.addEventListener("hashchange", fromHash);

  /* ---------- init ---------- */
  renderHero();
  renderChips();
  renderGrid();
  renderCreators();
  genOutput();
  fromHash();
})();
