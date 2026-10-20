  /* ---------- segmented controls ---------- */
  function segInit(el, onPick) {
    var btns = [].slice.call(el.querySelectorAll("button")), thumb = el.querySelector(".thumb");
    function set(btn, silent) {
      btns.forEach(function (b) { var on = b === btn; b.setAttribute(b.getAttribute("role") === "tab" ? "aria-selected" : "aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
      el.dataset.value = btn.getAttribute("data-v") || btn.getAttribute("data-p");
      place(); if (!silent && onPick) onPick(el.dataset.value);
    }
    function place() {
      var on = btns.filter(function (b) { return b.getAttribute("aria-selected") === "true" || b.getAttribute("aria-checked") === "true"; })[0];
      if (!on || !on.offsetWidth) return;
      thumb.style.width = on.offsetWidth + "px"; thumb.style.transform = "translateX(" + (on.offsetLeft - 2) + "px)";
    }
    btns.forEach(function (b, i) {
      b.addEventListener("click", function () { set(b); });
      b.addEventListener("keydown", function (e) { var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (n) { var t = btns[(i + n + btns.length) % btns.length]; t.focus(); set(t); e.preventDefault(); } });
    });
    window.addEventListener("resize", place);
    return { set: function (v, silent) { var b = btns.filter(function (x) { return (x.getAttribute("data-v") || x.getAttribute("data-p")) === String(v); })[0] || btns[0]; set(b, silent); }, place: place };
  }