+++
title = "Web Scraping with Node.js: Axios, Cheerio & Puppeteer"
description = "Build web scrapers in Node.js with Axios and Cheerio for static HTML, Puppeteer for JavaScript-heavy sites, and proxy rotation to stay unblocked."
template = "page.html"
date = 2026-09-10

[extra]
faq = [
  { q = "Is Node.js good for web scraping?", a = "Yes. Node.js's non-blocking I/O model makes it efficient for concurrent HTTP requests, and libraries like Axios, Cheerio, and Puppeteer cover the full scraping stack from simple HTTP fetches to full browser automation." },
  { q = "When should I use Puppeteer instead of Cheerio?", a = "Use Cheerio when the data you want is present in the raw HTML the server sends. Switch to Puppeteer when the site renders content with client-side JavaScript — check by viewing source (Ctrl+U) and searching for a visible data point." },
  { q = "How do I avoid getting blocked with Node.js scrapers?", a = "Set a realistic User-Agent header, add randomised delays between requests, and route your traffic through a proxy service that rotates residential IPs. Bright Data's Web Unlocker handles fingerprint and header challenges automatically." },
  { q = "Can I run Node.js scrapers at scale?", a = "Yes. Use Promise.allSettled or a concurrency library like p-limit to fan out requests without overwhelming the target, and pair that with IP rotation so your request pool doesn't share a single address across hundreds of pages." },
]
+++

Node.js is the quiet workhorse of the web scraping world. JavaScript runs natively in every browser, which means the same language you use to inspect a site in DevTools is the one you can use to scrape it — no mental context switch between languages. Combine that with Node's non-blocking I/O model and you have a runtime that handles hundreds of concurrent HTTP requests without breaking a sweat.

This guide walks you from zero to a working, pagination-aware scraper in Node.js. You'll learn to fetch static pages with Axios, parse HTML with Cheerio, automate a real browser with Puppeteer for JavaScript-heavy sites, rotate proxies to stay unblocked, and save your data. Every code sample is runnable against a public practice site.

## Why Node.js for Web Scraping?

Node.js isn't the only option — Python is arguably more popular, and our [Python web scraping guide](/learn/web-scraping-with-python/) covers that path thoroughly. Node earns its place when:

- **Your team already writes JavaScript.** No second language to maintain.
- **You need concurrency without complexity.** A single async function with `Promise.all` fires dozens of requests in parallel. The equivalent in Python requires threading or `asyncio`.
- **You're scraping SPAs.** Puppeteer and Playwright are built on the Chrome DevTools Protocol — the same engine that powers the browser. They feel at home in a Node environment in a way that Python wrappers do not.

For pure data science pipelines or projects where pandas is already involved, Python wins. For everything else, Node is a serious contender.

## Setting Up Your Project

You need Node.js 18 or newer (LTS). Verify with `node --version`, then create a project:

```bash
mkdir node-scraper && cd node-scraper
npm init -y
npm install axios cheerio
```

`axios` is the most ergonomic HTTP client in the Node ecosystem. `cheerio` parses HTML using a jQuery-like API and runs entirely server-side — no browser overhead.

For JavaScript-heavy sites, add Puppeteer later:

```bash
npm install puppeteer
```

Throughout this guide we'll scrape [books.toscrape.com](https://books.toscrape.com/) — a sandboxed bookstore designed for scraping practice.

## Fetching Pages with Axios

The minimum viable fetch:

```js
import axios from 'axios';

const { data } = await axios.get('https://books.toscrape.com/', {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',
  },
  timeout: 10_000,
});

console.log(data.length); // bytes of HTML
```

Three habits worth keeping from the start:

- **Always set a timeout.** Without it, a slow or dropped connection hangs your script indefinitely.
- **Send a real User-Agent.** The default `axios/1.x` string is the most obvious bot fingerprint you can broadcast.
- **Destructure `{ data }` from the response.** Axios puts the body in `response.data`; the top-level object also carries headers, status codes, and config you usually don't need right away.

Add `"type": "module"` to your `package.json` to enable ES module `import` syntax, or use `const axios = require('axios').default` with CommonJS.

## Parsing HTML with Cheerio

`cheerio` loads an HTML string and exposes the same CSS selectors and traversal methods you'd use in a browser's `document.querySelector`.

```js
import axios from 'axios';
import * as cheerio from 'cheerio';

const { data } = await axios.get('https://books.toscrape.com/', {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyScraper/1.0)' },
  timeout: 10_000,
});

const $ = cheerio.load(data);
const books = [];

$('article.product_pod').each((_, el) => {
  const title = $(el).find('h3 a').attr('title');
  const price = $(el).find('p.price_color').text().trim();
  const rating = $(el).find('p.star-rating').attr('class').split(' ')[1];
  books.push({ title, price, rating });
});

console.log(books);
```

The `$` convention mirrors jQuery and keeps the syntax familiar. A few points worth noting:

- **Data hides in attributes.** The full book title is in the `title` attribute of the link, because the visible text is truncated to save layout space. Always inspect the actual HTML rather than assuming the visible text is complete.
- **CSS class names carry data.** The star rating is encoded as a class name: `<p class="star-rating Three">`. Splitting the class string is cheaper than a regex.
- **`text().trim()`** collapses whitespace and removes the newlines that HTML is full of.

### Defensive Selectors

Real websites drift. Wrap every extraction so a missing element degrades to an empty string rather than throwing:

```js
const safe = (el, selector, attr = null) => {
  const found = $(el).find(selector);
  if (!found.length) return '';
  return attr ? found.attr(attr) : found.text().trim();
};

const price = safe(el, 'p.price_color');
const img   = safe(el, 'img', 'src');
```

Log a warning when an expected element returns empty. A layout change surfaces as a message instead of silent missing data.

## Handling Pagination

One page is a demo. All fifty pages is a dataset. Books.toscrape.com uses a "next" link (`<li class="next"><a href="catalogue/page-2.html">`):

```js
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE = 'https://books.toscrape.com/';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MyScraper/1.0)' };
const DELAY_MS = 1500;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeAll() {
  let url = BASE;
  const books = [];

  while (url) {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10_000 });
    const $ = cheerio.load(data);

    $('article.product_pod').each((_, el) => {
      books.push({
        title: $(el).find('h3 a').attr('title') ?? '',
        price: $(el).find('p.price_color').text().trim(),
        rating: $(el).find('p.star-rating').attr('class')?.split(' ')[1] ?? '',
        href: new URL($(el).find('h3 a').attr('href'), url).href,
      });
    });

    const nextHref = $('li.next a').attr('href');
    url = nextHref ? new URL(nextHref, url).href : null;

    if (url) await sleep(DELAY_MS + Math.random() * 500);
  }

  return books;
}

scrapeAll().then(books => console.log(`Scraped ${books.length} books`));
```

Two details make this loop robust. `new URL(href, base).href` resolves relative paths correctly regardless of how deep in the catalogue the "next" link points. And the loop terminates cleanly: when the next link is absent `url` becomes `null` and `while (url)` exits.

For sites that use `?page=N` query strings, offset parameters, or infinite scroll backed by a hidden JSON API, see our [pagination guide](/learn/handling-pagination/) for patterns tailored to each type.

## Scraping Dynamic Sites with Puppeteer

Everything so far requires the data to be present in the HTML the server sends. Modern single-page apps render content client-side, so Axios receives a JavaScript shell instead of products.

The quick check: view source (`Ctrl+U`) and search for a data point visible in the browser. If it's not there, you need a real browser engine.

```js
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

await page.setUserAgent(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36'
);

await page.goto('https://quotes.toscrape.com/js/', { waitUntil: 'networkidle0' });

const quotes = await page.$$eval('.quote', els =>
  els.map(el => ({
    text: el.querySelector('.text')?.textContent ?? '',
    author: el.querySelector('.author')?.textContent ?? '',
  }))
);

console.log(quotes);
await browser.close();
```

`waitUntil: 'networkidle0'` pauses until the page has made no network requests for 500ms — a reliable signal that the JavaScript has finished its initial render. For sites that load data lazily on scroll, use `page.evaluate(() => window.scrollBy(0, document.body.scrollHeight))` to trigger those fetches.

You can also get the rendered HTML after waiting and hand it to Cheerio, keeping your parsing code consistent across static and dynamic targets:

```js
const html = await page.content();
const $ = cheerio.load(html);
// ... same selectors as before
```

## Routing Through a Proxy to Stay Unblocked

Scale any scraper past a few hundred requests and IP-based blocking becomes your primary obstacle. Anti-bot systems track request volume per IP, and a single address sending thousands of requests looks nothing like a human browser.

The fix is proxy rotation — distributing requests across a large pool of IP addresses so no single one accumulates a suspicious count. For Axios:

```js
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent(process.env.PROXY_URL);

const { data } = await axios.get('https://example.com/', {
  httpAgent: agent,
  httpsAgent: agent,
  timeout: 10_000,
});
```

Set `PROXY_URL` in your environment to point at your provider's endpoint. Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a> goes further than a raw proxy pool: it manages IP rotation, browser fingerprinting, header normalisation, and CAPTCHA resolution automatically, so your code hits one endpoint and the service handles the rest. Read our full <a href="/reviews/bright-data-web-unlocker/">Bright Data Web Unlocker review</a> for a detailed look at what it does under the hood.

For Puppeteer, pass the proxy when launching the browser:

```js
const browser = await puppeteer.launch({
  headless: true,
  args: [`--proxy-server=${process.env.PROXY_URL}`],
});
```

Not sure which proxy tier fits your project? Our [proxy types guide](/learn/proxy-types-explained/) covers the tradeoffs between datacenter, residential, and ISP proxies so you can match the product to the target.

## Saving Your Data

A scraped array in memory disappears when the process exits. Write to disk before finishing:

```js
import fs from 'fs/promises';

// JSON — keeps nested structure, easy to import elsewhere
await fs.writeFile('books.json', JSON.stringify(books, null, 2), 'utf8');

// CSV — opens directly in Excel / Google Sheets
const header = 'title,price,rating\n';
const rows = books.map(b =>
  [b.title, b.price, b.rating].map(v => `"${v.replace(/"/g, '""')}"`).join(',')
);
await fs.writeFile('books.csv', header + rows.join('\n'), 'utf8');
```

Quote every CSV field and escape inner double-quotes — the one-liner above is sufficient for clean data. For anything that runs on a schedule or that you query after the fact, graduate to SQLite via the `better-sqlite3` package: its upsert support prevents duplicates across runs and queries stay readable.

## Debugging Your Scraper

When results come back empty or wrong, check in this order:

1. **Confirm the response.** Log `data.slice(0, 500)` before parsing. A 200 response can still be a CAPTCHA page, a consent wall, or a login redirect — all of which produce valid HTML with zero products.
2. **Test your selectors in DevTools.** Open the browser console and run `document.querySelectorAll('article.product_pod')`. Cheerio uses the same CSS selectors, but DevTools shows the *rendered* DOM while Cheerio parses the raw HTML. If they differ, the page is JavaScript-rendered and you need Puppeteer.
3. **Check for layout changes.** Sites update their HTML periodically. Log a warning whenever an expected field comes back empty so a design change surfaces as a message rather than silent missing rows.

Saving the raw HTML of failed requests costs almost nothing and turns "it broke on Tuesday" into a problem you can actually reproduce.

## Next Steps

You now have the full Node.js scraping toolkit: Axios for HTTP, Cheerio for HTML parsing, a pagination loop, Puppeteer for dynamic rendering, and proxy rotation for scale.

Where to go from here:

- **Add real-world targets.** The same patterns power high-value use cases like [tracking Amazon product prices](/solutions/amazon-product-tracking/) or [scraping Google search results](/solutions/google-search-scraping/) — both of which show how the difficulty jumps once a major platform is actively defending itself.
- **Harden against blocking.** The [anti-blocking playbook](/learn/how-to-avoid-getting-blocked/) covers fingerprinting, TLS signatures, and the full spectrum of defences modern sites deploy.
- **Manage IP rotation at scale.** When a rotating residential proxy pool becomes necessary, <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Bright Data's Web Unlocker</a> is the service most teams reach for — one endpoint, global residential coverage, and built-in unblocking logic.

Start with the static Axios + Cheerio flow, add Puppeteer only when the site demands it, and layer in proxies when you hit scale. Each step is a clear upgrade, not a rewrite.

## FAQ

### Is Node.js good for web scraping?

Yes. Node.js's non-blocking I/O model makes it efficient for concurrent HTTP requests, and libraries like Axios, Cheerio, and Puppeteer cover the full scraping stack from simple HTTP fetches to full browser automation.

### When should I use Puppeteer instead of Cheerio?

Use Cheerio when the data you want is present in the raw HTML the server sends. Switch to Puppeteer when the site renders content with client-side JavaScript — check by viewing source (Ctrl+U) and searching for a visible data point.

### How do I avoid getting blocked with Node.js scrapers?

Set a realistic User-Agent header, add randomised delays between requests, and route your traffic through a proxy service that rotates residential IPs. Bright Data's Web Unlocker handles fingerprint and header challenges automatically.

### Can I run Node.js scrapers at scale?

Yes. Use Promise.allSettled or a concurrency library like p-limit to fan out requests without overwhelming the target, and pair that with IP rotation so your request pool doesn't share a single address across hundreds of pages.
