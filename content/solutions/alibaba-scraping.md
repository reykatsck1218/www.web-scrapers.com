+++
title = "How to Scrape Alibaba: B2B Product and Supplier Data (PHP, Node.js, Rust)"
description = "Scrape Alibaba B2B product listings and supplier pages by parsing JSON-LD and embedded product state, with ready-to-run code in PHP, Node.js, and Rust."
template = "page.html"
+++

Alibaba is the world's largest B2B marketplace — a primary source for procurement research, competitive benchmarking, supplier discovery, and price range intelligence. Product listing pages expose structured data in two machine-readable layers: a **JSON-LD** `Product` block for core metadata (name, price range, supplier) and an **embedded JavaScript state object** for B2B-specific fields like minimum order quantity, certifications, and trade capacity. Both are publicly accessible without authentication.

This guide covers how to extract both layers and provides working code that routes through a rendering-capable proxy layer.

## What Alibaba product pages expose publicly

Every public Alibaba product listing at `https://www.alibaba.com/product-detail/{slug}_{id}.html` ships two structured data sources visible to any browser:

| Source | How to find it | What it contains |
|--------|---------------|-----------------|
| JSON-LD (`application/ld+json`) | `<script>` tags | Product schema — name, description, price range, supplier, aggregate rating |
| Embedded page state | `<script>` containing `window.pageData` | MOQ, certifications, trade capacity, company info, specification tables |

The JSON-LD block is more structurally stable and is the reliable extraction target for core fields. The embedded state holds richer B2B detail but its key paths change across Alibaba's A/B tests and layout updates.

## Why naive scrapers fail on Alibaba

- **Datacenter IP blocking.** Alibaba's CDN filters cloud and server IP ranges aggressively. Plain cURL from a VPS commonly returns a CAPTCHA page or an empty response before any product content loads.
- **JavaScript rendering required for full state.** While JSON-LD is present in the initial HTML, many secondary data fields (MOQ tables, certification badges, supplier capacity figures) are injected after React hydration.
- **TLS and browser fingerprinting.** Alibaba scores the TLS handshake and HTTP/2 settings alongside standard headers. Realistic browser fingerprint emulation is necessary to receive complete, unredacted product content.

See [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) and [proxy types explained](/learn/proxy-types-explained/) for deeper background.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

The samples below route requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/), which handles residential IP rotation, browser fingerprint emulation, and CAPTCHA solving. Supply your zone credentials in `PROXY_URL`.

> **No Bright Data account yet?** [Explore the Alibaba data collector →](/goto/bd-alibaba/)

Product URLs follow the pattern `https://www.alibaba.com/product-detail/{slug}_{numeric-id}.html`. The numeric ID is the stable identifier; the slug can vary.

## PHP

```php
<?php
// Run: php alibaba.php 60123456789
$proxy     = getenv('PROXY_URL');
$productId = $argv[1] ?? '60123456789';

$ch = curl_init("https://www.alibaba.com/product-detail/product_$productId.html");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_PROXY          => $proxy,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_HTTPHEADER     => [
        'Accept-Language: en-US,en;q=0.9',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ],
]);
$html = curl_exec($ch);
curl_close($ch);

$doc = new DOMDocument();
@$doc->loadHTML($html);
$xp = new DOMXPath($doc);

// 1. JSON-LD — Alibaba ships a Product block on every listing page.
$product = null;
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    if (($ld['@type'] ?? '') === 'Product') { $product = $ld; break; }
}

// 2. Embedded page state — locate the window.pageData assignment for B2B fields.
$pageData = null;
foreach ($xp->query('//script[not(@src)]') as $node) {
    $text = $node->textContent;
    if (strpos($text, 'window.pageData') !== false) {
        // Extract the JSON object assigned to window.pageData
        if (preg_match('/window\.pageData\s*=\s*(\{.+\})\s*;/s', $text, $m)) {
            $pageData = json_decode($m[1], true);
        }
        break;
    }
}

$offers = $product['offers'] ?? [];
echo json_encode([
    'id'          => $productId,
    'name'        => $product['name'] ?? null,
    'lowPrice'    => $offers['lowPrice'] ?? null,
    'highPrice'   => $offers['highPrice'] ?? null,
    'currency'    => $offers['priceCurrency'] ?? null,
    'supplier'    => $product['brand']['name'] ?? null,
    'rating'      => $product['aggregateRating']['ratingValue'] ?? null,
    'reviewCount' => $product['aggregateRating']['reviewCount'] ?? null,
    'moq'         => $pageData['tradeInfo']['minOrderQuantity'] ?? null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// alibaba.mjs — node alibaba.mjs 60123456789
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const proxyAgent = new HttpsProxyAgent(process.env.PROXY_URL);
const productId  = process.argv[2] ?? '60123456789';

const { data: html } = await axios.get(
  `https://www.alibaba.com/product-detail/product_${productId}.html`,
  {
    httpsAgent: proxyAgent, proxy: false, timeout: 60_000,
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }
);

const $ = cheerio.load(html);

// 1. JSON-LD — find the Product block.
let product = null;
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'Product') product = ld;
  } catch { /* skip malformed blocks */ }
});

// 2. Embedded page state — window.pageData assignment.
let pageData = null;
$('script:not([src])').each((_, el) => {
  const text = $(el).text();
  if (!text.includes('window.pageData')) return;
  const m = text.match(/window\.pageData\s*=\s*(\{[\s\S]+?\})\s*;/);
  if (m) {
    try { pageData = JSON.parse(m[1]); } catch { /* malformed */ }
  }
});

const offers = product?.offers ?? {};
console.log(JSON.stringify({
  id:          productId,
  name:        product?.name ?? null,
  lowPrice:    offers.lowPrice ?? null,
  highPrice:   offers.highPrice ?? null,
  currency:    offers.priceCurrency ?? null,
  supplier:    product?.brand?.name ?? null,
  rating:      product?.aggregateRating?.ratingValue ?? null,
  reviewCount: product?.aggregateRating?.reviewCount ?? null,
  moq:         pageData?.tradeInfo?.minOrderQuantity ?? null,
}, null, 2));
```

## Rust

```rust
// Cargo.toml:
//   reqwest = { version = "0.12", features = ["blocking"] }
//   scraper = "0.20"
//   serde_json = "1"
//   regex = "1"
use regex::Regex;
use scraper::{Html, Selector};
use serde_json::Value;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let product_id = std::env::args().nth(1).unwrap_or_else(|| "60123456789".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!(
            "https://www.alibaba.com/product-detail/product_{product_id}.html"
        ))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);

    // 1. JSON-LD — Product block.
    let ld_sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();
    let product = doc
        .select(&ld_sel)
        .filter_map(|el| {
            let raw = el.text().collect::<String>();
            serde_json::from_str::<Value>(&raw).ok()
        })
        .find(|v| v["@type"] == "Product")
        .unwrap_or(Value::Null);

    // 2. Embedded page state — window.pageData assignment.
    let script_sel = Selector::parse("script:not([src])").unwrap();
    let page_data_re = Regex::new(r"window\.pageData\s*=\s*(\{[\s\S]+?\})\s*;")?;
    let page_data: Value = doc
        .select(&script_sel)
        .find_map(|el| {
            let text = el.text().collect::<String>();
            if !text.contains("window.pageData") {
                return None;
            }
            page_data_re
                .captures(&text)
                .and_then(|caps| serde_json::from_str::<Value>(&caps[1]).ok())
        })
        .unwrap_or(Value::Null);

    let offers = &product["offers"];
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "id":          product_id,
            "name":        product["name"],
            "lowPrice":    offers["lowPrice"],
            "highPrice":   offers["highPrice"],
            "currency":    offers["priceCurrency"],
            "supplier":    product["brand"]["name"],
            "rating":      product["aggregateRating"]["ratingValue"],
            "reviewCount": product["aggregateRating"]["reviewCount"],
            "moq":         page_data["tradeInfo"]["minOrderQuantity"],
        }))?
    );
    Ok(())
}
```

## Working with supplier profile pages

Beyond product listings, Alibaba exposes company profile pages at `https://www.alibaba.com/{company-slug}.html`. These pages carry their own JSON-LD block with `@type: "Organization"` containing:

- Company name and headquarters country
- Trade Show attendance records
- Certification badges (ISO, CE, SGS) as text in the page body
- Year established and response time statistics

Use the same proxy-routed fetch and JSON-LD extraction pattern above, substituting the organization URL. The `@type` check changes from `"Product"` to `"Organization"`.

## Notes

- Alibaba's JSON-LD uses `AggregateOffer` for price ranges (not a single `Offer`). The `lowPrice` and `highPrice` fields reflect the quantity-tier range displayed on the page — typically in USD.
- MOQ data is B2B-specific and not always present in JSON-LD; the embedded `window.pageData.tradeInfo` subtree carries it when available. If that path is absent, check the raw HTML for a `<span>` with class patterns matching `min-order`.
- Certification data (ISO, RoHS, CE) appears in the supplier panel as plain HTML, not structured data — use CSS selectors on the rendered page for those fields.
- Alibaba's Terms of Service restrict automated data collection. This guide is technical documentation — assess your use case against the current ToS and seek legal advice before deploying commercially.

## Scaling for procurement intelligence and market research

Single-product scraping is straightforward, but meaningful B2B intelligence typically requires tracking hundreds of suppliers across product categories, monitoring price range shifts over time, and cross-referencing certification status. That means managing IP rotation, handling frequent layout changes in the `window.pageData` structure, and scaling request throughput without triggering progressive blocks.

Bright Data's [Alibaba data collector](/goto/bd-alibaba/) abstracts that infrastructure layer, delivering structured product and supplier data without the maintenance overhead of a hand-rolled scraper.

*Related: [AliExpress product tracking](/solutions/aliexpress-product-tracking/), [e-commerce scraping overview](/solutions/ecommerce/), [Amazon product tracking](/solutions/amazon-product-tracking/), [eBay product tracking](/solutions/ebay-product-tracking/), [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), and [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/).*

**[Collect Alibaba data at scale with Bright Data →](/goto/bd-alibaba/)**
