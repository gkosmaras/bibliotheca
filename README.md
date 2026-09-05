# Bibliotheca

A personal library that lives in this repository and opens with a password from
any device, anywhere.

**[SETUP.md](SETUP.md) has the step-by-step. Start there.**

---

## What it is

A static site — no server, no database, no account beyond GitHub. The books are
kept in `data/library.json`, encrypted, and every change you make is an ordinary
git commit. The commit history is the backup, and it goes back to the beginning.

## How the lock works

Your password never leaves the browser. It is stretched with PBKDF2-SHA-256
(600,000 iterations) into an AES-256-GCM key, and that key encrypts two files:

| File | Holds | Readable by |
|---|---|---|
| `data/vault.json` | the GitHub token that lets the page write | you, with the password |
| `data/library.json` | every book and category | you, with the password |

So the repository can be public and still give nothing away: what's committed is
ciphertext, and the key to it exists only in the browser of someone who knows
the password. That is also what makes a new device cost you one password instead
of a token and a configuration file — the token is *in* the vault.

The honest limit of this design: the encrypted vault is publicly readable, so
someone who wanted in could take it away and grind at it offline. 600,000
iterations makes that slow, but not impossible against a weak password. Use the
generated passphrase, or something of that calibre.

Losing the password loses the library. There is no reset and no recovery.

## How syncing works

Every edit is committed within a second, debounced so a burst of typing becomes
one commit. While a tab is open it checks GitHub every 25 seconds, and whenever
you return to it, so a change made on your phone shows up on your laptop shortly
after.

If two devices edit at the same time, the second one to save doesn't win — the
two sets of changes are merged, book by book, against the last state they agreed
on. Additions from both sides survive; a deletion on one side stays deleted; if
the same book was edited in both places, the copy you are looking at wins and
you're told. Nothing is silently thrown away.

## The files

| | |
|---|---|
| `index.html` | markup — the lock screen, the shelf, the editor |
| `app.css` | the whole design, light and dark, desktop and phone |
| `app.js` | the library itself: views, search, editing, import/export |
| `store.js` | encryption, GitHub, syncing, merging |
| `gate.js` | the password screen, first-run setup, settings |
| `config.js` | optional — only needed for a custom domain or a private data repo |
| `fonts/` | Literata, IBM Plex Sans and Mono, subset, self-hosted |
| `data/` | your encrypted library, written on first run |

Roughly 2,000 lines, no build step, no dependencies. Excel import and export
pull SheetJS from a CDN the first time you use them and not before.

## Data shape

Unchanged from the original app, so old backups import and new ones export the
same:

```json
{
  "books": [
    { "id": "b0001", "title": "…", "author": "…", "category": "…",
      "language": "…", "read": true, "rating": 0, "notes": "", "added": null }
  ],
  "categories": [ { "name": "Politics", "color": "Red" } ],
  "version": 1,
  "updatedAt": "2026-09-05T12:00:00.000Z",
  "source": "Bibliotheca"
}
```

## Keeping a copy elsewhere

The commit history is already a full history, but **Backup** in the sidebar
writes a plain unencrypted `.json` you can keep offline — worth doing
occasionally, and worth doing before you change anything drastic.

## Things worth knowing

- Nothing works offline by design; it needs a connection to open and to save.
  The status line at the bottom-left always says where you stand.
- Fine-grained GitHub tokens expire. *Storage → Replace the GitHub token* when
  yours does; every device picks it up on its next unlock.
- The page asks GitHub about 150 times an hour at most while open, against a
  limit of 5,000.
