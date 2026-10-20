"""Builds src.html from parts/, then index.html via build.py. Run: python assemble.py"""
from pathlib import Path
import subprocess, sys
here = Path(__file__).parent
p = here / "parts"
r = lambda n: (p / n).read_text(encoding="utf-8")
landing = r("landing.html").replace('href="#signin"', 'href="#signup"').replace('id="nav-signin" href="#signup"', 'id="nav-signin" href="#signin"')
landing = landing.replace("<body>", '<body class="booting">', 1)
app = r("app.js").replace("/*@@SVG@@*/", r("svg.js")).replace("/*@@HL@@*/", r("hl.js")).replace("/*@@SAMPLE@@*/", r("sample.js"))
js = r("core.js").replace("/*@@SEG@@*/", r("seg.js")).replace("/*@@LANDING@@*/", r("landing.js")).replace("/*@@APP@@*/", app)
extra = "\nbody.booting [data-view] { visibility: hidden; }\n"
out = r("head.html") + r("app.css") + extra + "</style>\n" + landing + "\n" + r("app.html") + "\n<script>\n" + js + "\n</script>\n</body>\n"
(here / "src.html").write_text(out, encoding="utf-8")
(here / "_check.js").write_text(js, encoding="utf-8")
print("src.html", len(out))
subprocess.run([sys.executable, str(here / "build.py")], check=True)
