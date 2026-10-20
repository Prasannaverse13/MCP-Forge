"""Builds web/index.html from web/src.html by adding a full document shell.
src.html is the page body (it is also what gets published as the preview). Run: python build.py"""
from pathlib import Path
here = Path(__file__).parent
src = (here / "src.html").read_text(encoding="utf-8")
shell = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')
head, _, rest = src.partition("<body>")
out = shell + head + "</head>\n<body>" + rest + ("\n</html>\n" if "</html>" not in rest else "")
(here / "index.html").write_text(out, encoding="utf-8")
print("wrote", here / "index.html", len(out), "bytes")
