/* ============================================================================
   Bibliotheca — the shelf itself
   Everything below is presentation and editing. Where the books live is
   store.js's business; this file only ever hands it { books, categories }.
   ========================================================================== */

(function () {
  "use strict";

  /* ── palette: the 16 category hues, fixed order ───────────────────── */
  const PALETTE = [
    { name: "Red",      hex: "#CC3333" }, { name: "Green",   hex: "#46CC33" },
    { name: "Blue",     hex: "#3359CC" }, { name: "Rose",    hex: "#CC336C" },
    { name: "Lime",     hex: "#80CC33" }, { name: "Sky Blue",hex: "#3393CC" },
    { name: "Magenta",  hex: "#CC33A6" }, { name: "Olive",   hex: "#94A329" },
    { name: "Teal",     hex: "#19B2B3" }, { name: "Purple",  hex: "#B933CC" },
    { name: "Gold",     hex: "#CCA633" }, { name: "Mint",    hex: "#33CC93" },
    { name: "Violet",   hex: "#7F33CC" }, { name: "Orange",  hex: "#CC6C33" },
    { name: "Emerald",  hex: "#33CC59" }, { name: "Indigo",  hex: "#4633CC" },
  ];
  const hexOf = (colorName) => (PALETTE.find(p => p.name === colorName) || {}).hex || "";

  /* ── state ────────────────────────────────────────────────────────── */
  const state = {
    books: [], categories: [], loaded: false,
    view: "library",
    q: "", cats: new Set(), lang: "", readFilter: "",
    sort: { key: "title", dir: 1 },
    editing: null, draft: null,
    openChecks: new Set(), showAllAuthors: false,
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

  /* ── talking to the store ─────────────────────────────────────────── */

  const payload = () => ({ books: state.books, categories: state.categories });

  function adopt(doc) {
    state.books = Array.isArray(doc && doc.books) ? doc.books.map(normalizeBook) : [];
    state.categories = Array.isArray(doc && doc.categories) && doc.categories.length
      ? doc.categories.map(c => ({ name: String(c.name || ""), color: c.color || "" })).filter(c => c.name)
      : [];
    state.loaded = true;
    renderAll();
  }

  function normalizeBook(b) {
    return {
      id: b.id || uid(),
      title: String(b.title || "").trim(),
      author: String(b.author || "").trim(),
      category: String(b.category || "").trim(),
      language: String(b.language || "").trim(),
      read: !!b.read,
      rating: Math.max(0, Math.min(5, Number(b.rating) || 0)),
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
  const countsByCategory = () => {
    const m = new Map();
    state.books.forEach(b => m.set(b.category, (m.get(b.category) || 0) + 1));
    return m;
  };
  const languages = () => {
    const m = new Map();
    state.books.forEach(b => { if (b.language) m.set(b.language, (m.get(b.language) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const authors = () => {
    const m = new Map();
    state.books.forEach(b => { if (b.author) m.set(b.author, (m.get(b.author) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  function visibleBooks() {
    const q = fold(state.q);
    const terms = q ? q.split(" ") : [];
    let list = state.books.filter(b => {
      if (state.cats.size && !state.cats.has(b.category)) return false;
      if (state.lang && b.language !== state.lang) return false;
      if (state.readFilter === "yes" && !b.read) return false;
      if (state.readFilter === "no" && b.read) return false;
      if (state.readFilter === "rated" && !b.rating) return false;
      if (state.readFilter === "unrated" && b.rating) return false;
      if (terms.length) {
        const hay = fold(b.title + " " + b.author + " " + b.notes + " " + b.category);
        if (!terms.every(t => hay.includes(t))) return false;
      }
      return true;
    });
    const { key, dir } = state.sort;
    const val = (b) => key === "rating" ? b.rating : key === "read" ? (b.read ? 1 : 0) : fold(b[key] || "￿");
    list.sort((a, b) => {
      const x = val(a), y = val(b);
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
    const counts = countsByCategory();
    const wrap = $("#catFilters");
    wrap.innerHTML = state.categories.map(c => {
      const n = counts.get(c.name) || 0;
      const on = state.cats.has(c.name);
      return '<button class="chip" data-cat="' + esc(c.name) + '" aria-pressed="' + on + '" style="--c:' + hexOf(c.color) + '">' +
             '<span class="swatch"></span>' + esc(c.name) + ' <span class="n">' + n + '</span></button>';
    }).join("") + (state.cats.size ? '<button class="btn ghost sm" id="clearCats">clear</button>' : "");

    const langSel = $("#fLang");
    const current = state.lang;
    langSel.innerHTML = '<option value="">All languages</option>' +
      languages().map(([l, n]) => '<option value="' + esc(l) + '">' + esc(l) + " · " + n + "</option>").join("");
    langSel.value = current;
  }

  function starsInner(rating, editable) {
    let out = "";
    for (let i = 1; i <= 5; i++) {
      const on = i <= rating ? "on" : "";
      out += editable
        ? '<button class="' + on + '" data-star="' + i + '" aria-label="' + i + ' star' + (i > 1 ? "s" : "") + '">★</button>'
        : '<span class="' + on + '">★</span>';
    }
    return out;
  }
  function starsHtml(rating, editable, id) {
    return '<span class="stars' + (editable ? "" : " read-only") + (rating ? "" : " zero") + '"' +
      (id ? ' data-stars="' + id + '"' : "") + ">" + starsInner(rating, editable) + "</span>";
  }

  function renderRows() {
    const list = visibleBooks();
    const box = $("#rows");
    $("#viewMeta").textContent = !state.loaded ? "loading…"
      : list.length === state.books.length
        ? state.books.length + " books"
        : list.length + " of " + state.books.length + " books";

    if (!state.loaded) { box.innerHTML = '<div class="empty"><p>Opening your library…</p></div>'; return; }
    if (!list.length) {
      box.innerHTML = '<div class="empty"><p>' +
        (state.books.length ? "Nothing matches these filters." : "Your library is empty.") +
        '</p><button class="btn" id="emptyAction">' +
        (state.books.length ? "Clear filters" : "Add the first book") + "</button></div>";
      return;
    }

    box.innerHTML = list.map(b => {
      const c = catColor(b.category);
      return '<div class="row" data-id="' + b.id + '" style="--c:' + (c || "transparent") + '" tabindex="0">' +
        '<div class="title truncate">' + (esc(b.title) || '<span class="unset">Untitled</span>') + "</div>" +
        '<div class="author truncate">' + (esc(b.author) || '<span class="unset">unknown</span>') + "</div>" +
        '<div class="cat">' + (b.category
            ? '<span class="swatch"></span><span class="truncate">' + esc(b.category) + "</span>"
            : '<span class="unset">uncategorised</span>') + "</div>" +
        '<div class="lang truncate">' + esc(b.language) + "</div>" +
        '<div class="rate">' + starsHtml(b.rating, true, b.id) + "</div>" +
        '<button class="readmark" data-read="' + b.id + '" aria-pressed="' + b.read + '" ' +
          'aria-label="' + (b.read ? "Mark as unread" : "Mark as read") + '">✓</button>' +
      "</div>";
    }).join("");
  }

  /* ── insights ─────────────────────────────────────────────────────── */
  function renderInsights() {
    const books = state.books;
    const read = books.filter(b => b.read).length;
    const rated = books.filter(b => b.rating > 0);
    const avg = rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : 0;
    const tiles = [
      ["Volumes", books.length, ""],
      ["Read", read, books.length ? Math.round(read / books.length * 100) + "%" : ""],
      ["Unread", books.length - read, ""],
      ["Rated", rated.length, rated.length ? avg.toFixed(2) + " avg" : ""],
      ["Authors", authors().length, ""],
      ["Languages", languages().length, ""],
    ];
    $("#tiles").innerHTML = tiles.map(([label, v, sub]) =>
      '<div class="tile"><div class="eyebrow">' + label + "</div>" +
      '<div class="v">' + v + (sub ? " <small>" + sub + "</small>" : "") + "</div></div>").join("");

    const counts = countsByCategory();
    const catRows = state.categories
      .map(c => ({ label: c.name, v: counts.get(c.name) || 0, hex: hexOf(c.color) }))
      .filter(r => r.v > 0).sort((a, b) => b.v - a.v);

    const ratingByCat = state.categories.map(c => {
      const rs = books.filter(b => b.category === c.name && b.rating > 0);
      return { label: c.name, v: rs.length ? rs.reduce((s, b) => s + b.rating, 0) / rs.length : 0,
               n: rs.length, hex: hexOf(c.color) };
    }).filter(r => r.n > 0).sort((a, b) => b.v - a.v);

    const repeats = authors().filter(([, n]) => n > 1).map(([a, n]) => ({ label: a, v: n }));
    const AUTHOR_CAP = 15;
    const topAuthors = state.showAllAuthors ? repeats : repeats.slice(0, AUTHOR_CAP);
    const hidden = repeats.length - topAuthors.length;

    const langRows = languages().map(([l, n]) => ({ label: l, v: n }));

    const dist = [5, 4, 3, 2, 1].map(r => ({
      label: "★".repeat(r), v: books.filter(b => b.rating === r).length,
    }));

    const bars = (rows, opts) => {
      opts = opts || {};
      if (!rows.length) return '<p class="note" style="margin:0">' + (opts.empty || "Nothing to show yet.") + "</p>";
      const max = opts.max || Math.max(...rows.map(r => r.v)) || 1;
      return '<div class="bars">' + rows.map(r =>
        '<div class="bar-row" style="--c:' + (r.hex || "var(--ink-2)") + '">' +
          '<div class="bar-label">' + (r.hex ? '<span class="swatch"></span>' : "") +
            "<span>" + esc(r.label) + "</span></div>" +
          '<div class="bar-track"><div class="bar-fill" style="width:' +
            (Math.max(r.v, 0) / max * 100).toFixed(1) + '%"></div></div>' +
          '<div class="bar-val">' + (opts.fmt ? opts.fmt(r) : r.v) + "</div>" +
        "</div>").join("") + "</div>";
    };

    $("#panels").innerHTML =
      panel("Books by category", "Every volume, counted by its shelf.", bars(catRows)) +
      panel("Average rating by category", "Unrated books are left out of the average.",
        bars(ratingByCat, { max: 5, fmt: r => r.v.toFixed(1),
          empty: "No ratings yet — rate a few books and this fills in." })) +
      panel("Authors with more than one book", "The spines that repeat on the shelf.",
        bars(topAuthors, { empty: "No author appears twice yet." }) +
        (hidden > 0 || state.showAllAuthors
          ? '<p class="more"><button class="btn sm" id="btnMoreAuthors">' +
            (state.showAllAuthors ? "Show the top 15" : "Show " + hidden + " more") + "</button></p>"
          : ""), true) +
      panel("Languages", "How the collection splits by language of the edition.", bars(langRows)) +
      panel("Rating distribution", "How you spend your stars.",
        bars(dist, { empty: "No ratings yet." }));
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

    // 1. duplicates — same title and author
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

    // 2. uncategorised
    const uncat = books.filter(b => !b.category);
    checks.push({ id: "uncat", severity: uncat.length ? "warn" : "ok",
      name: "Uncategorised books", desc: "No category assigned",
      items: uncat.map(b => ({ book: b, sub: "no category", acts: ["open"] })) });

    // 3. category not in the category list
    const orphan = books.filter(b => b.category && !catNames.has(b.category));
    checks.push({ id: "orphan", severity: orphan.length ? "warn" : "ok",
      name: "Unknown categories", desc: "Category is not on the Categories list, so it has no colour",
      items: orphan.map(b => ({ book: b, sub: '"' + b.category + '" is not a defined category',
        acts: ["open", "addcat"] })) });

    // 4. missing author or language
    const incomplete = books.filter(b => !b.author || !b.language);
    checks.push({ id: "missing", severity: incomplete.length ? "warn" : "ok",
      name: "Missing details", desc: "Author or language left blank",
      items: incomplete.map(b => ({ book: b,
        sub: [!b.author ? "no author" : null, !b.language ? "no language" : null].filter(Boolean).join(" · "),
        acts: ["open"] })) });

    // 5. author spelling variants
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

    // 6. read but unrated
    const unrated = books.filter(b => b.read && !b.rating);
    checks.push({ id: "unrated", severity: "info",
      name: "Read but unrated", desc: "Finished books with no stars yet",
      items: unrated.map(b => ({ book: b, sub: "read · no rating", acts: ["open"] })) });

    // 7. rated but not marked read
    const ghost = books.filter(b => !b.read && b.rating > 0);
    checks.push({ id: "ghost", severity: ghost.length ? "warn" : "ok",
      name: "Rated but not marked read", desc: "A rating without a read mark",
      items: ghost.map(b => ({ book: b, sub: b.rating + " stars · not marked read", acts: ["markread", "open"] })) });

    // 8. same author in two languages (informational — usually deliberate)
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
      if (a === "delete")   return '<button class="btn sm danger" data-fix="delete" data-id="' + id + '">Delete</button>';
      if (a === "markread") return '<button class="btn sm" data-fix="markread" data-id="' + id + '">Mark read</button>';
      if (a === "addcat")   return '<button class="btn sm" data-fix="addcat" data-id="' + id + '">Add category</button>';
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
    const used = new Set(state.categories.map(c => c.color));
    $("#viewMeta").textContent = state.categories.length + " categories · " +
      (PALETTE.length - used.size) + " colours free";
    $("#catsMeta").textContent = "Renaming a category renames it on every book that uses it.";

    $("#cats").innerHTML = state.categories.map((c, i) => {
      const n = counts.get(c.name) || 0;
      return '<div class="cat-row" style="--c:' + hexOf(c.color) + '" data-i="' + i + '">' +
        '<span class="bead"></span>' +
        '<input type="text" value="' + esc(c.name) + '" data-rename="' + i + '" aria-label="Category name">' +
        '<div class="swatches">' + PALETTE.map(p =>
          '<button data-color="' + esc(p.name) + '" data-i="' + i + '" style="--c:' + p.hex + '" ' +
          'aria-pressed="' + (p.name === c.color) + '" title="' + esc(p.name) +
          (used.has(p.name) && p.name !== c.color ? " (in use)" : "") + '"></button>').join("") + "</div>" +
        '<div class="n">' + n + "</div>" +
        '<button class="btn ghost sm" data-delcat="' + i + '">Remove</button>' +
      "</div>";
    }).join("");
  }

  /* ── drawer ───────────────────────────────────────────────────────── */
  function openDrawer(book) {
    state.editing = book ? book.id : null;
    state.draft = book ? Object.assign({}, book) : normalizeBook({ added: new Date().toISOString() });
    $("#drawerTitle").textContent = book ? "Edit book" : "Add book";
    $("#btnDelete").hidden = !book;
    $("#fTitle").value = state.draft.title;
    $("#fAuthor").value = state.draft.author;
    $("#fLangIn").value = state.draft.language;
    $("#fNotes").value = state.draft.notes;
    $("#fRead2").checked = state.draft.read;

    const known = state.categories.map(c => c.name);
    const extra = state.draft.category && !known.includes(state.draft.category) ? [state.draft.category] : [];
    $("#fCat").innerHTML = '<option value="">— uncategorised —</option>' +
      known.concat(extra).map(n => '<option value="' + esc(n) + '">' + esc(n) + "</option>").join("");
    $("#fCat").value = state.draft.category;
    $("#catHint").hidden = !extra.length;
    if (extra.length) $("#catHint").textContent = "“" + extra[0] + "” isn't on the Categories list yet.";

    $("#authorList").innerHTML = authors().map(([a]) => '<option value="' + esc(a) + '">').join("");
    $("#langList").innerHTML = languages().map(([l]) => '<option value="' + esc(l) + '">').join("");
    drawStars();

    $("#drawer").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    $("#scrim").classList.add("open");
    document.body.classList.add("no-scroll");
    // Focus now, not on a timer: a late focus can steal a keystroke aimed at
    // the field below it and drop it into the title.
    if (!isPhone()) $("#fTitle").focus({ preventScroll: true });
  }

  const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

  function drawStars() {
    $("#fStars").innerHTML = starsInner(state.draft.rating, true);
  }

  function closeDrawer() {
    $("#drawer").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    $("#scrim").classList.remove("open");
    document.body.classList.remove("no-scroll");
    state.editing = null; state.draft = null;
  }

  function saveDrawer() {
    const d = state.draft;
    if (!d) return;
    d.title = $("#fTitle").value.trim();
    d.author = $("#fAuthor").value.trim();
    d.category = $("#fCat").value;
    d.language = $("#fLangIn").value.trim();
    d.notes = $("#fNotes").value;
    d.read = $("#fRead2").checked;
    if (!d.title) { toast("A book needs a title."); $("#fTitle").focus(); return; }

    if (state.editing) {
      const i = state.books.findIndex(b => b.id === state.editing);
      if (i > -1) state.books[i] = normalizeBook(d);
      commit("Saved", true);
    } else {
      state.books.unshift(normalizeBook(d));
      commit("Added “" + d.title + "”", true);
    }
    closeDrawer();
  }

  /* ── import / export ──────────────────────────────────────────────── */
  const STAR = (n) => "★".repeat(n) + "☆".repeat(5 - n);

  function libraryRows() {
    return state.books.map(b => ({
      Title: b.title, Author: b.author, Category: b.category, Language: b.language,
      Read: b.read ? "TRUE" : "FALSE", Rating: b.rating || "",
      Stars: b.rating ? STAR(b.rating) : "", Notes: b.notes,
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
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(libraryRows()), "Library");
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(
      state.categories.map(c => ({ Category: c.name, Color: c.color, Hex: hexOf(c.color),
        Books: countsByCategory().get(c.name) || 0 }))), "Categories");
    const counts = countsByCategory();
    const summary = state.categories.map(c => {
      const rs = state.books.filter(b => b.category === c.name && b.rating > 0);
      return { Category: c.name, Books: counts.get(c.name) || 0,
        Read: state.books.filter(b => b.category === c.name && b.read).length,
        Rated: rs.length,
        "Avg rating": rs.length ? +(rs.reduce((s, b) => s + b.rating, 0) / rs.length).toFixed(2) : "" };
    });
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(summary), "Insights");
    const buf = X.write(wb, { bookType: "xlsx", type: "array" });
    offer("Bibliotheca.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  function exportCsv() {
    const rows = libraryRows();
    const cols = Object.keys(rows[0] || { Title: "", Author: "" });
    const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const csv = "﻿" + [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n");
    offer("Bibliotheca.csv", csv, "text/csv;charset=utf-8");
  }

  function exportJson() {
    offer("Bibliotheca-backup.json", JSON.stringify(
      { books: state.books, categories: state.categories, version: 1,
        exported: new Date().toISOString() }, null, 2), "application/json");
  }

  function importFile(file) {
    const reader = new FileReader();
    const isJson = /\.json$/i.test(file.name);
    reader.onload = async () => {
      try {
        let books = [], cats = null;
        if (isJson) {
          const doc = JSON.parse(reader.result);
          books = (doc.books || []).map(normalizeBook);
          if (Array.isArray(doc.categories) && doc.categories.length) cats = doc.categories;
        } else {
          let X;
          try { X = await withXlsx(); }
          catch (e) { toast("Couldn't fetch the spreadsheet library."); return; }
          const wb = X.read(new Uint8Array(reader.result), { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames.find(n => /librar|books|sheet1/i.test(n)) || wb.SheetNames[0]];
          const raw = X.utils.sheet_to_json(sheet, { defval: "" });
          books = raw.map(r => {
            const pick = (...keys) => {
              for (const k of keys) {
                const hit = Object.keys(r).find(h => h.trim().toLowerCase() === k);
                if (hit && String(r[hit]).trim() !== "") return String(r[hit]).trim();
              }
              return "";
            };
            const ratingRaw = pick("rating", "rating (1-5)", "stars");
            const stars = (ratingRaw.match(/★/g) || []).length;
            const readRaw = pick("read", "status").toLowerCase();
            return normalizeBook({
              title: pick("title"), author: pick("author"), category: pick("category"),
              language: pick("language"),
              read: readRaw === "true" || readRaw === "yes" || readRaw === "finished" || readRaw === "1",
              rating: stars || Number(ratingRaw) || 0,
              notes: pick("notes"),
            });
          }).filter(b => b.title);

          const catSheetName = wb.SheetNames.find(n => /categor/i.test(n));
          if (catSheetName) {
            const rows = X.utils.sheet_to_json(wb.Sheets[catSheetName], { defval: "" });
            const parsed = rows.map(r => {
              const k = Object.keys(r);
              const nameKey = k.find(h => /^category$/i.test(h.trim()));
              const colorKey = k.find(h => /^colou?r$/i.test(h.trim()));
              return { name: nameKey ? String(r[nameKey]).trim() : "",
                       color: colorKey ? String(r[colorKey]).trim() : "" };
            }).filter(c => c.name);
            if (parsed.length) cats = parsed;
          }
        }

        if (!books.length) { toast("No books found in that file."); return; }
        const replace = state.books.length > 0 &&
          confirm(books.length + " books found.\n\nOK — replace the library with this file.\nCancel — add only books that aren't already here.");

        if (replace || !state.books.length) {
          state.books = books;
          if (cats) state.categories = cats.map(c => ({ name: c.name, color: c.color }));
        } else {
          const have = new Set(state.books.map(b => fold(b.title) + "|" + fold(b.author)));
          const added = books.filter(b => !have.has(fold(b.title) + "|" + fold(b.author)));
          state.books = state.books.concat(added);
          if (cats) {
            const names = new Set(state.categories.map(c => c.name));
            cats.forEach(c => { if (!names.has(c.name)) state.categories.push({ name: c.name, color: c.color }); });
          }
        }
        ensureCategoryColors();
        commit(replace ? "Library replaced — " + state.books.length + " books" :
                         "Merged — " + state.books.length + " books total", true);
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
    if (author) {
      const mine = state.books.filter(b => fold(b.author) === fold(author) && b.category);
      if (mine.length) {
        const tally = new Map();
        mine.forEach(b => tally.set(b.category, (tally.get(b.category) || 0) + 1));
        const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
        return { category: best[0], why: best[1] + " other " + (best[1] === 1 ? "book" : "books") + " by this author" };
      }
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
    state.books.forEach(b => { if (b.author === from) { b.author = to; n++; } });
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

  function setView(v) {
    state.view = v;
    $$(".nav button").forEach(b => b.setAttribute("aria-current", String(b.dataset.view === v)));
    $$(".view").forEach(s => { s.hidden = s.id !== "view-" + v; });
    $("#viewTitle").textContent = { library: "Library", insights: "Insights", checks: "Checks", categories: "Categories" }[v];
    $("#libControls").style.display = v === "library" ? "" : "none";
    $("#catFilters").style.display = v === "library" ? "" : "none";
    const hideAdd = v === "categories" || v === "checks";
    $("#btnAdd").style.display = hideAdd ? "none" : "";
    $("#btnAddFab").hidden = hideAdd;
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
      if (state.books.length) { state.q = ""; $("#q").value = ""; state.cats.clear(); state.lang = ""; state.readFilter = "";
        $("#fLang").value = ""; $("#fRead").value = ""; renderFilters(); renderRows(); }
      else openDrawer(null);
      return;
    }

    const star = closest("[data-star]");
    if (star) {
      e.stopPropagation();
      const holder = star.closest("[data-stars]");
      const v = Number(star.dataset.star);
      if (holder) {
        const b = state.books.find(x => x.id === holder.dataset.stars);
        if (b) { b.rating = b.rating === v ? 0 : v; if (b.rating && !b.read) b.read = true; commit(); }
      } else if (state.draft) {
        state.draft.rating = state.draft.rating === v ? 0 : v;
        drawStars();
      }
      return;
    }

    const readBtn = closest("[data-read]");
    if (readBtn) {
      e.stopPropagation();
      const b = state.books.find(x => x.id === readBtn.dataset.read);
      if (b) { b.read = !b.read; commit(); }
      return;
    }

    const row = closest(".row");
    if (row) { const b = state.books.find(x => x.id === row.dataset.id); if (b) openDrawer(b); return; }

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
      if (kind === "open" && b) openDrawer(b);
      if (kind === "markread" && b) { b.read = true; commit("Marked read", true); }
      if (kind === "delete" && b && confirm("Delete “" + b.title + "”?")) {
        state.books = state.books.filter(x => x.id !== b.id); commit("Deleted", true);
      }
      if (kind === "addcat" && b) {
        state.categories.push({ name: b.category, color: "" }); ensureCategoryColors();
        commit("Added category “" + b.category + "”", true);
      }
      if (kind === "mergeA") renameAuthor(fix.dataset.b, fix.dataset.a);
      if (kind === "mergeB") renameAuthor(fix.dataset.a, fix.dataset.b);
      return;
    }

    const swatch = closest(".swatches button");
    if (swatch) {
      const c = state.categories[Number(swatch.dataset.i)];
      if (c) { c.color = swatch.dataset.color; commit(); }
      return;
    }

    const del = closest("[data-delcat]");
    if (del) {
      const i = Number(del.dataset.delcat), c = state.categories[i];
      const n = countsByCategory().get(c.name) || 0;
      if (n && !confirm("“" + c.name + "” is on " + n + " book" + (n === 1 ? "" : "s") +
        ". Remove it? Those books become uncategorised.")) return;
      state.books.forEach(b => { if (b.category === c.name) b.category = ""; });
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
    if (t.id === "btnCancel" || t.id === "drawerClose" || t.id === "scrim") return closeDrawer();
    if (t.id === "btnDelete") {
      const b = state.books.find(x => x.id === state.editing);
      if (b && confirm("Delete “" + b.title + "”?")) {
        state.books = state.books.filter(x => x.id !== b.id);
        closeDrawer(); commit("Deleted", true);
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
      state.books.forEach(b => { if (b.category === old) b.category = next; });
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
    if (e.key === "/") { e.preventDefault(); setView("library"); $("#q").focus(); }
    if (e.key.toLowerCase() === "n") { e.preventDefault(); openDrawer(null); }
  });

  document.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("row")) {
      const b = state.books.find(x => x.id === e.target.dataset.id);
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

  window.Bibliotheca = {
    boot(doc) {
      adopt(doc);
      Store.on("data", (fresh, info) => {
        const wasEditing = state.editing;
        adopt(fresh);
        if (info && info.incoming) toast(info.incoming + " change" + (info.incoming === 1 ? "" : "s") + " from another device");
        else if (info && info.reason === "remote") toast("Updated from another device");
        if (wasEditing && !state.books.some(b => b.id === wasEditing)) closeDrawer();
      });
    },
    payload: payload,
    toast: toast,
    adopt: adopt,
    state: state,
  };
})();
