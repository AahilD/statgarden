# StatGarden

A free NBA stats site where you build your own tables and charts by dragging fields around, like a pivot table. Every view gets a link you can send to someone.

Early days. Right now this repo pulls NBA data, cleans it with dbt and checks it. The API and the website come next.

## What's here

| Folder | What it does |
|---|---|
| `ingest/` | Python that pulls data from NBA.com (through [nba_api](https://github.com/swar/nba_api)) and saves the raw responses |
| `transform/` | dbt project that turns raw tables into clean ones in DuckDB |
| `catalog/` | `fields.yaml`, the list of every stat the site knows about, and a script that checks it against real data |

Coming later: `api/` (FastAPI), `web/` (Next.js + Tailwind + ECharts), `analysis/`.

## Running it

Needs [uv](https://docs.astral.sh/uv/).

```bash
uv sync
make pull     # one season of game logs into data/statgarden.duckdb
make build    # dbt models and tests
make check    # run every catalog field against the data
```

## Data

The data comes from NBA.com and belongs to the NBA. It isn't in this repo and isn't covered by the license below. This is a personal, non-commercial project. Data: NBA.com via nba_api.

## License

The code is MIT licensed. See `LICENSE`.
