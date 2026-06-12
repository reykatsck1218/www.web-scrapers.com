+++
title = "How to Handle Pagination in Web Scraping: The Complete Guide"
description = "Learn how to scrape paginated websites: query string pagination, next-button crawling, infinite scroll, and API-based pagination with Python examples."
template = "page.html"
+++

Pagination is one of the first obstacles every web scraper hits. Product listings, search results, news archives — any site with more items than fit on one page uses some form of it. Miss it, and your scraper silently collects a fraction of the data you need without any error to alert you.

This guide covers every pagination pattern you'll encounter in the wild and shows you exactly how to handle each one in Python.

## Why Pagination Matters

A single product category on a large e-commerce site can span hundreds of pages. A news site's archive may run thousands. If your scraper stops at page one, you might capture 1% of the data you actually need — and you won't even know it's missing.

The goal: build a loop that keeps following pages until there are no more.

## Pattern 1: Query String Pagination (`?page=N`)

The simplest and most common pattern. Each page is a distinct URL with a numeric parameter:

```
https://example.com/products?page=1
https://example.com/products?page=2
https://example.com/products?page=3
```

**How to detect it:** Click "Next" or a page number and watch the URL. If a `page=`, `p=`, or `start=` parameter appears or increments, you're dealing with query string pagination.

**How to scrape it:**

```python
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://example.com/products"
all_items = []

page = 1
while True:
    response = requests.get(BASE_URL, params={"page": page})
    soup = BeautifulSoup(response.text, "html.parser")

    items = soup.select(".product-card")
    if not items:
        break  # no more results

    all_items.extend(items)
    page += 1
```

The key is a **termination condition** — here we stop when the page returns no items. Alternatives include checking for a disabled "Next" button or comparing the current page number against a total page count you extract from the HTML.

## Pattern 2: Offset / Cursor Pagination

Many sites (and especially JSON APIs) use an `offset` rather than a page number:

```
https://example.com/products?offset=0&limit=24
https://example.com/products?offset=24&limit=24
https://example.com/products?offset=48&limit=24
```

Handle this by incrementing `offset` by the page size each iteration:

```python
LIMIT = 24
offset = 0

while True:
    response = requests.get(BASE_URL, params={"limit": LIMIT, "offset": offset})
    data = response.json()

    if not data["items"]:
        break

    process(data["items"])
    offset += LIMIT
```

Some APIs return a `next_cursor` token instead of a numeric offset. Pass `cursor=<token>` in the next request and stop when the response contains no cursor field.

## Pattern 3: "Next" Button Crawling

Some sites don't expose the total page count — they just render a "Next" link. Your scraper needs to find and follow it:

```python
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

url = "https://example.com/products"

while url:
    response = requests.get(url)
    soup = BeautifulSoup(response.text, "html.parser")

    items = soup.select(".product-card")
    process(items)

    next_link = soup.select_one("a.pagination__next")
    if next_link and next_link.get("href"):
        url = urljoin(url, next_link["href"])
    else:
        url = None  # no more pages
```

`urljoin` handles relative URLs gracefully — many sites link to `/products?page=2` rather than a full absolute URL.

> **Tip:** If you're getting blocked mid-pagination, rotating proxies will help. Distributing requests across different IP addresses prevents any single IP from accumulating a suspicious request count. See [Residential vs. Datacenter vs. Mobile Proxies](/learn/proxy-types-explained/) for guidance on which type to use, or check out [Bright Data's residential proxy network](/goto/bd-residential/) which offers 400M+ IPs with automatic rotation.

## Pattern 4: Infinite Scroll (AJAX / XHR)

The most deceptive pattern. The page appears to have no pagination — content loads as you scroll. Under the hood, the browser fires XHR requests to load batches of results.

**How to detect it:** Open DevTools → Network → XHR/Fetch. Scroll the page and watch for new requests. You'll usually see a JSON endpoint being called with `page` or `offset` parameters.

**Option A: Hit the underlying API directly.** This is faster and cleaner than automating a real browser. Copy the XHR URL from DevTools and replicate the request:

```python
# The underlying API endpoint discovered via DevTools
API_URL = "https://example.com/api/products"
headers = {
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json",
}

page = 1
while True:
    response = requests.get(API_URL, params={"page": page}, headers=headers)
    data = response.json()

    if not data.get("results"):
        break

    process(data["results"])
    page += 1
```

**Option B: Use Playwright to simulate scrolling.** If the underlying API is obfuscated or requires complex auth tokens, drive a real browser:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://example.com/products")

    prev_height = 0
    while True:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(2000)  # wait for new content to load

        new_height = page.evaluate("document.body.scrollHeight")
        if new_height == prev_height:
            break  # reached the bottom
        prev_height = new_height

    html = page.content()
    browser.close()
```

> **For JavaScript-heavy pagination on tough sites**, a managed scraping browser handles rendering, fingerprinting, and proxy rotation for you — no Playwright configuration required. [Bright Data's Scraping Browser](/learn/bright-data-scraping-browser/) is purpose-built for exactly this use case.

## Pattern 5: Directory + Detail Pages (Two-Pass Crawl)

For directory-style sites — real estate listings, job boards, business directories — you typically need two loops: one for the paginated index, one for each detail page linked from it.

```python
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

INDEX_URL = "https://example.com/listings?page={page}"
detail_urls = []

# Pass 1: collect all detail-page URLs from the paginated index
page = 1
while True:
    soup = BeautifulSoup(
        requests.get(INDEX_URL.format(page=page)).text, "html.parser"
    )
    links = [urljoin(INDEX_URL, a["href"]) for a in soup.select("a.listing-link")]
    if not links:
        break
    detail_urls.extend(links)
    page += 1

# Pass 2: scrape each detail page
for url in detail_urls:
    detail = BeautifulSoup(requests.get(url).text, "html.parser")
    process(detail)
```

## Handling Duplicates and Resumability

Long pagination runs can fail halfway through — a network error, a block, or a timeout. Protect yourself with a seen-set so you don't reprocess items, and save progress to disk so you can resume:

```python
import json, os

STATE_FILE = "scrape_state.json"
seen = set(json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else [])

for item in scraped_items:
    if item["id"] not in seen:
        save(item)
        seen.add(item["id"])

# checkpoint regularly so a crash doesn't lose everything
json.dump(list(seen), open(STATE_FILE, "w"))
```

## Rate Limiting and Politeness

Pagination scrapers fire many requests in a tight loop — exactly the pattern anti-bot systems watch for. Always add a randomized delay between page requests:

```python
import time, random

time.sleep(random.uniform(1.5, 4.0))
```

For large crawls, combine this with proxy rotation so no single IP bears your full request volume. The [full anti-blocking playbook is here](/learn/how-to-avoid-getting-blocked/).

If you'd rather skip the infrastructure work entirely, managed scraping APIs handle proxy rotation, retries, and JavaScript rendering behind a single endpoint. [ScraperAPI](/goto/scraperapi/) and [ZenRows](/goto/zenrows/) are popular options; [Oxylabs](/goto/oxylabs/) covers enterprise-scale crawls. Compare them head-to-head in our [scraping API reviews](/reviews/) and [Bright Data vs. Oxylabs comparison](/comparisons/).

## Quick Reference

| Pagination Pattern | How to Detect | Scraping Approach |
| --- | --- | --- |
| Query string (`?page=N`) | URL parameter increments on "Next" | Loop incrementing `page` param |
| Offset (`?offset=N`) | URL offset increases by page size | Loop incrementing `offset` by page size |
| Next-button crawl | "Next" link present, no page count | Follow `href` of "Next" link |
| Infinite scroll — JSON API | XHR requests visible in DevTools | Call the XHR endpoint directly |
| Infinite scroll — rendered | No clean XHR endpoint found | Playwright scroll-to-bottom loop |
| Directory + detail pages | Index lists links, detail pages hold data | Two-pass loop |

## The Bottom Line

Most pagination boils down to a loop: request a page, collect what you need, find the next URL, repeat until done. The tricky cases — infinite scroll, obfuscated APIs, aggressive anti-bot systems — are solved either by reverse-engineering the underlying network request or by driving a real browser.

Build in a termination condition, add politeness delays, and rotate your IPs on any large run. Those three habits transform a fragile one-off script into a reliable data pipeline.

**[Get started with Bright Data →](/goto/bd-residential/)**

*New to scraping? Start with our [Web Scraping with Python guide](/learn/web-scraping-with-python/) or read [How to Avoid Getting Blocked While Scraping](/learn/how-to-avoid-getting-blocked/).*
