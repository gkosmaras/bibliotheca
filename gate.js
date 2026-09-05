/* ============================================================================
   Bibliotheca — the door
   First run seals a token and your books into the repository; every visit
   after that is one password. Nothing here ever writes a secret in the clear.
   ========================================================================== */

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const show = (id) => {
    ["loading", "unlock", "setup", "config", "fail"].forEach(k => {
      const el = $("#gate-" + k);
      if (el) el.hidden = (k !== id);
    });
    $("#gate").hidden = false;
  };
  const hideGate = () => { $("#gate").hidden = true; };

  const say = (sel, msg, kind) => {
    const el = $(sel);
    el.textContent = msg || "";
    el.className = "gate-msg" + (kind ? " " + kind : "");
    el.hidden = !msg;
  };

  const busy = (btn, on, label) => {
    btn.disabled = on;
    if (on) { btn.dataset.was = btn.textContent; btn.textContent = label || "Working…"; }
    else if (btn.dataset.was) btn.textContent = btn.dataset.was;
  };

  /* ── password helpers ─────────────────────────────────────────────── */

  const WORDS = ("able acorn actor adobe agile alarm album alder amber anchor angle anvil apple April arbor arrow ashen aspen atlas attic autumn axiom bacon badge bagel baker balsa banjo barley basil basin beach beacon beetle bellow birch bishop bison blade bloom bluff bolt bonus boron bottle bramble brass bravo brick bridge bronze brook brush buckle bugle bunker burrow butter cabin cable cactus camel candle canoe canvas canyon carbon cargo carpet castle cedar cellar chalk chapel cherry chess chime cider cinder circus citrus clamp cliff clover cobalt cocoa comet compass copper coral cotton cougar cove cradle crane crater cricket crown crystal cypress dagger dahlia daisy damson dapple dawn delta denim desert diner ditch dolphin domino donkey dragon drift drum dune dusk eagle earth easel ember emerald ermine falcon fable fathom feather fennel fern ferry fiddle finch fjord flint flute forest fossil fox fresco frost gable galley garnet gavel geode ginger glacier glade glass globe gopher granite grape gravel grotto grove gully gypsum hammer harbor harvest hazel heather hedge helm hemlock heron hickory hollow honey hornet hostel hunter indigo ivory jasmine jetty jigsaw juniper kayak kelp kernel kettle keystone kiln lagoon lantern lark laurel lava ledger lemon lentil lever lichen lilac linen lobby locket lotus lumber lunar lupine lyric magnet magpie mallet mango manor maple marble marsh meadow medal melon mercy mesa millet mineral mint mirror mitten monsoon mortar mosaic moss mulberry mustard nectar needle nickel noble nomad notch nutmeg oaken oasis obsidian ocean ochre olive onyx opal orbit orchard osprey otter oyster paddle pagoda palm pantry papaya parlor pastel pebble pelican pepper pewter pigeon pillar pine pivot plank plaza plover plum pollen poplar poppy portal prairie prism pueblo puffin pumice quarry quartz quiver radish rafter ragtime rapids raven ravine reef relay resin ribbon ridge rivet robin rooster rosin rudder rugby rune saffron sage salmon sandal sapphire satchel saucer scarlet schooner sediment sequoia shale shamrock shelf sherbet shingle shore sierra silo silver siren sleet slope smoke socket solar sonnet sorrel spade sparrow spindle spiral spruce stable steppe stork stucco sumac summit sundial swallow sycamore tabby talon tandem tangle tarragon teak tempo tender thicket thimble thistle thorn thrush thunder timber tinder toffee topaz torrent totem tower trellis trestle trillium trout tundra tunnel turret twine umber urchin valley vellum velvet verbena vessel viola violet vireo vista walnut warbler wattle weaver wharf wheat whistle willow window winter wisteria wombat woodbine yarrow yeoman zenith zephyr zinnia").split(" ");

  function passphrase(words) {
    const n = words || 6;
    const picks = new Uint32Array(n);
    crypto.getRandomValues(picks);
    return Array.from(picks, x => WORDS[x % WORDS.length]).join("-");
  }

  // A rough, honest read on how hard the password would be to guess.
  function strength(pw) {
    if (!pw) return { score: 0, label: "" };
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
    const words = pw.split(/[-_ .]/).filter(w => w.length > 2).length;
    let bits = words >= 4 ? words * 8.5 : pw.length * (classes >= 3 ? 3.6 : classes >= 2 ? 3.0 : 2.3);
    if (/^\d+$/.test(pw)) bits = pw.length * 3.3;
    const score = bits < 40 ? 1 : bits < 58 ? 2 : bits < 76 ? 3 : 4;
    return { score: score,
             label: ["", "too easy to guess", "fair", "strong", "very strong"][score] };
  }

  function wireStrength(input, meter) {
    const paint = () => {
      const s = strength(input.value);
      meter.className = "pw-meter s" + s.score;
      meter.querySelector(".pw-label").textContent =
        input.value.length && input.value.length < 12
          ? "at least 12 characters"
          : s.label;
      meter.querySelector(".pw-bar > i").style.width = (s.score * 25) + "%";
    };
    input.addEventListener("input", paint);
    paint();
  }

  /* ── shared: status light ─────────────────────────────────────────── */

  Store.on("status", (kind, label) => {
    const dot = $("#storeDot"), text = $("#storeLabel");
    if (dot) dot.className = "dot " + kind;
    if (text) text.textContent = label;
  });

  /* ── boot ─────────────────────────────────────────────────────────── */

  async function boot() {
    show("loading");
    if (!Store.configured()) return askConfig();

    $("#cfgWhere").textContent = Store.cfg.owner + "/" + Store.cfg.dataRepo;

    // A device that was told to remember opens with no password at all.
    if (Store.isRemembered()) {
      try {
        const doc = await Store.resume();
        if (doc) return enter(doc);
      } catch (e) { /* fall through to the password */ }
    }

    let where;
    try { where = await Store.probe(); }
    catch (e) { return fail(e.message || "Couldn't reach GitHub."); }

    if (where === "needs-setup") return show("setup");
    show("unlock");
    setTimeout(() => $("#pw").focus(), 80);
  }

  function fail(msg) {
    show("fail");
    $("#failMsg").textContent = msg;
  }

  function enter(doc) {
    hideGate();
    window.Bibliotheca.boot(doc);
    document.body.classList.remove("gated");
  }

  function askConfig() {
    show("config");
    $("#cfgOwner").value = Store.cfg.owner || "";
    $("#cfgRepo").value = Store.cfg.repo || "";
    $("#cfgBranch").value = Store.cfg.branch || "main";
  }

  /* ── unlock ───────────────────────────────────────────────────────── */

  $("#gate-unlock").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#btnUnlock");
    const pw = $("#pw").value;
    if (!pw) return;
    say("#unlockMsg", "");
    busy(btn, true, "Unlocking…");
    try {
      const doc = await Store.unlock(pw, $("#rememberMe").checked);
      enter(doc);
    } catch (err) {
      say("#unlockMsg", err.message || "Couldn't unlock.", "bad");
      $("#pw").select();
    } finally { busy(btn, false); }
  });

  /* ── setup ────────────────────────────────────────────────────────── */

  let seed = null;

  $("#seedFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const doc = JSON.parse(r.result);
        if (!Array.isArray(doc.books)) throw new Error("no books array");
        seed = { books: doc.books, categories: Array.isArray(doc.categories) ? doc.categories : [] };
        $("#seedNote").textContent = "✓ " + doc.books.length + " books and " +
          seed.categories.length + " categories ready to import.";
        $("#seedNote").className = "gate-msg good";
        $("#seedNote").hidden = false;
      } catch (err) {
        seed = null;
        $("#seedNote").textContent = "That doesn't look like a Bibliotheca backup.";
        $("#seedNote").className = "gate-msg bad";
        $("#seedNote").hidden = false;
      }
    };
    r.readAsText(f);
  });

  $("#btnGenPw").addEventListener("click", () => {
    const p = passphrase(6);
    $("#pw1").value = p; $("#pw2").value = p;
    $("#pw1").type = $("#pw2").type = "text";
    $("#pw1").dispatchEvent(new Event("input"));
    say("#setupMsg", "Write this down somewhere safe before you continue. It cannot be recovered.", "warn");
  });

  $("#gate-setup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#btnSetup");
    const token = $("#token").value.trim();
    const p1 = $("#pw1").value, p2 = $("#pw2").value;

    say("#setupMsg", "");
    if (p1 !== p2) return say("#setupMsg", "The two passwords don't match.", "bad");
    if (p1.length < 12) return say("#setupMsg", "Use a password of at least 12 characters.", "bad");
    if (strength(p1).score < 2) return say("#setupMsg",
      "That password is too easy to guess. The encrypted file sits in a public repository, so it has to be a real one.", "bad");

    busy(btn, true, "Sealing your library…");
    try {
      const doc = await Store.setup({
        token: token, password: p1, seed: seed,
        remember: $("#rememberSetup").checked,
      });
      enter(doc);
      window.Bibliotheca.toast("Library committed to " + Store.cfg.owner + "/" + Store.cfg.dataRepo);
    } catch (err) {
      say("#setupMsg", err.message || "Setup failed.", "bad");
    } finally { busy(btn, false); }
  });

  /* ── config ───────────────────────────────────────────────────────── */

  $("#gate-config").addEventListener("submit", (e) => {
    e.preventDefault();
    Store.saveConfig({
      owner: $("#cfgOwner").value.trim(),
      repo: $("#cfgRepo").value.trim(),
      branch: $("#cfgBranch").value.trim() || "main",
      dataRepo: "",
    });
    Store.cfg.dataRepo = Store.cfg.repo;
    boot();
  });

  /* ── settings ─────────────────────────────────────────────────────── */

  const settings = $("#settings");
  function openSettings() {
    const c = Store.cfg;
    $("#setWhere").textContent = c.owner + "/" + c.dataRepo;
    $("#setBranch").textContent = c.branch;
    $("#setPath").textContent = c.dataPath;
    $("#setHistory").href = "https://github.com/" + c.owner + "/" + c.dataRepo +
      "/commits/" + c.branch + "/" + c.dataPath;
    $("#setRemember").checked = Store.isRemembered();
    settings.classList.add("open");
    $("#scrim").classList.add("open");
    document.body.classList.add("no-scroll");
  }
  function closeSettings() {
    settings.classList.remove("open");
    $("#scrim").classList.remove("open");
    document.body.classList.remove("no-scroll");
    say("#setMsg", "");
  }

  document.addEventListener("click", (e) => {
    const hit = (id) => e.target.closest ? e.target.closest("#" + id) : null;
    if (hit("btnSettings")) return openSettings();
    if (hit("settingsClose")) return closeSettings();
    if (e.target.id === "scrim" && settings.classList.contains("open")) return closeSettings();
    if (hit("btnSignOut")) {
      if (confirm("Sign out on this device? Your library stays in the repository — you'll just need the password again."))
        Store.signOut();
      return;
    }
    if (hit("btnSyncNow")) { Store.poll(); window.Bibliotheca.toast("Checking GitHub…"); return; }
  });

  $("#setRemember").addEventListener("change", async (e) => {
    if (e.target.checked) { await Store.remember(); say("#setMsg", "This device will open without the password.", "good"); }
    else { localStorage.removeItem("bibliotheca.remembered"); say("#setMsg", "This device will ask for the password again.", "good"); }
  });

  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#btnChangePw");
    const cur = $("#pwCur").value, next = $("#pwNew").value;
    say("#setMsg", "");
    if (strength(next).score < 2 || next.length < 12)
      return say("#setMsg", "The new password needs to be at least 12 characters and hard to guess.", "bad");
    busy(btn, true, "Re-encrypting…");
    try {
      await Store.changePassword(cur, next, window.Bibliotheca.payload());
      $("#pwCur").value = $("#pwNew").value = "";
      say("#setMsg", "Password changed. Other devices will need the new one.", "good");
    } catch (err) {
      say("#setMsg", err.message || "Couldn't change the password.", "bad");
    } finally { busy(btn, false); }
  });

  $("#tokenForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#btnReplaceToken");
    say("#setMsg", "");
    busy(btn, true, "Saving…");
    try {
      await Store.replaceToken($("#tokenNew").value, $("#tokenPw").value);
      $("#tokenNew").value = $("#tokenPw").value = "";
      say("#setMsg", "New token stored. Every device picks it up on the next unlock.", "good");
    } catch (err) {
      say("#setMsg", err.message || "Couldn't store that token.", "bad");
    } finally { busy(btn, false); }
  });

  /* ── show/hide password fields ────────────────────────────────────── */
  document.addEventListener("click", (e) => {
    const eye = e.target.closest ? e.target.closest("[data-peek]") : null;
    if (!eye) return;
    const input = $("#" + eye.dataset.peek);
    input.type = input.type === "password" ? "text" : "password";
    eye.setAttribute("aria-pressed", String(input.type === "text"));
  });

  /* ── go ───────────────────────────────────────────────────────────── */
  wireStrength($("#pw1"), $("#pwMeter"));
  wireStrength($("#pwNew"), $("#pwMeter2"));
  boot();
})();
