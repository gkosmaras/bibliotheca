/* ============================================================================
   Bibliotheca — storage
   ----------------------------------------------------------------------------
   The library lives in a GitHub repository as an encrypted file. Nothing
   readable ever leaves this browser: the books are sealed with AES-GCM under a
   key stretched from your password, and the GitHub write token is sealed the
   same way and kept beside them. A password is all you carry between devices.

   data/vault.json    { kdf, iv, ct }  ->  { token }
   data/library.json  { iv, ct }       ->  { books, categories, version, ... }

   Both files are committed through the GitHub Contents API, so every save is
   an ordinary commit and the whole history of the shelf is in git.
   ========================================================================== */

(function (global) {
  "use strict";

  /* ── config ──────────────────────────────────────────────────────────── */

  const DEFAULTS = {
    owner: "", repo: "", branch: "main",
    dataRepo: "",                       // blank = same repo as the app
    vaultRepo: "",                      // blank = same repo as the app
    vaultPath: "data/vault.json",
    dataPath: "data/library.json",
  };

  // Reads the repo out of the address bar so a fresh clone needs no editing:
  //   georgios.github.io/bibliotheca/  ->  owner georgios, repo bibliotheca
  //   georgios.github.io/              ->  owner georgios, repo georgios.github.io
  function detect() {
    const cfg = Object.assign({}, DEFAULTS, global.BIBLIOTHECA_CONFIG || {});
    const qs = new URLSearchParams(location.search);
    ["owner", "repo", "branch", "dataRepo", "vaultRepo"].forEach(k => { if (qs.get(k)) cfg[k] = qs.get(k); });

    try {
      const saved = JSON.parse(localStorage.getItem("bibliotheca.cfg") || "null");
      if (saved) Object.assign(cfg, saved);
    } catch (e) { /* ignore a corrupt override */ }

    if (!cfg.owner || !cfg.repo) {
      const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
      if (m) {
        cfg.owner = cfg.owner || m[1];
        const seg = location.pathname.split("/").filter(Boolean)[0];
        cfg.repo = cfg.repo || (seg && !/\./.test(seg) ? seg : location.hostname);
      }
    }
    cfg.dataRepo  = cfg.dataRepo  || cfg.repo;
    cfg.vaultRepo = cfg.vaultRepo || cfg.repo;   // the vault stays in the public repo
    return cfg;
  }

  function saveConfig(patch) {
    const keep = {};
    ["owner", "repo", "branch", "dataRepo", "vaultRepo"].forEach(k => { if (patch[k] != null) keep[k] = patch[k]; });
    localStorage.setItem("bibliotheca.cfg", JSON.stringify(keep));
    Object.assign(Store.cfg, keep);
    Store.cfg.dataRepo  = Store.cfg.dataRepo  || Store.cfg.repo;
    Store.cfg.vaultRepo = Store.cfg.vaultRepo || Store.cfg.repo;
  }

  /* ── bytes ───────────────────────────────────────────────────────────── */

  const utf8  = new TextEncoder();
  const utf8d = new TextDecoder();

  function b64(bytes) {
    let s = "";
    const a = new Uint8Array(bytes);
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    const bin = atob(String(str).replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const b64utf8   = (text) => b64(utf8.encode(text));
  const unb64utf8 = (str)  => utf8d.decode(unb64(str));

  /* ── crypto ──────────────────────────────────────────────────────────── */

  const KDF_ITER = 600000;             // ~0.4s on a phone, ~0.1s on a laptop

  async function deriveKey(password, salt, iter) {
    const base = await crypto.subtle.importKey("raw", utf8.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: iter || KDF_ITER, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,                            // not extractable — it can never be read back out
      ["encrypt", "decrypt"]
    );
  }

  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, utf8.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function open(key, box) {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct));
    return JSON.parse(utf8d.decode(pt));
  }

  /* ── "remember this device": a non-extractable key parked in IndexedDB ── */

  const DB = "bibliotheca", STORE_NAME = "keys";

  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(STORE_NAME, mode);
        const out = fn(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }
  const rememberKey = (key) => idb("readwrite", s => s.put(key, "master"));
  const recallKey   = ()    => idb("readonly",  s => s.get("master")).catch(() => null);
  const forgetKey   = ()    => idb("readwrite", s => s.delete("master")).catch(() => null);

  /* ── GitHub Contents API ─────────────────────────────────────────────── */

  const API = "https://api.github.com";

  class GitHubError extends Error {
    constructor(message, status, code) {
      super(message); this.name = "GitHubError"; this.status = status; this.code = code;
    }
  }

  async function gh(path, opts) {
    opts = opts || {};
    const headers = Object.assign({
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }, opts.headers || {});
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    if (opts.body)  headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(API + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
      });
    } catch (e) {
      throw new GitHubError("No connection to GitHub.", 0, "offline");
    }

    if (res.status === 304) return { notModified: true, etag: opts.etag };
    if (res.status === 404) throw new GitHubError("Not found.", 404, "missing");
    if (res.status === 401) throw new GitHubError("GitHub rejected the token.", 401, "bad_token");
    if (res.status === 403 || res.status === 429) {
      const left = res.headers.get("x-ratelimit-remaining");
      throw new GitHubError(
        left === "0" ? "GitHub rate limit reached — try again in a few minutes."
                     : "GitHub refused that (check the token's repository access).",
        res.status, left === "0" ? "rate_limited" : "forbidden");
    }
    if (res.status === 409 || res.status === 422) throw new GitHubError("Changed on another device.", res.status, "conflict");
    if (!res.ok) throw new GitHubError("GitHub error " + res.status + ".", res.status, "error");

    const json = await res.json().catch(() => null);
    return { json: json, etag: res.headers.get("ETag") };
  }

  const contentsPath = (repo, path) =>
    "/repos/" + Store.cfg.owner + "/" + repo + "/contents/" + path +
    "?ref=" + encodeURIComponent(Store.cfg.branch);

  // Reads a JSON file. Returns { doc, sha, etag } or null when the file isn't there.
  async function readFile(repo, path, token, etag) {
    let r;
    try {
      r = await gh(contentsPath(repo, path), {
        token: token,
        etag: etag,
        headers: etag ? { "If-None-Match": etag } : {},
      });
    } catch (e) {
      if (e.code === "missing") return null;
      throw e;
    }
    if (r.notModified) return { notModified: true };

    const f = r.json;
    let text;
    if (f.content) text = unb64utf8(f.content);
    else {
      // Over 1MB the Contents API sends an empty body and points at the blob.
      const blob = await gh("/repos/" + Store.cfg.owner + "/" + repo + "/git/blobs/" + f.sha, { token: token });
      text = unb64utf8(blob.json.content);
    }
    return { doc: JSON.parse(text), sha: f.sha, etag: r.etag };
  }

  async function writeFile(repo, path, token, obj, sha, message) {
    const r = await gh("/repos/" + Store.cfg.owner + "/" + repo + "/contents/" + path, {
      method: "PUT",
      token: token,
      body: {
        message: message,
        content: b64utf8(JSON.stringify(obj, null, 2)),
        branch: Store.cfg.branch,
        sha: sha || undefined,
      },
    });
    return { sha: r.json.content.sha };
  }

  /* ── three-way merge, so two devices can both be wrong at once ───────── */

  const fingerprint = (b) => b ? [b.title, b.author, b.category, b.language,
                                  b.read ? 1 : 0, b.year, b.pages, b.series, b.seriesNo,
                                  b.notes, b.added].join("␟") : null;

  // Reconciles one list (books, or wishlist) three ways.
  function mergeList(baseList, localList, remoteList) {
    const B = new Map((baseList   || []).map(b => [b.id, b]));
    const L = new Map((localList  || []).map(b => [b.id, b]));
    const R = new Map((remoteList || []).map(b => [b.id, b]));

    const out = [], seen = new Set();
    const order = (localList || []).map(b => b.id).concat((remoteList || []).map(b => b.id));
    let incoming = 0;

    for (const id of order) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = B.get(id), l = L.get(id), r = R.get(id);

      if (l && r) {
        // Untouched here since the last sync? Then the other device's copy is newer.
        if (b && fingerprint(l) === fingerprint(b) && fingerprint(r) !== fingerprint(b)) { out.push(r); incoming++; }
        else out.push(l);
      } else if (l && !r) {
        if (!b) out.push(l);              // added here
        // else: deleted on the other device — let the deletion stand
      } else if (r && !l) {
        if (!b) { out.push(r); incoming++; }     // added there
        // else: deleted here — let our deletion stand
      }
    }
    return { list: out, incoming: incoming };
  }

  function merge3(base, local, remote) {
    base = base || {};
    const books = mergeList(base.books, local.books, remote.books);
    const wish  = mergeList(base.wishlist, local.wishlist, remote.wishlist);

    // A book bought on one device left the wishlist and joined the library there.
    // Both halves of that move are already in the merge; this just makes sure a
    // moved entry doesn't end up sitting in both lists at once.
    const inLibrary = new Set(books.list.map(b => b.id));
    const wishlist = wish.list.filter(w => !inLibrary.has(w.id));

    const same = (a, c) => JSON.stringify(a || []) === JSON.stringify(c || []);
    const categories = same(local.categories, base.categories)
      ? (remote.categories || local.categories)
      : local.categories;

    return {
      merged: { books: books.list, wishlist: wishlist, categories: categories },
      incoming: books.incoming + wish.incoming,
    };
  }

  /* ── the store ───────────────────────────────────────────────────────── */

  const Store = {
    cfg: DEFAULTS,
    key: null,               // AES key, in memory only (or IndexedDB if remembered)
    token: null,
    state: "cold",           // cold | needs-setup | locked | ready
    sha: null,               // sha of data/library.json as we last saw it
    etag: null,
    rev: 0,                  // bumped on every successful write; a poll that
                             // started before one is stale by the time it lands
    vaultSha: null,
    base: null,              // last payload known to match the remote — the merge base
    dirty: false,
    inflight: false,
    timer: null,
    poller: null,
    listeners: { status: [], data: [] },

    on(event, fn) { (this.listeners[event] || []).push(fn); return this; },
    emit(event, a, b) { (this.listeners[event] || []).forEach(fn => { try { fn(a, b); } catch (e) {} }); },
    status(kind, label) { this.emit("status", kind, label); },

    init() {
      this.cfg = detect();
      return this;
    },

    configured() { return !!(this.cfg.owner && this.cfg.repo); },

    /* Is there a library in this repo yet? */
    async probe() {
      if (!this.configured()) { this.state = "unconfigured"; return this.state; }
      const vault = await readFile(this.cfg.vaultRepo, this.cfg.vaultPath, null);
      this.state = vault ? "locked" : "needs-setup";
      if (vault) { this.vault = vault.doc; this.vaultSha = vault.sha; }
      return this.state;
    },

    /* First run: seal the token and the starting library into the repo. */
    async setup(opts) {
      const token = String(opts.token || "").trim();
      const password = String(opts.password || "");
      if (!token) throw new Error("A GitHub token is needed to write to the repository.");
      if (password.length < 12) throw new Error("Use a password of at least 12 characters.");

      // Fail early and clearly if the token can't actually write here.
      const repos = [...new Set([this.cfg.vaultRepo, this.cfg.dataRepo])];
      for (const r of repos) {
        let probe;
        try {
          probe = await gh("/repos/" + this.cfg.owner + "/" + r, { token: token });
        } catch (e) {
          throw new Error(e.code === "bad_token"
            ? "GitHub didn't accept that token. Copy it again — it's only shown once."
            : e.code === "missing"
              ? "Can't see " + this.cfg.owner + "/" + r + ". Check the repository name, and that the token lists this repository."
              : e.message);
        }
        if (!probe.json.permissions || !probe.json.permissions.push) {
          throw new Error("That token can read " + r + " but not write to it. Give it Contents: Read and write.");
        }
      }

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(password, salt, KDF_ITER);

      const sealed = await seal(key, { token: token, created: new Date().toISOString() });
      const vaultDoc = {
        app: "bibliotheca", kind: "vault", v: 1,
        kdf: { name: "PBKDF2", hash: "SHA-256", iterations: KDF_ITER, salt: b64(salt) },
        iv: sealed.iv, ct: sealed.ct,
        note: "Encrypted. Without the password this file is noise.",
      };
      const v = await writeFile(this.cfg.vaultRepo, this.cfg.vaultPath, token, vaultDoc,
        this.vaultSha, "Bibliotheca: create vault");

      this.key = key; this.token = token; this.vault = vaultDoc; this.vaultSha = v.sha;
      this.base = null; this.sha = null; this.etag = null;

      const payload = {
        books: (opts.seed && opts.seed.books) || [],
        wishlist: (opts.seed && opts.seed.wishlist) || [],
        categories: (opts.seed && opts.seed.categories) || [],
      };
      await this.push(payload, "Bibliotheca: first commit");
      this.state = "ready";
      if (opts.remember) await this.remember();
      this.startPolling();
      return payload;
    },

    /* Every visit after that. */
    async unlock(password, remember) {
      if (!this.vault) {
        const vault = await readFile(this.cfg.vaultRepo, this.cfg.vaultPath, null);
        if (!vault) { this.state = "needs-setup"; throw new Error("No library in this repository yet."); }
        this.vault = vault.doc; this.vaultSha = vault.sha;
      }
      const kdf = this.vault.kdf || {};
      let secret;
      const key = await deriveKey(password, unb64(kdf.salt), kdf.iterations || KDF_ITER);
      try {
        secret = await open(key, this.vault);
      } catch (e) {
        throw new Error("That password doesn't open this library.");
      }
      this.key = key;
      this.token = secret.token;
      if (remember) await this.remember();
      return this.load();
    },

    async remember() {
      try { await rememberKey(this.key); localStorage.setItem("bibliotheca.remembered", "1"); }
      catch (e) { /* private browsing — carry on without it */ }
    },
    isRemembered() { return localStorage.getItem("bibliotheca.remembered") === "1"; },

    /* Unlock without a password on a device that was told to remember. */
    async resume() {
      if (!this.isRemembered()) return null;
      const key = await recallKey();
      if (!key) return null;
      if (!this.vault) {
        const vault = await readFile(this.cfg.vaultRepo, this.cfg.vaultPath, null);
        if (!vault) return null;
        this.vault = vault.doc; this.vaultSha = vault.sha;
      }
      try {
        const secret = await open(key, this.vault);
        this.key = key; this.token = secret.token;
        return await this.load();
      } catch (e) {
        await this.signOut(false);       // password was changed elsewhere
        return null;
      }
    },

    async load() {
      const file = await readFile(this.cfg.dataRepo, this.cfg.dataPath, this.token);
      if (!file) { this.state = "needs-setup"; throw new Error("The library file is missing from the repository."); }
      const payload = await open(this.key, file.doc);
      this.sha = file.sha; this.etag = file.etag;
      this.base = clone(payload);
      this.state = "ready";
      this.startPolling();
      this.status("on", "saved to GitHub");
      return payload;
    },

    // The file in the repo predates a schema change: write the upgraded shape
    // once, as its own commit, rather than waiting for the next edit.
    async upgrade(payload, message) {
      if (this.state !== "ready") return;
      try {
        await this.push(payload, message);
        this.status("on", "updated · " + clock());
      } catch (e) {
        this.save(payload, true);        // fall back to the ordinary save path
      }
    },

    /* ── saving ────────────────────────────────────────────────────────── */

    // Called on every edit. Coalesces a burst of keystrokes into one commit.
    save(payload, immediate) {
      if (this.state !== "ready") return;
      this.pending = clone(payload);
      this.dirty = true;
      this.status("busy", "saving…");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.timer = null; this.flush(); }, immediate ? 0 : 900);
    },

    later(ms) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.timer = null; this.flush(); }, ms);
    },

    async flush() {
      if (!this.dirty || this.state !== "ready") return;
      if (this.inflight) { this.again = true; return; }   // queue behind the write in progress
      this.inflight = true;
      const payload = this.pending;
      try {
        await this.push(payload, "Bibliotheca: " + describe(this.base, payload));
        this.dirty = (this.pending !== payload);
        this.status("on", "saved · " + clock());
      } catch (e) {
        if (e.code === "conflict") {
          try {
            const resolved = await this.reconcile(payload);
            this.inflight = false;
            return resolved;
          } catch (e2) { this.status("warn", "couldn't merge — " + e2.message); }
        } else if (e.code === "offline") {
          this.status("warn", "no connection — not saved");
        } else if (e.code === "bad_token") {
          this.status("warn", "token rejected — open Settings");
        } else {
          this.status("warn", (e.message || "couldn't save").replace(/\.$/, ""));
        }
        this.emit("error", e);
      } finally {
        this.inflight = false;
        if (this.again) { this.again = false; this.later(60); }
        else if (this.dirty && !this.timer) this.later(2500);
      }
    },

    async push(payload, message) {
      const body = {
        books: payload.books,
        wishlist: payload.wishlist || [],
        categories: payload.categories,
        version: 2, updatedAt: new Date().toISOString(), source: "Bibliotheca",
      };
      const sealed = await seal(this.key, body);
      const doc = { app: "bibliotheca", kind: "library", v: 1, iv: sealed.iv, ct: sealed.ct,
                    note: "Encrypted with your Bibliotheca password." };
      const w = await writeFile(this.cfg.dataRepo, this.cfg.dataPath, this.token, doc, this.sha, message);
      this.rev++;
      this.sha = w.sha;
      this.etag = null;                  // the ETag we held is stale now
      this.base = clone(payload);
      return payload;
    },

    // Someone else committed between our read and our write. Merge, then retry.
    async reconcile(local) {
      const file = await readFile(this.cfg.dataRepo, this.cfg.dataPath, this.token);
      const remote = await open(this.key, file.doc);
      this.sha = file.sha;
      const out = merge3(this.base, local, remote);
      await this.push(out.merged, "Bibliotheca: merge from another device");
      this.dirty = false;
      this.status("on", "merged · " + clock());
      this.emit("data", out.merged, { reason: "merge", incoming: out.incoming });
      return out.merged;
    },

    /* ── picking up edits made on another device ───────────────────────── */

    startPolling() {
      if (this.poller) return;
      const tick = () => { if (document.visibilityState === "visible") this.poll(); };
      this.poller = setInterval(tick, 25000);
      window.addEventListener("focus", () => this.poll());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.poll();
      });
    },

    async poll() {
      if (this.state !== "ready" || this.dirty || this.inflight || this.polling) return;
      this.polling = true;
      const rev = this.rev;
      try {
        const file = await readFile(this.cfg.dataRepo, this.cfg.dataPath, this.token, this.etag);
        if (!file || file.notModified) return;
        if (file.sha === this.sha) { this.etag = file.etag; return; }
        const remote = await open(this.key, file.doc);

        // Two ways this answer can be worthless by the time it arrives: an edit
        // started while the request was in the air, or our own write landed and
        // this is the copy from just before it. Either way, drop it — adopting it
        // would put the newer edit back in the bin. A save in flight will hit a
        // conflict and reconcile() merges properly; otherwise the next poll picks
        // up whatever is actually current.
        if (this.dirty || this.inflight || this.rev !== rev) return;

        this.sha = file.sha; this.etag = file.etag; this.base = clone(remote);
        this.emit("data", remote, { reason: "remote" });
        this.status("on", "updated · " + clock());
      } catch (e) {
        if (e.code === "offline") this.status("warn", "no connection");
      } finally { this.polling = false; }
    },

    /* ── account chores ────────────────────────────────────────────────── */

    async changePassword(current, next, payload) {
      const kdf = this.vault.kdf || {};
      const oldKey = await deriveKey(current, unb64(kdf.salt), kdf.iterations || KDF_ITER);
      let secret;
      try { secret = await open(oldKey, this.vault); }
      catch (e) { throw new Error("That isn't the current password."); }
      if (String(next).length < 12) throw new Error("Use a password of at least 12 characters.");

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(next, salt, KDF_ITER);
      const sealed = await seal(key, secret);
      const vaultDoc = {
        app: "bibliotheca", kind: "vault", v: 1,
        kdf: { name: "PBKDF2", hash: "SHA-256", iterations: KDF_ITER, salt: b64(salt) },
        iv: sealed.iv, ct: sealed.ct,
        note: "Encrypted. Without the password this file is noise.",
      };
      const v = await writeFile(this.cfg.vaultRepo, this.cfg.vaultPath, this.token, vaultDoc,
        this.vaultSha, "Bibliotheca: change password");
      this.vault = vaultDoc; this.vaultSha = v.sha; this.key = key;
      await this.push(payload, "Bibliotheca: re-encrypt library");
      if (this.isRemembered()) await this.remember();
      return true;
    },

    async replaceToken(newToken, password) {
      const kdf = this.vault.kdf || {};
      const key = await deriveKey(password, unb64(kdf.salt), kdf.iterations || KDF_ITER);
      try { await open(key, this.vault); }
      catch (e) { throw new Error("Wrong password."); }
      const sealed = await seal(key, { token: newToken.trim(), created: new Date().toISOString() });
      const vaultDoc = Object.assign({}, this.vault, { iv: sealed.iv, ct: sealed.ct });
      const v = await writeFile(this.cfg.vaultRepo, this.cfg.vaultPath, newToken.trim(), vaultDoc,
        this.vaultSha, "Bibliotheca: replace access token");
      this.vault = vaultDoc; this.vaultSha = v.sha; this.token = newToken.trim(); this.key = key;
      return true;
    },

    async signOut(reload) {
      clearTimeout(this.timer);
      clearInterval(this.poller); this.poller = null;
      localStorage.removeItem("bibliotheca.remembered");
      await forgetKey();
      this.key = null; this.token = null; this.base = null; this.state = "locked";
      if (reload !== false) location.reload();
    },
  };

  /* ── helpers ─────────────────────────────────────────────────────────── */

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // A readable commit message, so the repo's history is worth scrolling.
  function describe(before, after) {
    if (!before) return "update library";

    const wasWanted = new Map((before.wishlist || []).map(x => [x.id, x]));
    const nowWanted = new Map((after.wishlist || []).map(x => [x.id, x]));
    const nowOwned  = new Map((after.books || []).map(x => [x.id, x]));
    const bought = [...wasWanted.keys()].filter(id => !nowWanted.has(id) && nowOwned.has(id));
    if (bought.length === 1) return "bought “" + (nowOwned.get(bought[0]).title || "a book") + "”";
    if (bought.length > 1) return "bought " + bought.length + " books";
    const wantAdded = [...nowWanted.keys()].filter(id => !wasWanted.has(id));
    const wantGone  = [...wasWanted.keys()].filter(id => !nowWanted.has(id) && !nowOwned.has(id));
    if (wantAdded.length === 1 && !wantGone.length)
      return "want “" + (nowWanted.get(wantAdded[0]).title || "a book") + "”";
    if (wantAdded.length > 1) return "+" + wantAdded.length + " on the wishlist";
    if (wantGone.length === 1) return "drop “" + (wasWanted.get(wantGone[0]).title || "a book") + "” from the wishlist";
    if (wantGone.length > 1) return "−" + wantGone.length + " from the wishlist";

    const b = new Map((before.books || []).map(x => [x.id, x]));
    const a = new Map((after.books || []).map(x => [x.id, x]));
    const added = [...a.keys()].filter(id => !b.has(id));
    const gone  = [...b.keys()].filter(id => !a.has(id));
    const edited = [...a.keys()].filter(id => b.has(id) && fingerprint(a.get(id)) !== fingerprint(b.get(id)));
    const name = (id) => (a.get(id) || b.get(id) || {}).title || "a book";

    if (added.length === 1 && !gone.length && edited.length <= 1) return "add “" + name(added[0]) + "”";
    if (gone.length === 1 && !added.length && !edited.length)     return "remove “" + name(gone[0]) + "”";
    if (edited.length === 1 && !added.length && !gone.length)     return "edit “" + name(edited[0]) + "”";
    if (added.length || gone.length) {
      const bits = [];
      if (added.length) bits.push("+" + added.length);
      if (gone.length)  bits.push("−" + gone.length);
      if (edited.length) bits.push("~" + edited.length);
      return bits.join(" ") + " books";
    }
    if (edited.length > 1) return "edit " + edited.length + " books";
    if (JSON.stringify(before.categories) !== JSON.stringify(after.categories)) return "update categories";
    return "update library";
  }

  Store.merge3 = merge3;                 // exported for the test harness
  Store.saveConfig = saveConfig;
  Store._internals = { deriveKey, seal, open, b64, unb64, describe };

  global.Store = Store.init();

})(window);
