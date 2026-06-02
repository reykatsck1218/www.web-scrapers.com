#!/usr/bin/env python3
"""Generate affiliate redirect ("link cloaking") pages under static/goto/<slug>/.

Each /goto/<slug>/ page instantly redirects to the provider's affiliate URL via
meta-refresh + JS, and is marked noindex. Because these live in static/, Zola
copies them verbatim and they never appear in sitemap.xml.

To add/update a provider: edit AFFILIATES below and re-run:  python3 scripts/gen-goto.py
Then update any on-site links to point at /goto/<slug>/.
"""
import os
from html import escape

# slug -> affiliate URL (the single source of truth for outbound affiliate links)
AFFILIATES = {
    "brightdata":  "https://get.brightdata.com/5q1kr89k0efo",
    "oxylabs":     "https://oxylabs.go2cloud.org/aff_c?offer_id=7&aff_id=513",
    "dataimpulse": "https://dataimpulse.com/?aff=100161",
    "iproyal":     "https://iproyal.com/?r=222748",
    "hydraproxy":  "https://app.hydraproxy.com/aff=291/",
    "scraperapi":  "https://www.scraperapi.com/?fp_ref=web-guru-scraping",
}

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url={url_attr}">
<title>Redirecting…</title>
<script>window.location.replace("{url_js}");</script>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0a0f1a;color:#f5f7fa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:1.5rem">
<p>Redirecting you to our partner…<br>If nothing happens, <a style="color:#5b9bff" href="{url_attr}" rel="sponsored nofollow noopener">click here to continue</a>.</p>
</body>
</html>
"""

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base = os.path.join(root, "static", "goto")
    for slug, url in AFFILIATES.items():
        out_dir = os.path.join(base, slug)
        os.makedirs(out_dir, exist_ok=True)
        # url_attr: safe inside HTML attributes; url_js: raw for the JS string literal
        html = TEMPLATE.format(url_attr=escape(url, quote=True), url_js=url)
        with open(os.path.join(out_dir, "index.html"), "w") as f:
            f.write(html)
        print(f"  /goto/{slug}/  ->  {url}")
    print(f"\nGenerated {len(AFFILIATES)} redirect pages in static/goto/")

if __name__ == "__main__":
    main()
