#!/usr/bin/env python3
"""Generate affiliate redirect ("link cloaking") pages under static/goto/<slug>/.

Each /goto/<slug>/ page fires a GA4 `affiliate_click` event and then redirects to
the provider's affiliate URL via JS (with a meta-refresh fallback for no-JS). The
event uses sendBeacon + event_callback so the hit lands before the redirect, with
a short timeout so the redirect always happens even if analytics is blocked.
Pages are marked noindex. Because they live in static/, Zola copies them verbatim
and they never appear in sitemap.xml.

The GA4 ID is read from config.toml (extra.ga4_id) so it stays in sync; if absent,
tracking is omitted and the page still redirects.

If extra.goto_log_url is set in config.toml (a Google Apps Script web app URL),
each click is also POSTed there via sendBeacon so it can be appended to a Google
Sheet. The beacon is fire-and-forget: it survives the redirect and never blocks it.

To add/update a provider: edit AFFILIATES below and re-run:  python3 scripts/gen-goto.py
Then update any on-site links to point at /goto/<slug>/.
"""
import os
import re
from html import escape

# slug -> affiliate URL (the single source of truth for outbound affiliate links)
AFFILIATES = {
    "brightdata":  "https://get.brightdata.com/5q1kr89k0efo",
    "oxylabs":     "https://oxylabs.go2cloud.org/aff_c?offer_id=7&aff_id=513",
    "dataimpulse": "https://dataimpulse.com/?aff=100161",
    "iproyal":     "https://iproyal.com/?r=222748",
    "hydraproxy":  "https://app.hydraproxy.com/aff=291/",
    "scraperapi":  "https://www.scraperapi.com/?fp_ref=web-guru-scraping",
    "zenrows":     "https://www.zenrows.com?fpr=e1b9z00",

    # Bright Data deep links (product/proxy/use-case specific) — all "bd-*".
    # Proxy types
    "bd-proxy-types":     "https://get.brightdata.com/proxy-types43",
    "bd-residential":     "https://get.brightdata.com/proxy-type-residential-proxies",
    "bd-isp":             "https://get.brightdata.com/proxy-type-isp-proxies",
    "bd-datacenter":      "https://get.brightdata.com/proxy-type-data-center",
    "bd-mobile":          "https://get.brightdata.com/mobile-proxies1230",
    "bd-network":         "https://get.brightdata.com/proxy-network-g",
    "bd-shared":          "https://get.brightdata.com/solutions-shared-proxies",
    "bd-dedicated":       "https://get.brightdata.com/solutions-dedicated-proxies",
    # Geo proxies
    "bd-proxies-us":      "https://get.brightdata.com/proxy-location-us",
    "bd-proxies-cn":      "https://get.brightdata.com/proxy-location-cn",
    # Educational
    "bd-proxy-guide":     "https://get.brightdata.com/blog-ultimate-guide-to-proxy-types",
    # Unlocking
    "bd-web-unlocker":    "https://get.brightdata.com/web-unlocker1387",
    "bd-captcha":         "https://get.brightdata.com/unblocker-captcha-solver",
    # Data collectors / products (general)
    "bd-collector":       "https://get.brightdata.com/product-data-collector",
    "bd-collector-pro":   "https://get.brightdata.com/web-guro-data-collector",
    "bd-products":        "https://get.brightdata.com/products",
    "bd-use-cases":       "https://get.brightdata.com/use-cases",
    "bd-sdk":             "https://get.brightdata.com/sdk-program",
    # Datasets
    "bd-datasets":        "https://get.brightdata.com/product-datasets",
    "bd-datasets-amazon": "https://get.brightdata.com/product-datasets-amazon",
    # Platform data collectors
    "bd-amazon":          "https://get.brightdata.com/product-data-collector-amazon",
    "bd-walmart":         "https://get.brightdata.com/product-data-collector-walmart",
    "bd-ebay":            "https://get.brightdata.com/product-data-collector-ebay",
    "bd-linkedin":        "https://get.brightdata.com/data-collector-linkedin",
    "bd-tiktok":          "https://get.brightdata.com/product-data-collector-tiktok",
    "bd-instagram":       "https://get.brightdata.com/product-data-collector-instagram",
    "bd-facebook":        "https://get.brightdata.com/product-data-collector-facebook",
    "bd-alibaba":         "https://get.brightdata.com/product-data-collector-alibaba",
    "bd-airbnb":          "https://get.brightdata.com/product-data-collector-airbnb",
    "bd-booking":         "https://get.brightdata.com/product-data-collector-booking",
    "bd-kayak":           "https://get.brightdata.com/product-data-collector-kayak",
    # Industry use cases
    "bd-ecommerce":       "https://get.brightdata.com/use-case-ecommerce",
    "bd-travel":          "https://get.brightdata.com/use-case-travel",
    "bd-social":          "https://get.brightdata.com/use-case-socila-media",
}

# Tracking script (only injected when a GA4 ID is configured). Fires an
# `affiliate_click` event, then redirects via event_callback / safety timeout.
TRACKING = """<script async src="https://www.googletagmanager.com/gtag/js?id={ga4}"></script>
<script>
  var DEST = "{url_js}", PROVIDER = "{slug}";
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', '{ga4}');
  var done = false;
  function go(){{ if (!done) {{ done = true; window.location.replace(DEST); }} }}
  gtag('event', 'affiliate_click', {{
    provider: PROVIDER,
    link_url: DEST,
    transport_type: 'beacon',
    event_callback: go
  }});
  setTimeout(go, 800); // fallback if analytics is slow or blocked
</script>"""

# Plain redirect script used when no GA4 ID is configured.
NO_TRACKING = """<script>window.location.replace("{url_js}");</script>"""

# Click-logging beacon (only injected when extra.goto_log_url is configured).
# Posts the click to a Google Apps Script web app that appends a row to a
# Google Sheet. sendBeacon queues the request and survives navigation, so the
# redirect is never delayed; the try/catch keeps old browsers from breaking it.
LOG_BEACON = """<script>
  try {{
    navigator.sendBeacon("{log_url}", JSON.stringify({{
      provider: "{slug}",
      dest: "{url_js}",
      referrer: document.referrer,
      ua: navigator.userAgent
    }}));
  }} catch (e) {{}}
</script>"""

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="2; url={url_attr}">
<title>Redirecting…</title>
{redirect_script}
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0a0f1a;color:#f5f7fa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:1.5rem">
<p>Redirecting you to our partner…<br>If nothing happens, <a style="color:#5b9bff" href="{url_attr}" rel="sponsored nofollow noopener">click here to continue</a>.</p>
</body>
</html>
"""

def read_config_str(root, key):
    """Pull a string value from config.toml so settings stay in sync."""
    try:
        cfg = open(os.path.join(root, "config.toml")).read()
    except OSError:
        return None
    m = re.search(r'^\s*' + re.escape(key) + r'\s*=\s*"([^"]+)"', cfg, re.M)
    return m.group(1) if m else None

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base = os.path.join(root, "static", "goto")
    ga4 = read_config_str(root, "ga4_id")
    log_url = read_config_str(root, "goto_log_url")
    print(f"GA4 tracking: {'enabled (' + ga4 + ')' if ga4 else 'disabled (no ga4_id in config.toml)'}")
    print(f"Sheet logging: {'enabled' if log_url else 'disabled (no goto_log_url in config.toml)'}\n")

    for slug, url in AFFILIATES.items():
        out_dir = os.path.join(base, slug)
        os.makedirs(out_dir, exist_ok=True)
        # url_attr: safe inside HTML attributes; url_js: raw for the JS string literal
        if ga4:
            script = TRACKING.format(ga4=ga4, url_js=url, slug=slug)
        else:
            script = NO_TRACKING.format(url_js=url)
        # The beacon goes first so it is queued before any redirect can fire.
        if log_url:
            script = LOG_BEACON.format(log_url=log_url, slug=slug, url_js=url) + "\n" + script
        html = TEMPLATE.format(url_attr=escape(url, quote=True), redirect_script=script)
        with open(os.path.join(out_dir, "index.html"), "w") as f:
            f.write(html)
        print(f"  /goto/{slug}/  ->  {url}")
    print(f"\nGenerated {len(AFFILIATES)} redirect pages in static/goto/")

if __name__ == "__main__":
    main()
