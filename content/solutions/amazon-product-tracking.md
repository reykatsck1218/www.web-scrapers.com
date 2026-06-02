+++
title = "Amazon Product Tracking: Scraper Code Samples (PHP, Node.js, Rust)"
description = "Track Amazon product prices and availability by ASIN with ready-to-run scraper code samples in PHP, Node.js, and Rust."
template = "page.html"
[extra]
og_image = "assets/og/solutions-amazon-product-tracking.png"
+++

Tracking Amazon product prices and availability is one of the most popular e-commerce scraping use cases — for repricing, competitor monitoring, and deal alerts. Amazon's anti-bot systems make raw requests unreliable, so the samples below route requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) (which handles CAPTCHAs, fingerprinting, and IP rotation) and then parse the product page for title, price, availability, and rating.

## Prerequisites

Set a `PROXY_URL` pointing at your Web Unlocker zone:

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

> **New to Bright Data?** **7-day free trial, no credit card required.** [Get started →](https://get.brightdata.com/5q1kr89k0efo)

We identify products by their **ASIN** (the 10-character ID in every Amazon URL, e.g. `B08N5WRWNW`).

## PHP

```php
<?php
// Run: php amazon.php B08N5WRWNW
$proxy = getenv('PROXY_URL');
$asin  = $argv[1] ?? 'B08N5WRWNW';

$ch = curl_init("https://www.amazon.com/dp/$asin");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_PROXY          => $proxy,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_HTTPHEADER     => ['Accept-Language: en-US,en;q=0.9'],
]);
$html = curl_exec($ch);
curl_close($ch);

$doc = new DOMDocument();
@$doc->loadHTML($html);
$xp = new DOMXPath($doc);

$text = function (string $q) use ($xp): ?string {
    $node = $xp->query($q)->item(0);
    return $node ? trim($node->textContent) : null;
};

$product = [
    'asin'         => $asin,
    'title'        => $text('//*[@id="productTitle"]'),
    'price'        => $text('(//span[@class="a-price"]//span[@class="a-offscreen"])[1]'),
    'availability' => $text('//*[@id="availability"]//span'),
    'rating'       => $text('//*[@id="acrPopover"]//span[@class="a-icon-alt"]'),
];

echo json_encode($product, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// amazon.mjs — node amazon.mjs B08N5WRWNW
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent = new HttpsProxyAgent(process.env.PROXY_URL);
const asin = process.argv[2] ?? 'B08N5WRWNW';

const { data: html } = await axios.get(`https://www.amazon.com/dp/${asin}`, {
  httpsAgent: agent,
  proxy: false,
  timeout: 60_000,
  headers: { 'Accept-Language': 'en-US,en;q=0.9' },
});

const $ = cheerio.load(html);
const product = {
  asin,
  title: $('#productTitle').text().trim(),
  price: $('span.a-price span.a-offscreen').first().text().trim(),
  availability: $('#availability span').first().text().trim(),
  rating: $('#acrPopover span.a-icon-alt').first().text().trim(),
};

console.log(JSON.stringify(product, null, 2));
```

## Rust

```rust
// Cargo.toml:
//   reqwest = { version = "0.12", features = ["blocking"] }
//   scraper = "0.20"
//   serde_json = "1"
use scraper::{Html, Selector};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let asin = std::env::args().nth(1).unwrap_or_else(|| "B08N5WRWNW".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.amazon.com/dp/{asin}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let pick = |sel: &str| {
        Selector::parse(sel)
            .ok()
            .and_then(|s| doc.select(&s).next())
            .map(|el| el.text().collect::<String>().trim().to_string())
    };

    let product = serde_json::json!({
        "asin": asin,
        "title": pick("#productTitle"),
        "price": pick("span.a-price span.a-offscreen"),
        "availability": pick("#availability span"),
        "rating": pick("#acrPopover span.a-icon-alt"),
    });

    println!("{}", serde_json::to_string_pretty(&product)?);
    Ok(())
}
```

## From Scraper to Tracker

To turn this into a price tracker:

1. **Store each run** — write `{asin, price, timestamp}` to a database or CSV on every scrape.
2. **Schedule it** — run the script on a cron job (e.g. hourly or daily).
3. **Compare and alert** — diff the latest price against the previous one and trigger an email/Slack alert when it drops below your threshold.

> Amazon's CSS classes shift occasionally and vary by category/locale. If a field comes back empty, re-inspect the live page and adjust the selector.

*See our [E-commerce Web Scraping Solutions](/solutions/ecommerce/) overview, the [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), and [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/).*

**[Start your free 7-day Bright Data trial →](https://get.brightdata.com/5q1kr89k0efo)**
