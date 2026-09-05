/* Optional. Leave it alone and Bibliotheca works out the repository from the
   address bar — georgios.github.io/bibliotheca/ means owner "georgios",
   repo "bibliotheca". Fill these in only for a custom domain, or to keep the
   library in a different (say, private) repository from the app. */
window.BIBLIOTHECA_CONFIG = {
  owner:     "",                    // GitHub username
  repo:      "",                    // repository holding this page
  branch:    "main",
  dataRepo:  "",                    // blank = same repo as the app
  vaultRepo: "",                    // blank = same repo as the app
  vaultPath: "data/vault.json",
  dataPath:  "data/library.json",
};
