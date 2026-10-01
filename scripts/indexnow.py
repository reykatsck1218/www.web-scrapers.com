#!/usr/bin/env python3
"""Tell IndexNow (Bing, Yandex, Seznam, Naver...) which URLs changed in a deploy.

Run by .github/workflows/deploy.yml after the site is published. It compares the
freshly built public/sitemap.xml against the sitemap that was live before the
deploy and submits only URLs that are new or whose <lastmod> changed, which is
what the IndexNow protocol asks for. Pass --all to submit every URL instead
(used for manual "Run workflow" runs and for seeding).

The key is read from config.toml (extra.indexnow_key); if absent, nothing is
submitted. The matching key file static/<key>.txt proves ownership of the host,
so the script waits for the deploy to be live before submitting.

Usage:  python3 scripts/indexnow.py [--old old-sitemap.xml] [--all] [--dry-run]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

ENDPOINT = "https://api.indexnow.org/indexnow"
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
UA = "web-scrapers.com-indexnow/1.0"

def read_config_str(root, key):
    """Pull a string value from config.toml so settings stay in sync."""
    try:
        cfg = open(os.path.join(root, "config.toml")).read()
    except OSError:
        return None
    m = re.search(r'^\s*' + re.escape(key) + r'\s*=\s*"([^"]+)"', cfg, re.M)
    return m.group(1) if m else None

def parse_sitemap(xml):
    """Return {loc: lastmod-or-None} for sitemap XML, or None if unparseable."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    urls = {}
    for url in root.findall("sm:url", NS):
        loc = url.findtext("sm:loc", default="", namespaces=NS).strip()
        if loc:
            urls[loc] = url.findtext("sm:lastmod", default=None, namespaces=NS)
    return urls

def read_sitemap(path):
    try:
        with open(path, "rb") as f:
            return parse_sitemap(f.read())
    except OSError:
        return None

def fetch(url):
    """GET a URL, returning the body bytes or None on any failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read()
    except (urllib.error.URLError, TimeoutError):
        return None

def wait_until_live(base_url, key_url, key, new, timeout):
    """Poll until GitHub Pages serves this deploy (it lags the gh-pages push).

    Returns (key_ok, site_ok): whether the key file is served, and whether the
    live sitemap matches the one just built.
    """
    deadline = time.time() + timeout
    while True:
        body = fetch(key_url)
        key_ok = body is not None and body.decode(errors="replace").strip() == key
        body = fetch(f"{base_url}/sitemap.xml")
        site_ok = body is not None and parse_sitemap(body) == new
        if (key_ok and site_ok) or time.time() >= deadline:
            return key_ok, site_ok
        time.sleep(15)

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--old", help="sitemap that was live before this deploy")
    ap.add_argument("--all", action="store_true", help="submit every URL in the sitemap")
    ap.add_argument("--dry-run", action="store_true", help="print the URLs, submit nothing")
    ap.add_argument("--wait", type=int, default=300, help="seconds to wait for the deploy to go live (default 300)")
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    key = read_config_str(root, "indexnow_key")
    base_url = read_config_str(root, "base_url")
    if not key or not base_url:
        print("IndexNow: disabled (no indexnow_key in config.toml)")
        return 0
    base_url = base_url.rstrip("/")
    key_url = f"{base_url}/{key}.txt"

    new = read_sitemap(os.path.join(root, "public", "sitemap.xml"))
    if new is None:
        print("IndexNow: public/sitemap.xml missing or unreadable (run `zola build` first)")
        return 1

    old = read_sitemap(args.old) if args.old else None
    if args.all or old is None:
        if not args.all:
            print("IndexNow: no previous sitemap to diff against, submitting all URLs")
        urls = sorted(new)
    else:
        urls = sorted(loc for loc, lastmod in new.items()
                      if loc not in old or old[loc] != lastmod)

    if not urls:
        print("IndexNow: no new or updated URLs in this deploy")
        return 0
    print(f"IndexNow: {len(urls)} URL(s) to submit")
    for u in urls:
        print(f"  {u}")
    if args.dry_run:
        return 0

    key_ok, site_ok = wait_until_live(base_url, key_url, key, new, args.wait)
    if not key_ok:
        print(f"IndexNow: key file not live at {key_url}, nothing submitted")
        return 1
    if not site_ok:
        print("IndexNow: live sitemap does not match this build yet, submitting anyway")

    payload = {
        "host": urlparse(base_url).netloc,
        "key": key,
        "keyLocation": key_url,
        "urlList": urls,
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
    except urllib.error.HTTPError as e:
        print(f"IndexNow: submission rejected, HTTP {e.code} {e.reason}: {e.read().decode(errors='replace')[:300]}")
        return 1
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"IndexNow: submission failed: {e}")
        return 1
    # 200 = accepted; 202 = accepted, key validation still pending
    print(f"IndexNow: submitted {len(urls)} URL(s), HTTP {status}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
