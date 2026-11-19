"""Where everything lives on disk. Data is never committed (see .gitignore)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW_DIR = DATA / "raw"  # gzipped API responses, one file per call
LOG_DIR = DATA / "logs"
DB_PATH = DATA / "statgarden.duckdb"  # the pipeline's working database
