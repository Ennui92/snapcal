# Stream the official Open Food Facts export and pull out per-country
# catalogues. One pass, no rate limits, real data only.
#
# v2: recovers kJ-only products. EU labels are legally required to show kJ but
# kcal is optional in the data, so filtering on energy-kcal alone threw away
# ~80% of Greek products.
import csv, gzip, json, sys, urllib.request

URL = "https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz"
WANT = {"en:greece": "GR", "en:cyprus": "CY"}
OUT = "/tmp/catalogue-%s.json"

csv.field_size_limit(10_000_000)
need = ["code", "product_name", "brands", "countries_tags",
        "energy-kcal_100g", "energy-kj_100g", "energy_100g",
        "proteins_100g", "carbohydrates_100g", "fat_100g", "sugars_100g"]

req = urllib.request.Request(URL, headers={"User-Agent": "SnapCal offline catalogue build"})
buckets = {cc: {} for cc in WANT.values()}
rows_seen = 0

with urllib.request.urlopen(req) as resp:
    with gzip.open(resp, mode="rt", encoding="utf-8", errors="replace") as fh:
        reader = csv.reader(fh, delimiter="\t", quoting=csv.QUOTE_NONE)
        header = next(reader)
        idx = {c: header.index(c) for c in need if c in header}
        missing = [c for c in need if c not in idx]
        if missing:
            print("MISSING COLUMNS:", missing, file=sys.stderr)
            sys.exit(1)

        def num(row, col):
            try:
                v = float(row[idx[col]])
                return v if v == v else None      # drop NaN
            except Exception:
                return None

        for row in reader:
            rows_seen += 1
            if rows_seen % 1000000 == 0:
                print(f"scanned {rows_seen:,}; " +
                      ", ".join(f"{cc}={len(b)}" for cc, b in buckets.items()),
                      file=sys.stderr, flush=True)
            try:
                tags = row[idx["countries_tags"]]
            except IndexError:
                continue
            if not tags:
                continue
            hit = [cc for tag, cc in WANT.items() if tag in tags]
            if not hit:
                continue

            code = row[idx["code"]].strip()
            name = " ".join(row[idx["product_name"]].split())
            if not code or not name or len(name) < 2 or len(name) > 80:
                continue

            kcal = num(row, "energy-kcal_100g")
            if kcal is None:
                kj = num(row, "energy-kj_100g")
                if kj is None:
                    kj = num(row, "energy_100g")   # OFF stores this in kJ
                if kj is not None and 0 <= kj <= 3800:
                    kcal = kj / 4.184
            if kcal is None or kcal < 0 or kcal > 900:
                continue

            rec = [
                code, name,
                " ".join(row[idx["brands"]].split()).split(",")[0][:28],
                round(kcal, 1),
                round(num(row, "proteins_100g") or 0, 1),
                round(num(row, "carbohydrates_100g") or 0, 1),
                round(num(row, "fat_100g") or 0, 1),
                round(num(row, "sugars_100g") or 0, 1),
            ]
            for cc in hit:
                buckets[cc].setdefault(code, rec)

for cc, b in buckets.items():
    vals = list(b.values())
    with open(OUT % cc.lower(), "w", encoding="utf-8") as f:
        json.dump(vals, f, ensure_ascii=False, separators=(",", ":"))
    print(f"DONE {cc}: {len(vals)} products", file=sys.stderr, flush=True)
