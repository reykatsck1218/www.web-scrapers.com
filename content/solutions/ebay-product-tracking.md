+++
title = "eBay Product Tracking: Scraper Code Samples (PHP, Node.js, Rust)"
description = "Scrape eBay item prices and availability by parsing JSON-LD product data, with ready-to-run scraper code samples in PHP, Node.js, and Rust."
template = "page.html"
+++

eBay is a prime target for price tracking, competitor monitoring, and deal sourcing — but its listing pages are heavily A/B-tested, so scraping rendered HTML with CSS selectors breaks constantly. The reliable source is the **JSON-LD** block eBay embeds in every item page: a `<script type="application/ld+json">` tag containing a clean `Product` object with name, price, currency, and availability. The samples below fetch the page through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) and read straight from that structured data.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

> **No Bright Data account yet?** [Get started with the eBay collector →](/goto/bd-ebay/)

Items are identified by their numeric **item ID** from the URL: `https://www.ebay.com/itm/<id>`.

## PHP

```php
<?php
// Run: php ebay.php 167890123456
$proxy  = getenv('PROXY_URL');
$itemId = $argv[1] ?? '167890123456';

$ch = curl_init("https://www.ebay.com/itm/$itemId");
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

// eBay ships product data as JSON-LD. Find the block whose @type is "Product".
$doc = new DOMDocument();
@$doc->loadHTML($html);
$xp = new DOMXPath($doc);

$product = null;
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    if (($ld['@type'] ?? '') === 'Product') { $product = $ld; break; }
}

$offer = $product['offers'] ?? [];
echo json_encode([
    'id'           => $itemId,
    'name'         => $product['name'] ?? null,
    'price'        => $offer['price'] ?? null,
    'currency'     => $offer['priceCurrency'] ?? null,
    'availability' => $offer['availability'] ?? null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// ebay.mjs — node ebay.mjs 167890123456
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent  = new HttpsProxyAgent(process.env.PROXY_URL);
const itemId = process.argv[2] ?? '167890123456';

const { data: html } = await axios.get(`https://www.ebay.com/itm/${itemId}`, {
  httpsAgent: agent, proxy: false, timeout: 60_000,
  headers: { 'Accept-Language': 'en-US,en;q=0.9' },
});

const $ = cheerio.load(html);
let product = {};
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'Product') product = ld;
  } catch { /* skip malformed blocks */ }
});

const offer = product.offers ?? {};
console.log(JSON.stringify({
  id: itemId,
  name: product.name ?? null,
  price: offer.price ?? null,
  currency: offer.priceCurrency ?? null,
  availability: offer.availability ?? null,
}, null, 2));
```

## Rust

```rust
// Cargo.toml:
//   reqwest = { version = "0.12", features = ["blocking"] }
//   scraper = "0.20"
//   serde_json = "1"
use scraper::{Html, Selector};
use serde_json::Value;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let item_id = std::env::args().nth(1).unwrap_or_else(|| "167890123456".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.ebay.com/itm/{item_id}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();

    let mut product = Value::Null;
    for el in doc.select(&sel) {
        let raw = el.text().collect::<String>();
        if let Ok(ld) = serde_json::from_str::<Value>(&raw) {
            if ld["@type"] == "Product" { product = ld; break; }
        }
    }

    let offer = &product["offers"];
    let out = serde_json::json!({
        "id": item_id,
        "name": product["name"],
        "price": offer["price"],
        "currency": offer["priceCurrency"],
        "availability": offer["availability"],
    });

    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}
```

## Notes

- JSON-LD survives eBay's frequent layout experiments far better than CSS selectors — the same block also carries `image`, `brand`, `sku`, and `aggregateRating`.
- `availability` is a schema.org URL (e.g. `https://schema.org/InStock`); strip the prefix if you only want the status word.
- Auction listings differ from fixed-price ones — for live bids you may need the bidding section in the DOM rather than JSON-LD.
- For a tracker, persist `{id, price, timestamp}` per run and schedule with cron — see the [Amazon tracker](/solutions/amazon-product-tracking/) for the full alerting pattern.

## Scaling beyond a few items

Hitting thousands of eBay listings on a schedule means rotating IPs, handling blocks, and absorbing layout changes — maintenance that adds up fast. Bright Data's [eBay data collector](/goto/bd-ebay/) returns structured listing data without you managing any of that infrastructure, and pre-built [datasets](/goto/bd-datasets/) cover bulk historical pulls.

*See our [E-commerce Web Scraping Solutions](/solutions/ecommerce/) overview, the [eBay Product Search Scraping](/solutions/ebay-product-search-scraping/) guide for market-level pricing, the [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), and [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/).*

**[Scrape eBay at scale with Bright Data →](/goto/bd-ebay/)**
