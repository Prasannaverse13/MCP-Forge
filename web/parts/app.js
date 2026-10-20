  /* ================= SIGN IN AND SIGN UP ================= */
  var authMode = "in", authBusy = false;
  var authSeg = segInit($("auth-seg"), function (v) { location.hash = v === "up" ? "signup" : "signin"; });
  function setAuthMode(m) {
    authMode = m; var up = m === "up";
    authSeg.set(m, true);
    $("auth-title").textContent = up ? "Create your account" : "Sign in to MCP Forge";
    $("auth-sub").textContent = up ? "It takes a few seconds. No card needed." : "Welcome back. Your servers are where you left them.";
    $("ff-name").hidden = !up; $("a-hint").hidden = !up; $("a-go").querySelector("span").textContent = up ? "Create account" : "Sign in";
    $("a-pw").setAttribute("autocomplete", up ? "new-password" : "current-password");
    $("a-err").hidden = true;
    $("a-note").textContent = MODE === "demo" ? "Demo mode: no MCP Forge server was found, so accounts stay in this browser." : "Passwords are hashed on the server. Sessions end when you sign out.";
    setTimeout(authSeg.place, 20);
  }
  function authErr(msg) {
    var e = $("a-err"), f = $("fgroup"); e.textContent = msg; e.hidden = false;
    f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
  }
  $("a-eye").addEventListener("click", function () {
    var show = $("a-pw").type === "password"; $("a-pw").type = show ? "text" : "password";
    $("a-eye").textContent = show ? "Hide" : "Show"; $("a-eye").setAttribute("aria-pressed", String(show));
  });
  $("auth-form").addEventListener("submit", function (e) {
    e.preventDefault(); if (authBusy) return;
    var em = $("a-email").value.trim(), pw = $("a-pw").value, nm = $("a-name").value.trim(), up = authMode === "up", msg = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) msg = "Enter a valid email, like you@example.com.";
    else if (!pw) msg = "Enter your password.";
    else if (up && pw.length < 8) msg = "Use at least 8 characters for your password.";
    if (msg) { authErr(msg); return; }
    authBusy = true; $("a-err").hidden = true; $("a-go").classList.add("busy");
    (up ? Auth.signup(nm, em, pw) : Auth.signin(em, pw)).then(function () {
      $("a-pw").value = ""; go(getPrefs().done ? "app" : "onboarding");
    }, function (err) { authErr(err.message || "Something went wrong. Try again."); })
      .then(function () { authBusy = false; $("a-go").classList.remove("busy"); });
  });
  $("signout").addEventListener("click", function () { Auth.signout().then(function () { S.runs = []; resetRun(); go("home"); }); });

  /* ================= ONBOARDING (two steps, no keys) ================= */
  var obStep = 1, obRounds = segInit($("ob-rounds"));
  function radioGroup(el) {
    var rows = [].slice.call(el.querySelectorAll("button.row"));
    rows.forEach(function (r) { r.addEventListener("click", function () { if (r.getAttribute("aria-disabled") === "true") return; rows.forEach(function (o) { o.setAttribute("aria-checked", String(o === r)); }); }); });
    return {
      get: function () { var r = rows.filter(function (x) { return x.getAttribute("aria-checked") === "true"; })[0]; return r ? r.getAttribute("data-v") : ""; },
      set: function (v) { rows.forEach(function (o) { o.setAttribute("aria-checked", String(o.getAttribute("data-v") === v)); }); },
      rows: rows
    };
  }
  var obUse = radioGroup($("ob-use")), obRunner = radioGroup($("ob-runner"));
  function nebiusOk() { return MODE === "demo" || !!(HEALTH && HEALTH.runners && HEALTH.runners.indexOf("nebius") >= 0); }
  function obShow(n, dir) {
    var prev = obStep; obStep = n;
    [1, 2].forEach(function (i) {
      var s = $("st" + i);
      if (i === n) { s.hidden = false; s.classList.add(dir < 0 ? "out-l" : "out-r"); void s.offsetWidth; s.classList.remove("out-l", "out-r"); }
      else if (i === prev && prev !== n) { s.classList.add(dir < 0 ? "out-r" : "out-l"); setTimeout(function () { if (obStep !== i) s.hidden = true; }, 450); }
      else s.hidden = true;
    });
    [].forEach.call(document.querySelectorAll(".dots i"), function (d, i) { d.className = i === n - 1 ? "on" : ""; });
    $("ob-back").hidden = n === 1; $("ob-next").textContent = n === 2 ? "Open dashboard" : "Continue";
    if (n === 2) setTimeout(obRounds.place, 30);
  }
  function obOpen() {
    var p = getPrefs();
    $("ob-name").value = (ME && ME.name) || ""; $("ob-model").value = p.model || ""; obRounds.set(p.rounds || "3", true); obUse.set(p.use || "");
    var ok = nebiusOk(), nb = obRunner.rows[0];
    nb.setAttribute("aria-disabled", String(!ok));
    $("ob-nebius-note").textContent = ok ? "Isolated containers on Nebius." : "Needs the Nebius CLI on the server. It was not found.";
    var want = p.runner || (ok && HEALTH && HEALTH.runner === "nebius" ? "nebius" : (ok && MODE === "demo" ? "nebius" : "local"));
    if (want === "nebius" && !ok) want = "local";
    obRunner.set(want); obStep = 1; obShow(1, 1);
  }
  $("ob-back").addEventListener("click", function () { obShow(Math.max(1, obStep - 1), -1); });
  $("ob-next").addEventListener("click", function () {
    if (obStep < 2) { obShow(2, 1); return; }
    var name = $("ob-name").value.trim() || (ME && ME.name) || "there", p = Object.assign({}, getPrefs());
    p.done = true; p.use = obUse.get(); p.model = $("ob-model").value; p.rounds = $("ob-rounds").dataset.value || "3"; p.runner = obRunner.get() || "local";
    $("ob-next").disabled = true;
    Auth.save(p, name).then(function () { go("app"); }, function (e) { toast(e.message || "Could not save your setup."); }).then(function () { $("ob-next").disabled = false; });
  });

  /* ================= DASHBOARD ================= */
  var S = { view: "home", runs: [], cur: null, steps: [], files: {}, prev: {}, tests: [], round: 0, failedBefore: {}, logs: [], result: null, deploy: null,
            file: "server.py", t0: 0, busy: false, events: [], name: "", ctl: null, timers: [], clockT: 0, rest: false, anim: false, tools: null, toolsFor: null, tryOut: null };
  var fRounds = segInit($("f-rounds")), outSeg = segInit($("outseg"), function (pid) {
    ["p-code", "p-tests", "p-try", "p-logs", "p-conn"].forEach(function (id) { $(id).hidden = id !== pid; });
    if (pid === "p-try") renderTry();
  });
  /*@@SVG@@*/
  /*@@HL@@*/

  var TPL = [
    { n: "Open-Meteo weather", m: "OM", c: ["#64d2ff", "#0a84ff"], url: "https://open-meteo.com/en/docs", tools: "Current weather for a city. Seven day forecast.", d: "Weather with no API key" },
    { n: "CoinGecko prices", m: "CG", c: ["#ffd60a", "#ff9f0a"], url: "https://docs.coingecko.com/v3.0.1/reference/introduction", tools: "Price of a coin in any currency. Top coins by market cap.", d: "Crypto prices and markets" },
    { n: "GitHub issues", m: "GH", c: ["#8e8e93", "#3a3a3c"], url: "https://docs.github.com/en/rest/issues/issues", tools: "List open issues for a repo. Read one issue with its comments.", d: "Read issues from any repo" },
    { n: "Hacker News", m: "HN", c: ["#ff9f0a", "#ff6a1a"], url: "https://github.com/HackerNews/API", tools: "Top stories. One story with its first comments.", d: "Top stories and comments" },
    { n: "REST Countries", m: "RC", c: ["#30d158", "#0a9e5b"], url: "https://restcountries.com/", tools: "Find a country by name. List countries in a region.", d: "Facts about every country" },
    { n: "PokeAPI", m: "PK", c: ["#ff453a", "#c93400"], url: "https://pokeapi.co/docs/v2", tools: "Get a pokemon by name with its types and stats.", d: "Games data, great for demos" }
  ];
  $("tpl").innerHTML = TPL.map(function (t, i) {
    return '<button type="button" class="tcard" data-i="' + i + '" style="animation-delay:' + (i * 55) + 'ms"><span class="mono" style="background:linear-gradient(150deg,' + t.c[0] + "," + t.c[1] + ')">' + t.m + '</span><span><b>' + esc(t.n) + "</b><small>" + esc(t.d) + "</small><em>" + esc(t.url.replace(/^https?:\/\//, "").slice(0, 38)) + "</em></span></button>";
  }).join("");
  [].forEach.call(document.querySelectorAll(".tcard"), function (b) {
    b.addEventListener("click", function () {
      var t = TPL[+b.getAttribute("data-i")];
      $("f-api").value = t.n; $("f-url").value = t.url; $("f-tools").value = t.tools;
      var c = $("brief"); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash");
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); $("f-api").focus();
      toast("Filled in " + t.n + ". Press Forge server.");
    });
  });

  function hello() { var h = new Date().getHours(), g = h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; return g + ", " + ((ME && ME.name) || "there").split(" ")[0]; }
  function ago(ts) {
    var s = Math.max(1, Math.round(Date.now() / 1000 - ts));
    if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago";
  }
  function countTo(el, to) {
    var from = parseInt(el.textContent, 10) || 0; if (reduce || from === to) { el.textContent = to; return; }
    var t0 = performance.now(), d = 700;
    (function f(t) { var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); })(t0);
  }

  /* ---------- run storage: the server database, or this browser in demo mode ---------- */
  function demoKey() { return "forge.demo.runs." + (ME ? ME.email : "none"); }
  var Runs = {
    list: function () {
      if (MODE === "server") return api("/api/runs");
      return Promise.resolve((ls(demoKey()) || []).map(function (r) { return { id: r.id, api_name: r.api_name, created: r.created, status: r.status, passed: r.passed, total: r.total, secs: r.secs, url: r.url }; }));
    },
    get: function (id) {
      if (MODE === "server") return api("/api/runs/" + id);
      var r = (ls(demoKey()) || []).filter(function (x) { return x.id === id; })[0];
      return r ? Promise.resolve(r) : Promise.reject(new Error("That server was not found."));
    },
    del: function (id) {
      if (MODE === "server") return api("/api/runs/" + id, { method: "DELETE" });
      ls(demoKey(), (ls(demoKey()) || []).filter(function (x) { return x.id !== id; })); return Promise.resolve();
    },
    saveDemo: function (rec) { var a = ls(demoKey()) || []; a.unshift(rec); ls(demoKey(), a.slice(0, 20)); }
  };
  function refreshRuns() { return Runs.list().then(function (r) { S.runs = r || []; renderRecent(); renderStats(); }, function () { }); }

  /* ---------- renderers ---------- */
  var STEP_GROUP = { docs: 0, plan: 1, write: 2, deploy: 4 };
  function groupOf(key) { return key in STEP_GROUP ? STEP_GROUP[key] : (/^(test|fix)/.test(key) ? 3 : -1); }
  function renderBanner() {
    var b = $("banner"), msg = "";
    if (MODE === "demo") msg = "<b>Demo mode.</b> No MCP Forge server was found, so this plays a sample run. Start the server to forge real servers.";
    else if (HEALTH && (!HEALTH.nebius_key || !HEALTH.tavily_key)) msg = "<b>The server needs its keys.</b> Add <code>NEBIUS_API_KEY</code> and <code>TAVILY_API_KEY</code> to the <code>.env</code> file next to the server, then restart it.";
    b.hidden = !msg; b.innerHTML = msg ? '<span>' + msg + "</span>" : "";
  }
  function renderMode() {
    var p = $("modepill");
    if (MODE === "server") { var ok = HEALTH && HEALTH.nebius_key && HEALTH.tavily_key; p.className = "badge " + (ok ? "ok" : "warn"); p.innerHTML = "<i></i>" + (ok ? "Connected" : "Keys missing"); }
    else { p.className = "badge"; p.innerHTML = "<i></i>Demo mode"; }
    $("connnote").textContent = MODE === "server" ? "Requests need the token shown in the config, if there is one." : "Sample data. Start the server to forge real servers.";
  }
  function setView(v) {
    S.view = v; $("home-pane").hidden = v !== "home"; $("run-pane").hidden = v !== "run";
    $("hello").textContent = v === "home" ? hello() : (S.name || "Server");
    $("crumb").textContent = v === "home" ? "Name an API and Nemotron builds, tests and ships an MCP server for it." : "";
    if (v === "home") $("crumb").hidden = false;
    setTimeout(function () { fRounds.place(); outSeg.place(); }, 20);
  }
  function stepState(g) {
    var st = S.steps.filter(function (s) { return groupOf(s.key) === g; });
    if (!st.length) return "";
    if (st.some(function (s) { return s.state === "run"; })) return "run";
    var last = st[st.length - 1];
    if (g === 3) {
      if (last.state === "done" && /^test/.test(last.key)) return "done";
      if (S.result && S.result.state !== "run" && !(S.result.ok)) return "fail";
      return "warn";
    }
    if (last.state === "done") return "done";
    if (S.result && S.result.state === "error") return "fail";
    return last.state === "warn" ? "warn" : last.state;
  }
  var NODE_TICK = '<svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 6.3l2.2 2.2 4.6-5"/></svg>';
  function renderHead() {
    var running = S.result && S.result.state === "run";
    $("fh-name").textContent = S.name || "Server";
    var states = [0, 1, 2, 3, 4].map(stepState), doneN = 0, run = false;
    [].forEach.call($("stepper").querySelectorAll("li"), function (li, i) {
      var s = states[i]; li.setAttribute("data-s", s);
      var node = li.querySelector(".node"); node.innerHTML = s === "done" ? NODE_TICK : "";
      if (s === "done") doneN++; if (s === "run") run = true;
    });
    var fill = Math.min(100, (doneN + (run ? 0.5 : 0)) / 4 * 100), tf = $("trackfill");
    if (S.result && S.result.state === "done" && S.result.ok) fill = 100;
    tf.style.width = (fill * 0.999) + "%"; tf.classList.toggle("ok", fill >= 100 && S.result && S.result.ok);
    var status = "Starting";
    if (running) { var cur = S.steps.filter(function (s) { return s.state === "run"; }).pop(); status = cur ? cur.name + (cur.tool ? " with " + cur.tool : "") : "Working"; }
    else if (S.result && S.result.state === "done") status = S.result.ok ? "Live. " + S.result.passed + " of " + S.result.total + " tests passed" : "Not ready. " + S.result.passed + " of " + S.result.total + " tests passed";
    else if (S.result && S.result.state === "error") status = S.result.message;
    else if (S.steps.length) status = "Finished";
    $("fh-status").textContent = status;
    var ing = $("fIngot"); ing.classList.toggle("instant", S.rest);
    ing.classList.toggle("forging", !!running);
    if (!running) ing.style.setProperty("--h", "0"); else ing.style.removeProperty("--h");
    $("fh-clock").textContent = running ? clock() : (S.result && S.result.secs ? fmtSecs(S.result.secs) : (S.steps.length ? clock() : "00:00"));
  }
  function fmtSecs(s) { s = Math.round(s); return ("0" + Math.floor(s / 60)).slice(-2) + ":" + ("0" + (s % 60)).slice(-2); }
  function clock() { return fmtSecs(Math.max(0, (Date.now() - S.t0) / 1000)); }
  function renderPipe() {
    var el = $("pipe");
    if (!S.steps.length) { el.innerHTML = '<li style="display:block;animation:none"><div class="empty"><b>Getting ready</b>Each step shows up here as it happens.</div></li>'; el.dataset.empty = "1"; $("roundpill").className = "badge"; $("roundpill").textContent = "Ready"; renderHead(); return; }
    if (el.dataset.empty) { el.innerHTML = ""; delete el.dataset.empty; }
    S.steps.forEach(function (s) {
      var li = el.querySelector('[data-k="' + s.key + '"]');
      if (!li) { li = document.createElement("li"); li.setAttribute("data-k", s.key); if (S.rest) li.style.animation = "none"; li.innerHTML = '<span class="ic"></span><div><div class="nm"></div><div class="dt"></div><span class="tool"></span></div><span class="sec"></span>'; el.appendChild(li); }
      if (li.getAttribute("data-s") !== s.state) { li.setAttribute("data-s", s.state); li.querySelector(".ic").innerHTML = SVG[s.state] || SVG.wait; }
      li.querySelector(".nm").textContent = s.name;
      li.querySelector(".dt").textContent = s.state === "run" ? "Working" : (s.detail || "");
      li.querySelector(".tool").textContent = s.tool;
      li.querySelector(".sec").textContent = s.secs != null && s.state !== "run" ? s.secs.toFixed(1) + " s" : "";
    });
    var tests = S.steps.filter(function (s) { return /^test/.test(s.key); }).length;
    var rb = $("roundpill"); rb.className = "badge" + (S.result && S.result.state === "run" ? " run" : "");
    rb.innerHTML = (S.result && S.result.state === "run" ? "<i></i>" : "") + (tests ? "Round " + tests + " of " + ($("f-rounds").dataset.value || 3) : "Starting");
    renderHead();
  }
  function renderCode() {
    var names = Object.keys(S.files);
    $("ftabs").innerHTML = names.map(function (n) { return '<button type="button" class="ftab" aria-pressed="' + (n === S.file) + '" data-f="' + esc(n) + '">' + esc(n) + "</button>"; }).join("");
    [].forEach.call($("ftabs").querySelectorAll(".ftab"), function (b) { b.addEventListener("click", function () { S.file = b.getAttribute("data-f"); renderCode(); }); });
    var src = S.files[S.file];
    $("dlzip").disabled = !names.length; $("copycode").disabled = src == null;
    if (src == null) { $("code").innerHTML = '<div class="empty"><b>No code yet</b>The server and its tests appear here once Nemotron writes them.</div>'; $("codemeta").textContent = ""; return; }
    var old = {}; (S.prev[S.file] || "").split("\n").forEach(function (l) { old[l] = 1; });
    var lines = src.replace(/\n$/, "").split("\n"), ch = 0, an = S.anim && !reduce;
    $("code").innerHTML = lines.map(function (l, i) {
      var hit = S.prev[S.file] != null && l.trim() && !old[l]; if (hit) ch++;
      return '<div class="ln' + (hit ? " hl" : "") + (an ? " rv" : "") + '" style="--i:' + Math.min(i, 45) + '"><i>' + (i + 1) + "</i><span>" + (l ? hlLine(l) : " ") + "</span></div>";
    }).join("");
    S.anim = false;
    $("codemeta").textContent = lines.length + " lines" + (ch ? ", " + ch + " changed by the last fix" : "");
  }
  function lastLine(s) { var a = String(s || "").trim().split("\n").filter(Boolean); return (a[a.length - 1] || "").slice(0, 180); }
  function human(n) { n = String(n).replace(/^test_/, "").replace(/_/g, " "); return n.charAt(0).toUpperCase() + n.slice(1); }
  function renderTests() {
    var el = $("tests"), sum = $("tsum");
    if (!S.tests.length) { sum.innerHTML = ""; el.innerHTML = '<li style="display:block"><div class="empty"><b>No results yet</b>Test results appear after the first round.</div></li>'; return; }
    var pn = S.tests.filter(function (t) { return t.outcome === "passed"; }).length, tot = S.tests.length, C = 2 * Math.PI * 24;
    sum.innerHTML = '<svg class="ring" viewBox="0 0 56 56"><circle class="bg" cx="28" cy="28" r="24"/><circle class="fg' + (pn < tot ? " part" : "") + '" cx="28" cy="28" r="24" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg><div><b>' + pn + " of " + tot + " passed</b><span>Round " + S.round + "</span></div>";
    var fg = sum.querySelector(".fg"); requestAnimationFrame(function () { requestAnimationFrame(function () { fg.style.strokeDashoffset = (C * (1 - pn / tot)).toFixed(1); }); });
    el.innerHTML = S.tests.map(function (t, i) {
      var pass = t.outcome === "passed", fixed = pass && S.failedBefore[t.name];
      return '<li style="--i:' + i + '">' + (pass ? SVG.pass : SVG.fail) + '<div><div class="nm">' + esc(human(t.name)) + "</div>" + (pass ? "" : '<div class="why">' + esc(lastLine(t.detail)) + "</div>") + "</div>" +
        (fixed ? '<span class="badge warn">Fixed in round ' + S.round + "</span>" : pass ? '<span class="badge ok">Passed</span>' : '<span class="badge bad">Failed</span>') + "</li>";
    }).join("");
  }
  function renderLogs() {
    var el = $("logs");
    if (!S.logs.length) { el.innerHTML = '<span class="t">Nothing logged yet.</span>'; return; }
    el.innerHTML = S.logs.map(function (l) { return '<span class="t">' + l.t + "</span>  " + (l.level ? '<span class="' + l.level + '">' + esc(l.text) + "</span>" : esc(l.text)); }).join("\n");
    el.scrollTop = el.scrollHeight;
  }
  function renderResult() {
    var r = S.result, el = $("result");
    if (!r) { el.innerHTML = ""; renderHead(); return; }
    if (r.state === "run") el.innerHTML = '<span class="badge run"><i></i>Forging</span>';
    else if (r.state === "error") el.innerHTML = '<span class="badge bad"><i></i>Stopped</span>';
    else if (!r.ok) el.innerHTML = '<span class="badge bad"><i></i>Not ready</span><span>' + r.passed + " of " + r.total + " tests passed</span>";
    else el.innerHTML = '<svg class="ck" viewBox="0 0 24 24">' + SVG.done.replace(/^<svg[^>]*>|<\/svg>$/g, "") + '</svg><b>Server ready</b><span>' + r.passed + " of " + r.total + " tests passed in " + r.rounds + (r.rounds === 1 ? " round" : " rounds") + "</span>";
    renderHead();
  }
  function renderConnect() {
    var d = S.deploy;
    $("url").textContent = d ? d.url : "Your endpoint appears here after deploy.";
    var cfg = {};
    if (d) { cfg = { mcpServers: {} }; cfg.mcpServers[d.name || "my-server"] = d.token ? { url: d.url, headers: { Authorization: "Bearer " + d.token } } : { url: d.url }; }
    $("cfg").textContent = JSON.stringify(cfg, null, 2);
  }
  var armed = null, armT = 0;
  function renderRecent() {
    var q = ($("srv-q").value || "").trim().toLowerCase(), el = $("recent");
    var rs = S.runs.filter(function (r) { return !q || r.api_name.toLowerCase().indexOf(q) >= 0; });
    if (!rs.length) { el.innerHTML = '<p class="empty-s">' + (S.runs.length ? "No servers match." : "Servers you forge show up here.") + "</p>"; return; }
    el.innerHTML = rs.slice(0, 40).map(function (r, i) {
      var cls = r.status === "live" ? "ok" : r.status === "running" ? "run" : "warn";
      var meta = r.status === "live" ? "Live, " + r.passed + " of " + r.total + " tests" : r.status === "running" ? "Running" : r.status === "failed" ? "Not ready, " + r.passed + " of " + r.total : "Stopped";
      return '<div class="it" role="listitem" tabindex="0" data-id="' + esc(r.id) + '"' + (r.id === S.cur && S.view === "run" ? ' aria-current="true"' : "") + ' style="animation-delay:' + Math.min(i, 8) * 40 + 'ms"><i class="' + cls + '"></i><span><span class="nm">' + esc(r.api_name) + "</span><small>" + meta + ", " + ago(r.created) + '</small></span><button class="del" type="button" aria-label="Delete ' + esc(r.api_name) + '" data-del="' + esc(r.id) + '"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 3h8M4.5 3V2h3v1M3.2 3l.4 7h4.8l.4-7"/></svg></button></div>';
    }).join("");
  }
  $("recent").addEventListener("click", function (e) {
    var d = e.target.closest("[data-del]");
    if (d) {
      e.stopPropagation(); var id = d.getAttribute("data-del");
      if (armed !== id) { armed = id; d.style.opacity = 1; d.style.width = "auto"; d.style.padding = "0 8px"; d.style.font = "500 12px/1 var(--text)"; d.textContent = "Delete?"; clearTimeout(armT); armT = setTimeout(function () { armed = null; renderRecent(); }, 2600); return; }
      armed = null; Runs.del(id).then(function () { if (S.cur === id) { newServer(); } return refreshRuns(); }).then(function () { toast("Deleted."); }, function (er) { toast(er.message); }); return;
    }
    var it = e.target.closest(".it"); if (it) openRun(it.getAttribute("data-id"));
  });
  $("recent").addEventListener("keydown", function (e) { if (e.key === "Enter") { var it = e.target.closest(".it"); if (it && e.target === it) openRun(it.getAttribute("data-id")); } });
  $("srv-q").addEventListener("input", renderRecent);
  function renderStats() {
    var rs = S.runs, live = rs.filter(function (r) { return r.status === "live"; }), tests = rs.reduce(function (a, r) { return a + (r.passed || 0); }, 0);
    var secs = rs.filter(function (r) { return r.secs > 0; }), avg = secs.length ? Math.round(secs.reduce(function (a, r) { return a + r.secs; }, 0) / secs.length) : 0;
    var v = { count: rs.length, live: live.length, tests: tests, avg: avg };
    [].forEach.call($("stats").querySelectorAll("b"), function (b) { countTo(b, v[b.getAttribute("data-k")]); });
  }
  function renderAll() { renderMode(); renderBanner(); renderPipe(); renderCode(); renderTests(); renderLogs(); renderResult(); renderConnect(); renderRecent(); if (!$("p-try").hidden) renderTry(); }

  /* ---------- Try it: call the live tools ---------- */
  var DEMO_TOOLS = [
    { name: "current_weather", description: "Current temperature and wind for a city.", schema: { properties: { city: { type: "string", title: "City" } }, required: ["city"] } },
    { name: "forecast_7_day", description: "High, low and rain for the next seven days.", schema: { properties: { city: { type: "string", title: "City" } }, required: ["city"] } }
  ];
  function demoCall(tool, args) {
    var c = args.city || "Paris";
    if (tool === "current_weather") return { city: c, temp_c: 17.4, wind_kmh: 11.2 };
    var out = []; for (var i = 0; i < 7; i++) out.push({ date: "2026-10-" + (21 + i), high_c: 18 - (i % 3), low_c: 9 + (i % 4), rain_mm: [0, 0.4, 2.1, 0, 0, 5.2, 0.8][i] });
    return out;
  }
  function renderTry() {
    var el = $("try");
    if (!S.deploy) { el.innerHTML = '<div class="empty"><b>Nothing to try yet</b>When a server is live you can call its tools here.</div>'; return; }
    if (S.toolsFor !== S.cur) {
      S.toolsFor = S.cur; S.tools = null; S.tryOut = null;
      el.innerHTML = '<div class="empty"><b>Loading tools</b>Asking the live server what it can do.</div>';
      var p = MODE === "server" ? api("/api/runs/" + S.cur + "/tools") : Promise.resolve(DEMO_TOOLS);
      p.then(function (t) { S.tools = t; drawTry(); }, function (e) { S.tools = []; S.toolsErr = e.message; drawTry(); });
      return;
    }
    drawTry();
  }
  function drawTry() {
    var el = $("try"), tools = S.tools || [];
    if (!tools.length) { el.innerHTML = '<div class="empty"><b>No tools to show</b>' + esc(S.toolsErr || "The server did not list any tools. It may have stopped.") + "</div>"; return; }
    var sel = S.sel && tools.some(function (t) { return t.name === S.sel; }) ? S.sel : tools[0].name; S.sel = sel;
    var t = tools.filter(function (x) { return x.name === sel; })[0], props = (t.schema && t.schema.properties) || {}, req = (t.schema && t.schema.required) || [];
    el.innerHTML = '<div class="try-row"><span class="lbl">Tool</span><span class="chipsel"><select id="try-sel" aria-label="Tool">' + tools.map(function (x) { return '<option value="' + esc(x.name) + '"' + (x.name === sel ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></span></div>" +
      '<p class="try-desc">' + esc(t.description || "No description.") + "</p>" +
      '<div class="try-args">' + Object.keys(props).map(function (k) { var p = props[k]; return '<div class="sub"><label for="ta-' + esc(k) + '">' + esc(k) + (req.indexOf(k) >= 0 ? " (required)" : "") + " " + esc(p.type || "") + '</label><input id="ta-' + esc(k) + '" data-k="' + esc(k) + '" data-t="' + esc(p.type || "string") + '" placeholder="' + esc(p.title || k) + '" value="' + esc(S.tryArgs && S.tryArgs[k] != null ? S.tryArgs[k] : (p.type === "string" && k.indexOf("city") >= 0 ? "Paris" : (p.default != null ? p.default : ""))) + '"></div>'; }).join("") + "</div>" +
      '<div class="try-row"><button class="pill-btn sm" id="try-go" type="button">Run tool</button><span class="lbl" id="try-note">' + (MODE === "demo" ? "Sample output in demo mode." : "Runs against the live server.") + "</span></div>" +
      (S.tryOut ? '<div class="try-out"><div class="h"><span>' + esc(S.tryOut.title) + "</span><span>" + esc(S.tryOut.ms) + '</span></div><pre>' + esc(S.tryOut.text) + "</pre></div>" : "");
    $("try-sel").addEventListener("change", function () { S.sel = this.value; S.tryOut = null; S.tryArgs = null; drawTry(); });
    $("try-go").addEventListener("click", function () {
      var args = {}, bad = "";
      [].forEach.call(el.querySelectorAll("[data-k]"), function (i) {
        var v = i.value.trim(), ty = i.getAttribute("data-t"), k = i.getAttribute("data-k");
        if (v === "") { if (req.indexOf(k) >= 0) bad = k + " is required."; return; }
        if (ty === "integer" || ty === "number") { var n = Number(v); if (isNaN(n)) bad = k + " must be a number."; else args[k] = n; }
        else if (ty === "boolean") args[k] = v === "true";
        else if (ty === "array" || ty === "object") { try { args[k] = JSON.parse(v); } catch (e) { bad = k + " must be valid JSON."; } }
        else args[k] = v;
      });
      S.tryArgs = args; if (bad) { toast(bad); return; }
      var b = $("try-go"); b.disabled = true; b.textContent = "Running"; var t0 = performance.now();
      var p = MODE === "server" ? api("/api/runs/" + S.cur + "/call", { method: "POST", body: { tool: sel, args: args } })
        : new Promise(function (ok) { setTimeout(function () { ok({ ok: true, text: JSON.stringify(demoCall(sel, args), null, 2) }); }, reduce ? 0 : 650); });
      p.then(function (r) { S.tryOut = { title: (r.ok ? "Result from " : "Error from ") + sel, text: r.text, ms: Math.round(performance.now() - t0) + " ms" }; },
        function (e) { S.tryOut = { title: "Could not call " + sel, text: e.message, ms: "" }; }).then(drawTry);
    });
  }

  /* ---------- events: the live API and the sample both feed this ---------- */
  function applyEvent(ev) {
    if (ev.type === "run") { S.cur = ev.id; return; }
    S.events.push(ev);
    if (ev.type === "step") {
      var s = S.steps.filter(function (x) { return x.key === ev.key; })[0];
      if (!s) { s = { key: ev.key }; S.steps.push(s); }
      s.name = ev.name; s.tool = ev.tool; s.state = ev.state; s.detail = ev.detail; s.secs = ev.secs; renderPipe();
    } else if (ev.type === "log") { S.logs.push({ t: S.rest ? "" : clock(), level: ev.level || "", text: ev.text }); if (!S.rest) renderLogs();
    } else if (ev.type === "code") {
      S.prev = (ev.changed && ev.changed.length) ? S.files : {}; S.files = ev.files; if (!S.files[S.file]) S.file = "server.py"; S.anim = !S.rest; renderCode();
    } else if (ev.type === "tests") {
      S.tests.forEach(function (t) { if (t.outcome !== "passed") S.failedBefore[t.name] = 1; });
      S.round = ev.round; S.tests = ev.tests; renderTests();
    } else if (ev.type === "done") {
      var sm = ev.summary || {};
      S.result = { state: "done", ok: ev.ok, passed: sm.passed, total: sm.total, rounds: sm.rounds || S.round, secs: sm.secs };
      if (ev.ok) S.deploy = { url: ev.url, token: ev.token, name: ev.server_name };
      renderResult(); renderConnect(); renderPipe();
    } else if (ev.type === "error") { S.result = { state: "error", message: ev.message }; renderResult(); renderPipe(); }
  }
  function resetRun() {
    S.steps = []; S.files = {}; S.prev = {}; S.tests = []; S.round = 0; S.failedBefore = {}; S.logs = []; S.result = null; S.deploy = null; S.events = [];
    S.t0 = Date.now(); S.file = "server.py"; S.tools = null; S.toolsFor = null; S.tryOut = null; S.tryArgs = null; S.sel = null; $("pipe").innerHTML = "";
  }
  function stopTimers() { S.timers.forEach(clearTimeout); S.timers = []; clearInterval(S.clockT); S.clockT = 0; }
  function startClock() { clearInterval(S.clockT); S.clockT = setInterval(function () { if (S.result && S.result.state === "run") $("fh-clock").textContent = clock(); }, 500); }

  /* ---------- open a saved run (replays its events without the show) ---------- */
  function openRun(id) {
    if (S.busy) { toast("A run is in progress. Stop it first."); return; }
    closeMenu();
    Runs.get(id).then(function (r) {
      stopTimers(); resetRun(); S.rest = true; S.cur = r.id; S.name = r.api_name;
      (r.events || []).forEach(applyEvent);
      if (!S.result && r.status === "running") S.result = null;
      if (!S.result && r.status === "stopped") S.result = { state: "error", message: "This run was stopped." };
      if (r.files && Object.keys(S.files).length === 0) S.files = r.files;
      var b = r.brief || {}; $("f-api").value = r.api_name; $("f-url").value = b.docs_url || ""; $("f-tools").value = b.tools || "";
      S.rest = false; setView("run"); renderAll(); outSeg.set("p-code"); renderRecent();
    }, function (e) { toast(e.message || "Could not open that server."); });
  }
  function newServer() {
    if (S.busy) { toast("A run is in progress. Stop it first."); return; }
    stopTimers(); resetRun(); S.cur = null; S.name = ""; $("f-api").value = ""; $("f-url").value = ""; $("f-tools").value = "";
    setView("home"); renderAll(); closeMenu(); $("f-api").focus();
  }
  $("newbtn").addEventListener("click", newServer);

  /* ---------- sample run (demo mode) ---------- */
  /*@@SAMPLE@@*/
  function playSample(done) {
    var i = 0; S.timers = [];
    (function next() { if (i >= SAMPLE.length) { done(); return; } var s = SAMPLE[i++]; S.timers.push(setTimeout(function () { applyEvent(s[1]); next(); }, reduce ? 0 : s[0])); })();
  }

  /* ---------- live run: POST, then read the event stream ---------- */
  function liveRun(body, done) {
    S.ctl = new AbortController();
    return fetch("/api/forge", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: S.ctl.signal }).then(function (res) {
      if (res.status === 401) { throw Object.assign(new Error("Your session ended. Sign in again."), { auth: true }); }
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(typeof d.detail === "string" && d.detail ? d.detail : "The server answered " + res.status + "."); });
      var rd = res.body.getReader(), dec = new TextDecoder(), buf = "";
      function pump() {
        return rd.read().then(function (c) {
          if (c.done) return;
          buf += dec.decode(c.value, { stream: true });
          var parts = buf.split("\n\n"); buf = parts.pop();
          parts.forEach(function (p) { if (p.indexOf("data: ") === 0) { try { applyEvent(JSON.parse(p.slice(6))); } catch (e) { } } });
          return pump();
        });
      }
      return pump().then(function () { if (S.result && S.result.state === "run") applyEvent({ type: "error", message: "The stream ended early. Check the server log." }); });
    }).catch(function (e) {
      if (e.name === "AbortError") { applyEvent({ type: "error", message: "You stopped this run." }); return; }
      if (e.auth) { ME = null; toast(e.message); go("signin"); return; }
      applyEvent({ type: "error", message: e.message || "Could not reach the server." });
    }).then(done);
  }

  /* ---------- composer ---------- */
  function setBusy(b) {
    S.busy = b; $("go").disabled = b; $("go").textContent = b ? "Forging" : "Forge server"; $("stop").hidden = !b;
    [].forEach.call($("brief").querySelectorAll("input,select"), function (i) { i.disabled = b; });
  }
  function finishRun(name) {
    setBusy(false); clearInterval(S.clockT); S.clockT = 0; S.ctl = null; renderHead();
    if (S.result && S.result.ok) toast("Server ready. " + S.result.passed + " of " + S.result.total + " tests passed.");
    if (MODE === "demo" && S.result && S.result.state === "done") {
      Runs.saveDemo({ id: "d" + Date.now(), api_name: name, created: Date.now() / 1000, status: S.result.ok ? "live" : "failed", passed: S.result.passed, total: S.result.total, secs: S.result.secs,
        url: S.deploy ? S.deploy.url : null, files: S.files, events: S.events.slice(), brief: { api_name: name, docs_url: $("f-url").value, tools: $("f-tools").value } });
    }
    refreshRuns();
  }
  $("brief").addEventListener("submit", function (e) {
    e.preventDefault(); if (S.busy) return;
    var name = $("f-api").value.trim();
    if (name.length < 2) { toast("Name the API first."); $("f-api").focus(); return; }
    if (MODE === "server" && HEALTH && !(HEALTH.nebius_key && HEALTH.tavily_key)) { toast("Add the keys to the server's .env file first."); return; }
    var p = getPrefs();
    stopTimers(); resetRun(); S.name = name; S.cur = null; S.result = { state: "run" }; setView("run"); renderAll(); outSeg.set("p-code"); setBusy(true); startClock();
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    if (MODE === "server") {
      liveRun({ api_name: name, docs_url: $("f-url").value.trim(), tools: $("f-tools").value.trim(), writer_hint: $("f-model").value, max_rounds: parseInt($("f-rounds").dataset.value, 10) || 3, runner: p.runner || "" },
        function () { finishRun(name); });
    } else playSample(function () { finishRun(name); });
  });
  $("stop").addEventListener("click", function () {
    if (S.ctl) S.ctl.abort();
    else { stopTimers(); applyEvent({ type: "error", message: "You stopped this run." }); finishRun($("f-api").value.trim()); }
  });
  $("f-model").addEventListener("change", function () { var p = Object.assign({}, getPrefs(), { model: this.value }); Auth.save(p).catch(function () { }); });

  /* ---------- copy, download, toast ---------- */
  var toastEl = $("toast"), tt;
  function toast(m) { toastEl.textContent = m; toastEl.classList.add("on"); clearTimeout(tt); tt = setTimeout(function () { toastEl.classList.remove("on"); }, 2600); }
  function copy(text, ok, node) {
    function fallback() { try { var r = document.createRange(); r.selectNodeContents(node); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press Ctrl+C to copy."); } catch (e) { } }
    try { navigator.clipboard.writeText(text).then(function () { toast(ok); }, fallback); } catch (e) { fallback(); }
  }
  $("copycode").addEventListener("click", function () { if (S.files[S.file] != null) copy(S.files[S.file], "Copied " + S.file, $("code")); else toast("No code yet."); });
  $("copyurl").addEventListener("click", function () { if (S.deploy) copy(S.deploy.url, "Copied endpoint", $("url")); else toast("No endpoint yet."); });
  $("copycfg").addEventListener("click", function () { if (S.deploy) copy($("cfg").textContent, "Copied config", $("cfg")); else toast("No config yet."); });
  $("dlzip").addEventListener("click", function () {
    var a = document.createElement("a");
    if (MODE === "server" && S.cur) { a.href = "/api/runs/" + S.cur + "/zip"; a.download = ""; }
    else { if (S.files[S.file] == null) return; a.href = URL.createObjectURL(new Blob([S.files[S.file]], { type: "text/plain" })); a.download = S.file; }
    document.body.appendChild(a); a.click(); a.remove(); toast(MODE === "server" ? "Downloading zip." : "Downloaded " + S.file + ".");
  });

  /* ---------- mobile sidebar ---------- */
  function closeMenu() { $("side").classList.remove("open"); $("scrim").hidden = true; $("menubtn").setAttribute("aria-expanded", "false"); }
  $("menubtn").addEventListener("click", function () { var o = !$("side").classList.contains("open"); $("side").classList.toggle("open", o); $("scrim").hidden = !o; this.setAttribute("aria-expanded", String(o)); });
  $("scrim").addEventListener("click", closeMenu);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  /* ---------- open the dashboard ---------- */
  function appOpen() {
    var p = getPrefs(), name = (ME && ME.name) || "there";
    $("avatar").textContent = (name.charAt(0) || "?").toUpperCase(); $("uname").textContent = name; $("uemail").textContent = ME ? ME.email : "";
    fRounds.set(p.rounds || "3", true); $("f-model").value = p.model || "";
    outSeg.set("p-code");
    if (!S.busy) { stopTimers(); resetRun(); S.cur = null; S.name = ""; setView("home"); }
    renderAll(); S.runs = []; renderRecent(); refreshRuns();
    setTimeout(function () { fRounds.place(); outSeg.place(); }, 30);
  }
