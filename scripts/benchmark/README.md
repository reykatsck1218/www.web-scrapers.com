# Provider benchmark harness

Runs real success-rate and latency measurements for proxy/unlocker providers
against public targets, producing a dated JSON file that can back a published
benchmark page on the site.

## Why

The most linkable asset a review site can own is original data. Publishing
real, dated, reproducible benchmark numbers (with this methodology in the
open) gives other sites a reason to cite us — and replaces qualitative
claims in reviews with measured ones.

## Usage

1. Create `providers.json` (gitignored — contains credentials):

```json
{
  "bright-data-residential": "http://brd-customer-<id>-zone-<zone>:<pass>@brd.superproxy.io:22225",
  "iproyal-residential": "http://user:pass@geo.iproyal.com:12321"
}
```

2. Run:

```bash
python3 run_benchmark.py --providers providers.json --requests 50 \
    --out results/$(date +%Y-%m-%d).json
```

3. Publish: hand the results JSON to the site build (a future
   `/benchmarks/` page) — never hand-edit numbers, never publish a partial
   run as if it were complete.

## Ground rules

- Keep request counts modest and the inter-request delay on (default 2s) —
  these are public sites, not load-test targets.
- A success = HTTP 200 **and** the expected content marker present, so
  CAPTCHA/block interstitials count as failures.
- Every published number must trace to a results file with a date.
