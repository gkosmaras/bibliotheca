# Applying this update

Nothing in your repository's settings changes — same repo, same token, same
password, same address. You are only replacing files.

**Take a backup first.** Open your library, click **Backup** in the sidebar, keep
the `.json` somewhere. Two minutes, and it makes everything below reversible.

Then, if you have Bibliotheca open in any other tab or on any other device,
**close it**. An old tab still running the previous code would write the old
format back over the new one.

---

## Replacing the files

Six files change: `index.html`, `app.js`, `app.css`, `store.js`, `gate.js`,
`README.md`, plus a new `UPDATING.md`. Nothing under `fonts/`, and **nothing
under `data/`** — your library stays exactly where it is.

### From a terminal

```sh
cd path/to/your/bibliotheca-checkout
git pull                       # only if the checkout is behind
# copy the new files in, replacing what's there
cp -f /path/to/new/{index.html,app.js,app.css,store.js,gate.js,README.md,UPDATING.md} .
git add -A
git commit -m "Wishlist, 32 colours, year and pages; drop ratings"
git push
```

### Through the browser

On the repository page, click **Add file → Upload files**, drag in the six
changed files plus `UPDATING.md`, and commit. GitHub replaces same-named files
rather than duplicating them. Don't drag the whole folder — that would put
`data/` back to an older state.

Either way, wait a minute for Pages to redeploy. The Actions tab shows when it
is done.

---

## First open after the update

Open your normal address. It will ask for your password as usual, and the shelf
opens as usual — with two things happening quietly behind it:

1. The library file is rewritten once in the new format: ratings dropped, an
   empty wishlist added, blank `year`, `pages` and `series` on every book. You'll
   see a commit called **"Bibliotheca: drop ratings, add the wishlist"** in the
   repository. That happens once, on whichever device opens it first; every
   other device picks it up on its next unlock.
2. Nothing else moves. All 189 books, all 15 categories, every read mark, every
   note. (Your ratings were all zero, so nothing was lost with them.)

If the page looks unchanged — still a Rating column, no Wishlist tab — your
browser is serving the old files from cache. The asset links now carry a `?v=2`
marker specifically to prevent that, but if it happens anyway: hard-refresh
(**Ctrl/Cmd + Shift + R**), or on iOS close the tab and reopen it. On a home-screen
icon, remove the icon and add it again.

---

## What's new, in order of where you'll notice it

**Ratings are gone** — the column, the filter, the field in the editor, the two
Insights panels, and the `rating` key in the data. The two rating panels are
replaced by **Where the backlog is**: read against unread per category, worst
first, which for you starts Classics 8, Politics 7, Thrillers 6.

**A Wishlist tab**, second in the list, next to Library because they're the same
kind of thing. Same schema, same editor, same search and filters. When you buy
something, the **→** at the end of the row moves it to the library — keeping its
id, category, notes, everything — and stamps the date. There's also a **Bought
it** button inside the editor.

**Year, Pages and Series** on every entry. Year and Pages are sortable columns
(blanks always sink to the bottom, whichever way the arrow points). Series shows
as a small tag after the title. Filling them in is optional; the Insights tiles
grow a total page count and a median year once you start.

**Thirty-two colours** instead of sixteen. The original sixteen are untouched and
still first, so nothing you've already coloured has moved. Rather than showing
480 dots at once, each category now shows just the colour it's using — click
that to open the full set, click a colour to choose and close.

**Two new checks.** *Gaps in a series* spots that you own volumes 1 and 3 but not
2, and offers to put the missing one on the wishlist in one click. *On the
wishlist but already owned* stops you buying a second copy of something.

---

## If you want to undo it

Your library file is unaffected by the code, so rolling back the code is enough:

```sh
git revert --no-edit HEAD    # the commit that replaced the files
git push
```

The one thing that doesn't roll back on its own is the data upgrade — the file
is version 2 now, and the old code would ignore the wishlist. If you truly want
to go back, restore the pre-upgrade version of `data/library.json` from the
repository's history (**History** on that file, pick the commit just before
"drop ratings", **Revert**).
