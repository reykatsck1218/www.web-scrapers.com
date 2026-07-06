+++
title = "How to Scrape Airbnb Listings: Pricing, Availability, and Property Data"
description = "Scrape Airbnb listing prices and property details by parsing JSON-LD and embedded JSON from public pages, with ready-to-run code in PHP, Node.js, and Rust."
template = "page.html"
+++

Airbnb listing data — nightly rates, property specs, star ratings, and host details — powers short-term rental market analysis, investment due diligence, and competitive pricing in the vacation rental industry. The challenge is that Airbnb is a React/Next.js single-page application: raw HTML responses are skeletal, most content is injected client-side, and datacenter IPs are blocked before any useful content loads.

This guide covers the two structured data sources embedded in public listing pages and provides working code that retrieves them through a rendering-capable proxy layer.

## What public Airbnb listing pages expose

Every listing at `https://www.airbnb.com/rooms/<listingId>` — visible to a logged-out visitor — carries two machine-readable data sources in the rendered HTML:

| Source | How to find it | What it contains |
|--------|---------------|-----------------|
| JSON-LD (`application/ld+json`) | `<script>` tags | Property name, description, address, star rating, price range, images |
| Next.js page state (`__NEXT_DATA__`) | `<script id="__NEXT_DATA__">` | Full pricing details, amenities, host info, review counts |

The JSON-LD block carries schema.org `LodgingBusiness` structured data and is the most stable parsing target — it changes infrequently relative to the `__NEXT_DATA__` object, whose internal key paths Airbnb updates silently. Both sources require a **fully rendered page** because Airbnb's initial server response is intentionally minimal.

## Why naive scrapers fail on Airbnb

- **Instant datacenter IP blocks.** Airbnb's CDN rejects cloud provider IP ranges on the first request. Residential or ISP proxies are the minimum viable starting point.
- **Browser fingerprinting.** Requests without realistic TLS parameters and browser-consistent headers receive empty shells or redirects, regardless of IP quality.
- **JavaScript rendering required.** The useful structured data — including the `__NEXT_DATA__` pricing payload — appears only after React hydration completes. A plain HTTP client fetches the shell, not the content.
- **Aggressive rate limiting.** At meaningful volume, even good proxies trigger rate limits and CAPTCHA challenges without additional mitigation.

See [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) and [proxy types explained](/learn/proxy-types-explained/) for deeper background on each of these defenses.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

The samples below route all requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/), which handles JavaScript rendering, browser fingerprinting, CAPTCHA solving, and residential IP rotation automatically. Supply your zone credentials in `PROXY_URL`.

> **No Bright Data account yet?** [Explore the Airbnb data collector →](/goto/bd-airbnb/)

Listings are identified by their numeric ID from the URL: `https://www.airbnb.com/rooms/12345678`.

## PHP

```php
<?php
// Run: php airbnb.php 12345678
$proxy     = getenv('PROXY_URL');
$listingId = $argv[1] ?? '12345678';

$ch = curl_init("https://www.airbnb.com/rooms/$listingId");
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

// 1. JSON-LD — LodgingBusiness (most stable)
$lodging = null;
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    if (($ld['@type'] ?? '') === 'LodgingBusiness') { $lodging = $ld; break; }
}

// 2. __NEXT_DATA__ — richer pricing/availability payload
$nextData = null;
$nextNode = $xp->query('//script[@id="__NEXT_DATA__"]')->item(0);
if ($nextNode) {
    $nextData = json_decode($nextNode->textContent, true);
}

$rating = $lodging['starRating'] ?? [];
echo json_encode([
    'listingId'   => $listingId,
    'name'        => $lodging['name']        ?? null,
    'description' => $lodging['description'] ?? null,
    'priceRange'  => $lodging['priceRange']  ?? null,
    'starRating'  => is_array($rating) ? ($rating['ratingValue'] ?? null) : null,
    'address'     => $lodging['address']     ?? null,
    // Drill into $nextData['props']['pageProps'] for nightly rates; key paths vary
    'hasNextData' => $nextData !== null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
```

## Node.js

```javascript
// airbnb.mjs — node airbnb.mjs 12345678
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent     = new HttpsProxyAgent(process.env.PROXY_URL);
const listingId = process.argv[2] ?? '12345678';

const { data: html } = await axios.get(
  `https://www.airbnb.com/rooms/${listingId}`,
  {
    httpsAgent: agent, proxy: false, timeout: 60_000,
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }
);

const $ = cheerio.load(html);

// 1. JSON-LD — LodgingBusiness
let lodging = null;
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'LodgingBusiness') lodging = ld;
  } catch { /* skip malformed blocks */ }
});

// 2. __NEXT_DATA__ — nightly rates nested under props.pageProps
let nextData = null;
try { nextData = JSON.parse($('#__NEXT_DATA__').text()); } catch { /* not present */ }

const rating = lodging?.starRating ?? {};
console.log(JSON.stringify({
  listingId,
  name:        lodging?.name        ?? null,
  description: lodging?.description ?? null,
  priceRange:  lodging?.priceRange  ?? null,
  starRating:  typeof rating === 'object' ? (rating.ratingValue ?? null) : null,
  address:     lodging?.address     ?? null,
  hasNextData: nextData !== null,
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
    let listing_id = std::env::args().nth(1).unwrap_or_else(|| "12345678".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.airbnb.com/rooms/{listing_id}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);

    // 1. JSON-LD — LodgingBusiness
    let ld_sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();
    let mut lodging = Value::Null;
    for el in doc.select(&ld_sel) {
        let raw = el.text().collect::<String>();
        if let Ok(ld) = serde_json::from_str::<Value>(&raw) {
            if ld["@type"] == "LodgingBusiness" { lodging = ld; break; }
        }
    }

    // 2. __NEXT_DATA__
    let next_sel = Selector::parse(r#"script[id="__NEXT_DATA__"]"#).unwrap();
    let has_next_data = doc
        .select(&next_sel)
        .next()
        .and_then(|el| {
            let raw = el.text().collect::<String>();
            serde_json::from_str::<Value>(&raw).ok()
        })
        .is_some();

    let star = match &lodging["starRating"] {
        obj if obj.is_object() => obj["ratingValue"].clone(),
        _ => Value::Null,
    };

    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "listingId":   listing_id,
        "name":        lodging["name"],
        "description": lodging["description"],
        "priceRange":  lodging["priceRange"],
        "starRating":  star,
        "address":     lodging["address"],
        "hasNextData": has_next_data,
    }))?);
    Ok(())
}
```

## Extracting nightly prices from __NEXT_DATA__

The `__NEXT_DATA__` object carries richer pricing detail than JSON-LD — including the nightly rate, cleaning fee, and service fee breakdown — but its internal structure is volatile. Airbnb ships key renames and tree reorganizations without notice, and the shape differs across A/B experiments and locales. The practical approach is to walk the object searching for a node whose fields indicate pricing intent:

```javascript
// Node.js — walk __NEXT_DATA__ for a price node
function findPriceNode(obj, depth = 0) {
  if (depth > 10 || obj === null || typeof obj !== 'object') return null;
  if (obj.price && typeof obj.price === 'string' && obj.currency) return obj;
  for (const v of Object.values(obj)) {
    const hit = findPriceNode(Array.isArray(v) ? { ...v } : v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

const priceNode = nextData ? findPriceNode(nextData) : null;
console.log('price node:', priceNode);
```

Treat this path as structurally fragile. Wrap all `__NEXT_DATA__` access in `try/catch`, log parse failures, and set up monitoring to catch schema drift early.

## Notes

- Airbnb listing IDs are stable identifiers. They appear in the URL (`/rooms/<id>`) and in the JSON-LD `@id` field — use them as your primary deduplication key.
- Some property types (boutique hotels, resort units) surface as `Hotel` or `Resort` rather than `LodgingBusiness` — scan all JSON-LD blocks and check multiple `@type` values if your count seems low.
- Availability calendars are not included in JSON-LD or `__NEXT_DATA__`; Airbnb fetches them via a separate async API call. Intercepting that request within a rendering session, or using Airbnb's public iCal export where available, are the practical paths for date-level availability.
- Host names and profile photos are potentially personal data under GDPR and CCPA even when posted publicly. Apply appropriate data handling practices.
- Airbnb's Terms of Service restricts automated access to its platform. This guide is technical documentation; seek legal counsel before deploying a scraper commercially.

## Scaling for market analysis

Monitoring nightly rates across hundreds of properties, tracking seasonal availability patterns, or building a city-level supply-and-demand model requires more than a scraper: IP rotation, JavaScript rendering infrastructure, CAPTCHA handling, and structural-change monitoring all compound quickly. Bright Data's [Airbnb data collector](/goto/bd-airbnb/) abstracts that entire layer and delivers clean structured listing data on demand. For large historical market datasets, pre-built [datasets](/goto/bd-datasets/) are often faster to acquire than bootstrapping a scraper from scratch.

*Related: [e-commerce scraping overview](/solutions/ecommerce/), [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/), and [proxy types explained](/learn/proxy-types-explained/).*

**[Collect Airbnb listing data at scale →](/goto/bd-airbnb/)**
