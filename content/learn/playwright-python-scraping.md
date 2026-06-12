+++
title = "Web Scraping with Playwright in Python: A Complete Guide to Dynamic Content"
description = "Learn to scrape JavaScript-rendered websites with Playwright and Python. Covers setup, dynamic content, pagination, stealth, and production proxies."
template = "page.html"
+++

Plain HTTP requests fail on the modern web. A growing share of sites — e-commerce storefronts, travel search engines, social platforms — render their content entirely in JavaScript. Send a `requests.get()` to one of those URLs and you'll get an empty shell. That's where Playwright comes in.

Playwright is a browser automation library from Microsoft that drives a real Chromium, Firefox, or WebKit engine from Python code. Because it runs a real browser, JavaScript executes, SPAs render, and lazy-loaded content appears — exactly as it would for a human visitor. This guide covers everything you need to scrape dynamic websites with Playwright in Python, from initial setup to production-ready techniques.

## Installation and Setup

Install the library and download the browser binaries:

```bash
pip install playwright
playwright install chromium
```

Playwright manages the browser installation for you — no separate ChromeDriver or binary to keep in sync.

## Basic Scraping: Your First Playwright Script

A minimal scraper looks like this:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://example.com")

    title = page.title()
    html = page.content()   # full rendered HTML after JS executes

    print(title)
    browser.close()
```

`headless=True` runs the browser invisibly. Switch to `headless=False` during development to watch what's happening in real time.

## Waiting for Dynamic Content

The most common mistake is reading the page before JavaScript has finished rendering it. Playwright offers several strategies:

```python
# Wait for a specific element to appear in the DOM
page.wait_for_selector(".product-list")

# Wait until network activity has settled
page.goto("https://example.com", wait_until="networkidle")

# Wait for a URL pattern (useful after form submissions or redirects)
page.wait_for_url("**/results**")
```

For infinite-scroll pages, trigger scrolls programmatically and pause for content to load:

```python
for _ in range(5):
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(1500)
```

## Extracting Data from Rendered Pages

Once the page is rendered, use Playwright's locators or hand the HTML to BeautifulSoup for parsing:

```python
from bs4 import BeautifulSoup

# Direct extraction with Playwright locators
titles = page.locator(".product-title").all_inner_texts()
price  = page.locator("span.price").first.inner_text()
href   = page.locator("a.product-link").first.get_attribute("href")

# Alternatively, pass rendered HTML to BeautifulSoup
soup  = BeautifulSoup(page.content(), "html.parser")
cards = soup.select(".product-card")
for card in cards:
    print(card.select_one("h2").get_text(strip=True))
```

## Handling Login-Gated Content

Playwright handles authentication naturally by filling forms just as a user would:

```python
page.goto("https://example.com/login")
page.fill("#email", "user@example.com")
page.fill("#password", "s3cr3t")
page.click("button[type='submit']")
page.wait_for_url("**/dashboard")

# Save session state so you don't log in on every run
page.context.storage_state(path="session.json")
```

On subsequent runs, restore the saved session:

```python
context = browser.new_context(storage_state="session.json")
page    = context.new_page()
```

## Scraping Across Multiple Pages

Most real scrapers need to walk through pagination. Here's a clean pattern:

```python
results  = []
page_num = 1

while True:
    page.goto(f"https://example.com/products?page={page_num}")
    page.wait_for_selector(".product-card")

    items = page.locator(".product-card").all_inner_texts()
    if not items:
        break

    results.extend(items)

    # Stop when there is no "Next" button
    next_btn = page.locator("a.next-page")
    if not next_btn.is_visible():
        break

    page_num += 1
    page.wait_for_timeout(2000)   # polite delay between pages

print(f"Scraped {len(results)} items across {page_num} pages")
```

> For a broader look at avoiding rate limits and bans during multi-page runs, see [How to Avoid Getting Blocked While Web Scraping](/learn/how-to-avoid-getting-blocked/).

## Reducing Your Fingerprint: Stealth Settings

Headless Playwright leaks `navigator.webdriver = true` and a handful of other signals that anti-bot systems watch for. A few settings reduce that exposure significantly:

```python
context = browser.new_context(
    viewport={"width": 1920, "height": 1080},
    locale="en-US",
    timezone_id="America/New_York",
    user_agent=(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
)

page = context.new_page()
# Mask the webdriver flag before any page load
page.add_init_script("delete Object.getPrototypeOf(navigator).webdriver")
```

For a more comprehensive set of stealth patches, install `playwright-stealth`:

```bash
pip install playwright-stealth
```

```python
from playwright_stealth import stealth_sync

stealth_sync(page)
page.goto("https://example.com")
```

## Rotating Proxies with Playwright

Distributing requests across many IP addresses is essential once you move beyond toy projects. Playwright supports proxies natively at the browser or context level:

```python
context = browser.new_context(
    proxy={
        "server":   "http://proxy.example.com:8080",
        "username": "user",
        "password": "pass",
    }
)
page = context.new_page()
```

For serious scraping, residential proxies are far less likely to be blocked than datacenter IPs — they route through real consumer devices and look indistinguishable from normal traffic. See our [proxy types guide](/learn/proxy-types-explained/) for a full breakdown of your options.

> **Recommended proxies for Playwright:** [Bright Data](/goto/bd-residential/) offers a 400M+ residential IP pool with automatic rotation — try it free for 7 days, no credit card required. Budget-friendly alternatives include [IPRoyal](/goto/iproyal/), [DataImpulse](/goto/dataimpulse/), and [HydraProxy](/goto/hydraproxy/). Browse all head-to-head comparisons in our [proxy and scraper reviews](/reviews/).

## Async Playwright for Parallel Scraping

The sync API is convenient for scripts, but for scraping many URLs at once, the async API lets you run browser contexts concurrently:

```python
import asyncio
from playwright.async_api import async_playwright

async def scrape_url(url: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page    = await browser.new_page()
        await page.goto(url)
        content = await page.content()
        await browser.close()
        return content

async def main():
    urls    = ["https://example.com/page/1", "https://example.com/page/2"]
    results = await asyncio.gather(*[scrape_url(u) for u in urls])
    for html in results:
        print(len(html), "bytes")

asyncio.run(main())
```

For production crawls, consider managing a shared browser instance and creating a new context per task rather than a new browser process — it's significantly cheaper on resources.

## When Self-Hosted Playwright Isn't Enough

Even with stealth settings and good proxies, the most aggressively protected targets (Cloudflare Turnstile, Akamai Bot Manager, PerimeterX) can still block a self-managed browser. At that point, the economics shift in favor of a managed solution.

The [Bright Data Scraping Browser](/learn/bright-data-scraping-browser/) connects your existing Playwright code to a hosted browser that adds built-in CAPTCHA solving and residential IP rotation on every request — your scripts stay almost identical, but Bright Data handles staying unblocked. For simpler HTTP-based needs, [ZenRows](/goto/zenrows/) and [ScraperAPI](/goto/scraperapi/) offer one-endpoint Web Unlocker APIs that handle rendering and unblocking without browser automation.

Compare providers in our [scraping service comparisons](/comparisons/).

## Quick Reference

| Task | Playwright API |
|---|---|
| Wait for element | `page.wait_for_selector(".class")` |
| Wait for network quiet | `goto(..., wait_until="networkidle")` |
| Scroll to load more | `page.evaluate("window.scrollTo(...)")` |
| Extract text list | `page.locator(".item").all_inner_texts()` |
| Get attribute | `.get_attribute("href")` |
| Save/restore session | `storage_state(path=...)` |
| Use proxy | `new_context(proxy={...})` |

## The Bottom Line

Playwright is the most capable self-hosted option for scraping JavaScript-heavy sites. Its Python API is clean, its waiting primitives are reliable, and it handles everything from simple HTML extraction to authenticated multi-page crawls. Pair it with stealth patches and rotating residential proxies, and you have a scraper that handles the vast majority of real-world targets without a managed service.

**[Get rotating residential proxies for your Playwright scraper →](/goto/bd-residential/)**

*New to scraping? Start with our [Web Scraping with Python guide](/learn/web-scraping-with-python/), or read [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) for the full anti-bot playbook.*
