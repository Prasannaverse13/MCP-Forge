  /* ---------- hero: the chip cools, sparks fly, it follows the pointer ---------- */
  var ingot = $("heroIngot"), glow = $("glow"), cv = $("sparks"), cx = cv.getContext("2d");
  var heat = reduce ? 0 : 1, cooled = reduce, sparks = [], raf = 0, running = false, t0 = 0, W = 0, H = 0, DPR = 1;
  function setHeat(h) { ingot.style.setProperty("--h", h.toFixed(3)); glow.style.setProperty("--h", h.toFixed(3)); }
  setHeat(heat);
  function sizeCanvas() { var r = cv.getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; }
  function spark() {
    var a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4.5;
    return { x: W / 2 + Math.cos(a) * 60, y: H / 2 + Math.sin(a) * 60, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.4, life: 1, r: 0.7 + Math.random() * 1.6 };
  }
  function frame(t) {
    if (!t0) t0 = t;
    var el = (t - t0) / 1000;
    if (!cooled) { heat = Math.max(0, 1 - Math.pow(Math.max(0, el - 0.5) / 2.6, 1.4)); setHeat(heat); if (heat <= 0) cooled = true; }
    cx.setTransform(DPR, 0, 0, DPR, 0, 0); cx.clearRect(0, 0, W, H);
    var n = heat > 0.05 ? Math.round(heat * 6) : 0;
    for (var i = 0; i < n; i++) sparks.push(spark());
    cx.globalCompositeOperation = "lighter";
    for (var j = sparks.length - 1; j >= 0; j--) {
      var p = sparks[j]; p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.vx *= 0.99; p.life -= 0.016;
      if (p.life <= 0) { sparks.splice(j, 1); continue; }
      cx.strokeStyle = "rgba(255," + Math.round(150 + 90 * p.life) + "," + Math.round(60 * p.life) + "," + p.life.toFixed(2) + ")";
      cx.lineWidth = p.r; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5); cx.stroke();
    }
    cx.globalCompositeOperation = "source-over";
    if (running && (!cooled || sparks.length)) raf = requestAnimationFrame(frame); else running = false;
  }
  var heroBooted = false;
  function heroStart() {
    if (heroBooted || reduce) return; heroBooted = true;
    sizeCanvas(); running = true; raf = requestAnimationFrame(frame);
  }
  function heroStop() { running = false; cancelAnimationFrame(raf); }
  var stage = $("stage");
  if (!reduce && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", function (e) {
      if (current !== "home") return;
      var r = stage.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
      var dx = (e.clientX - (r.left + r.width / 2)) / innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
      ingot.style.transform = "rotateY(" + (dx * 22).toFixed(2) + "deg) rotateX(" + (-dy * 18).toFixed(2) + "deg)";
    }, { passive: true });
  }

  /* ---------- pinned scroll story ---------- */
  var story = $("how"), says = [].slice.call(document.querySelectorAll(".say")), rails = [].slice.call(document.querySelectorAll(".rail div"));
  var scenes = [$("sc0"), $("sc1"), $("sc2"), $("sc3")], titles = ["open-meteo.com/en/docs", "server.py", "Serverless Job", "Serverless Endpoint"];
  var STORY_CODE = 'from mcp.server.fastmcp import FastMCP\nimport httpx\n\nmcp = FastMCP("open-meteo")\n\n@mcp.tool()\nasync def forecast_7_day(city: str) -> list[dict]:\n    """High, low and rain for the next seven days."""\n    lat, lon = await _locate(city)\n    async with httpx.AsyncClient(timeout=10) as http:\n        r = await http.get(API, params={\n            "latitude": lat, "longitude": lon,\n            "daily": "temperature_2m_max,precipitation_sum"})\n    return parse_days(r.json()["daily"])';
  var STORY_TESTS = [["Lists both tools", 1], ["Returns a temperature for Paris", 1], ["Explains an unknown city", 0], ["Returns seven days", 1], ["Has high, low and rain every day", 0], ["Times out cleanly", 1]];
  $("trList").innerHTML = STORY_TESTS.map(function (t) { return '<li data-ok="' + t[1] + '"><span class="dot"><svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M2 5.2l2 2 4-4.4"/></svg></span><span>' + t[0] + "</span><small></small></li>"; }).join("");
  var trItems = [].slice.call($("trList").children), eps = [].slice.call(document.querySelectorAll(".doc .ep"));
  var sTop = 0, sLen = 1, lastPhase = -1, lastTyped = -1;
  function storyMeasure() { if (reduce) return; var r = story.getBoundingClientRect(); sTop = r.top + scrollY; sLen = Math.max(1, story.offsetHeight - innerHeight); onScroll(); }
  function hlStory(src) { return src.split("\n").map(hlLine).join("\n"); }
  function onScroll() {
    if (current !== "home" || reduce) return;
    var p = Math.min(1, Math.max(0, (scrollY - sTop) / sLen)), f = p * 4, ph = Math.min(3, Math.floor(f)), loc = Math.min(1, f - ph);
    if (ph !== lastPhase) {
      says.forEach(function (s, i) { s.classList.toggle("on", i === ph); });
      scenes.forEach(function (s, i) { s.classList.toggle("on", i === ph); });
      $("wintitle").textContent = titles[ph]; lastPhase = ph;
    }
    rails.forEach(function (r, i) { r.classList.toggle("on", i <= ph); r.querySelector("b").style.width = (i < ph ? 100 : i === ph ? loc * 100 : 0) + "%"; });
    if (ph === 0) {
      $("beam").style.top = (loc * 210 - 30) + "px";
      eps.forEach(function (e) { e.classList.toggle("lit", loc > parseFloat(e.getAttribute("data-at"))); });
      $("found").style.opacity = loc > 0.7 ? 1 : 0; $("found").style.transition = "opacity .4s";
    } else if (ph === 1) {
      var n = Math.round(Math.min(1, loc * 1.15) * STORY_CODE.length);
      if (n !== lastTyped) { lastTyped = n; $("typed").innerHTML = hlStory(STORY_CODE.slice(0, n)) + '<span class="caret"></span>'; }
    } else if (ph === 2) {
      var shown = Math.min(6, Math.floor(loc * 12)), fixed = loc > 0.68;
      trItems.forEach(function (li, i) {
        var ok = li.getAttribute("data-ok") === "1";
        li.classList.toggle("in", i < shown);
        li.classList.toggle("bad", !ok && !fixed);
        li.classList.toggle("fixed", !ok && fixed);
        li.querySelector("small").textContent = !ok && fixed ? "Fixed by Nano" : "";
      });
      var passed = trItems.filter(function (li, i) { return i < shown && (li.getAttribute("data-ok") === "1" || fixed); }).length;
      $("trTitle").textContent = fixed ? "Round 2" : "Round 1"; $("trScore").textContent = passed + " of 6 passed";
    }
  }
  if (reduce) {
    story.classList.add("static");
    $("typed").innerHTML = hlStory(STORY_CODE);
    trItems.forEach(function (li) { li.classList.add("in"); if (li.getAttribute("data-ok") === "0") { li.classList.add("fixed"); li.querySelector("small").textContent = "Fixed by Nano"; } });
    $("trTitle").textContent = "Round 2"; $("trScore").textContent = "6 of 6 passed";
    eps.forEach(function (e) { e.classList.add("lit"); }); $("beam").hidden = true;
  } else {
    $("found").style.opacity = 0;
    window.addEventListener("scroll", function () { requestAnimationFrame(onScroll); }, { passive: true });
    window.addEventListener("resize", storyMeasure);
    window.addEventListener("load", storyMeasure);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("go"); io.unobserve(e.target); } }); }, { threshold: 0.6 });
    io.observe($("vdots"));
  } else $("vdots").classList.add("go");