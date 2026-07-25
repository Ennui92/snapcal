# Third pass over the Open Food Facts export: the globally most-scanned
# products that actually carry nutrition data.
#
# Why: only ~2k Greek-tagged products have usable nutrition, but a shopper in
# Athens also scans Nutella, Barilla, Coca-Cola, Pringles — items tagged to
# other countries. Ranking by unique_scans_n gives us the products real people
# actually put in front of a scanner, worldwide.
import csv, gzip, heapq, json, sys, urllib.request

URL = "https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz"
OUT = "/tmp/catalogue-global.json"
TOP_N = 15000

csv.field_size_limit(10_000_000)
need = ["code", "product_name", "brands", "unique_scans_n",
        "energy-kcal_100g", "energy-kj_100g", "energy_100g",
        "proteins_100g", "carbohydrates_100g", "fat_100g", "sugars_100g"]

req = urllib.request.Request(URL, headers={"User-Agent": "SnapCal offline catalogue build"})
heap = []          # min-heap of (scans, code, rec)
seen = set()
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
                return v if v == v else None
            except Exception:
                return None

        for row in reader:
            rows_seen += 1
            if rows_seen % 1000000 == 0:
                print(f"scanned {rows_seen:,}; kept {len(heap)}", file=sys.stderr, flush=True)
            try:
                scans = num(row, "unique_scans_n") or 0
            except IndexError:
                continue
            if scans < 5:                      # ignore the long tail nobody scans
                continue
            code = row[idx["code"]].strip()
            if not code or code in seen:
                continue
            name = " ".join(row[idx["product_name"]].split())
            if not name or len(name) < 2 or len(name) > 80:
                continue

            kcal = num(row, "energy-kcal_100g")
            if kcal is None:
                kj = num(row, "energy-kj_100g")
                if kj is None:
                    kj = num(row, "energy_100g")
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
            if len(heap) < TOP_N:
                heapq.heappush(heap, (scans, code, rec))
                seen.add(code)
            elif scans > heap[0][0]:
                _, oldcode, _ = heapq.heappushpop(heap, (scans, code, rec))
                seen.discard(oldcode)
                seen.add(code)

rows = [r for _, _, r in sorted(heap, key=lambda x: -x[0])]
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
print(f"DONE global: {len(rows)} products -> {OUT}", file=sys.stderr, flush=True)
