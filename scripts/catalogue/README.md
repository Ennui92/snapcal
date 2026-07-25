# Rebuilding the bundled product catalogue

`src/data/catalogue-{gr,cy,global}.json` are generated, not hand-written. They
come from the official Open Food Facts data export.

```bash
python3 scripts/catalogue/extract-countries.py   # -> /tmp/catalogue-gr.json, -cy.json
python3 scripts/catalogue/extract-global.py      # -> /tmp/catalogue-global.json
cp /tmp/catalogue-*.json src/data/
# then bump SEED_VERSION in src/lib/food-db.ts so installs re-seed
```

Each script streams the ~1.3GB gzipped CSV export and filters in one pass, so
it needs bandwidth but no disk. Takes about 6 minutes each.

## Why the export and not the API

The Open Food Facts **search** endpoint is heavily rate limited and starts
returning 503/401 after a handful of pages, so it cannot be used to pull a
catalogue. The static export is the supported bulk path. The single-product
endpoint (`/api/v2/product/{barcode}.json`) *is* reliable and is what the app
uses at runtime for cache misses.

## What gets kept

A row is only included if it has a usable name and a plausible per-100g calorie
figure. `energy-kcal_100g` is preferred; where it is missing we convert from
kJ (`energy-kj_100g`, else `energy_100g`, ÷ 4.184), since EU labels are
kJ-mandatory and kcal is often absent from the data.

Worth knowing: Open Food Facts reports ~11,434 Greece-tagged products, but only
~1,967 of them carry any nutrition data. The rest are photo- or name-only
records and are useless for calorie counting. That gap is what the in-app AI
label reader exists to cover.

`extract-global.py` ranks by `unique_scans_n` — the products people actually
put in front of a scanner — because a shopper in Athens also buys Nutella and
Barilla, which are tagged to other countries.
