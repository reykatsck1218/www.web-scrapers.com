+++
title = "How to Scrape Booking.com: Hotel Rates and Reviews"
description = "Scrape Booking.com hotel prices, ratings, and property details from public pages by parsing JSON-LD and embedded JSON, with code in PHP, Node.js, and Rust."
template = "page.html"
date = 2026-07-20
[extra]
og_image = "assets/og/solutions-booking-scraping.png"
+++

Booking.com publishes an enormous volume of hotel and accommodation data — nightly rates, cancellation policies, star ratings, guest reviews, room types, and availability windows — that powers competitive pricing analysis, travel market intelligence, and OTA monitoring. The challenge is that Booking.com defends its listings aggressively: DataDome-backed bot detection rejects datacenter IPs before any useful content loads, and geo-sensitive pricing means the same URL returns different rates depending on where the request originates.

This guide covers the structured data embedded in public listing pages and provides working code that retrieves it through a rendering-capable proxy layer.

## What public Booking.com property pages expose

Every property page at `https://www.booking.com/hotel/<country>/<slug>.html` — visible to a logged-out visitor — contains two machine-readable sources in the rendered HTML:

| Source | How to find it | What it contains |
|--------|---------------|-----------------|
| JSON-LD (`application/ld+json`) | `<script>` tags | Property name, address, star rating, aggregate review score, amenity list, price range, images |
| Embedded page state | `<script>` tag with inline JSON | Room type details, availability flags, offer prices, cancellation rules |

The JSON-LD block carries schema.org `Hotel` (or `LodgingBusiness`) structured data and is the most stable parsing target — Booking.com updates its embedded JSON keys silently and frequently, while JSON-LD schema shapes change far less often.

## Why naive scrapers fail on Booking.com

- **DataDome bot protection.** Booking.com uses DataDome, a dedicated bot management layer that scores requests by IP reputation, TLS fingerprint, header consistency, and behavioral signals. Datacenter ranges are blocked immediately.
- **JavaScript rendering required.** Room-level pricing and availability data is injected after page hydration. A plain HTTP client sees the shell, not the content.
- **Geo-IP pricing.** Rates are personalised by visitor country and currency. Requests through IPs from different regions will return different prices — scraping without geo-targeted proxies produces a mix of incoherent rates.
- **Aggressive session tracking.** Booking.com correlates requests by cookie, referer, and timing patterns. High-volume collection without realistic browsing cadence triggers rate limits and CAPTCHAs.

See [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) and [proxy types explained](/learn/proxy-types-explained/) for deeper background on each of these defences.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

The samples below route all requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/), which handles JavaScript rendering, DataDome/CAPTCHA mitigation, browser fingerprint emulation, and residential IP rotation automatically. Supply your zone credentials in `PROXY_URL`.

> **No Bright Data account yet?** <a href="/goto/bd-booking/" rel="sponsored noopener">Explore the Booking.com data collector →</a>

Property slugs appear in the URL: `https://www.booking.com/hotel/gb/premier-inn-london-city.html` → country `gb`, slug `premier-inn-london-city`.

## PHP

```php
<?php
// Run: php booking.php gb premier-inn-london-city
$proxy   = getenv('PROXY_URL');
$country = $argv[1] ?? 'gb';
$slug    = $argv[2] ?? 'premier-inn-london-city';

$ch = curl_init("https://www.booking.com/hotel/$country/$slug.html");
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

// JSON-LD — Hotel or LodgingBusiness (most stable target)
$hotel = null;
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    $type = $ld['@type'] ?? '';
    if ($type === 'Hotel' || $type === 'LodgingBusiness') { $hotel = $ld; break; }
}

$rating = $hotel['aggregateRating'] ?? [];
echo json_encode([
    'slug'           => $slug,
    'name'           => $hotel['name']         ?? null,
    'description'    => $hotel['description']  ?? null,
    'priceRange'     => $hotel['priceRange']   ?? null,
    'starRating'     => $hotel['starRating']   ?? null,
    'reviewScore'    => $rating['ratingValue'] ?? null,
    'reviewCount'    => $rating['reviewCount'] ?? null,
    'address'        => $hotel['address']      ?? null,
    'amenityCount'   => count($hotel['amenityFeature'] ?? []),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
```

## Node.js

```javascript
// booking.mjs — node booking.mjs gb premier-inn-london-city
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent   = new HttpsProxyAgent(process.env.PROXY_URL);
const country = process.argv[2] ?? 'gb';
const slug    = process.argv[3] ?? 'premier-inn-london-city';

const { data: html } = await axios.get(
  `https://www.booking.com/hotel/${country}/${slug}.html`,
  {
    httpsAgent: agent, proxy: false, timeout: 60_000,
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }
);

const $ = cheerio.load(html);

// JSON-LD — Hotel or LodgingBusiness
let hotel = null;
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'Hotel' || ld['@type'] === 'LodgingBusiness') hotel = ld;
  } catch { /* skip malformed blocks */ }
});

const rating = hotel?.aggregateRating ?? {};
console.log(JSON.stringify({
  slug,
  name:         hotel?.name         ?? null,
  description:  hotel?.description  ?? null,
  priceRange:   hotel?.priceRange   ?? null,
  starRating:   hotel?.starRating   ?? null,
  reviewScore:  rating.ratingValue  ?? null,
  reviewCount:  rating.reviewCount  ?? null,
  address:      hotel?.address      ?? null,
  amenityCount: (hotel?.amenityFeature ?? []).length,
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
    let mut args = std::env::args().skip(1);
    let country = args.next().unwrap_or_else(|| "gb".into());
    let slug    = args.next().unwrap_or_else(|| "premier-inn-london-city".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.booking.com/hotel/{country}/{slug}.html"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();

    let mut hotel = Value::Null;
    for el in doc.select(&sel) {
        let raw = el.text().collect::<String>();
        if let Ok(ld) = serde_json::from_str::<Value>(&raw) {
            let t = ld["@type"].as_str().unwrap_or("");
            if t == "Hotel" || t == "LodgingBusiness" { hotel = ld; break; }
        }
    }

    let rating = &hotel["aggregateRating"];
    let amenity_count = hotel["amenityFeature"]
        .as_array()
        .map(|a| a.len())
        .unwrap_or(0);

    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "slug":         slug,
        "name":         hotel["name"],
        "description":  hotel["description"],
        "priceRange":   hotel["priceRange"],
        "starRating":   hotel["starRating"],
        "reviewScore":  rating["ratingValue"],
        "reviewCount":  rating["reviewCount"],
        "address":      hotel["address"],
        "amenityCount": amenity_count,
    }))?);
    Ok(())
}
```

## Notes

- Booking.com uses both `Hotel` and `LodgingBusiness` as the JSON-LD `@type` depending on property category (apartments, hostels, and resorts often get `LodgingBusiness`). The code above checks both — scan all JSON-LD blocks if your match rate seems low.
- `starRating` in the JSON-LD is the official category rating (1–5 stars); `aggregateRating.ratingValue` is the guest review score, typically on a 1–10 scale. Track both — they measure different things.
- Room-level pricing (per-room, per-night rates) and granular availability calendars are not reliably present in JSON-LD. They appear in the rendered DOM after hydration, often in embedded JSON objects whose key paths Booking.com updates without notice. Wrap all embedded JSON access in `try/catch` and monitor for schema drift.
- Geo-IP pricing is significant on Booking.com. Use geo-targeted proxies from the traveller's target market to retrieve market-relevant rates. See [proxy types explained](/learn/proxy-types-explained/) for ISP and residential options.
- Booking.com's Terms of Service restricts automated access. This guide is technical documentation — seek appropriate legal counsel before deploying a scraper commercially.

## Scaling for rate monitoring and market analysis

Tracking nightly rates across hundreds of properties, monitoring availability windows for a market, or powering a price alert system demands more than a single scraper: residential IP rotation, CAPTCHA handling, geo-targeted sessions, and resilience against silent schema changes all compound quickly. Bright Data's <a href="/goto/bd-booking/" rel="sponsored noopener">Booking.com data collector</a> abstracts that infrastructure and delivers clean structured property and pricing data on demand.

*Related: [Airbnb scraping guide](/solutions/airbnb-scraping/), [e-commerce scraping overview](/solutions/ecommerce/), [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/), and [proxy types explained](/learn/proxy-types-explained/).*

**<a href="/goto/bd-booking/" rel="sponsored noopener">Collect Booking.com data at scale →</a>**
