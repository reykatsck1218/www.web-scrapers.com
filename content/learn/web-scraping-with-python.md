+++
title = "Web Scraping with Python: A Beginner's Guide"
description = "A beginner's guide to web scraping with Python using Requests, Beautiful Soup, Scrapy, and Selenium, with a simple example to get you started."
template = "page.html"
date = 2026-01-27
updated = 2026-08-05
[extra]
og_image = "assets/og/learn-web-scraping-with-python.png"
+++

Web scraping with Python is the most accessible way to turn websites into structured data. Python's ecosystem gives you everything from one-line HTTP requests to full browser automation, and the learning curve is gentle enough that you can go from zero to a working scraper in an afternoon. This guide walks you through the entire process: fetching pages, parsing HTML, following pagination, handling JavaScript-heavy sites, and storing the results — all with real, runnable code.

By the end, you'll have built a complete scraper against a live practice site and you'll know exactly which tool to reach for as your projects grow.

## Why Python for Web Scraping?

Python dominates web scraping for three reasons:

- **The libraries.** `requests` and `httpx` handle HTTP, `BeautifulSoup` parses HTML, `Playwright` drives a real browser, and `Scrapy` scales all of it into a crawling framework. Every layer of the problem has a mature, well-documented tool.
- **The readability.** A scraper is something you'll revisit and patch constantly as target sites change. Python code stays legible months later.
- **The data ecosystem.** Scraped data usually ends up in pandas, a database, or a machine-learning pipeline — all places where Python is already at home.

Other languages can scrape. Python makes it feel effortless.

## Prerequisites and Setup

You need Python 3.9 or newer and a terminal. Create a virtual environment so your scraping dependencies stay isolated from the rest of your system:

```bash
python -m venv scraper-env
source scraper-env/bin/activate   # Windows: scraper-env\Scripts\activate

pip install requests beautifulsoup4 httpx
```

That's the core toolkit. We'll add Playwright later for JavaScript-rendered sites.

Throughout this guide we'll scrape [books.toscrape.com](https://books.toscrape.com/) — a demo bookstore built specifically for scraping practice. It has product cards, prices, ratings, and 50 pages of pagination, and you can hammer it without worrying about terms of service.

## Fetching Pages with Requests

Every scraper starts the same way: download the HTML. The `requests` library makes this a two-liner, but a production-minded fetch looks like this:

```python
import requests

headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

response = requests.get("https://books.toscrape.com/", headers=headers, timeout=10)
response.raise_for_status()   # raises an exception on 4xx/5xx

print(response.status_code)   # 200
print(len(response.text))     # size of the HTML document
```

Three habits worth building from day one:

- **Always set a timeout.** Without one, a hung connection can freeze your script forever.
- **Always call `raise_for_status()`.** Silently parsing a 404 error page produces empty results with no explanation.
- **Always send a real User-Agent.** The default `python-requests/2.x` header is the single most obvious bot signal you can broadcast.

### httpx: The Modern Alternative

`httpx` is a drop-in replacement for `requests` with two extras you'll eventually want: HTTP/2 support (many anti-bot systems flag HTTP/1.1-only clients) and native async for concurrent fetching.

```python
import httpx

with httpx.Client(http2=True, timeout=10, follow_redirects=True) as client:
    response = client.get("https://books.toscrape.com/")
    response.raise_for_status()
    print(response.http_version)  # HTTP/2
```

HTTP/2 support requires an extra: `pip install "httpx[http2]"`. For your first projects, either library works — the API is nearly identical. Start with `requests` if you're following tutorials (most use it), and reach for `httpx` when you need async or HTTP/2.

## Parsing HTML with BeautifulSoup

Raw HTML is just a wall of text. BeautifulSoup turns it into a searchable tree. The two methods you'll use constantly are `select()` (returns all elements matching a CSS selector) and `select_one()` (returns the first match or `None`).

Open books.toscrape.com in your browser, right-click a book, and choose *Inspect*. You'll see each book lives in an `<article class="product_pod">` element. That's your anchor. Here's a complete scraper for the first page:

```python
import requests
from bs4 import BeautifulSoup

url = "https://books.toscrape.com/"
response = requests.get(url, timeout=10)
response.raise_for_status()

soup = BeautifulSoup(response.text, "html.parser")

for book in soup.select("article.product_pod"):
    title = book.h3.a["title"]
    price = book.select_one("p.price_color").get_text(strip=True)
    in_stock = book.select_one("p.instock.availability").get_text(strip=True)
    # rating is stored as a class name: <p class="star-rating Three">
    rating = book.select_one("p.star-rating")["class"][1]

    print(f"{title} | {price} | {rating} stars | {in_stock}")
```

Run it and you'll see twenty books stream past, each with a title, price, rating, and stock status. A few things worth noticing:

- **Data hides in attributes, not just text.** The full book title lives in the `title` attribute of the link, because the visible text is truncated. The star rating is encoded as a CSS class name. Always inspect the actual HTML rather than assuming the visible text is all there is.
- **`get_text(strip=True)`** removes the whitespace and newlines that HTML is full of.
- **CSS selectors beat `find()`/`find_all()`** for most work. If you can describe an element in browser DevTools, you can select it with the same string in BeautifulSoup.

### Defensive Parsing

Real websites are messier than demo sites. Elements go missing, layouts change mid-crawl, and a scraper that assumes every field exists will crash on page 37 of 50. Wrap extractions so a missing element degrades gracefully:

```python
def safe_text(parent, selector, default=""):
    el = parent.select_one(selector)
    return el.get_text(strip=True) if el else default

price = safe_text(book, "p.price_color", default="N/A")
```

This pattern — extract what you can, default what you can't, log what surprised you — is the difference between a script and a scraper.

## Handling Pagination

One page of books is a demo. All 1,000 books across 50 pages is a dataset. Books.toscrape.com uses a "next" link (`<li class="next"><a href="catalogue/page-2.html">`), so the cleanest approach is to follow it until it disappears:

```python
import time
import random
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

url = "https://books.toscrape.com/"
books = []

while url:
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    for book in soup.select("article.product_pod"):
        books.append({
            "title": book.h3.a["title"],
            "price": book.select_one("p.price_color").get_text(strip=True),
            "rating": book.select_one("p.star-rating")["class"][1],
            "url": urljoin(url, book.h3.a["href"]),
        })

    next_link = soup.select_one("li.next a")
    url = urljoin(url, next_link["href"]) if next_link else None

    time.sleep(random.uniform(1.0, 2.5))  # polite delay between pages

print(f"Scraped {len(books)} books")
```

Two details make this loop robust. `urljoin` converts the relative `href` (`page-2.html`) into a full URL, correctly handling the fact that later pages live under `/catalogue/`. And the loop has a clear **termination condition**: when there's no next link, `url` becomes `None` and the `while` exits.

Next-button crawling is only one of several pagination patterns — you'll also meet `?page=N` query strings, offset parameters, and infinite scroll backed by hidden JSON APIs. Our [complete pagination guide](/learn/handling-pagination/) covers how to detect and scrape every variant.

## Scraping Dynamic Websites with Playwright

Everything so far assumes the data is in the HTML the server sends. Increasingly, it isn't. Modern sites render content with JavaScript after the page loads, so `requests` receives an empty shell where the products should be.

The quickest way to check: view the page source (`Ctrl+U`) and search for a piece of data you can see in the browser. If it's not in the source, you need a real browser engine — and in Python, that means Playwright:

```bash
pip install playwright
playwright install chromium
```

Here's a scraper for [quotes.toscrape.com/js/](https://quotes.toscrape.com/js/), a practice page that renders its quotes entirely with JavaScript:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://quotes.toscrape.com/js/")
    page.wait_for_selector(".quote")   # wait until JS has rendered the quotes

    for quote in page.locator(".quote").all():
        text = quote.locator(".text").inner_text()
        author = quote.locator(".author").inner_text()
        print(f"{text} — {author}")

    browser.close()
```

The crucial line is `wait_for_selector(".quote")` — it pauses until the JavaScript has actually produced the elements you want, which is the step beginners most often skip. You can also grab `page.content()` after the wait and hand the rendered HTML to BeautifulSoup, keeping your parsing code identical across static and dynamic sites.

Browser automation is a deep topic — waiting strategies, login flows, infinite scroll, stealth configuration, and proxy integration all matter on real targets. When you're ready, work through our full [Playwright web scraping guide](/learn/playwright-python-scraping/).

## Being a Polite Scraper

A scraper is a guest on someone else's server. Polite scraping isn't just ethics — it's also self-interest, because aggressive scrapers get blocked fast.

**Check robots.txt.** Sites publish crawling rules at `/robots.txt`. Python's standard library can read them:

```python
from urllib.robotparser import RobotFileParser

rp = RobotFileParser("https://books.toscrape.com/robots.txt")
rp.read()

allowed = rp.can_fetch("MyScraper/1.0", "https://books.toscrape.com/catalogue/page-2.html")
print(allowed)
```

**Rate-limit yourself.** A human clicks a page every few seconds; a naive scraper fires dozens of requests per second. Randomized delays (`time.sleep(random.uniform(1.5, 4.0))`) keep your traffic pattern closer to human and reduce load on the target.

**Identify sensibly.** Use a realistic browser User-Agent, and don't fetch resources you don't need — skip images, ads, and tracking scripts.

**Respect the data.** Scrape public data, honor site terms where they apply to you, and never hammer login-gated or personal information.

## Avoiding Blocks: When You Need Proxies

Scrape a handful of pages and nobody notices. Scrape thousands from one IP address and you'll start seeing 403 errors, CAPTCHAs, or silently degraded content. Anti-bot systems track request volume per IP, and a single address running a large crawl is trivially easy to flag.

The standard fix is proxy rotation — distributing your requests across a pool of IP addresses so no single one accumulates a suspicious request count. With `requests`, routing through a proxy is one parameter:

```python
proxies = {
    "http": "http://username:password@proxy.example.com:8080",
    "https": "http://username:password@proxy.example.com:8080",
}
response = requests.get(url, proxies=proxies, timeout=10)
```

Not all proxies are equal: datacenter IPs are cheap but easily detected, while residential IPs route through real consumer connections and blend in with normal traffic. Our [proxy types guide](/learn/proxy-types-explained/) breaks down when each makes sense. For serious crawls, a rotating residential network like [Bright Data](/goto/bd-residential/) handles IP rotation automatically so your code just points at one endpoint.

Blocking is a whole discipline of its own — fingerprinting, header order, TLS signatures, behavioral analysis. Before you scale any scraper up, read [How to Avoid Getting Blocked While Web Scraping](/learn/how-to-avoid-getting-blocked/), and if your target throws CAPTCHAs at you, see [how to solve CAPTCHAs when scraping](/learn/how-to-solve-captchas-web-scraping/).

## Storing Your Data: CSV and JSON

A list of Python dictionaries is no use once the script exits. The two simplest persistent formats are CSV (opens directly in Excel and Google Sheets) and JSON (preserves nesting, ideal for further processing). Both are in the standard library:

```python
import csv
import json

# CSV — one row per book
with open("books.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["title", "price", "rating", "url"])
    writer.writeheader()
    writer.writerows(books)

# JSON — the same data, structure preserved
with open("books.json", "w", encoding="utf-8") as f:
    json.dump(books, f, ensure_ascii=False, indent=2)
```

Use `newline=""` when opening CSV files (it prevents blank rows on Windows) and `ensure_ascii=False` for JSON so accented characters are stored readably instead of as escape sequences.

Once a scraper runs on a schedule, graduate to SQLite — still standard library (`import sqlite3`), but it gives you deduplication via unique constraints and easy querying, which flat files can't.

## Debugging Your Scraper

When a scraper misbehaves, the cause is almost always one of three things — check them in this order:

1. **You didn't get the page you think you got.** Print `response.status_code` and dump `response.text` to a file, then open it in a browser. A 200 response can still be a CAPTCHA page, a consent wall, or a "please enable JavaScript" shell.
2. **Your selector doesn't match.** Test selectors interactively in browser DevTools (`document.querySelectorAll("article.product_pod")` in the console) before blaming your Python. Remember that DevTools shows the *rendered* DOM — for static scraping, your selector must match the raw source, not what JavaScript built afterward.
3. **The site changed.** Selectors rot. Log a warning whenever an expected element comes back `None`, so layout changes surface as messages instead of silent gaps in your data.

Saving the raw HTML of every failed request costs almost nothing and turns "it broke last Tuesday" into a problem you can actually reproduce.

## Putting It to Work

The techniques above compose into real projects quickly. The same fetch–parse–paginate–store loop powers price monitoring, search-result tracking, and market research. For worked applications of these patterns, see our guides to [scraping Google search results](/solutions/google-search-scraping/) and [tracking Amazon product prices](/solutions/amazon-product-tracking/) — both build directly on the requests/BeautifulSoup and Playwright foundations you've just learned, and both show where the difficulty jumps once a major site is actively defending itself.

## Next Steps

You now have the full beginner's toolkit for web scraping with Python: `requests` or `httpx` to fetch, BeautifulSoup to parse, a pagination loop to cover whole sites, Playwright for JavaScript rendering, and CSV/JSON to keep what you collect. From here, three directions are worth exploring:

- **Scale up your crawls** with [Scrapy](https://scrapy.org/), a framework that adds scheduling, retries, throttling, and pipelines once single scripts stop being enough.
- **Harden against blocking** — the [anti-blocking playbook](/learn/how-to-avoid-getting-blocked/) and [proxy types guide](/learn/proxy-types-explained/) cover what changes when targets fight back.
- **Master browser automation** with the [Playwright guide](/learn/playwright-python-scraping/) for login flows, infinite scroll, and stealth configuration.

Start small, respect the sites you scrape, and build up one pattern at a time. Every large scraping operation is just this afternoon's script with more discipline attached.
