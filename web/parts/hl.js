  function hlLine(line) {
    var cm = "", idx = -1, q = false;
    for (var j = 0; j < line.length; j++) { var ch = line[j]; if (ch === '"' || ch === "'") q = q === ch ? false : (q || ch); if (ch === "#" && !q) { idx = j; break; } }
    if (idx >= 0) { cm = '<span class="c">' + esc(line.slice(idx)) + "</span>"; line = line.slice(0, idx); }
    var parts = line.split(/("[^"]*"?|'[^']*'?)/), out = "";
    parts.forEach(function (seg, i) {
      if (i % 2) { out += '<span class="s">' + esc(seg) + "</span>"; return; }
      out += esc(seg)
        .replace(/\b(from|import|async|await|def|return|if|not|with|as|for|in|raise|or|and|class|try|except|else|elif|None|True|False|lambda)\b/g, '<span class="k">$1</span>')
        .replace(/(@[\w.]+(\(\))?)/g, '<span class="d">$1</span>')
        .replace(/\b(\d+)\b/g, '<span class="n">$1</span>');
    });
    return out + cm;
  }