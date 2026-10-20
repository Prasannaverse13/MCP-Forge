"""Nemotron calls through Nebius Token Factory (OpenAI compatible)."""
from __future__ import annotations

import re
from openai import AsyncOpenAI

import config


def client(api_key: str | None = None) -> AsyncOpenAI:
    return AsyncOpenAI(base_url=config.NEBIUS_BASE_URL, api_key=api_key or config.NEBIUS_API_KEY or "missing")


async def list_model_ids(api_key: str | None = None) -> list[str]:
    res = await client(api_key).models.list()
    return [m.id for m in res.data]


def pick_models(ids: list[str], hint: str = "") -> dict[str, str]:
    """Writer prefers Super, then Ultra. Fixer prefers Nano. Falls back to any Nemotron."""
    nem = [i for i in ids if "nemotron" in i.lower()]
    if not nem:
        return {"writer": "", "fixer": ""}

    def find(*words: str) -> str:
        for w in words:
            for i in nem:
                if w in i.lower():
                    return i
        return nem[0]

    return {
        "writer": config.WRITER_MODEL or (find(hint) if hint else find("super", "ultra", "nano")),
        "fixer": config.FIXER_MODEL or find("nano", "super", "ultra"),
    }


async def chat(model: str, system: str, user: str, *, api_key: str | None = None,
               temperature: float = 0.2, max_tokens: int = 16000) -> str:
    res = await client(api_key).chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    text = res.choices[0].message.content or ""
    # Some reasoning models wrap thoughts in <think> tags. Drop them.
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()




def parse_files(text: str) -> dict[str, str]:
    """Reads blocks that start with a fence line like ```file:server.py"""
    files: dict[str, str] = {}
    for m in re.finditer(r"```[^\n]*?(?:file:|path:)\s*([\w./-]+)[^\n]*\n(.*?)(?:```|\Z)", text, re.S):
        if m.group(2).strip():
            files[m.group(1).strip()] = m.group(2).rstrip() + "\n"
    return files


def parse_json(text: str) -> dict:
    import json
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S) or re.search(r"(\{.*\})", text, re.S)
    if not m:
        raise ValueError("Model did not return JSON")
    return json.loads(m.group(1))
