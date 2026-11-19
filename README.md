# StatGarden

A free NBA stats site where you build your own tables and charts by dragging fields around, like a pivot table. Every view gets a link you can send to someone.

Early days. It pulls NBA data, cleans it with dbt, serves it through an API, and has a first version of the site: a home page and the Lab, where you build tables. Charts are next.

## What's here

| Folder | What it does |
|---|---|
| `ingest/` | Pulls data from NBA.com (through [nba_api](https://github.com/swar/nba_api)), saves the raw responses, loads them into DuckDB |
| `transform/` | dbt project that turns raw tables into clean ones |
| `catalog/` | `fields.yaml`, every stat the site knows about, plus a check that runs each one against real data |
| `api/` | FastAPI app. Turns a view from the site into one SQL query |
| `web/` | Next.js + Tailwind site |
| `tests/` | API tests with known answers |

## Running it

Needs [uv](https://docs.astral.sh/uv/) and Node.

```bash
uv sync
make pull-stats     # everything from stats.nba.com (resumable, takes hours the first time)
make pull-cdn       # everything from cdn.nba.com
make build          # load raw files, dbt models and tests
make check          # run every catalog field against the data
make publish-local  # hand the finished database to the API
make api            # API on localhost:8000
make web            # site on localhost:3000
```

`make stop-pull` stops a pull cleanly; `make resume-pull` clears the stop so it can carry on. `make test` and `make lint` before committing.

## Data

The data comes from NBA.com and belongs to the NBA. It isn't in this repo and isn't covered by the license below. This is a personal, non-commercial project. Data: NBA.com via nba_api.

## License

The code is MIT licensed. See `LICENSE`.
