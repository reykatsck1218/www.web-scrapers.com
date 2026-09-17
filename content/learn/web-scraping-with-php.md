+++
title = "Web Scraping with PHP: cURL, DOMDocument & Proxies"
description = "Learn to scrape the web with PHP using cURL and DOMDocument, extract JSON-LD structured data, rotate proxies, and scale with a managed unlocker."
template = "page.html"
date = 2026-09-17

[extra]
faq = [
  { q = "Is PHP good for web scraping?", a = "Yes. PHP ships with cURL and DOMDocument/DOMXPath in its standard library, so you can fetch pages and parse HTML without installing any third-party package. It's a practical choice when your data pipeline already lives in a PHP backend." },
  { q = "How do I parse HTML in PHP without a library?", a = "Use the built-in DOMDocument class: load the fetched HTML string with loadHTML(), then use DOMXPath to query elements with CSS-like XPath expressions. Suppress markup-warning noise with the @ error-suppression operator before loadHTML()." },
  { q = "How do I route PHP cURL requests through a proxy?", a = "Pass the proxy URL to curl_setopt() using the CURLOPT_PROXY constant. For authenticated proxies (user:pass@host:port format), use CURLOPT_PROXYUSERPWD. Set CURLOPT_SSL_VERIFYPEER to false only when the proxy uses a self-signed certificate you trust." },
  { q = "Can PHP scrape JavaScript-rendered pages?", a = "Not with cURL alone — cURL fetches the raw HTML the server sends before any client-side JavaScript runs. For JavaScript-heavy sites, use a managed unblocking service that renders pages server-side, such as Bright Data's Web Unlocker, which returns fully rendered HTML without you running a headless browser." },
]
+++

PHP is the original web language — powering roughly 77% of all websites with a server-side language — yet it's rarely the first name mentioned when scraping comes up. That's a missed opportunity. PHP ships with a battle-tested HTTP client (cURL) and an HTML parser (DOMDocument) directly in its standard library. There is nothing to install, no virtual environment to activate, and no dependency conflicts to debug. If your pipeline already runs in PHP — a Laravel worker, a WordPress plugin, a legacy data job — you can add scraping in the same codebase without a language jump.

This guide walks from a minimal cURL fetch to a pagination-aware scraper that routes through a proxy, extracts embedded JSON-LD structured data, and saves results to disk.

## Prerequisites and Setup

You need PHP 8.1 or newer with the `curl` and `dom` extensions enabled (both are on by default in most distributions). Verify:

```bash
php -m | grep -E 'curl|dom'
```

All examples in this guide use core PHP only. For an optional HTML-parsing shortcut, you can install [symfony/css-selector](https://symfony.com/doc/current/components/css_selector.html) or [voku/simple_html_dom](https://github.com/voku/simple_html_dom) via Composer — but neither is required here.

## Fetching a Page with cURL

PHP's cURL extension wraps the `libcurl` library. At its simplest:

```php
<?php
function fetch(string $url, string $proxy = ''): string {
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                . 'AppleWebKit/537.36 (KHTML, like Gecko) '
                . 'Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language: en-US,en;q=0.9',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ],
    ];
    if ($proxy) {
        $opts[CURLOPT_PROXY]          = $proxy;
        $opts[CURLOPT_SSL_VERIFYPEER] = false;
    }
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) throw new RuntimeException("cURL error: $err");
    return $body;
}

$html = fetch('https://books.toscrape.com/');
echo strlen($html) . " bytes fetched\n";
```

Three habits from the start:

- **Always set `CURLOPT_TIMEOUT`.** Without it, a slow or dropped connection hangs your script forever.
- **Send a realistic `User-Agent`** — the default `curl/8.x` string is an instant bot signal.
- **Wrap proxy configuration in a flag.** The same function works locally (no proxy) and in production (with proxy) by toggling one parameter.

## Parsing HTML with DOMDocument and DOMXPath

`DOMDocument` loads HTML into a traversable tree; `DOMXPath` queries it with XPath expressions that work similarly to CSS selectors:

```php
<?php
$html = fetch('https://books.toscrape.com/');

$doc = new DOMDocument();
@$doc->loadHTML($html); // @ suppresses malformed-HTML warnings
$xp = new DOMXPath($doc);

$books = [];
foreach ($xp->query('//article[contains(@class,"product_pod")]') as $node) {
    $titleNode = $xp->query('.//h3/a', $node)->item(0);
    $priceNode = $xp->query('.//p[contains(@class,"price_color")]', $node)->item(0);
    $books[] = [
        'title' => $titleNode?->getAttribute('title') ?? '',
        'price' => trim($priceNode?->textContent ?? ''),
    ];
}

echo json_encode($books, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), PHP_EOL;
```

Key points:

- The `@` suppressor before `loadHTML` prevents HTML5 tags from flooding your error log. It is safe here because you handle the return value separately.
- XPath axes (`.//` = descendant of context node) let you scope queries to a subtree, avoiding global matches that break when the page layout shifts.
- Nullsafe operators (`?->`) short-circuit cleanly when an expected element is missing, giving you an empty string rather than a fatal error.

## Extracting Embedded JSON-LD Structured Data

Many e-commerce and content sites embed a `<script type="application/ld+json">` block containing a clean `Product`, `Article`, or `BreadcrumbList` object. This structured data survives layout changes better than CSS selectors tied to class names:

```php
<?php
function extractJsonLd(DOMXPath $xp, string $type): ?array {
    foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
        $ld = json_decode($node->textContent, true);
        if (($ld['@type'] ?? '') === $type) return $ld;
    }
    return null;
}

// On a product detail page:
$html    = fetch('https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html');
$doc     = new DOMDocument();
@$doc->loadHTML($html);
$xp      = new DOMXPath($doc);

$product = extractJsonLd($xp, 'Book') ?? extractJsonLd($xp, 'Product');
echo json_encode([
    'name'   => $product['name']             ?? null,
    'price'  => $product['offers']['price']  ?? null,
    'sku'    => $product['sku']              ?? null,
], JSON_PRETTY_PRINT), PHP_EOL;
```

This pattern is the same one used in our [eBay Product Tracking](/solutions/ebay-product-tracking/) guide — the structured data block is the most stable extraction target on any page that provides it. Check for it first before writing fragile CSS or XPath selectors against the layout.

## Routing Through a Proxy

Scale any scraper past a few hundred requests and IP-based blocking becomes the main obstacle. Anti-bot systems flag addresses that send requests far faster than a human browser would. The fix is routing through a rotating proxy pool so each request appears to originate from a different IP.

```php
<?php
$proxyUrl = getenv('PROXY_URL'); // e.g. http://user:pass@brd.superproxy.io:22225

$html = fetch('https://www.example.com/products', $proxyUrl);
```

Set `PROXY_URL` in your environment before running:

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:22225"
php scraper.php
```

For targets that require JavaScript rendering or solve CAPTCHAs, a raw proxy pool isn't enough — you also need fingerprint management and challenge resolution. Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a> wraps all of that behind a single proxy-compatible endpoint: your cURL code stays identical, while the service handles IP rotation, browser fingerprinting, and CAPTCHA solving transparently. See our [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/) for a detailed look at what it does under the hood.

Not sure which proxy tier matches your target? [Proxy types explained](/learn/proxy-types-explained/) compares datacenter, residential, ISP, and mobile proxies so you can match the product to the level of protection the site deploys.

## A Complete Pagination-Aware Scraper

Putting the pieces together: fetch, parse, follow the "next" link, add a polite delay, and write results to JSON:

```php
<?php
// Run: PROXY_URL="http://..." php books_scraper.php

function fetch(string $url, string $proxy = ''): string {
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                . 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language: en-US,en;q=0.9',
        ],
    ];
    if ($proxy) {
        $opts[CURLOPT_PROXY]          = $proxy;
        $opts[CURLOPT_SSL_VERIFYPEER] = false;
    }
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) throw new RuntimeException("cURL error: $err");
    return $body;
}

$proxy = getenv('PROXY_URL') ?: '';
$base  = 'https://books.toscrape.com/';
$url   = $base;
$books = [];

while ($url) {
    echo "Fetching $url\n";
    $html = fetch($url, $proxy);

    $doc = new DOMDocument();
    @$doc->loadHTML($html);
    $xp = new DOMXPath($doc);

    foreach ($xp->query('//article[contains(@class,"product_pod")]') as $node) {
        $a     = $xp->query('.//h3/a', $node)->item(0);
        $price = $xp->query('.//p[contains(@class,"price_color")]', $node)->item(0);
        $books[] = [
            'title' => $a?->getAttribute('title') ?? '',
            'price' => trim($price?->textContent ?? ''),
            'href'  => $a ? rtrim($base, '/') . '/catalogue/' . basename($a->getAttribute('href')) : '',
        ];
    }

    // Follow "next" pagination link
    $nextNode = $xp->query('//li[contains(@class,"next")]/a')->item(0);
    if ($nextNode) {
        $rel = $nextNode->getAttribute('href');
        // Resolve relative path against the current URL's directory
        $url = rtrim(dirname($url), '/') . '/' . $rel;
    } else {
        $url = null;
    }

    if ($url) usleep(mt_rand(800_000, 1_500_000)); // 0.8–1.5 s polite delay
}

file_put_contents('books.json', json_encode($books, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo "Saved " . count($books) . " books to books.json\n";
```

The random delay (`usleep`) is deliberate — uniform timing is itself a bot signal. Jitter in the 0.8–1.5 s range mimics the irregular pace of a human reading and clicking. For more on pagination strategies (offset parameters, cursor tokens, infinite scroll), see our [pagination guide](/learn/handling-pagination/).

## Handling JavaScript-Rendered Pages

cURL fetches exactly what the server sends before any JavaScript runs. If you view-source a page and the data you want isn't there, the site renders it client-side.

Your options in PHP:

1. **Find the underlying API.** Open DevTools → Network → XHR and reload the page. Most SPAs fetch data from a JSON API that you can call directly — cleaner and faster than rendering.
2. **Use a managed rendering endpoint.** Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a> renders the page in a real browser server-side and returns the fully rendered HTML. Your cURL code stays the same; you just point it at the unlocker endpoint instead of the target URL directly.
3. **Pair PHP with a headless browser sidecar.** Run Chromium via Puppeteer (Node.js) or Playwright as a subprocess, call it from PHP via `proc_open`, and receive the rendered HTML back on stdout — effective but complex to deploy.

For most protected targets, option 2 is the pragmatic path. It keeps your codebase pure PHP and offloads rendering, fingerprinting, and CAPTCHA solving to infrastructure built for the task.

## Debugging Your Scraper

When results come back empty:

1. **Inspect the raw response first.** Log `substr($html, 0, 1000)`. A 200 status can still be a CAPTCHA page, a consent wall, or a login redirect — all valid HTML, zero data.
2. **Check the HTTP status code.** Add `curl_getinfo($ch, CURLINFO_HTTP_CODE)` before `curl_close`. A 403 or 429 means you've been blocked, not that the selector is wrong.
3. **Test XPath in the browser.** Open DevTools console and run `$x('//article[contains(@class,"product_pod")]')` — Chrome supports XPath natively. This confirms your expression before you debug PHP.
4. **Diff the view-source against what cURL received.** If they differ, the page likely has a bot-detection layer serving different content to non-browser clients.

## Saving Data

JSON is the easiest format to pass to other systems:

```php
file_put_contents('output.json', json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
```

For CSV that opens cleanly in Excel:

```php
$fp = fopen('output.csv', 'w');
fputcsv($fp, array_keys($records[0])); // header row
foreach ($records as $row) fputcsv($fp, $row);
fclose($fp);
```

PHP's `fputcsv()` handles quoting and escaping automatically — no regex required.

## Scaling Up

Running hundreds of pages per minute from a single IP is a fast path to a ban. Beyond proxy rotation, consider:

- **Parallel requests with cURL multi.** PHP's `curl_multi_init` handles concurrent requests in a single PHP process without threads — effective up to ~20 parallel requests before connection overhead becomes the bottleneck.
- **Queue-based architecture.** Push URLs into Redis or a database queue and run multiple PHP worker processes in parallel, each with its own IP.
- **Managed data collection.** When the target is a major platform (Amazon, social media, travel sites), building and maintaining a scraper often costs more than using a provider's ready-made data product. See [Datasets vs. Web Scraping](/learn/datasets-vs-web-scraping/) to weigh that decision.

For a broader view of when to build a scraper vs. buy structured data, see our [web scraping use cases overview](/solutions/web-scraping-use-cases/) and compare proxy providers in our [reviews section](/reviews/).

**<a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Start scraping at scale with Bright Data's Web Unlocker →</a>**

## FAQ

### Is PHP good for web scraping?

Yes. PHP ships with cURL and DOMDocument/DOMXPath in its standard library, so you can fetch pages and parse HTML without installing any third-party package. It's a practical choice when your data pipeline already lives in a PHP backend.

### How do I parse HTML in PHP without a library?

Use the built-in DOMDocument class: load the fetched HTML string with `loadHTML()`, then use `DOMXPath` to query elements with CSS-like XPath expressions. Suppress markup-warning noise with the `@` error-suppression operator before `loadHTML()`.

### How do I route PHP cURL requests through a proxy?

Pass the proxy URL to `curl_setopt()` using the `CURLOPT_PROXY` constant. For authenticated proxies (`user:pass@host:port` format), use `CURLOPT_PROXYUSERPWD`. Set `CURLOPT_SSL_VERIFYPEER` to `false` only when the proxy uses a self-signed certificate you trust.

### Can PHP scrape JavaScript-rendered pages?

Not with cURL alone — cURL fetches the raw HTML the server sends before any client-side JavaScript runs. For JavaScript-heavy sites, use a managed unblocking service that renders pages server-side, such as Bright Data's Web Unlocker, which returns fully rendered HTML without you running a headless browser.
