+++
title = "E-commerce Web Scraping Solutions"
description = "E-commerce web scraping solutions for price monitoring, product data, and review tracking, plus step-by-step scrapers with PHP, Node.js, and Rust code."
template = "page.html"
date = 2026-01-27
updated = 2026-08-05
[extra]
og_image = "assets/og/solutions-ecommerce.png"
+++

Ecommerce web scraping is the practice of programmatically collecting product data — prices, availability, ratings, reviews, seller information — from online stores and marketplaces. It powers repricing engines, competitor dashboards, dropshipping research, and brand-protection programs, and it's one of the most common reasons people build scrapers in the first place. This page is the hub for our e-commerce scraping content: what the data is good for, the obstacles you'll hit, how to architect a price tracker, and step-by-step guides (with real PHP, Node.js, and Rust code) for each major marketplace.

## Why E-commerce Data Matters

### Price Intelligence

If you sell anything online, your competitors' prices are a direct input to your own. Scraping lets you watch those prices continuously instead of spot-checking by hand. A repricing loop is straightforward once the data exists: scrape competitor listings on a schedule, compare against your own catalog, and adjust — either automatically or by flagging items for review. The same feed answers strategic questions too: how often do competitors run promotions, how deep are their discounts, and do they move prices in response to yours?

### MAP Monitoring

Brands that set a minimum advertised price (MAP) need to know when retailers advertise below it. Checking hundreds of resellers across multiple marketplaces manually doesn't scale; a scraper that visits each listing daily and records the advertised price does. When a price crosses the MAP threshold, the tracker flags the seller, and you have a timestamped record to act on. This is one of the highest-value e-commerce scraping use cases because the alternative — periodic manual audits — misses most violations.

### Assortment and Availability

Which products does a competitor carry that you don't? Which of their bestsellers just went out of stock? Assortment scraping means crawling category and search pages to enumerate a catalog, then tracking each listing's availability over time. Out-of-stock windows on a rival's listing are sales opportunities; new SKUs appearing in their catalog are early signals of where a category is heading. Availability data is also core to dropshipping — you need to know your supplier's listing is live and in stock before you sell against it.

### Reviews and Sentiment

Reviews are unfiltered customer research that someone else paid to collect. Scraping reviews — yours and competitors' — surfaces recurring complaints ("battery dies fast", "runs small"), feature requests, and quality issues before they show up in your own returns data. Aggregate signals matter too: review velocity and rating trends over time tell you whether a competing product is gaining or losing traction.

## The Challenges

E-commerce sites are among the hardest scraping targets on the web, for three main reasons.

### Anti-Bot Systems

Major marketplaces protect their pages with commercial anti-bot systems that fingerprint your requests — IP reputation, TLS handshake, headers, browser signals — and block anything that looks automated. Raw `curl`-style requests from a datacenter IP get banned quickly. The countermeasures are well understood: rotate residential or mobile proxies, send complete browser-like headers, throttle and randomize your request rate, and maintain sessions. Our guide [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) walks through all ten techniques, and [Residential vs. Datacenter vs. Mobile Proxies](/learn/proxy-types-explained/) explains which proxy type fits which target. For the toughest sites, a managed unlocker that bundles rotation, fingerprinting, and CAPTCHA solving into one endpoint — like the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) — saves you from maintaining that stack yourself.

### JavaScript Rendering — and How to Avoid Needing It

Many store pages render content client-side, so a plain HTTP request returns a skeleton without prices. The heavyweight fix is a headless browser (Playwright, Puppeteer), but for e-commerce there's usually a better option: most marketplaces embed the full product data as JSON inside the initial HTML. Walmart ships a `__NEXT_DATA__` blob, AliExpress assigns an object to `window.runParams`, and eBay (like many Shopify and WooCommerce stores) includes schema.org **JSON-LD**. Parsing embedded JSON is faster and far more stable than scraping rendered HTML with CSS selectors — the per-marketplace guides below each show exactly where the JSON lives.

### Scale

Tracking ten products is a cron job; tracking fifty thousand across four marketplaces is an engineering project. At scale you're managing request concurrency, proxy pool exhaustion, retry logic for transient blocks, selector breakage when sites redesign, and a growing database of price history. Budget for maintenance: marketplace markup changes regularly, and a tracker that ran clean for months will silently start returning nulls. Log parse failures loudly, and alert when the null rate for any field spikes.

## Architecture of a Price Tracker

Every product tracker — regardless of marketplace — reduces to the same loop:

1. **Fetch** the product page through a proxy or unlocker.
2. **Parse** out the fields you care about (title, price, availability).
3. **Store** a `{id, price, timestamp}` row per run.
4. **Schedule** the loop with cron.
5. **Compare and alert** when the latest value differs from the previous one.

Here's the fetch-and-parse core in Node.js, following the same conventions as our marketplace guides. This version reads schema.org JSON-LD, which works on eBay and a large share of independent stores (Shopify, WooCommerce, Magento all emit it):

```javascript
// tracker.mjs — node tracker.mjs "https://www.example-store.com/products/widget"
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent = new HttpsProxyAgent(process.env.PROXY_URL);
const url = process.argv[2];

const { data: html } = await axios.get(url, {
  httpsAgent: agent, proxy: false, timeout: 60_000,
  headers: { 'Accept-Language': 'en-US,en;q=0.9' },
});

// Find the JSON-LD block whose @type is "Product".
const $ = cheerio.load(html);
let product = {};
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    const nodes = Array.isArray(ld) ? ld : [ld];
    const hit = nodes.find((n) => n['@type'] === 'Product');
    if (hit) product = hit;
  } catch { /* skip malformed blocks */ }
});

const offer = Array.isArray(product.offers) ? product.offers[0] : (product.offers ?? {});
console.log(JSON.stringify({
  url,
  name: product.name ?? null,
  price: offer.price ?? null,
  currency: offer.priceCurrency ?? null,
  availability: offer.availability ?? null,
  scrapedAt: new Date().toISOString(),
}, null, 2));
```

Set `PROXY_URL` the same way as in the marketplace guides:

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

> **Building on Bright Data?** Their e-commerce scraping stack covers the unlocking layer for you. [Get started →](/goto/bd-ecommerce/)

For marketplaces that don't ship JSON-LD, swap the parse step for the marketplace-specific extraction shown in the guides below — the rest of the loop is identical.

## Per-Marketplace Guides

Each guide is a ready-to-run tracker with full code samples in **PHP, Node.js, and Rust**, plus notes on where that marketplace hides its data.

### Amazon

Products are identified by ASIN, and data lives in the rendered HTML — so the [Amazon Product Tracking](/solutions/amazon-product-tracking/) guide extracts title, price, availability, and rating with CSS/XPath selectors, routed through an unlocker to get past Amazon's anti-bot systems.

### Walmart

Walmart's pages are built with Next.js, and the cleanest data source is the `__NEXT_DATA__` JSON blob rather than the visible HTML. The [Walmart Product Tracking](/solutions/walmart-product-tracking/) guide parses that script tag for structured name, price, and availability fields with no brittle selectors.

### eBay

eBay's listing pages are heavily A/B-tested, so selectors break constantly — but every item page embeds a clean JSON-LD `Product` object. The [eBay Product Tracking](/solutions/ebay-product-tracking/) guide reads price, currency, and availability straight from it, and the companion [eBay Product Search Scraping](/solutions/ebay-product-search-scraping/) guide covers market-level pricing across search results.

### AliExpress

A staple for dropshipping research. AliExpress embeds product data in a `window.runParams` JSON object; the [AliExpress Product Tracking](/solutions/aliexpress-product-tracking/) guide extracts it with a balanced-brace parser that's more robust than regex against deeply nested JSON.

### Google Search and Shopping

Search visibility is e-commerce data too — rankings, competitors' shopping placements, and "people also ask" coverage. The [Google Search Scraping](/solutions/google-search-scraping/) guide shows how to collect SERP data reliably.

## Data Storage and Change Detection

A tracker is only as useful as its history. Keep it simple:

- **Schema:** one append-only table of observations — `(product_id, source, price, currency, availability, scraped_at)`. Never overwrite; the whole point is the time series. SQLite is plenty until you're tracking tens of thousands of SKUs.
- **Change detection:** on each run, compare the new observation against the most recent stored row for that product. Emit an event when the price moves, availability flips, or a listing disappears entirely (repeated fetch failures are a signal, not just an error).
- **Alerting:** pipe change events to email, Slack, or a webhook. Thresholds beat noise — "alert when price drops more than 5%" is more actionable than reporting every one-cent fluctuation.
- **Data hygiene:** normalize prices to a numeric value plus a currency code at parse time (marketplaces format prices differently), and store the raw scraped string alongside it so you can re-parse when a format changes.
- **Selector drift:** track your null rate per field. A sudden jump from near-zero to 100% nulls means the site changed its markup, not that every product lost its price.

## Legal and Ethical Notes

This isn't legal advice, but a few grounding principles apply to e-commerce scraping:

- **Stick to public data.** Product pages, prices, and reviews visible to any anonymous visitor are a different category from anything behind a login. Don't scrape logged-in or private areas, and don't collect personal data.
- **Read the terms of service.** Most marketplaces prohibit scraping in their ToS. That's a contractual matter distinct from whether scraping public data is lawful in your jurisdiction — understand both, and if the data matters to your business, get proper legal guidance.
- **Check robots.txt and be a good citizen.** Throttle your request rate, scrape during off-peak hours where possible, and don't degrade the site for real users. A scraper that behaves like a polite visitor is also, conveniently, a scraper that gets blocked less.
- **Prefer official channels when they exist.** Some marketplaces offer APIs or affiliate feeds that cover common use cases without scraping at all.

## Next Steps

If you're starting from zero, pick the marketplace guide closest to your target and get one product tracking end-to-end — [Amazon](/solutions/amazon-product-tracking/), [Walmart](/solutions/walmart-product-tracking/), [eBay](/solutions/ebay-product-tracking/), or [AliExpress](/solutions/aliexpress-product-tracking/). Then:

1. Read [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) before you scale past a handful of requests.
2. Choose the right proxy type for your target with [Residential vs. Datacenter vs. Mobile Proxies](/learn/proxy-types-explained/).
3. Add the storage and change-detection layer above, schedule it with cron, and let the history accumulate.

When maintaining the unblocking layer yourself stops being worth your time, a managed stack takes it over. **[Get started with Bright Data →](/goto/bd-ecommerce/)**
