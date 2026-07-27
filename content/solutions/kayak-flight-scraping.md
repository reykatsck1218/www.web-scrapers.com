+++
title = "How to Scrape Kayak Flight Prices: Search Data and Dynamic Pricing"
description = "Scrape Kayak flight search results by parsing embedded JSON from fully rendered pages, with working code samples in PHP, Node.js, and Rust."
template = "page.html"
+++

Kayak aggregates flight prices from airlines and booking platforms — making it one of the richest real-time sources for dynamic pricing analysis, route benchmarking, and fare monitoring. The challenge is that Kayak is a React-rendered single-page application that loads results asynchronously and employs aggressive bot detection at the CDN layer.

This guide covers the structured data sources embedded in public Kayak search pages and provides working code that retrieves them through a rendering-capable proxy layer.

## What public Kayak flight search pages expose

A Kayak one-way search at `https://www.kayak.com/flights/{ORIGIN}-{DEST}/{DATE}` — visible to any browser without a login — delivers flight results through two machine-readable paths:

| Source | How to find it | What it contains |
|--------|---------------|-----------------|
| JSON-LD (`application/ld+json`) | `<script>` tags | BreadcrumbList, SearchResultsPage metadata; occasionally FlightReservation nodes |
| Next.js page state (`__NEXT_DATA__`) | `<script id="__NEXT_DATA__">` | Initial search context, result summaries, price nodes |

The embedded page state is the data-rich source but its internal key paths are updated silently. JSON-LD blocks are sparser — capturing breadcrumb and page context rather than per-itinerary price detail — but are structurally more stable. For per-flight price extraction, reading the rendered DOM after full JavaScript execution is the most reliable approach; the proxy layer described below handles that rendering automatically.

## Why naive scrapers fail on Kayak

- **CDN-level IP blocking.** Kayak's infrastructure blocks cloud and datacenter IP ranges before any useful content loads. Even simple HEAD requests from provider IP blocks return 403s or redirect loops.
- **JavaScript rendering required.** Flight results are injected by React after the initial page load. A plain HTTP GET returns a skeletal HTML shell — prices, airline names, and departure times are absent until the application hydrates.
- **Strict bot scoring.** Kayak evaluates TLS fingerprints, user-agent consistency, and behavioural signals in combination. Realistic browser emulation — not just header-setting — is required to receive rendered result pages.
- **Dynamic search sessions.** Each search generates an internal session identifier used for subsequent data calls. Reusing or replaying session tokens does not work without the full session context established by the initial render.

See [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) and [proxy types explained](/learn/proxy-types-explained/) for deeper background on each of these defences.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

The samples below route all requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/), which handles JavaScript rendering, browser fingerprint emulation, CAPTCHA solving, and residential IP rotation automatically. Supply your zone credentials in `PROXY_URL`.

> **No Bright Data account yet?** [Explore the Kayak flight data collector →](/goto/bd-kayak/)

Search URLs follow the pattern `https://www.kayak.com/flights/{ORIGIN}-{DEST}/{DATE}` for one-way and `https://www.kayak.com/flights/{ORIGIN}-{DEST}/{OUTBOUND}/{RETURN}` for round trips, using IATA airport codes.

## PHP

```php
<?php
// Run: php kayak.php NYC LAX 2026-09-15
$proxy  = getenv('PROXY_URL');
$origin = strtoupper($argv[1] ?? 'NYC');
$dest   = strtoupper($argv[2] ?? 'LAX');
$date   = $argv[3] ?? date('Y-m-d', strtotime('+30 days'));

$ch = curl_init("https://www.kayak.com/flights/$origin-$dest/$date");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_PROXY          => $proxy,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_TIMEOUT        => 90,
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

// 1. JSON-LD blocks (BreadcrumbList, SearchResultsPage, FlightReservation)
$ldBlocks = [];
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    if ($ld !== null) $ldBlocks[] = $ld;
}

// 2. Next.js embedded state — initial search context and result summaries
$nextData = null;
$nextNode = $xp->query('//script[@id="__NEXT_DATA__"]')->item(0);
if ($nextNode) {
    $nextData = json_decode($nextNode->textContent, true);
}

echo json_encode([
    'route'    => "$origin → $dest",
    'date'     => $date,
    'ldTypes'  => array_column($ldBlocks, '@type'),
    'ldBlocks' => $ldBlocks,
    'hasState' => $nextData !== null,
    // Drill into $nextData['props']['pageProps'] for result nodes and price data
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// kayak.mjs — node kayak.mjs NYC LAX 2026-09-15
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const proxyAgent = new HttpsProxyAgent(process.env.PROXY_URL);
const origin     = (process.argv[2] ?? 'NYC').toUpperCase();
const dest       = (process.argv[3] ?? 'LAX').toUpperCase();
const date       = process.argv[4]
  ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

const { data: html } = await axios.get(
  `https://www.kayak.com/flights/${origin}-${dest}/${date}`,
  {
    httpsAgent: proxyAgent, proxy: false, timeout: 90_000,
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }
);

const $ = cheerio.load(html);

// 1. JSON-LD blocks
const ldBlocks = [];
$('script[type="application/ld+json"]').each((_, el) => {
  try { ldBlocks.push(JSON.parse($(el).text())); } catch { /* skip malformed */ }
});

// 2. __NEXT_DATA__ — initial page state
let nextData = null;
try { nextData = JSON.parse($('#__NEXT_DATA__').text()); } catch { /* not present */ }

console.log(JSON.stringify({
  route:    `${origin} → ${dest}`,
  date,
  ldTypes:  ldBlocks.map(b => b['@type']),
  ldBlocks,
  hasState: nextData !== null,
  // nextData?.props?.pageProps contains the search context and result structure
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
    let origin = args.next().unwrap_or_else(|| "NYC".into()).to_uppercase();
    let dest   = args.next().unwrap_or_else(|| "LAX".into()).to_uppercase();
    let date   = args.next().unwrap_or_else(|| "2026-09-15".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.kayak.com/flights/{origin}-{dest}/{date}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);

    // 1. JSON-LD blocks
    let ld_sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();
    let ld_blocks: Vec<Value> = doc
        .select(&ld_sel)
        .filter_map(|el| {
            let raw = el.text().collect::<String>();
            serde_json::from_str::<Value>(&raw).ok()
        })
        .collect();

    // 2. __NEXT_DATA__ — initial page state
    let next_sel = Selector::parse(r#"script[id="__NEXT_DATA__"]"#).unwrap();
    let next_data: Option<Value> = doc
        .select(&next_sel)
        .next()
        .and_then(|el| {
            let raw = el.text().collect::<String>();
            serde_json::from_str::<Value>(&raw).ok()
        });

    let ld_types: Vec<&Value> = ld_blocks.iter().map(|b| &b["@type"]).collect();

    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "route":    format!("{origin} → {dest}"),
        "date":     date,
        "ldTypes":  ld_types,
        "ldBlocks": ld_blocks,
        "hasState": next_data.is_some(),
        // next_data["props"]["pageProps"] contains result nodes and pricing data
    }))?);
    Ok(())
}
```

## Navigating the __NEXT_DATA__ result structure

The `__NEXT_DATA__` object carries Kayak's initial search state, including result summaries loaded at page render time. Once you confirm it is present, walk the `props.pageProps` subtree to find price-bearing objects — typically nodes containing fields like `price`, `airline`, `duration`, and `stops`. The exact key paths vary across Kayak's A/B experiments and change silently across deploys:

```javascript
// Node.js — walk pageProps for flight price nodes
function findFlightNodes(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return [];
  if (obj.price && obj.airline && obj.duration) return [obj];
  return Object.values(obj).flatMap(v =>
    findFlightNodes(Array.isArray(v) ? Object.assign({}, v) : v, depth + 1)
  );
}

const pageProps = nextData?.props?.pageProps ?? {};
const flights   = findFlightNodes(pageProps);
console.log('flight nodes found:', flights.length);
console.log(JSON.stringify(flights.slice(0, 3), null, 2));
```

Wrap all `__NEXT_DATA__` access in `try/catch`, log extraction failures, and set up structural monitoring — Kayak ships silent key renames across deploys with no versioning signal.

## Notes

- IATA airport codes must be three-letter codes for specific airports, or metro-area codes like `NYC` (covers JFK, LGA, EWR) and `LON` for broad searches.
- Round-trip searches use `https://www.kayak.com/flights/{ORIGIN}-{DEST}/{OUTBOUND}/{RETURN}`; multi-city itineraries use a different URL scheme.
- Prices shown on Kayak are quotes from OTAs and airlines at the moment of the search. Actual booking prices can differ — treat scraped fares as reference benchmarks.
- Add realistic delays between searches at scale. High request velocity triggers escalating CAPTCHA challenges even through quality proxies.
- Kayak's Terms of Service restricts automated access to its platform. This guide is technical documentation — seek appropriate legal counsel before deploying a scraper commercially.

## Scaling for fare monitoring and competitive analysis

Tracking prices across hundreds of routes, running daily market benchmarks, or building fare-alert systems demands more than a one-off scraper: residential IP rotation, session management, rendering infrastructure, and schema-change monitoring all compound quickly. Bright Data's [Kayak flight data collector](/goto/bd-kayak/) abstracts that entire layer and delivers clean structured flight and pricing data on demand, without the maintenance overhead of a hand-rolled scraper.

*Related: [Airbnb scraping guide](/solutions/airbnb-scraping/), [Booking.com scraping guide](/solutions/booking-scraping/), [e-commerce scraping overview](/solutions/ecommerce/), [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/), and [proxy types explained](/learn/proxy-types-explained/).*

**[Collect Kayak flight data at scale →](/goto/bd-kayak/)**
