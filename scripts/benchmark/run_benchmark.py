#!/usr/bin/env python3
"""Proxy/unlocker benchmark harness for web-scrapers.com.

Measures real success rates and latencies for one or more providers against
public targets, and writes a dated JSON results file. Results are meant to be
published on the site ONLY after a real run — never hand-edit the output.

Usage:
    # providers.json: {"bright-data": "http://user:pass@host:port", ...}
    python3 run_benchmark.py --providers providers.json \
        --requests 50 --out results/$(date +%Y-%m-%d).json

Notes:
- Targets are public pages that tolerate light automated access. Keep
  --requests modest (default 50/provider/target) and the built-in delay.
- A request counts as a success when it returns HTTP 200 AND the page
  contains its expected marker (SUCCESS_MARKERS), so soft-blocks and
  CAPTCHA interstitials count as failures.
- Credentials stay in providers.json (gitignored) — never commit them.
"""
import argparse
import json
import statistics
import sys
import time
import urllib.request
from datetime import date

TARGETS = {
    "books.toscrape.com": {
        "url": "https://books.toscrape.com/",
        "marker": "All products",
    },
    "example.com": {
        "url": "https://example.com/",
        "marker": "Example Domain",
    },
    # Add tougher public targets deliberately and sparingly.
}

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def fetch(url, proxy, timeout):
    handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    opener = urllib.request.build_opener(handler)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    start = time.monotonic()
    try:
        with opener.open(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, body, time.monotonic() - start
    except Exception as e:
        return None, str(e), time.monotonic() - start


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--providers", required=True, help="JSON file: {name: proxy_url}")
    ap.add_argument("--requests", type=int, default=50)
    ap.add_argument("--timeout", type=float, default=60.0)
    ap.add_argument("--delay", type=float, default=2.0, help="seconds between requests")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    with open(args.providers) as f:
        providers = json.load(f)

    results = {"date": date.today().isoformat(), "requests_per_cell": args.requests, "providers": {}}
    for name, proxy in providers.items():
        results["providers"][name] = {}
        for tname, target in TARGETS.items():
            ok, latencies = 0, []
            for i in range(args.requests):
                status, body, elapsed = fetch(target["url"], proxy, args.timeout)
                if status == 200 and target["marker"] in body:
                    ok += 1
                    latencies.append(elapsed)
                time.sleep(args.delay)
            cell = {
                "success": ok,
                "total": args.requests,
                "success_rate": round(ok / args.requests, 4),
                "p50_ms": round(statistics.median(latencies) * 1000) if latencies else None,
                "p90_ms": round(statistics.quantiles(latencies, n=10)[8] * 1000) if len(latencies) >= 10 else None,
            }
            results["providers"][name][tname] = cell
            print(f"{name} × {tname}: {ok}/{args.requests} ok, p50 {cell['p50_ms']} ms", file=sys.stderr)

    with open(args.out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"wrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
