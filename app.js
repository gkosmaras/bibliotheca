/* ============================================================================
   Bibliotheca — the shelf itself
   Everything below is presentation and editing. Where the books live is
   store.js's business; this file only ever hands it { books, wishlist,
   categories }.
   ========================================================================== */

(function () {
  "use strict";

  /* ── palette ──────────────────────────────────────────────────────────
     Two rings of sixteen. The first is the original set, unchanged, so a
     category keeps the colour it was given. The second sits half a hue-step
     across and lighter, so the two rings read as different colours rather
     than as near-misses of each other.                                     */
  const PALETTE = [
    { name: "Red",        hex: "#CC3333" }, { name: "Green",      hex: "#46CC33" },
    { name: "Blue",       hex: "#3359CC" }, { name: "Rose",       hex: "#CC336C" },
    { name: "Lime",       hex: "#80CC33" }, { name: "Sky Blue",   hex: "#3393CC" },
    { name: "Magenta",    hex: "#CC33A6" }, { name: "Olive",      hex: "#94A329" },
    { name: "Teal",       hex: "#19B2B3" }, { name: "Purple",     hex: "#B933CC" },
    { name: "Gold",       hex: "#CCA633" }, { name: "Mint",       hex: "#33CC93" },
    { name: "Violet",     hex: "#7F33CC" }, { name: "Orange",     hex: "#CC6C33" },
    { name: "Emerald",    hex: "#33CC59" }, { name: "Indigo",     hex: "#4633CC" },
    { name: "Coral",      hex: "#DA7F6A" }, { name: "Apricot",    hex: "#DAA96A" },
    { name: "Wheat",      hex: "#DAD36A" }, { name: "Pear",       hex: "#B7DA6A" },
    { name: "Fern",       hex: "#8DDA6A" }, { name: "Jade",       hex: "#6ADA71" },
    { name: "Seafoam",    hex: "#6ADA9B" }, { name: "Aqua",       hex: "#6ADAC5" },
    { name: "Cerulean",   hex: "#6AC5DA" }, { name: "Cornflower", hex: "#6A9BDA" },
    { name: "Periwinkle", hex: "#6A71DA" }, { name: "Lavender",   hex: "#8D6ADA" },
    { name: "Orchid",     hex: "#B76ADA" }, { name: "Fuchsia",    hex: "#DA6AD3" },
    { name: "Blush",      hex: "#DA6AA9" }, { name: "Peony",      hex: "#DA6A7F" },
  ];
  const hexOf = (colorName) => (PALETTE.find(p => p.name === colorName) || {}).hex || "";

  /* ── state ────────────────────────────────────────────────────────── */
  const LISTS = { library: "books", wishlist: "wishlist" };

  const state = {
    books: [], wishlist: [], categories: [], loaded: false,
    view: "library",
    q: "", cats: new Set(), lang: "", readFilter: "",
    sort: { key: "title", dir: 1 },
    editing: null, editingIn: "books", draft: null,
    openChecks: new Set(), openCat: null, showAllAuthors: false,
  };

  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Greek-aware normalisation: strip accents, fold final sigma, drop punctuation.
  const fold = (s) => String(s == null ? "" : s)
    .toLocaleLowerCase("el")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ς/g, "σ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim();

  const uid = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Which array the current view is looking at.
  const listKey = () => LISTS[state.view] || "books";
  const rows    = () => state[listKey()];
  const isList  = () => state.view === "library" || state.view === "wishlist";

  /* ── talking to the store ─────────────────────────────────────────── */

  const payload = () => ({
    books: state.books, wishlist: state.wishlist, categories: state.categories,
  });

  function adopt(doc) {
    state.books = Array.isArray(doc && doc.books) ? doc.books.map(normalizeBook) : [];
    state.wishlist = Array.isArray(doc && doc.wishlist) ? doc.wishlist.map(normalizeBook) : [];
    state.categories = Array.isArray(doc && doc.categories) && doc.categories.length
      ? doc.categories.map(c => ({ name: String(c.name || ""), color: c.color || "" })).filter(c => c.name)
      : [];
    state.loaded = true;
    renderAll();
  }

  const num = (v, max) => {
    if (v == null || v === "") return null;
    const n = Math.round(Number(v));
    return isFinite(n) && n > 0 ? Math.min(n, max) : null;
  };

  function normalizeBook(b) {
    return {
      id: b.id || uid(),
      title: String(b.title || "").trim(),
      author: String(b.author || "").trim(),
      category: String(b.category || "").trim(),
      language: String(b.language || "").trim(),
      read: !!b.read,
      year: num(b.year, 2999),
      pages: num(b.pages, 99999),
      series: String(b.series || "").trim(),
      seriesNo: num(b.seriesNo, 999),
      notes: String(b.notes || ""),
      added: b.added || null,
    };
  }

  function commit(message, immediate) {
    Store.save(payload(), immediate);
    renderAll();
    if (message) toast(message);
  }

  /* ── derived data ─────────────────────────────────────────────────── */
  const catColor = (name) => {
    const c = state.categories.find(x => x.name === name);
    return c ? hexOf(c.color) : "";
  };
  const countsByCategory = (src) => {
    const m = new Map();
    (src || state.books).forEach(b => m.set(b.category, (m.get(b.category) || 0) + 1));
    return m;
  };
  const languages = (src) => {
    const m = new Map();
    (src || state.books).forEach(b => { if (b.language) m.set(b.language, (m.get(b.language) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const authors = (src) => {
    const m = new Map();
    (src || state.books).forEach(b => { if (b.author) m.set(b.author, (m.get(b.author) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  function visibleBooks() {
    const q = fold(state.q);
    const terms = q ? q.split(" ") : [];
    const list = rows().filter(b => {
      if (state.cats.size && !state.cats.has(b.category)) return false;
      if (state.lang && b.language !== state.lang) return false;
      if (state.readFilter === "yes" && !b.read) return false;
      if (state.readFilter === "no" && b.read) return false;
      if (terms.length) {
        const hay = fold(b.title + " " + b.author + " " + b.notes + " " + b.category + " " + b.series);
        if (!terms.every(t => hay.includes(t))) return false;
      }
      return true;
    });

    const { key, dir } = state.sort;
    // Numbers sort as numbers, and a blank always sinks to the bottom whichever
    // way the arrow points.
    const numeric = key === "year" || key === "pages";
    const val = (b) => numeric ? b[key] : key === "read" ? (b.read ? 1 : 0) : fold(b[key] || "￿");
    list.sort((a, b) => {
      const x = val(a), y = val(b);
      if (numeric) {
        if (x == null && y == null) return fold(a.title).localeCompare(fold(b.title));
        if (x == null) return 1;
        if (y == null) return -1;
      }
      if (x < y) return -dir;
      if (x > y) return dir;
      return fold(a.title).localeCompare(fold(b.title));
    });
    return list;
  }

  /* ── rendering ────────────────────────────────────────────────────── */
  function renderAll() {
    renderNav();
    renderFilters();
    renderRows();
    if (state.view === "insights") renderInsights();
    if (state.view === "checks") renderChecks();
    if (state.view === "categories") renderCategories();
  }

  function renderNav() {
    const read = state.books.filter(b => b.read).length;
    $("#navLibrary").textContent = state.books.length || "—";
    $("#navWishlist").textContent = state.wishlist.length || "—";
    $("#navCats").textContent = state.categories.length || "—";
    $("#navInsights").textContent = state.books.length ? Math.round(read / state.books.length * 100) + "%" : "—";
    const issues = runChecks().filter(c => c.severity !== "ok" && c.severity !== "info")
      .reduce((n, c) => n + c.items.length, 0);
    const el = $("#navChecks");
    el.textContent = state.loaded ? (issues || "0") : "—";
    el.className = "count mono" + (issues ? " flag" : "");
    $("#brandSub").textContent = state.books.length
      ? state.books.length + " volumes · " + read + " read"
      : "personal library";
  }

  function renderFilters() {
    const counts = countsByCategory(isList() ? rows() : state.books);
    $("#catFilters").innerHTML = state.categories.map(c => {
      const n = counts.get(c.name) || 0;
      const on = state.cats.has(c.name);
      return '<button class="chip' + (n ? "" : " zero") + '" data-cat="' + esc(c.name) + '" aria-pressed="' + on + '" style="--c:' + hexOf(c.color) + '">' +
             '<span class="swatch"></span>' + esc(c.name) + ' <span class="n">' + n + '</span></button>';
    }).join("") + (state.cats.size ? '<button class="btn ghost sm" id="clearCats">clear</button>' : "");

    const langSel = $("#fLang");
    const current = state.lang;
    langSel.innerHTML = '<option value="">All languages</option>' +
      languages(isList() ? rows() : state.books)
        .map(([l, n]) => '<option value="' + esc(l) + '">' + esc(l) + " · " + n + "</option>").join("");
    langSel.value = current;
  }

  function renderRows() {
    if (!isList()) return;
    const list = visibleBooks();
    const all = rows();
    const box = $("#rows");
    const noun = state.view === "wishlist" ? "wanted" : "books";
    $("#viewMeta").textContent = !state.loaded ? "loading…"
      : list.length === all.length ? all.length + " " + noun
      : list.length + " of " + all.length + " " + noun;

    if (!state.loaded) { box.innerHTML = '<div class="empty"><p>Opening your library…</p></div>'; return; }
    if (!list.length) {
      box.innerHTML = '<div class="empty"><p>' +
        (all.length ? "Nothing matches these filters."
          : state.view === "wishlist" ? "Nothing on the wishlist yet."
          : "Your library is empty.") +
        '</p><button class="btn" id="emptyAction">' +
        (all.length ? "Clear filters" : state.view === "wishlist" ? "Add something you want" : "Add the first book") +
        "</button></div>";
      return;
    }

    const wish = state.view === "wishlist";
    box.innerHTML = list.map(b => {
      const c = catColor(b.category);
      const ser = b.series
        ? '<span class="ser">' + esc(b.series) + (b.seriesNo ? " " + b.seriesNo : "") + "</span>"
        : "";
      return '<div class="row" data-id="' + b.id + '" style="--c:' + (c || "transparent") + '" tabindex="0">' +
        '<div class="title truncate">' + (esc(b.title) || '<span class="unset">Untitled</span>') + ser + "</div>" +
        '<div class="author truncate">' + (esc(b.author) || '<span class="unset">unknown</span>') + "</div>" +
        '<div class="cat">' + (b.category
            ? '<span class="swatch"></span><span class="truncate">' + esc(b.category) + "</span>"
            : '<span class="unset">uncategorised</span>') + "</div>" +
        '<div class="lang truncate">' + esc(b.language) + "</div>" +
        '<div class="year mono">' + (b.year || '<span class="unset">—</span>') + "</div>" +
        '<div class="pages mono">' + (b.pages || '<span class="unset">—</span>') + "</div>" +
        (wish
          ? '<button class="movemark" data-move="' + b.id + '" title="I bought it — move to the library" ' +
            'aria-label="Move to the library">→</button>'
          : '<button class="readmark" data-read="' + b.id + '" aria-pressed="' + b.read + '" ' +
            'aria-label="' + (b.read ? "Mark as unread" : "Mark as read") + '">✓</button>') +
      "</div>";
    }).join("");
  }

  /* ── insights ─────────────────────────────────────────────────────── */
  function renderInsights() {
    const books = state.books;
    const read = books.filter(b => b.read).length;
    const withPages = books.filter(b => b.pages);
    const totalPages = withPages.reduce((s, b) => s + b.pages, 0);
    const years = books.map(b => b.year).filter(Boolean).sort((a, b) => a - b);

    const tiles = [
      ["Volumes", books.length, ""],
      ["Read", read, books.length ? Math.round(read / books.length * 100) + "%" : ""],
      ["Unread", books.length - read, ""],
      ["Wishlist", state.wishlist.length, ""],
      ["Authors", authors().length, ""],
      ["Languages", languages().length, ""],
    ];
    if (totalPages) tiles.push(["Pages", totalPages.toLocaleString(),
      withPages.length < books.length ? "from " + withPages.length + " of " + books.length : ""]);
    if (years.length) tiles.push(["Median year", years[Math.floor(years.length / 2)],
      years[0] + "–" + years[years.length - 1]]);

    $("#tiles").innerHTML = tiles.map(([label, v, sub]) =>
      '<div class="tile"><div class="eyebrow">' + label + "</div>" +
      '<div class="v">' + v + (sub ? " <small>" + sub + "</small>" : "") + "</div></div>").join("");

    const counts = countsByCategory();
    const catRows = state.categories
      .map(c => ({ label: c.name, v: counts.get(c.name) || 0, hex: hexOf(c.color) }))
      .filter(r => r.v > 0).sort((a, b) => b.v - a.v);

    // read vs unread, so it's clear where the backlog actually sits
    const backlog = state.categories.map(c => {
      const inCat = books.filter(b => b.category === c.name);
      return { label: c.name, hex: hexOf(c.color),
               done: inCat.filter(b => b.read).length, left: inCat.filter(b => !b.read).length };
    }).filter(r => r.done + r.left > 0).sort((a, b) => b.left - a.left || (b.done + b.left) - (a.done + a.left));

    const repeats = authors().filter(([, n]) => n > 1).map(([a, n]) => ({ label: a, v: n }));
    const AUTHOR_CAP = 15;
    const topAuthors = state.showAllAuthors ? repeats : repeats.slice(0, AUTHOR_CAP);
    const hidden = repeats.length - topAuthors.length;
    const langRows = languages().map(([l, n]) => ({ label: l, v: n }));

    const bars = (list, opts) => {
      opts = opts || {};
      if (!list.length) return '<p class="note" style="margin:0">' + (opts.empty || "Nothing to show yet.") + "</p>";
      const max = opts.max || Math.max(...list.map(r => r.v)) || 1;
      return '<div class="bars">' + list.map(r =>
        '<div class="bar-row" style="--c:' + (r.hex || "var(--ink-2)") + '">' +
          '<div class="bar-label">' + (r.hex ? '<span class="swatch"></span>' : "") +
            "<span>" + esc(r.label) + "</span></div>" +
          '<div class="bar-track"><div class="bar-fill" style="width:' +
            (Math.max(r.v, 0) / max * 100).toFixed(1) + '%"></div></div>' +
          '<div class="bar-val">' + (opts.fmt ? opts.fmt(r) : r.v) + "</div>" +
        "</div>").join("") + "</div>";
    };

    const split = (list) => {
      if (!list.length) return '<p class="note" style="margin:0">Nothing to show yet.</p>';
      const max = Math.max(...list.map(r => r.done + r.left)) || 1;
      return '<div class="bars">' + list.map(r =>
        '<div class="bar-row" style="--c:' + r.hex + '">' +
          '<div class="bar-label"><span class="swatch"></span><span>' + esc(r.label) + "</span></div>" +
          '<div class="bar-track split">' +
            '<div class="bar-fill" style="width:' + (r.done / max * 100).toFixed(1) + '%"></div>' +
            '<div class="bar-fill ghost" style="width:' + (r.left / max * 100).toFixed(1) + '%"></div>' +
          "</div>" +
          '<div class="bar-val">' + (r.left ? r.left : "—") + "</div>" +
        "</div>").join("") + "</div>" +
        '<p class="legend"><span class="key"></span>read<span class="key ghost"></span>unread ' +
        '<span class="legend-note">the number is what is left</span></p>';
    };

    $("#panels").innerHTML =
      panel("Books by category", "Every volume, counted by its shelf.", bars(catRows)) +
      panel("Where the backlog is", "Read against unread, worst first.", split(backlog)) +
      panel("Authors with more than one book", "The spines that repeat on the shelf.",
        bars(topAuthors, { empty: "No author appears twice yet." }) +
        (hidden > 0 || state.showAllAuthors
          ? '<p class="more"><button class="btn sm" id="btnMoreAuthors">' +
            (state.showAllAuthors ? "Show the top 15" : "Show " + hidden + " more") + "</button></p>"
          : ""), true) +
      panel("Languages", "How the collection splits by language of the edition.", bars(langRows));
  }

  const panel = (title, note, inner, wide) =>
    '<section class="panel' + (wide ? " wide" : "") + '"><h3>' + esc(title) + "</h3>" +
    '<p class="note">' + esc(note) + "</p>" + inner + "</section>";

  /* ── checks ───────────────────────────────────────────────────────── */
  function levenshtein(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 99;
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function runChecks() {
    const books = state.books;
    const catNames = new Set(state.categories.map(c => c.name));
    const checks = [];

    // 1. duplicates — same title, author and language
    const seen = new Map(), dups = [];
    books.forEach(b => {
      const key = fold(b.title) + "|" + fold(b.author) + "|" + fold(b.language);
      if (!fold(b.title)) return;
      if (seen.has(key)) dups.push({ book: b, other: seen.get(key) });
      else seen.set(key, b);
    });
    checks.push({ id: "dup", severity: dups.length ? "crit" : "ok",
      name: "Duplicate entries", desc: "Same title, author and language listed twice",
      items: dups.map(d => ({ book: d.book, sub: "also entered as a separate row", acts: ["open", "delete"] })) });

    // 2. already on the shelf — the point of a wishlist is not to buy it twice
    const owned = new Set(books.map(b => fold(b.title) + "|" + fold(b.author)));
    const already = state.wishlist.filter(w => fold(w.title) && owned.has(fold(w.title) + "|" + fold(w.author)));
    checks.push({ id: "have", severity: already.length ? "crit" : "ok",
      name: "On the wishlist but already owned", desc: "You have this one — don't buy it again",
      items: already.map(w => ({ book: w, list: "wishlist",
        sub: "already in the library", acts: ["openwish", "delwish"] })) });

    // 3. uncategorised
    const uncat = books.filter(b => !b.category);
    checks.push({ id: "uncat", severity: uncat.length ? "warn" : "ok",
      name: "Uncategorised books", desc: "No category assigned",
      items: uncat.map(b => ({ book: b, sub: "no category", acts: ["open"] })) });

    // 4. category not in the category list
    const orphan = books.filter(b => b.category && !catNames.has(b.category));
    checks.push({ id: "orphan", severity: orphan.length ? "warn" : "ok",
      name: "Unknown categories", desc: "Category is not on the Categories list, so it has no colour",
      items: orphan.map(b => ({ book: b, sub: '"' + b.category + '" is not a defined category',
        acts: ["open", "addcat"] })) });

    // 5. gaps in a series
    const bySeries = new Map();
    books.forEach(b => {
      if (!b.series || !b.seriesNo) return;
      const k = fold(b.series);
      if (!bySeries.has(k)) bySeries.set(k, { name: b.series, have: new Set(), sample: b });
      bySeries.get(k).have.add(b.seriesNo);
    });
    const wanted = new Set(state.wishlist.map(w => fold(w.series) + "#" + w.seriesNo));
    const gaps = [];
    bySeries.forEach((s, k) => {
      const nums = [...s.have].sort((a, b) => a - b);
      if (nums.length < 2) return;
      for (let n = nums[0]; n < nums[nums.length - 1]; n++) {
        if (!s.have.has(n) && !wanted.has(k + "#" + n)) {
          gaps.push({ plain: s.name + " — no " + n, series: s.name, no: n, author: s.sample.author,
            category: s.sample.category, language: s.sample.language,
            sub: "you have " + nums.join(", "), acts: ["wantit"] });
        }
      }
    });
    checks.push({ id: "series", severity: gaps.length ? "warn" : "ok",
      name: "Gaps in a series", desc: "A numbered volume missing between ones you own",
      items: gaps });

    // 6. missing author or language
    const incomplete = books.filter(b => !b.author || !b.language);
    checks.push({ id: "missing", severity: incomplete.length ? "warn" : "ok",
      name: "Missing details", desc: "Author or language left blank",
      items: incomplete.map(b => ({ book: b,
        sub: [!b.author ? "no author" : null, !b.language ? "no language" : null].filter(Boolean).join(" · "),
        acts: ["open"] })) });

    // 7. author spelling variants
    const names = authors().map(([a]) => a);
    const variants = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = fold(names[i]), b = fold(names[j]);
        if (!a || !b || a === b) continue;
        if (levenshtein(a, b) <= 2) variants.push([names[i], names[j]]);
      }
    }
    checks.push({ id: "variants", severity: variants.length ? "warn" : "ok",
      name: "Author name variants", desc: "Near-identical spellings that are probably one person",
      items: variants.map(([a, b]) => ({ pair: [a, b], acts: ["merge"] })) });

    // 8. year or pages not filled in yet
    const thin = books.filter(b => !b.year || !b.pages);
    checks.push({ id: "thin", severity: "info",
      name: "No year or page count", desc: "Fill these in and the Insights page gets more to say",
      items: thin.map(b => ({ book: b,
        sub: [!b.year ? "no year" : null, !b.pages ? "no page count" : null].filter(Boolean).join(" · "),
        acts: ["open"] })) });

    // 9. same author in two languages (informational — usually deliberate)
    const langPairs = new Map();
    books.forEach(b => {
      const k = fold(b.author);
      if (!k) return;
      if (!langPairs.has(k)) langPairs.set(k, new Set());
      langPairs.get(k).add(b.language);
    });
    const twoLang = [];
    langPairs.forEach((set, k) => { if (set.size > 1) twoLang.push(k); });
    checks.push({ id: "bilingual", severity: "info",
      name: "Authors you read in both languages", desc: "Not a problem — just how the shelf sits",
      items: twoLang.map(k => {
        const b = books.find(x => fold(x.author) === k);
        return { plain: (b ? b.author : k), sub: [...langPairs.get(k)].filter(Boolean).join(" · ") };
      }) });

    return checks;
  }

  function renderChecks() {
    const checks = runChecks();
    const issues = checks.filter(c => c.severity === "warn" || c.severity === "crit")
      .reduce((n, c) => n + c.items.length, 0);
    $("#viewMeta").textContent = issues ? issues + " to look at" : "everything checks out";

    $("#checks").innerHTML = checks.map(c => {
      const open = state.openChecks.has(c.id);
      const sev = c.items.length ? c.severity : "ok";
      return '<article class="check">' +
        '<button class="check-head" data-check="' + c.id + '" aria-expanded="' + open + '">' +
          '<span class="sev ' + sev + '"></span>' +
          '<span class="name">' + esc(c.name) + "</span>" +
          '<span class="desc">' + esc(c.desc) + "</span>" +
          '<span class="n">' + (c.items.length || "clear") + "</span>" +
        "</button>" +
        '<div class="check-body"' + (open && c.items.length ? "" : " hidden") + ">" +
          (c.items.length ? c.items.map(it => renderFix(c, it)).join("") : "") +
        "</div></article>";
    }).join("");
  }

  function renderFix(check, it) {
    const acts = (it.acts || []).map(a => {
      const id = it.book ? it.book.id : "";
      if (a === "open")     return '<button class="btn sm" data-fix="open" data-id="' + id + '">Open</button>';
      if (a === "openwish") return '<button class="btn sm" data-fix="openwish" data-id="' + id + '">Open</button>';
      if (a === "delete")   return '<button class="btn sm danger" data-fix="delete" data-id="' + id + '">Delete</button>';
      if (a === "delwish")  return '<button class="btn sm danger" data-fix="delwish" data-id="' + id + '">Remove from wishlist</button>';
      if (a === "addcat")   return '<button class="btn sm" data-fix="addcat" data-id="' + id + '">Add category</button>';
      if (a === "wantit")   return '<button class="btn sm" data-fix="wantit" data-series="' + esc(it.series) +
                                   '" data-no="' + it.no + '" data-author="' + esc(it.author || "") +
                                   '" data-cat="' + esc(it.category || "") + '" data-lang="' + esc(it.language || "") +
                                   '">Add to wishlist</button>';
      if (a === "merge")    return '<button class="btn sm" data-fix="mergeA" data-a="' + esc(it.pair[0]) + '" data-b="' + esc(it.pair[1]) + '">Use “' + esc(it.pair[0]) + '”</button>' +
                                   '<button class="btn sm" data-fix="mergeB" data-a="' + esc(it.pair[0]) + '" data-b="' + esc(it.pair[1]) + '">Use “' + esc(it.pair[1]) + '”</button>';
      return "";
    }).join("");
    const label = it.book ? esc(it.book.title) : it.pair ? esc(it.pair[0]) + "  ·  " + esc(it.pair[1]) : esc(it.plain);
    const sub = it.book ? esc(it.book.author) + (it.sub ? " — " + esc(it.sub) : "") : esc(it.sub || "");
    return '<div class="fix"><div class="what"><div class="t">' + label + "</div>" +
      '<div class="s">' + sub + "</div></div>" +
      (acts ? '<div class="acts">' + acts + "</div>" : "") + "</div>";
  }

  /* ── categories ───────────────────────────────────────────────────── */
  function renderCategories() {
    const counts = countsByCategory();
    const wishCounts = countsByCategory(state.wishlist);
    const used = new Set(state.categories.map(c => c.color));
    $("#viewMeta").textContent = state.categories.length + " categories · " +
      (PALETTE.length - used.size) + " colours free";
    $("#catsMeta").textContent = "Renaming a category renames it on every book and wishlist entry that uses it.";

    // 32 swatches on every row at once is a wall of colour; each row opens its
    // own picker instead, and closes when you have chosen.
    $("#cats").innerHTML = state.categories.map((c, i) => {
      const n = counts.get(c.name) || 0;
      const w = wishCounts.get(c.name) || 0;
      const open = state.openCat === i;
      return '<div class="cat-row' + (open ? " open" : "") + '" style="--c:' + hexOf(c.color) + '" data-i="' + i + '">' +
        '<span class="bead"></span>' +
        '<input type="text" value="' + esc(c.name) + '" data-rename="' + i + '" aria-label="Category name">' +
        '<button class="colourpick" data-pick="' + i + '" aria-expanded="' + open + '">' +
          '<span class="bead sm"></span>' + esc(c.color || "no colour") + "</button>" +
        '<div class="n">' + n + (w ? '<span class="w" title="' + w + ' on the wishlist">+' + w + "</span>" : "") + "</div>" +
        '<button class="btn ghost sm" data-delcat="' + i + '">Remove</button>' +
        '<div class="swatches"' + (open ? "" : " hidden") + ">" + PALETTE.map(p =>
          '<button data-color="' + esc(p.name) + '" data-i="' + i + '" style="--c:' + p.hex + '" ' +
          'aria-pressed="' + (p.name === c.color) + '" title="' + esc(p.name) +
          (used.has(p.name) && p.name !== c.color ? " (in use)" : "") + '"></button>').join("") + "</div>" +
      "</div>";
    }).join("");
  }

  /* ── drawer ───────────────────────────────────────────────────────── */
  function openDrawer(book, which) {
    const where = which || (state.view === "wishlist" ? "wishlist" : "books");
    state.editingIn = where;
    state.editing = book ? book.id : null;
    state.draft = book ? Object.assign({}, book) : normalizeBook({ added: new Date().toISOString() });

    const wish = where === "wishlist";
    $("#drawerTitle").textContent = book
      ? (wish ? "Edit wanted book" : "Edit book")
      : (wish ? "Add to wishlist" : "Add book");
    $("#btnDelete").hidden = !book;
    $("#btnDelete").textContent = wish ? "Remove" : "Delete";
    $("#btnBought").hidden = !(book && wish);
    $("#fTitle").value = state.draft.title;
    $("#fAuthor").value = state.draft.author;
    $("#fLangIn").value = state.draft.language;
    $("#fYear").value = state.draft.year || "";
    $("#fPages").value = state.draft.pages || "";
    $("#fSeries").value = state.draft.series;
    $("#fSeriesNo").value = state.draft.seriesNo || "";
    $("#fNotes").value = state.draft.notes;
    $("#fRead2").checked = state.draft.read;

    const known = state.categories.map(c => c.name);
    const extra = state.draft.category && !known.includes(state.draft.category) ? [state.draft.category] : [];
    $("#fCat").innerHTML = '<option value="">— uncategorised —</option>' +
      known.concat(extra).map(n => '<option value="' + esc(n) + '">' + esc(n) + "</option>").join("");
    $("#fCat").value = state.draft.category;
    $("#catHint").hidden = !extra.length;
    if (extra.length) $("#catHint").textContent = "“" + extra[0] + "” isn't on the Categories list yet.";

    const everything = state.books.concat(state.wishlist);
    $("#authorList").innerHTML = authors(everything).map(([a]) => '<option value="' + esc(a) + '">').join("");
    $("#langList").innerHTML = languages(everything).map(([l]) => '<option value="' + esc(l) + '">').join("");
    $("#seriesList").innerHTML = [...new Set(everything.map(b => b.series).filter(Boolean))]
      .sort().map(s => '<option value="' + esc(s) + '">').join("");

    $("#drawer").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    $("#scrim").classList.add("open");
    document.body.classList.add("no-scroll");
    // Focus now, not on a timer: a late focus can steal a keystroke aimed at
    // the field below it and drop it into the title.
    if (!isPhone()) $("#fTitle").focus({ preventScroll: true });
  }

  const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

  function closeDrawer() {
    $("#drawer").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    $("#scrim").classList.remove("open");
    document.body.classList.remove("no-scroll");
    state.editing = null; state.draft = null;
  }

  function readDraft() {
    const d = state.draft;
    d.title = $("#fTitle").value.trim();
    d.author = $("#fAuthor").value.trim();
    d.category = $("#fCat").value;
    d.language = $("#fLangIn").value.trim();
    d.year = num($("#fYear").value, 2999);
    d.pages = num($("#fPages").value, 99999);
    d.series = $("#fSeries").value.trim();
    d.seriesNo = num($("#fSeriesNo").value, 999);
    d.notes = $("#fNotes").value;
    d.read = $("#fRead2").checked;
    return d;
  }

  function saveDrawer() {
    if (!state.draft) return;
    const d = readDraft();
    if (!d.title) { toast("A book needs a title."); $("#fTitle").focus(); return; }
    const where = state.editingIn;
    const list = state[where];
    const wish = where === "wishlist";

    if (state.editing) {
      const i = list.findIndex(b => b.id === state.editing);
      if (i > -1) list[i] = normalizeBook(d);
      commit("Saved", true);
    } else {
      list.unshift(normalizeBook(d));
      commit((wish ? "Added “" : "Added “") + d.title + "”" + (wish ? " to the wishlist" : ""), true);
    }
    closeDrawer();
  }

  // Bought it: the entry moves across, keeping its id and everything on it.
  function moveToLibrary(id, fromDrawer) {
    const i = state.wishlist.findIndex(b => b.id === id);
    if (i < 0) return;
    const book = state.wishlist[i];
    if (fromDrawer && state.draft && state.editing === id) Object.assign(book, normalizeBook(readDraft()));
    book.added = new Date().toISOString();
    state.wishlist.splice(i, 1);
    state.books.unshift(book);
    if (fromDrawer) closeDrawer();
    commit("“" + book.title + "” moved to the library", true);
  }

  function wantMissing(d) {
    const entry = normalizeBook({
      title: d.series + " " + d.no, author: d.author, category: d.cat,
      language: d.lang, series: d.series, seriesNo: Number(d.no),
      added: new Date().toISOString(),
    });
    state.wishlist.unshift(entry);
    commit("Added “" + entry.title + "” to the wishlist", true);
    setView("wishlist");
    const fresh = state.wishlist.find(b => b.id === entry.id);
    if (fresh) openDrawer(fresh, "wishlist");
  }

  /* ── import / export ──────────────────────────────────────────────── */

  function sheetRows(list) {
    return list.map(b => ({
      Title: b.title, Author: b.author, Category: b.category, Language: b.language,
      Read: b.read ? "TRUE" : "FALSE",
      Year: b.year || "", Pages: b.pages || "",
      Series: b.series, "Series no": b.seriesNo || "",
      Notes: b.notes,
    }));
  }

  function offer(filename, data, mime) {
    try {
      const blob = data instanceof Blob ? data
        : new Blob([data], { type: mime || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Saved " + filename);
    } catch (e) { toast("Couldn't save the file."); }
  }

  // SheetJS is 900KB. It only loads when you actually reach for Excel.
  let sheetjs = null;
  function withXlsx() {
    if (typeof XLSX !== "undefined") return Promise.resolve(XLSX);
    if (sheetjs) return sheetjs;
    toast("Fetching the spreadsheet library…");
    sheetjs = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { sheetjs = null; reject(new Error("no network")); };
      document.head.appendChild(s);
    });
    return sheetjs;
  }

  async function exportXlsx() {
    let X;
    try { X = await withXlsx(); }
    catch (e) { toast("Couldn't fetch the spreadsheet library — try CSV."); return; }
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(sheetRows(state.books)), "Library");
    if (state.wishlist.length)
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(sheetRows(state.wishlist)), "Wishlist");
    const counts = countsByCategory(), wishCounts = countsByCategory(state.wishlist);
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(
      state.categories.map(c => ({ Category: c.name, Color: c.color, Hex: hexOf(c.color),
        Books: counts.get(c.name) || 0, Wishlist: wishCounts.get(c.name) || 0 }))), "Categories");
    const summary = state.categories.map(c => {
      const inCat = state.books.filter(b => b.category === c.name);
      const pages = inCat.filter(b => b.pages);
      return { Category: c.name, Books: inCat.length,
        Read: inCat.filter(b => b.read).length,
        Unread: inCat.filter(b => !b.read).length,
        Pages: pages.reduce((s, b) => s + b.pages, 0) || "",
        Wishlist: wishCounts.get(c.name) || 0 };
    });
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(summary), "Insights");
    const buf = X.write(wb, { bookType: "xlsx", type: "array" });
    offer("Bibliotheca.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  function exportCsv() {
    const which = state.view === "wishlist" ? state.wishlist : state.books;
    const list = sheetRows(which);
    const cols = Object.keys(list[0] || { Title: "", Author: "" });
    const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const csv = "﻿" + [cols.join(","), ...list.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n");
    offer(state.view === "wishlist" ? "Bibliotheca-wishlist.csv" : "Bibliotheca.csv",
      csv, "text/csv;charset=utf-8");
  }

  function exportJson() {
    offer("Bibliotheca-backup.json", JSON.stringify(
      { books: state.books, wishlist: state.wishlist, categories: state.categories,
        version: 2, exported: new Date().toISOString() }, null, 2), "application/json");
  }

  function importFile(file) {
    const reader = new FileReader();
    const isJson = /\.json$/i.test(file.name);
    const into = state.view === "wishlist" ? "wishlist" : "books";
    reader.onload = async () => {
      try {
        let books = [], cats = null, wish = null;
        if (isJson) {
          const doc = JSON.parse(reader.result);
          books = (doc.books || []).map(normalizeBook);
          if (Array.isArray(doc.wishlist)) wish = doc.wishlist.map(normalizeBook);
          if (Array.isArray(doc.categories) && doc.categories.length) cats = doc.categories;
        } else {
          let X;
          try { X = await withXlsx(); }
          catch (e) { toast("Couldn't fetch the spreadsheet library."); return; }
          const wb = X.read(new Uint8Array(reader.result), { type: "array" });
          const pickSheet = (re) => wb.SheetNames.find(n => re.test(n));
          const parseSheet = (name) => {
            const raw = X.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
            return raw.map(r => {
              const pick = (...keys) => {
                for (const k of keys) {
                  const hit = Object.keys(r).find(h => h.trim().toLowerCase() === k);
                  if (hit && String(r[hit]).trim() !== "") return String(r[hit]).trim();
                }
                return "";
              };
              const readRaw = pick("read", "status").toLowerCase();
              return normalizeBook({
                title: pick("title"), author: pick("author"), category: pick("category"),
                language: pick("language"),
                read: readRaw === "true" || readRaw === "yes" || readRaw === "finished" || readRaw === "1",
                year: pick("year", "published", "year published"),
                pages: pick("pages", "page count"),
                series: pick("series"), seriesNo: pick("series no", "series number", "no"),
                notes: pick("notes"),
              });
            }).filter(b => b.title);
          };
          const main = pickSheet(/librar|books|sheet1/i) || wb.SheetNames[0];
          books = parseSheet(main);
          const wishSheet = pickSheet(/wish/i);
          if (wishSheet) wish = parseSheet(wishSheet);

          const catSheetName = pickSheet(/categor/i);
          if (catSheetName) {
            const rowsIn = X.utils.sheet_to_json(wb.Sheets[catSheetName], { defval: "" });
            const parsed = rowsIn.map(r => {
              const k = Object.keys(r);
              const nameKey = k.find(h => /^category$/i.test(h.trim()));
              const colorKey = k.find(h => /^colou?r$/i.test(h.trim()));
              return { name: nameKey ? String(r[nameKey]).trim() : "",
                       color: colorKey ? String(r[colorKey]).trim() : "" };
            }).filter(c => c.name);
            if (parsed.length) cats = parsed;
          }
        }

        // A wishlist view importing a plain list puts it on the wishlist.
        if (into === "wishlist" && !wish) { wish = books; books = []; }

        if (!books.length && !(wish && wish.length)) { toast("No books found in that file."); return; }

        const target = books.length ? "books" : "wishlist";
        const incoming = books.length ? books : wish;
        const replace = state[target].length > 0 &&
          confirm(incoming.length + " entries found.\n\nOK — replace the " +
            (target === "books" ? "library" : "wishlist") + " with this file.\nCancel — add only what isn't already there.");

        const mergeInto = (key, list) => {
          if (!list) return;
          if (replace && key === target) state[key] = list;
          else {
            const have = new Set(state[key].map(b => fold(b.title) + "|" + fold(b.author)));
            state[key] = state[key].concat(list.filter(b => !have.has(fold(b.title) + "|" + fold(b.author))));
          }
        };
        mergeInto("books", books.length ? books : null);
        mergeInto("wishlist", wish);

        if (cats) {
          if (replace) state.categories = cats.map(c => ({ name: c.name, color: c.color }));
          else {
            const names = new Set(state.categories.map(c => c.name));
            cats.forEach(c => { if (!names.has(c.name)) state.categories.push({ name: c.name, color: c.color }); });
          }
        }
        ensureCategoryColors();
        commit("Imported — " + state.books.length + " books, " + state.wishlist.length + " wanted", true);
      } catch (e) {
        toast("Couldn't read that file.");
      }
    };
    if (isJson) reader.readAsText(file); else reader.readAsArrayBuffer(file);
  }

  function ensureCategoryColors() {
    const used = new Set(state.categories.map(c => c.color).filter(Boolean));
    state.categories.forEach(c => {
      if (!c.color || !hexOf(c.color)) {
        const free = PALETTE.find(p => !used.has(p.name)) || PALETTE[used.size % PALETTE.length];
        c.color = free.name; used.add(free.name);
      }
    });
  }

  /* ── category suggestion, from your own shelf ─────────────────────── */
  function localSuggestion(title, author) {
    const everything = state.books.concat(state.wishlist);
    if (author) {
      const mine = everything.filter(b => fold(b.author) === fold(author) && b.category);
      if (mine.length) {
        const tally = new Map();
        mine.forEach(b => tally.set(b.category, (tally.get(b.category) || 0) + 1));
        const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
        return { category: best[0], why: best[1] + " other " + (best[1] === 1 ? "book" : "books") + " by this author" };
      }
    }
    const series = $("#fSeries").value.trim();
    if (series) {
      const sameSeries = everything.find(b => fold(b.series) === fold(series) && b.category);
      if (sameSeries) return { category: sameSeries.category, why: "the rest of the series" };
    }
    const hay = fold(title + " " + $("#fNotes").value);
    const hit = state.categories.find(c => c.name.split(/[\s/]+/).some(w => w.length > 3 && hay.includes(fold(w))));
    return hit ? { category: hit.name, why: "the title mentions it" } : null;
  }

  function suggestCategory() {
    const title = $("#fTitle").value.trim(), author = $("#fAuthor").value.trim();
    if (!title) { toast("Enter a title first."); return; }
    const s = localSuggestion(title, author);
    if (!s) { toast("No match on your shelf — pick a category yourself."); return; }
    $("#fCat").value = s.category;
    $("#catHint").hidden = false;
    $("#catHint").textContent = "Your shelf suggests " + s.category +
      (s.why ? " — " + s.why : "") + ". Change it if you disagree.";
  }

  function renameAuthor(from, to) {
    let n = 0;
    [state.books, state.wishlist].forEach(list =>
      list.forEach(b => { if (b.author === from) { b.author = to; n++; } }));
    commit("Renamed " + n + " " + (n === 1 ? "entry" : "entries") + " to “" + to + "”", true);
  }

  /* ── events ───────────────────────────────────────────────────────── */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  const TITLES = { library: "Library", wishlist: "Wishlist", insights: "Insights",
                   checks: "Checks", categories: "Categories" };

  function setView(v) {
    state.view = v;
    $$(".nav button").forEach(b => b.setAttribute("aria-current", String(b.dataset.view === v)));
    $$(".view").forEach(s => { s.hidden = s.id !== "view-" + (isList() ? "list" : v); });
    $("#viewTitle").textContent = TITLES[v];
    const list = isList();
    $("#libControls").style.display = list ? "" : "none";
    $("#catFilters").style.display = list ? "" : "none";
    $("#btnAdd").style.display = list ? "" : "none";
    $("#btnAdd").textContent = v === "wishlist" ? "Add to wishlist" : "Add book";
    $("#btnAddFab").hidden = !list;
    $("#q").placeholder = v === "wishlist"
      ? "Search the wishlist…" : "Search titles, authors, notes…";
    document.body.classList.toggle("wishing", v === "wishlist");
    renderAll();
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    const closest = (sel) => t.closest ? t.closest(sel) : null;

    const navBtn = closest(".nav button");
    if (navBtn) return setView(navBtn.dataset.view);

    const chip = closest(".chip[data-cat]");
    if (chip) {
      const name = chip.dataset.cat;
      state.cats.has(name) ? state.cats.delete(name) : state.cats.add(name);
      renderFilters(); renderRows(); return;
    }
    if (t.id === "clearCats") { state.cats.clear(); renderFilters(); renderRows(); return; }

    if (t.id === "emptyAction") {
      if (rows().length) { state.q = ""; $("#q").value = ""; state.cats.clear(); state.lang = ""; state.readFilter = "";
        $("#fLang").value = ""; $("#fRead").value = ""; renderFilters(); renderRows(); }
      else openDrawer(null);
      return;
    }

    const readBtn = closest("[data-read]");
    if (readBtn) {
      e.stopPropagation();
      const b = rows().find(x => x.id === readBtn.dataset.read);
      if (b) { b.read = !b.read; commit(); }
      return;
    }

    const moveBtn = closest("[data-move]");
    if (moveBtn) { e.stopPropagation(); return moveToLibrary(moveBtn.dataset.move); }

    const row = closest(".row");
    if (row) { const b = rows().find(x => x.id === row.dataset.id); if (b) openDrawer(b); return; }

    const checkHead = closest("[data-check]");
    if (checkHead) {
      const id = checkHead.dataset.check;
      state.openChecks.has(id) ? state.openChecks.delete(id) : state.openChecks.add(id);
      renderChecks(); return;
    }

    const fix = closest("[data-fix]");
    if (fix) {
      const kind = fix.dataset.fix;
      const b = state.books.find(x => x.id === fix.dataset.id);
      const w = state.wishlist.find(x => x.id === fix.dataset.id);
      if (kind === "open" && b) { setView("library"); openDrawer(b, "books"); }
      if (kind === "openwish" && w) { setView("wishlist"); openDrawer(w, "wishlist"); }
      if (kind === "delete" && b && confirm("Delete “" + b.title + "”?")) {
        state.books = state.books.filter(x => x.id !== b.id); commit("Deleted", true);
      }
      if (kind === "delwish" && w && confirm("Remove “" + w.title + "” from the wishlist?")) {
        state.wishlist = state.wishlist.filter(x => x.id !== w.id); commit("Removed from the wishlist", true);
      }
      if (kind === "addcat" && b) {
        state.categories.push({ name: b.category, color: "" }); ensureCategoryColors();
        commit("Added category “" + b.category + "”", true);
      }
      if (kind === "wantit") wantMissing(fix.dataset);
      if (kind === "mergeA") renameAuthor(fix.dataset.b, fix.dataset.a);
      if (kind === "mergeB") renameAuthor(fix.dataset.a, fix.dataset.b);
      return;
    }

    const pick = closest("[data-pick]");
    if (pick) {
      const i = Number(pick.dataset.pick);
      state.openCat = state.openCat === i ? null : i;
      renderCategories();
      return;
    }

    const swatch = closest(".swatches button");
    if (swatch) {
      const c = state.categories[Number(swatch.dataset.i)];
      if (c) { c.color = swatch.dataset.color; state.openCat = null; commit(); }
      return;
    }

    const del = closest("[data-delcat]");
    if (del) {
      const i = Number(del.dataset.delcat), c = state.categories[i];
      const n = (countsByCategory().get(c.name) || 0) + (countsByCategory(state.wishlist).get(c.name) || 0);
      if (n && !confirm("“" + c.name + "” is on " + n + " entr" + (n === 1 ? "y" : "ies") +
        ". Remove it? Those become uncategorised.")) return;
      [state.books, state.wishlist].forEach(list =>
        list.forEach(b => { if (b.category === c.name) b.category = ""; }));
      state.categories.splice(i, 1);
      commit("Removed “" + c.name + "”", true);
      return;
    }

    if (t.id === "btnAddCat") {
      state.categories.push({ name: "New category", color: "" });
      ensureCategoryColors(); commit();
      const input = $('[data-rename="' + (state.categories.length - 1) + '"]');
      if (input) { input.focus(); input.select(); }
      return;
    }

    if (t.id === "btnMoreAuthors") { state.showAllAuthors = !state.showAllAuthors; renderInsights(); return; }
    if (t.id === "btnAdd" || t.id === "btnAddFab") return openDrawer(null);
    if (t.id === "btnSave") return saveDrawer();
    if (t.id === "btnBought") return moveToLibrary(state.editing, true);
    if (t.id === "btnCancel" || t.id === "drawerClose" || t.id === "scrim") return closeDrawer();
    if (t.id === "btnDelete") {
      const where = state.editingIn;
      const b = state[where].find(x => x.id === state.editing);
      if (b && confirm((where === "wishlist" ? "Remove “" : "Delete “") + b.title + "”?")) {
        state[where] = state[where].filter(x => x.id !== b.id);
        closeDrawer(); commit(where === "wishlist" ? "Removed" : "Deleted", true);
      }
      return;
    }
    if (t.id === "btnSuggest") return suggestCategory();
    if (t.id === "btnXlsx") return exportXlsx();
    if (t.id === "btnCsv") return exportCsv();
    if (t.id === "btnJson") return exportJson();
    if (t.id === "btnImport") return $("#fileInput").click();

    const sortBtn = closest("[data-sort]");
    if (sortBtn) {
      const key = sortBtn.dataset.sort;
      if (state.sort.key === key) state.sort.dir *= -1;
      else state.sort = { key: key, dir: 1 };
      $$("[data-arrow]").forEach(a => a.textContent = "");
      const arrow = $('[data-arrow="' + key + '"]');
      if (arrow) arrow.textContent = state.sort.dir > 0 ? "↑" : "↓";
      renderRows();
      return;
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "fLang") { state.lang = t.value; renderRows(); }
    if (t.id === "fRead") { state.readFilter = t.value; renderRows(); }
    if (t.id === "tint") document.body.classList.toggle("tinted", t.checked);
    if (t.id === "fileInput" && t.files && t.files[0]) { importFile(t.files[0]); t.value = ""; }
    const rename = t.matches && t.matches("[data-rename]") ? t : null;
    if (rename) {
      const i = Number(rename.dataset.rename), c = state.categories[i];
      const next = rename.value.trim();
      if (!c || !next || next === c.name) { renderCategories(); return; }
      if (state.categories.some((x, j) => j !== i && x.name === next)) { toast("That category already exists."); renderCategories(); return; }
      const old = c.name;
      [state.books, state.wishlist].forEach(list =>
        list.forEach(b => { if (b.category === old) b.category = next; }));
      c.name = next;
      if (state.cats.has(old)) { state.cats.delete(old); state.cats.add(next); }
      commit("Renamed to “" + next + "”", true);
    }
  });

  let qTimer;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    const v = e.target.value;
    qTimer = setTimeout(() => { state.q = v; renderRows(); }, 120);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.draft) return closeDrawer();
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) {
      if (e.key === "Enter" && state.draft && document.activeElement.id !== "fNotes") saveDrawer();
      return;
    }
    if (e.key === "/") { e.preventDefault(); if (!isList()) setView("library"); $("#q").focus(); }
    if (e.key.toLowerCase() === "n") { e.preventDefault(); if (isList()) openDrawer(null); }
  });

  document.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("row")) {
      const b = rows().find(x => x.id === e.target.dataset.id);
      if (b) openDrawer(b);
    }
  });

  // An edit made a moment before the tab closes still has to reach GitHub.
  window.addEventListener("pagehide", () => { if (Store.dirty) Store.flush(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && Store.dirty) Store.flush();
  });
  window.addEventListener("beforeunload", (e) => {
    if (Store.dirty || Store.inflight) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ── go ───────────────────────────────────────────────────────────── */
  document.body.classList.add("tinted");

  // Files written by the first version of the app carry a rating on every book
  // and no wishlist at all.
  function needsUpgrade(doc) {
    if (!doc) return false;
    if (!Array.isArray(doc.wishlist)) return true;
    return (doc.books || []).some(b => "rating" in b) ||
           (doc.wishlist || []).some(b => "rating" in b);
  }

  window.Bibliotheca = {
    boot(doc) {
      adopt(doc);
      if (needsUpgrade(doc)) {
        Store.upgrade(payload(), "Bibliotheca: drop ratings, add the wishlist");
      }
      Store.on("data", (fresh, info) => {
        const wasEditing = state.editing, wasIn = state.editingIn;
        adopt(fresh);
        if (info && info.incoming) toast(info.incoming + " change" + (info.incoming === 1 ? "" : "s") + " from another device");
        else if (info && info.reason === "remote") toast("Updated from another device");
        if (wasEditing && !state[wasIn].some(b => b.id === wasEditing)) closeDrawer();
      });
    },
    payload: payload,
    // gate.js hands the setup file through here, so the very first commit is
    // already in the current shape rather than needing an upgrade behind it.
    normalize: (doc) => ({
      books: ((doc && doc.books) || []).map(normalizeBook),
      wishlist: ((doc && doc.wishlist) || []).map(normalizeBook),
      categories: ((doc && doc.categories) || [])
        .map(c => ({ name: String(c.name || ""), color: c.color || "" })).filter(c => c.name),
    }),
    toast: toast,
    adopt: adopt,
    setView: setView,
    state: state,
    PALETTE: PALETTE,
  };
})();
