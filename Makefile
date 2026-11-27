.PHONY: nightly coverage backfill pull-stats pull-cdn stop-pull resume-pull load sources build check recon docs publish-local api web test lint

pull-stats:  ## everything from stats.nba.com (resumable; ~7h the first time)
	uv run python -m ingest.pull --source stats --per once,season,team,team_season
	uv run python -m ingest.pull --source stats --per player,game

pull-cdn:    ## everything from cdn.nba.com (resumable)
	uv run python -m ingest.pull --source cdn

load:        ## raw files -> raw DuckDB tables (only new or re-pulled files)
	uv run python -m ingest.load

sources:     ## regenerate dbt's source list from the raw tables
	uv run python -m ingest.gen_sources

build: load sources  ## load, then dbt models and tests
	cd transform && uv run dbt build --profiles-dir .

check:       ## run every catalog field against the built tables
	uv run python -m catalog.check

recon:       ## where stats.nba.com and cdn.nba.com disagree
	uv run python -m ingest.recon

docs:        ## dbt docs site on localhost:8080
	cd transform && uv run dbt docs generate --profiles-dir . && uv run dbt docs serve --profiles-dir . --port 8080

stop-pull:   ## ask running pulls to stop cleanly (they finish the current call)
	touch data/STOP_PULL

resume-pull: ## clear the stop flag; then run pull-stats / pull-cdn again
	rm -f data/STOP_PULL

nightly:     ## pull new games (both sources), build, check, publish; logs in data/logs/nightly_*
	uv run python -m ingest.nightly

coverage:    ## which stats.nba.com endpoints have data for which seasons (writes data/coverage.json)
	uv run python -m ingest.coverage

backfill:    ## pull older seasons for HOURS hours (default 4); the nightly run does this too
	uv run python -m ingest.backfill --hours $(or $(HOURS),4)

publish-local: ## copy the working DB to data/serve/ for the API (atomic swap)
	mkdir -p data/serve
	cp data/statgarden.duckdb data/serve/.statgarden.duckdb.tmp
	mv data/serve/.statgarden.duckdb.tmp data/serve/statgarden.duckdb

api:         ## run the API on localhost:8000 (docs at /docs)
	uv run uvicorn api.main:app --reload --port 8000

web:         ## run the site on localhost:3000 (needs the API running)
	cd web && npm run dev

test:        ## API tests
	uv run pytest -q

lint:        ## Python (ruff) and web (eslint + TypeScript) checks
	uv run ruff check . && uv run ruff format --check .
	cd web && npm run lint && npm run typecheck
