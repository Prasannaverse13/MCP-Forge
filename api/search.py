"""Docs lookup with Tavily."""
from __future__ import annotations

import asyncio
from urllib.parse import urlparse

import config


def _search_sync(api_name: str, docs_url: str, api_key: str) -> list[dict]:
    from tavily import TavilyClient

    tv = TavilyClient(api_key=api_key)
    pages: list[dict] = []
    seen: set[str] = set()

    def add(url: str, title: str, text: str) -> None:
        if url and url not in seen and text:
            seen.add(url)
            pages.append({"url": url, "title": title or url, "text": text})

    host = urlparse(docs_url).netloc if docs_url else ""
    if docs_url:
        try:
            ext = tv.extract(urls=[docs_url])
            for r in ext.get("results", []):
                add(r.get("url", docs_url), "Docs page", r.get("raw_content", ""))
        except Exception:
            pass  # fall through to search

    kwargs = dict(search_depth="advanced", max_results=5, include_raw_content=True)
    if host:
        kwargs["include_domains"] = [host]
    res = tv.search(f"{api_name} API reference endpoints parameters example", **kwargs)
    for r in res.get("results", []):
        add(r.get("url", ""), r.get("title", ""), r.get("raw_content") or r.get("content", ""))
    if len(pages) < 2 and host:  # try the open web if the docs domain gave too little
        kwargs.pop("include_domains", None)
        res = tv.search(f"{api_name} API documentation", **kwargs)
        for r in res.get("results", []):
            add(r.get("url", ""), r.get("title", ""), r.get("raw_content") or r.get("content", ""))
    return pages


async def find_docs(api_name: str, docs_url: str = "", api_key: str | None = None) -> tuple[str, list[dict]]:
    """Returns (docs text trimmed to budget, pages used)."""
    key = api_key or config.TAVILY_API_KEY
    if not key:
        raise RuntimeError("TAVILY_API_KEY is not set")
    pages = await asyncio.to_thread(_search_sync, api_name, docs_url, key)
    budget = config.MAX_DOC_CHARS
    parts, used = [], []
    for p in pages:
        if budget <= 0:
            break
        chunk = p["text"][: max(1500, budget // max(1, len(pages)))]
        parts.append(f"### {p['title']}\nSource: {p['url']}\n{chunk}")
        budget -= len(chunk)
        used.append({"url": p["url"], "title": p["title"]})
    return "\n\n".join(parts), used
