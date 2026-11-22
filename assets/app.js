(() => {
  "use strict";

  const COMMUNITY = window.COMMUNITY || { games: [], creators: {} };
  const GAMES = [...(window.GAMES || []), ...(COMMUNITY.games || [])];
  const GENRES = window.GENRES || {};
  const CREATORS = { ...(COMMUNITY.creators || {}), ...(window.CREATORS || {}) };
  const REPO = (window.SITE && window.SITE.repo) || "";
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

  reg.querySelectorAll("[name=source]").forEach((r) =>
    r.addEventListener("change", () => {
      reg.querySelectorAll(".src-panel").forEach((p) => (p.hidden = p.dataset.src !== source()));
    })
  );

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

  function showNext(url) {
    const isFile = source() === "file";
    const box = $("#nextSteps");
    box.hidden = false;
    box.innerHTML = `
      <h4>📮 あと少しで送信完了！</h4>
      <ol>
        <li>新しいタブで GitHub の登録画面が開きました（入力内容は自動で入っています）</li>
        ${isFile ? `<li><b>${esc(upload.zipName)}</b> を「ゲームファイル」欄にドラッグ＆ドロップ${upload.converted ? "（ダウンロードフォルダに保存しました）" : ""}</li>` : ""}
        <li>ルールにチェックして <b>Create</b> を押す</li>
        <li>数十秒で自動チェックの結果がコメントされます</li>
      </ol>
      <a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">GitHub の画面をもう一度開く ↗</a>
      ${isFile && upload.converted ? `<button class="btn" type="button" id="dlAgain">⬇ zip をもう一度保存</button>` : ""}`;
    $("#dlAgain")?.addEventListener("click", () => saveBlob(upload.zipBlob, upload.zipName));
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  reg.addEventListener("input", renderPreview);
  reg.addEventListener("change", renderPreview);
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
    if (m) openDetail(decodeURIComponent(m[1]));
  }
  window.addEventListener("hashchange", fromHash);

  /* ---------- init ---------- */
  renderHero();
  renderChips();
  renderGrid();
  renderCreators();
  renderPreview();
  fromHash();
})();
