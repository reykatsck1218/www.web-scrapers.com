+++
title = "How to Scrape Airbnb Listings: Property Data, Pricing, and Availability"
description = "Scrape Airbnb listing pages by parsing embedded JSON-LD property data, with ready-to-run code samples in PHP, Node.js, and Rust."
template = "page.html"
+++

Airbnb's public listing pages expose rich property metadata, nightly rates, availability calendars, and guest reviews — all visible to any logged-out visitor. That data is valuable for short-term rental market analysis, dynamic pricing benchmarks, travel aggregation, and investment research. This guide covers what you can realistically extract from public Airbnb pages, why standard HTTP clients fail almost immediately, and working code that parses structured listing data via the proxy layer that handles Airbnb's defenses.

## What public Airbnb pages expose

Every Airbnb listing page (`https://www.airbnb.com/rooms/<id>`) embeds two machine-readable data sources that don't require client-side JavaScript execution:

| Source | What it contains |
|--------|------------------|
| `<script type="application/ld+json">` | Property metadata: name, description, address, star rating, aggregate review score, images, amenity features |
| `<script id="__NEXT_DATA__" type="application/json">` | Full server-rendered page state including nightly pricing tiers, house rules, and host details |

The JSON-LD block uses `@type: "LodgingBusiness"` and is the most stable parsing target — Airbnb ships Next.js frontend updates frequently, but schema-driven structured data persists across redesigns. For pricing data, the `__NEXT_DATA__` object carries values loaded during server-side rendering, though its internal key path shifts between Airbnb deploys. The code samples below parse the JSON-LD block; pricing extraction is covered in [Notes](#notes).

## Use cases

- **Market analysis**: benchmark nightly rates across neighborhoods or property types for short-term rental investment decisions.
- **Dynamic pricing**: property managers monitor competitor listings to adjust their own rates in response to local supply and demand.
- **Travel aggregators**: surface availability and pricing from Airbnb alongside hotel data for comparison tools.
- **Academic research**: housing economists use Airbnb listing density and pricing as indicators of gentrification and housing market pressure.

## Why naive scrapers fail

Airbnb runs layered bot detection on top of its CDN. Several failure modes appear immediately:

- **Datacenter IP ranges are blocked outright.** Cloud provider subnets trigger 403s or CAPTCHA challenges before the listing page loads.
- **TLS fingerprinting.** Airbnb's edge validates cipher suite ordering and TLS extension patterns that distinguish scripted clients from real browsers.
- **Header and behavioral fingerprinting.** Unexpected header ordering or missing browser signals result in bot-detection interstitials rather than listing HTML.
- **Geo-restrictions.** Currency, availability presentation, and some content vary by request origin; an IP from outside the target region may return incomplete data.

See [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) and [proxy types explained](/learn/proxy-types-explained/) for background on these defenses.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

The samples below route all requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/), which handles CAPTCHA solving, browser fingerprint emulation, and IP rotation automatically. Supply your zone credentials in `PROXY_URL`.

> **No account yet?** [Explore the Airbnb data collector →](/goto/bd-airbnb/)

Listings are identified by their numeric room ID from the URL: `https://www.airbnb.com/rooms/<id>`.

## PHP

```php
<?php
// Run: php airbnb.php 12345678
$proxy  = getenv('PROXY_URL');
$roomId = $argv[1] ?? '12345678';

$ch = curl_init("https://www.airbnb.com/rooms/$roomId");
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

$listing = null;
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    if (($ld['@type'] ?? '') === 'LodgingBusiness') { $listing = $ld; break; }
}

$rating = $listing['aggregateRating'] ?? [];
$image  = is_array($listing['image'] ?? null) ? ($listing['image'][0] ?? null) : ($listing['image'] ?? null);

echo json_encode([
    'roomId'      => $roomId,
    'name'        => $listing['name']        ?? null,
    'description' => $listing['description'] ?? null,
    'address'     => $listing['address']     ?? null,
    'ratingValue' => $rating['ratingValue']  ?? null,
    'reviewCount' => $rating['reviewCount']  ?? null,
    'image'       => $image,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// airbnb.mjs — node airbnb.mjs 12345678
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent  = new HttpsProxyAgent(process.env.PROXY_URL);
const roomId = process.argv[2] ?? '12345678';

const { data: html } = await axios.get(
  `https://www.airbnb.com/rooms/${roomId}`,
  {
    httpsAgent: agent, proxy: false, timeout: 60_000,
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }
);

const $ = cheerio.load(html);
let listing = null;
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'LodgingBusiness') listing = ld;
  } catch { /* skip malformed blocks */ }
});

const rating = listing?.aggregateRating ?? {};
const image  = Array.isArray(listing?.image) ? listing.image[0] : listing?.image ?? null;

console.log(JSON.stringify({
  roomId,
  name:        listing?.name        ?? null,
  description: listing?.description ?? null,
  address:     listing?.address     ?? null,
  ratingValue: rating.ratingValue   ?? null,
  reviewCount: rating.reviewCount   ?? null,
  image,
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
    let room_id = std::env::args().nth(1).unwrap_or_else(|| "12345678".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.airbnb.com/rooms/{room_id}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();

    let mut listing = Value::Null;
    for el in doc.select(&sel) {
        let raw = el.text().collect::<String>();
        if let Ok(ld) = serde_json::from_str::<Value>(&raw) {
            if ld["@type"] == "LodgingBusiness" { listing = ld; break; }
        }
    }

    let rating = &listing["aggregateRating"];
    let image = match &listing["image"] {
        Value::Array(arr) => arr.first().cloned().unwrap_or(Value::Null),
        v => v.clone(),
    };

    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "roomId":      room_id,
        "name":        listing["name"],
        "description": listing["description"],
        "address":     listing["address"],
        "ratingValue": rating["ratingValue"],
        "reviewCount": rating["reviewCount"],
        "image":       image,
    }))?);
    Ok(())
}
```

## Notes

- **Pricing and availability** are not present in the JSON-LD block. They live in the `__NEXT_DATA__` embedded JSON (`<script id="__NEXT_DATA__" type="application/json">`). The exact key path to nightly pricing within that blob shifts between Airbnb frontend deploys, making it brittle to target directly — a dedicated Airbnb collector is more robust for pricing workloads.
- The `address` field returns a nested `PostalAddress` object with `streetAddress`, `addressLocality`, `addressRegion`, `addressCountry`, and `postalCode`. Extract whichever granularity you need.
- `image` may be a single URL string or an array of URL strings depending on the listing; the samples above normalize this to the first image URL.
- `aggregateRating` appears only on listings with at least one review; always check for null before reading `ratingValue` and `reviewCount`.
- `amenityFeature` is an array of `LocationFeatureSpecification` objects, each with `name` and `value`. Filter to `"value": true` to collect confirmed amenities (e.g. Wi-Fi, kitchen, parking).
- Airbnb's Terms of Service restrict bulk automated collection. For commercial applications, review the ToS and seek legal advice before deploying at scale. This guide targets technically accessible public data.

## Scaling for market analysis

Building a pricing dashboard, tracking nightly rate movements across a city, or refreshing availability for hundreds of listings requires stable residential IP rotation, CAPTCHA handling, and resilience against Airbnb's frequent anti-bot updates — infrastructure that compounds in maintenance cost quickly. Bright Data's [Airbnb data collector](/goto/bd-airbnb/) delivers structured listing data without managing any scraping layer; specify room IDs or geographic parameters and receive clean JSON. For bulk historical data, Bright Data's [pre-built datasets](/goto/bd-datasets/) cover Airbnb listing snapshots without real-time scraping overhead.

*See also the [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), [e-commerce scraping solutions overview](/solutions/ecommerce/), [Amazon product tracker](/solutions/amazon-product-tracking/), [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/), and [proxy types explained](/learn/proxy-types-explained/).*

**[Scrape Airbnb listings at scale with Bright Data →](/goto/bd-airbnb/)**
