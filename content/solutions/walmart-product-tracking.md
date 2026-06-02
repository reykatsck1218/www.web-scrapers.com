+++
title = "Walmart Product Tracking: Scraper Code Samples (PHP, Node.js, Rust)"
description = "Track Walmart product prices by parsing the __NEXT_DATA__ JSON blob, with ready-to-run scraper code samples in PHP, Node.js, and Rust."
template = "page.html"
[extra]
og_image = "assets/og/solutions-walmart-product-tracking.png"
+++

Walmart is a top target for price tracking and assortment monitoring, but its product pages are built with Next.js — which means the cleanest data source isn't the visible HTML, it's the `__NEXT_DATA__` JSON blob the page ships with. Parsing that script tag gives you structured, reliable fields (name, price, availability) without brittle CSS selectors. The samples below fetch the page through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) and read straight from `__NEXT_DATA__`.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

> **New to Bright Data?** **7-day free trial, no credit card required.** [Get started →](/goto/brightdata/)

Products are identified by their **item ID** from the URL: `https://www.walmart.com/ip/<id>`.

## PHP

```php
<?php
// Run: php walmart.php 5689919121
$proxy  = getenv('PROXY_URL');
$itemId = $argv[1] ?? '5689919121';

$ch = curl_init("https://www.walmart.com/ip/$itemId");
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

// Walmart embeds all product data as JSON in a __NEXT_DATA__ script tag.
$doc = new DOMDocument();
@$doc->loadHTML($html);
$xp   = new DOMXPath($doc);
$json = $xp->query('//script[@id="__NEXT_DATA__"]')->item(0)?->textContent;

$data = json_decode($json ?? '{}', true);
$p    = $data['props']['pageProps']['initialData']['data']['product'] ?? [];

$product = [
    'id'           => $p['usItemId'] ?? $itemId,
    'name'         => $p['name'] ?? null,
    'price'        => $p['priceInfo']['currentPrice']['price'] ?? null,
    'priceString'  => $p['priceInfo']['currentPrice']['priceString'] ?? null,
    'availability' => $p['availabilityStatus'] ?? null,
];

echo json_encode($product, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// walmart.mjs — node walmart.mjs 5689919121
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent  = new HttpsProxyAgent(process.env.PROXY_URL);
const itemId = process.argv[2] ?? '5689919121';

const { data: html } = await axios.get(`https://www.walmart.com/ip/${itemId}`, {
  httpsAgent: agent, proxy: false, timeout: 60_000,
  headers: { 'Accept-Language': 'en-US,en;q=0.9' },
});

const $ = cheerio.load(html);
const next = JSON.parse($('#__NEXT_DATA__').text() || '{}');
const p = next?.props?.pageProps?.initialData?.data?.product ?? {};

console.log(JSON.stringify({
  id: p.usItemId ?? itemId,
  name: p.name ?? null,
  price: p.priceInfo?.currentPrice?.price ?? null,
  priceString: p.priceInfo?.currentPrice?.priceString ?? null,
  availability: p.availabilityStatus ?? null,
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
    let item_id = std::env::args().nth(1).unwrap_or_else(|| "5689919121".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.walmart.com/ip/{item_id}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let sel = Selector::parse("script#__NEXT_DATA__").unwrap();
    let raw = doc
        .select(&sel)
        .next()
        .map(|e| e.text().collect::<String>())
        .unwrap_or_default();

    let data: Value = serde_json::from_str(&raw)?;
    let p = &data["props"]["pageProps"]["initialData"]["data"]["product"];

    let product = serde_json::json!({
        "id": p["usItemId"].as_str().unwrap_or(&item_id),
        "name": p["name"],
        "price": p["priceInfo"]["currentPrice"]["price"],
        "priceString": p["priceInfo"]["currentPrice"]["priceString"],
        "availability": p["availabilityStatus"],
    });

    println!("{}", serde_json::to_string_pretty(&product)?);
    Ok(())
}
```

## Notes

- Parsing `__NEXT_DATA__` is far more stable than scraping rendered HTML — the same blob also carries seller info, ratings, shipping, and variant data under `product`.
- If `initialData` is ever absent, Walmart occasionally hydrates from a `__PRELOADED_STATE__` script instead; dump the JSON keys to confirm the current path.
- For a tracker, persist `{id, price, timestamp}` per run, schedule with cron, and alert on drops — see the [Amazon tracker](/solutions/amazon-product-tracking/) for the full pattern.

*See our [E-commerce Web Scraping Solutions](/solutions/ecommerce/) overview, the [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), and [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/).*

**[Start your free 7-day Bright Data trial →](/goto/brightdata/)**
