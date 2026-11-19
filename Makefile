.PHONY: pull build check docs

SEASON ?= 2025-26

pull:      ## pull one season of game logs into DuckDB
	uv run python -m ingest.explore_season --season $(SEASON)

build:     ## run dbt: build models and run tests
	cd transform && uv run dbt build --profiles-dir .

check:     ## run every catalog field against the built tables
	uv run python -m catalog.check

docs:      ## dbt docs site on localhost:8080
	cd transform && uv run dbt docs generate --profiles-dir . && uv run dbt docs serve --profiles-dir . --port 8080
