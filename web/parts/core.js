(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ---------- storage (memory fallback when the browser blocks it) ---------- */
  var mem = {};
  function ls(k, v) {
    try {
      if (v === undefined) { var x = localStorage.getItem(k); return x ? JSON.parse(x) : (mem[k] || null); }
      if (v === null) { localStorage.removeItem(k); delete mem[k]; } else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { if (v === undefined) return mem[k] || null; if (v === null) delete mem[k]; else mem[k] = v; }
  }

  /* ---------- who is signed in ----------
     "server" mode: a real MCP Forge server answers. Accounts, sessions and runs live in its database.
     "demo" mode: no server found (for example the hosted preview). Everything stays in this browser. */
  var MODE = "demo", HEALTH = null, ME = null, READY = false;

  function api(path, opt) {
    opt = opt || {};
    opt.credentials = "same-origin";
    opt.headers = Object.assign({ "Content-Type": "application/json" }, opt.headers || {});
    if (opt.body && typeof opt.body !== "string") opt.body = JSON.stringify(opt.body);
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (!r.ok) { var e = new Error(d && typeof d.detail === "string" ? d.detail : "The server answered " + r.status + "."); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  function sha(s) {
    try {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
        return [].map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      });
    } catch (e) { return Promise.resolve(btoa(unescape(encodeURIComponent(s)))); }
  }
  function demoMe(email) { var a = (ls("forge.demo.accounts") || {})[email]; return a ? { email: email, name: a.name, prefs: a.prefs || {} } : null; }

  var Auth = {
    signup: function (name, email, pw) {
      email = email.toLowerCase();
      if (MODE === "server") return api("/api/auth/signup", { method: "POST", body: { name: name, email: email, password: pw } }).then(function (u) { ME = u; });
      var acc = ls("forge.demo.accounts") || {};
      if (acc[email]) return Promise.reject(new Error("An account with this email already exists. Sign in instead."));
      return sha(pw).then(function (h) {
        acc[email] = { name: name || email.split("@")[0], h: h, prefs: {} };
        ls("forge.demo.accounts", acc); ls("forge.demo.me", email); ME = demoMe(email);
      });
    },
    signin: function (email, pw) {
      email = email.toLowerCase();
      if (MODE === "server") return api("/api/auth/signin", { method: "POST", body: { email: email, password: pw } }).then(function (u) { ME = u; });
      var acc = ls("forge.demo.accounts") || {};
      return sha(pw).then(function (h) {
        if (!acc[email] || acc[email].h !== h) throw new Error("Email or password is wrong.");
        ls("forge.demo.me", email); ME = demoMe(email);
      });
    },
    signout: function () {
      var p = MODE === "server" ? api("/api/auth/signout", { method: "POST" }).catch(function () { }) : Promise.resolve();
      return p.then(function () { ls("forge.demo.me", null); ME = null; });
    },
    save: function (prefs, name) {
      ME.prefs = prefs; if (name) ME.name = name;
      if (MODE === "server") return api("/api/me", { method: "PATCH", body: { prefs: prefs, name: name || null } }).then(function (u) { ME = u; });
      var acc = ls("forge.demo.accounts") || {}; if (acc[ME.email]) { acc[ME.email].prefs = prefs; if (name) acc[ME.email].name = name; ls("forge.demo.accounts", acc); }
      return Promise.resolve();
    }
  };
  function getPrefs() { return (ME && ME.prefs) || {}; }

  function boot() {
    var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 2500);
    return fetch("/api/health", { signal: ctl.signal, credentials: "same-origin" })
      .then(function (r) { clearTimeout(to); return r.ok ? r.json() : null; })
      .then(function (h) { if (!h || h.ok !== true || !h.auth) throw 0; MODE = "server"; HEALTH = h; return api("/api/me").then(function (u) { ME = u; }, function () { ME = null; }); })
      .catch(function () { MODE = "demo"; HEALTH = null; var em = ls("forge.demo.me"); ME = em ? demoMe(em) : null; })
      .then(function () { READY = true; document.body.classList.remove("booting"); syncNav(); route(); });
  }

  /* ---------- segmented controls ---------- */
  /*@@SEG@@*/

  /* ---------- views ---------- */
  var current = "";
  function go(h) { if (location.hash === "#" + h) route(); else location.hash = h; }
  function route() {
    var h = (location.hash || "").replace("#", ""), user = ME, prefs = getPrefs(), v = "home";
    if ((h === "app" || h === "onboarding" || h === "signin" || h === "signup") && !READY) return;
    if (h === "app") v = !user ? "signin" : (!prefs.done ? "onboarding" : "app");
    else if (h === "onboarding") v = !user ? "signin" : "onboarding";
    else if (h === "signin" || h === "signup") v = user ? (prefs.done ? "app" : "onboarding") : "signin";
    if ((h === "app" || h === "onboarding") && v !== h) { location.hash = v === "signin" ? "signup" : v; return; }
    if ((h === "signin" || h === "signup") && v !== "signin") { location.hash = v; return; }
    var changed = v !== current; current = v;
    [].forEach.call(document.querySelectorAll("[data-view]"), function (el) { el.hidden = el.getAttribute("data-view") !== v; });
    if (v === "home") {
      syncNav(); heroStart();
      if (h === "how" || h === "built") { var el = $(h); if (el) el.scrollIntoView(); } else if (changed) window.scrollTo(0, 0);
      storyMeasure();
    } else { heroStop(); window.scrollTo(0, 0); }
    if (v === "signin") { setAuthMode(h === "signup" ? "up" : "in"); if (changed) setTimeout(function () { (h === "signup" ? $("a-name") : $("a-email")).focus(); }, 80); }
    if (v === "onboarding" && changed) obOpen();
    if (v === "app" && changed) appOpen();
  }
  window.addEventListener("hashchange", route);
  function syncNav() {
    var u = ME;
    $("nav-signin").hidden = !!u;
    $("nav-cta").textContent = u ? "Open dashboard" : "Get started";
    $("nav-cta").setAttribute("href", u ? "#app" : "#signup");
  }

  /*@@LANDING@@*/

  /*@@APP@@*/

  syncNav();
  route();
  boot();
})();
