# Applying this update

Same repository, same token, same password, same address. You are replacing
files, nothing else.

**Take a backup first** — open your library, click **Backup**, keep the `.json`.
Then close Bibliotheca in any other tab or on any other device before you start.

## Replacing the files

Seven change: `index.html`, `app.js`, `app.css`, `store.js`, `gate.js`,
`README.md`, `UPDATING.md`. Nothing under `fonts/`, and **nothing under
`data/`**.

Upload them on the repository page with **Add file → Upload files** and commit —
GitHub replaces same-named files rather than duplicating them. Don't drag the
whole folder; that would push `data/` back to an older state. From a terminal it
is the usual `cp`, `git add -A`, `git commit`, `git push`.

Wait a minute for Pages to redeploy, then open your address. The asset links now
carry `?v=3`, so you should not need to clear anything; if the page looks
unchanged, hard-refresh (**Ctrl/Cmd + Shift + R**).

Nothing happens to your data on this update — no migration, no rewrite. The
guest door starts closed.

---

## Turning guest access on

**Storage** (the status line at the bottom-left) → **Guest access** → tick
*Let anyone with the link read the shelf*.

That publishes `data/guest.json`: a second, read-only copy of the shelf,
encrypted under a passphrase generated for the purpose. Your lock screen grows
an **Enter as guest** button underneath the password box. Anyone with your
address can press it and read the library, the wishlist, the insights and the
checks. They cannot change anything.

Untick it and the copy is deleted from the repository and the button disappears.

## What "guest" actually protects

Worth reading once, because the honest answer is narrower than it looks.

The passphrase is published in the same file as the ciphertext — it has to be,
or the button could not work without someone typing something. So:

| | |
|---|---|
| Someone browsing your repository | sees noise |
| GitHub code search for a book title | finds nothing |
| Search engines | index nothing |
| Anyone you send the link to | reads everything |
| Anyone who views the page source | reads everything |

That is obscurity, not secrecy. If what you want is "my shelf is visible to
people I share the address with", this is exactly right. If you wanted something
stronger, see the next section.

**Read-only, on the other hand, is real.** A guest never opens your vault, so
their browser never holds a write token. There is no hidden button to find —
there is no credential. I tested this by calling the save function directly from
a guest's console and by firing an unauthenticated write straight at the GitHub
API: nothing moved, and GitHub returned 401.

## If you want the stronger version

In **Storage → Guest access**, switch off **One click, no passphrase**. The key
is removed from the published file, the button asks for the passphrase instead,
and the passphrase is shown to you in Settings so you can hand it to whoever you
choose. It is then a genuine lock — a weaker, read-only credential separate from
your own password.

You can flip between the two at any time; it rewrites the one file.

## Odds and ends

- The guest copy is rewritten on every save, so it never trails your real one.
  That means two commits per edit rather than one while guest access is on.
- Guests refresh every five minutes rather than every twenty-five seconds: they
  read GitHub without a token, where the hourly allowance is 60 requests, not
  5,000.
- A guest can still use **Excel**, **CSV** and **Backup** — it is the same data
  they are already looking at. **Import** is gone.
- Changing your own password does not disturb guest access, and replacing your
  GitHub token no longer discards the guest passphrase (it used to overwrite the
  whole vault entry; that is fixed here).

## Undoing it

```sh
git revert --no-edit HEAD
git push
```

Then delete `data/guest.json` from the repository by hand if it exists. Your
library file is untouched by any of this.
