# StatGarden web

The Next.js site: the home page (`app/page.tsx`) and the Lab (`app/lab/`).

```bash
npm install
npm run dev        # localhost:3000; needs the API on localhost:8000 (make api)
```

The site calls `/api/...`, which `next.config.ts` passes on to FastAPI, so the API address lives in one place (`STATGARDEN_API_URL`, default `http://localhost:8000`).

| Folder | What's in it |
|---|---|
| `components/builder/` | The Lab: field list, wells, toolbar, table/chart switch |
| `components/table/` | The pivot table |
| `components/layout/` | Header, footer, stripe, logo, theme toggle |
| `lib/` | The view format (`spec.ts`), edits to it (`specOps.ts`), API calls, colours, formatting |

Colours and corner sizes live in `app/globals.css` and follow the shared theme note in Obsidian.
