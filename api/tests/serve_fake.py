"""Run the real API and the built web app with a fake model and fake search.
Use it to click through the UI with no API keys:  python tests/serve_fake.py  then open http://127.0.0.1:8000"""
import os, sys
from pathlib import Path
os.environ.setdefault("NEBIUS_API_KEY", "demo"); os.environ.setdefault("TAVILY_API_KEY", "demo"); os.environ["FORGE_RUNNER"] = "local"
import tempfile; os.environ.setdefault("FORGE_DB", os.path.join(tempfile.gettempdir(), "forge-fake.db"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent)); sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_fake  # noqa: F401  (patches llm and search)
import uvicorn
from main import app
uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
