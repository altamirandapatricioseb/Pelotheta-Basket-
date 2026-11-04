# Pelotheta Θ · Basketball

**Boca Juniors' season in Argentina's Liga Nacional de Básquet, in data: charts, tables, game situations
and player comparisons, every number with its source and traceable to the game it comes from.** Sister
system of Pelotheta fútbol: the same experience, with basketball data. The site is in Spanish.

**Live:** <https://pelotheta-basket-dva.vercel.app> · [Versión en español](README.md)

## What it does

| Interface | What it shows |
|---|---|
| Charts | 76 charts in 13 categories (73 with real data), with PNG, CSV, table and "view source" |
| Team | Boca by game, opponent, month, competition or cumulative, one category at a time |
| Players | Squad master table with percentiles, per-36 values and a current-player panel |
| Situations | 118 cards ("when X happens, how does Boca do?") computed in SQL |
| Compare | A player against the squad, a zone, a position or another player |
| Update | Last load date and history; detects a new load without writing |

Plus a native-chart Excel workbook with interactive sheets, a star-schema Power BI model, a read-only API
and own metrics (performance index, Improvement and Potential α and β, on-court net rating, On/Off, EWA,
ELA and Elo).

## How it works

A Python pipeline (GitHub Actions, monthly) scrapes the whole league from the official LNB site,
reconciles each play-by-play against the official box score (games that do not match are quarantined),
computes every metric and loads it into Supabase (private schema with row level security, public read-only
views). A Next.js 16 site on Vercel reads those views. The pipeline also builds the Excel workbook and the
Power BI CSVs and uploads them to a public storage bucket.

## Security

Public read-only database (RLS verified with pgTAP), nonce-based CSP and strict headers, no secrets in the
repository (gitleaks), CodeQL, Semgrep, Dependabot, weekly ZAP baseline, monthly encrypted backup with a
tested restore, threat model and incident response plan. See [`SECURITY.md`](SECURITY.md).

## Quick start

```bash
git clone https://github.com/altamirandapatricioseb/Pelotheta-Basket-.git && cd Pelotheta-Basket-
cp .env.example .env && cp web/.env.example web/.env.local
uv sync && (cd web && corepack pnpm@10.34.9 install)
uv run --env-file .env python -m pipeline.run --liga && uv run --env-file .env python -m pipeline.load
just dev
```

## License

Code under [MIT](LICENSE). Data belongs to its sources and keeps their licenses. Non-commercial portfolio
project.
