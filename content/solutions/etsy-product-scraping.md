+++
title = "Etsy Product Scraping: Prices, Reviews & Listings"
description = "Extract Etsy listing prices, tags, seller details, and review counts from embedded JSON-LD structured data, with working PHP, Node.js, and Rust scrapers."
template = "page.html"
date = 2026-09-28
[extra]
faq = [
  { q = "Is scraping Etsy legal?", a = "Etsy's Terms of Use prohibit automated scraping of its platform. That said, US courts have generally held that automated collection of publicly visible, non-login-gated data is not a copyright violation on its own. The legal picture depends on your use case, data volume, and jurisdiction — always review the relevant terms and seek appropriate legal advice before deploying at scale." },
  { q = "How does Etsy embed its product data?", a = "Etsy injects a JSON-LD Product block into every public listing page inside a <script type='application/ld+json'> tag. This block contains the listing name, description, price, currency, availability, and aggregate rating data. Because it is structured data aimed at search engine crawlers, it tends to be more stable than CSS selectors tied to the rendered layout." },
  { q = "Why do Etsy scrapers get blocked so quickly?", a = "Etsy fingerprints TLS handshakes, checks HTTP/2 settings, and responds to datacenter IP ranges with CAPTCHAs or empty pages. A residential or ISP proxy that presents a genuine household IP is usually required to retrieve listing pages reliably. The Bright Data Web Unlocker handles fingerprint rotation and CAPTCHA solving automatically." },
  { q = "What Etsy data is publicly accessible without a login?", a = "Listing title, description, price, currency, availability, primary and secondary images, aggregate star rating, review count, seller name, and product tags are all visible to anonymous visitors and present in the JSON-LD payload. Buyer identities, private messages, and draft listings require authentication and are off-limits for automated collection." },
]
+++

Etsy is one of the largest marketplaces for handmade, vintage, and craft goods — which makes it a valuable data source for competitive pricing, product trend analysis, and seller research. Because every public listing page is rendered for anonymous visitors, the structured data Etsy publishes for search engines is also available to any scraper that can fetch the raw HTML.

The most reliable extraction point is the **JSON-LD Product block** Etsy injects into each listing — a `<script type="application/ld+json">` tag whose contents include the listing name, price, currency, availability, and aggregate rating. This structured data is far more stable than CSS selectors tied to Etsy's React layout, which changes with A/B tests and redesigns.

This guide explains where that data lives, why standard HTTP clients still fail, and provides working code samples in PHP, Node.js, and Rust that fetch through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) and parse the embedded JSON.

## Public listing data vs. account-gated data

Etsy does not require a login to browse listings, and everything an anonymous visitor can see counts as public data:

- **Public** — listing title, description, price, primary and secondary images, seller name, product tags, star rating, and review count.
- **Gated** — buyer identities in reviews, private shop analytics, order history, and draft listings all require authentication and are off-limits for automated collection.

The code samples below target only the anonymous, public view. Etsy's Terms of Use restrict automated scraping even of public data — review the relevant terms and seek appropriate advice before running at production scale.

## Where the data lives: JSON-LD Product blocks

Etsy listing pages include a structured-data block aimed at Google's product indexer:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Hand-thrown Ceramic Mug",
  "description": "…",
  "offers": {
    "@type": "Offer",
    "price": "28.00",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.9",
    "reviewCount": "312"
  }
}
</script>
```

A listing page may contain multiple JSON-LD blocks (for breadcrumbs, seller info, etc.). The scraper needs to find the one whose `@type` is `Product`.

## Why plain HTTP clients fail

Etsy returns CAPTCHAs or incomplete pages to datacenter IP ranges and to clients that present unusual TLS fingerprints. A `curl` command or a default `axios` request from a cloud server is typically blocked within a handful of requests. Residential or ISP proxies — IPs that look like genuine household connections — get through because Etsy's anti-bot layer treats them as normal browsers.

The [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) abstracts that entirely: it picks the right proxy type, rotates IPs, and handles CAPTCHA challenges, so your scraper sees a clean HTML response every time. <a href="/goto/bd-ecommerce/" rel="sponsored noopener">Explore Bright Data's e-commerce scraping tools →</a>

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

Listings are identified by their numeric **listing ID** in the URL:
`https://www.etsy.com/listing/<listing_id>/`

## PHP

```php
<?php
// Run: php etsy.php 1234567890
$proxy     = getenv('PROXY_URL');
$listingId = $argv[1] ?? '1234567890';

$ch = curl_init("https://www.etsy.com/listing/$listingId/");
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

$product = null;
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    if (($ld['@type'] ?? '') === 'Product') { $product = $ld; break; }
}

$offer  = $product['offers'] ?? [];
$rating = $product['aggregateRating'] ?? [];

echo json_encode([
    'id'           => $listingId,
    'name'         => $product['name'] ?? null,
    'description'  => substr($product['description'] ?? '', 0, 200),
    'price'        => $offer['price'] ?? null,
    'currency'     => $offer['priceCurrency'] ?? null,
    'availability' => $offer['availability'] ?? null,
    'rating'       => $rating['ratingValue'] ?? null,
    'review_count' => $rating['reviewCount'] ?? null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// etsy.mjs — node etsy.mjs 1234567890
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent     = new HttpsProxyAgent(process.env.PROXY_URL);
const listingId = process.argv[2] ?? '1234567890';

const { data: html } = await axios.get(
  `https://www.etsy.com/listing/${listingId}/`,
  {
    httpsAgent: agent,
    proxy: false,
    timeout: 60_000,
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }
);

const $ = cheerio.load(html);
let product = {};
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'Product') product = ld;
  } catch { /* skip malformed blocks */ }
});

const offer  = product.offers ?? {};
const rating = product.aggregateRating ?? {};

console.log(JSON.stringify({
  id:           listingId,
  name:         product.name ?? null,
  description:  (product.description ?? '').slice(0, 200),
  price:        offer.price ?? null,
  currency:     offer.priceCurrency ?? null,
  availability: offer.availability ?? null,
  rating:       rating.ratingValue ?? null,
  reviewCount:  rating.reviewCount ?? null,
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
    let listing_id = std::env::args().nth(1).unwrap_or_else(|| "1234567890".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.etsy.com/listing/{listing_id}/"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
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

    let offer  = &product["offers"];
    let rating = &product["aggregateRating"];
    let desc   = product["description"].as_str().unwrap_or("").chars().take(200).collect::<String>();

    let out = serde_json::json!({
        "id":           listing_id,
        "name":         product["name"],
        "description":  desc,
        "price":        offer["price"],
        "currency":     offer["priceCurrency"],
        "availability": offer["availability"],
        "rating":       rating["ratingValue"],
        "review_count": rating["reviewCount"],
    });

    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}
```

## Extracting additional fields

The JSON-LD `Product` block is intentionally minimal. For additional fields that Etsy renders on the page — seller name, shop URL, individual review text, tags, and secondary images — parse the surrounding HTML after the JSON-LD extraction:

- **Seller name / shop link** — present in an `<a>` inside the `.shop-name-and-title-container` section, or in a second JSON-LD block whose `@type` is `Organization` or `Person`.
- **Tags** — Etsy renders product tags as links in a `<div>` near the listing description. Select `a[href*="/search?q="]` links inside the tag container.
- **Images** — the JSON-LD `image` array lists the main product images as absolute URLs; no additional parsing is needed for those.
- **Variants** — size or color variants are embedded in a React state blob in `<script>` tags. The key is a JSON object keyed on `listingId` whose `variations` array describes each option and its price delta.

## Scaling beyond a few listings

Scraping Etsy at scale — monitoring thousands of competitor listings, tracking price changes over time, or building a trend-detection pipeline — requires rotating proxies, handling blocked responses, and absorbing layout updates without breaking your parser. Managing that infrastructure takes sustained effort that rarely shows up in a roadmap.

Bright Data's <a href="/goto/bd-ecommerce/" rel="sponsored noopener">e-commerce data collection tools</a> return structured listing data without you owning any of that infrastructure. For a broader look at what structured data extraction looks like across marketplaces, see the [Amazon Product Tracking](/solutions/amazon-product-tracking/) and [eBay Product Tracking](/solutions/ebay-product-tracking/) guides, or the [E-commerce Web Scraping Solutions](/solutions/ecommerce/) overview.

*Also see: [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/), and the [Web Scraping Use Cases](/solutions/web-scraping-use-cases/) overview for more context on marketplace intelligence.*

**<a href="/goto/bd-ecommerce/" rel="sponsored noopener">Scrape Etsy at scale with Bright Data →</a>**

## FAQ

### Is scraping Etsy legal?

Etsy's Terms of Use prohibit automated scraping of its platform. That said, US courts have generally held that automated collection of publicly visible, non-login-gated data is not a copyright violation on its own. The legal picture depends on your use case, data volume, and jurisdiction — always review the relevant terms and seek appropriate legal advice before deploying at scale.

### How does Etsy embed its product data?

Etsy injects a JSON-LD Product block into every public listing page inside a `<script type="application/ld+json">` tag. This block contains the listing name, description, price, currency, availability, and aggregate rating data. Because it is structured data aimed at search engine crawlers, it tends to be more stable than CSS selectors tied to the rendered layout.

### Why do Etsy scrapers get blocked so quickly?

Etsy fingerprints TLS handshakes, checks HTTP/2 settings, and responds to datacenter IP ranges with CAPTCHAs or empty pages. A residential or ISP proxy that presents a genuine household IP is usually required to retrieve listing pages reliably. The Bright Data Web Unlocker handles fingerprint rotation and CAPTCHA solving automatically.

### What Etsy data is publicly accessible without a login?

Listing title, description, price, currency, availability, primary and secondary images, aggregate star rating, review count, seller name, and product tags are all visible to anonymous visitors and present in the JSON-LD payload. Buyer identities, private messages, and draft listings require authentication and are off-limits for automated collection.
