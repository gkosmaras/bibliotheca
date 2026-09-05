# Setting up Bibliotheca

About fifteen minutes, once. After that any device you own needs one password.

You will need the `Bibliothecabackup.json` file with your 189 books — keep it to
hand for step 6.

---

## 1 · Make the repository

Go to **[github.com/new](https://github.com/new)**.

| Field | Value |
|---|---|
| Repository name | `bibliotheca` |
| Description | leave blank |
| Visibility | **Public** |
| Add a README | leave unticked |

Click **Create repository**.

> **Public?** Yes — and it costs you nothing in privacy. Your books are encrypted
> in the browser before they are ever committed; what lands in the repository is
> a block of ciphertext. GitHub Pages only hosts sites from public repositories
> unless you pay for Pro, so this is the free path. Section 9 covers the private
> variant if you would rather have both.

## 2 · Put the files in it

**Through the browser** — on the empty repository page, click
*uploading an existing file*, then drag in **everything inside** the
`bibliotheca` folder (the files themselves, not the folder). Scroll down,
click **Commit changes**.

macOS and Windows hide the file called `.nojekyll`; if it doesn't make it
across, no harm done.

**Or from a terminal**, if you have git set up:

```sh
cd path/to/bibliotheca
git init -b main
git add -A
git commit -m "Bibliotheca"
git remote add origin https://github.com/YOUR-USERNAME/bibliotheca.git
git push -u origin main
```

## 3 · Switch on GitHub Pages

In the repository: **Settings** → **Pages** (left sidebar).

Under *Build and deployment*, set **Source** to `Deploy from a branch`, then
**Branch** to `main` and the folder to `/ (root)`. Click **Save**.

Give it a minute or two. The page will then show your address:

```
https://YOUR-USERNAME.github.io/bibliotheca/
```

Open it. You should see the Bibliotheca lock screen asking to be set up. If you
get a 404, wait another minute and reload — the first deploy is the slow one.

## 4 · Make a token

This is what lets the page write back to the repository. It is the one piece of
fiddly GitHub business.

Go to **[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)**
(*Settings → Developer settings → Personal access tokens → Fine-grained tokens →
Generate new token*).

| Field | Value |
|---|---|
| Token name | `Bibliotheca` |
| Resource owner | your own account |
| Expiration | 1 year (or *No expiration* if you would rather not think about it) |
| Repository access | **Only select repositories** → `bibliotheca` |

Then open **Permissions → Repository permissions**, find **Contents**, and set it
to **Read and write**. (*Metadata: Read-only* switches itself on — leave it.)
Everything else stays *No access*.

Click **Generate token** and copy what it shows you. It starts with
`github_pat_` and GitHub will never show it again.

> Scoped like this, the token can do exactly one thing: read and write files in
> this one repository. It cannot touch your other repositories, your account, or
> anything else.

## 5 · Choose a password

This one matters. The password is what encrypts both your library and the token,
and the encrypted file sits in a public repository where anyone could in
principle try to guess at it. The setup screen has a **Generate a strong
passphrase** button that produces something like
`cedar-lantern-quarry-thistle-marble-ochre` — six random words, easy enough to
type on a phone, and far beyond guessing.

**There is no reset.** Nobody can recover it, including me. Write it down
somewhere real, or put it in a password manager, before you go further.

## 6 · Set it up

Back on your `https://YOUR-USERNAME.github.io/bibliotheca/` page:

1. Paste the token into **1 · GitHub token**.
2. Type your password twice into **2 · Password**.
3. Under **3 · Your books**, choose your `Bibliothecabackup.json`. It should
   confirm *189 books and 15 categories ready to import*.
4. Click **Create the library**.

It encrypts everything and makes two commits. A few seconds later your shelf
opens. Look at the repository afterwards and you'll find `data/vault.json` and
`data/library.json` — both unreadable noise, which is the point.

## 7 · Every other device

Open the same address, type the password. That's the whole procedure — no token,
no configuration, nothing to install.

Tick **Stay unlocked on this device** on machines only you use and it stops
asking.

## 8 · Put it on your phone's home screen

**iPhone** — open the address in Safari, tap Share, **Add to Home Screen**.
**Android** — open it in Chrome, menu, **Add to Home screen**.

It then opens full-screen with its own icon, like an app.

---

## 9 · Optional: keep the books in a private repository

The encryption already means the public repository gives nothing away. But if
you would rather the ciphertext itself weren't public:

1. Make a second repository, `bibliotheca-data`, this one **Private**.
2. Edit `config.js` in the `bibliotheca` repository and set
   `dataRepo: "bibliotheca-data"`. Leave `vaultRepo` blank — the vault has to
   stay in the public repository so the page can read it before you've
   unlocked anything.
3. Give your token access to **both** repositories
   (*Repository access → Only select repositories* → tick both), Contents:
   Read and write on each.

Do this before step 6 and setup will write to the right places on its own. If
you have already set up, do it afterwards, then open **Storage** in the app and
use *Replace the GitHub token* to store a token that covers both.

## 10 · When the token expires

If you chose an expiry, GitHub emails you when it approaches. Make a new token
exactly as in step 4, then in the app click the little status line at the
bottom-left (**Storage**) → **Replace the GitHub token**. Every device picks the
new one up the next time it unlocks.

---

## If something goes wrong

**The page is a 404.** Pages hasn't finished its first deploy. Wait a couple of
minutes, then reload. Check Settings → Pages shows a green "Your site is live at".

**"Can't see YOUR-USERNAME/bibliotheca."** The token isn't listing this
repository. Edit the token and add it under *Repository access*.

**"That token can read bibliotheca but not write to it."** The Contents
permission is missing or is Read-only. Edit the token, set Contents to
*Read and write*.

**"GitHub didn't accept that token."** It was copied incompletely, or it has
expired. Make a new one.

**"That password doesn't open this library."** Wrong password. There is no way
around this — that is the whole design. If it is genuinely lost, delete
`data/vault.json` and `data/library.json` from the repository, reload the page,
and set it up again from your last backup.

**The status line says "no connection".** Your edit is on screen but not saved
yet. It retries by itself; it will also save the moment you come back to the
tab. Don't close the tab until it says *saved*.

**Two devices disagree.** They shouldn't — an edit from another device is picked
up within about 25 seconds, and if you both change something at once the two
sets of changes are merged rather than one winning. If a book somehow goes
missing, every version of the library is in the repository's commit history.
