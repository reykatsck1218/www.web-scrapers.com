+++
title = "How to Scrape Public Facebook Data: Pages and Marketplace Listings"
description = "Scrape public Facebook Pages and Marketplace listings by parsing embedded JSON-LD, with ready-to-run code samples in PHP, Node.js, and Rust."
template = "page.html"
+++

Public Facebook data — brand page details, business contact information, Marketplace prices, and public post activity — is valuable for competitive intelligence, lead generation, local-business research, and e-commerce pricing. This guide covers what you can realistically extract from Facebook **without authentication**, why naive scrapers fail almost immediately, and working code that parses structured entity data from public Facebook Pages.

## Public data vs. authenticated data

The boundary matters both technically and legally:

- **Public data** — Pages, Marketplace listings, and public posts visible to a logged-out visitor in a browser. This is the only appropriate target for automated collection.
- **Authenticated data** — personal profiles, private groups, News Feeds, friend lists, and anything requiring a login. Facebook's Terms of Service explicitly forbid automated access to the authenticated experience, and violations can trigger legal action under the CFAA and similar statutes.

Everything below targets **logged-out public pages only**. Facebook's ToS also restricts automated access to public pages; assess your use case against the current platform terms — and, for commercial applications, seek legal counsel — before deploying at scale. This guide is technical documentation, not legal advice.

## What public Facebook Pages expose

A public Facebook Page (`https://www.facebook.com/<slug>/`) embeds one or more `<script type="application/ld+json">` blocks that surface structured entity data. The `@type` value depends on the page category:

| Page type | JSON-LD `@type` |
|-----------|----------------|
| Business / brand | `Organization` |
| Restaurant / café | `Restaurant` |
| Retail shop | `Store` |
| Band / musician | `MusicGroup` |
| Sports team | `SportsTeam` |

Core fields available across types: `name`, `description`, `url`, `image`, `telephone`, and a structured `address` object (street address, city, postal code, country). This is the most reliable parsing target — CSS selectors break on every layout redesign, while JSON-LD stays stable because it is schema-driven rather than layout-driven.

Marketplace item pages (`/marketplace/item/<id>/`) sometimes carry a `Product` block with price and availability, but consistent access without a session cookie is unreliable — Facebook increasingly intercepts unrecognized requests with login prompts before the structured data loads.

## Why DIY Facebook scraping is hard

Facebook is among the most aggressively defended scraping targets on the web:

- **Datacenter IPs are blocked immediately.** Nearly all cloud provider ranges are flagged on first contact. You need [residential proxies](/goto/bd-residential/) that present as genuine consumer traffic from real ISPs.
- **Heavy client-side rendering.** The public Page shell often arrives with minimal content; the full JSON-LD block only appears after JavaScript hydration. A plain HTTP request typically returns a cookie-consent redirect or an empty skeleton.
- **Aggressive fingerprinting.** Facebook runs concurrent TLS fingerprint checks, browser-header validation, and behavioral analysis. Rotating bare proxies fails quickly at any meaningful volume.
- **Frequent markup changes.** Even when you reach a rendered page, hard-coded CSS selectors break on every redesign. Targeting JSON-LD insulates you from most of those changes.

See [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) and [proxy types explained](/learn/proxy-types-explained/) for deeper background on these defenses.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

The samples below route all requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/), which handles JavaScript rendering, fingerprint evasion, CAPTCHA solving, and IP rotation automatically. Supply your zone credentials in `PROXY_URL`.

> **No account yet?** [Explore the Facebook data collector →](/goto/bd-facebook/)

Pages are identified by their slug — the short name after `facebook.com/`. For well-known brands this is typically the brand name; for local businesses it may include a numeric ID suffix.

## PHP

```php
<?php
// Run: php facebook.php cocacola
$proxy = getenv('PROXY_URL');
$slug  = $argv[1] ?? 'cocacola';

$ch = curl_init("https://www.facebook.com/{$slug}/");
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

$entity   = null;
$orgTypes = ['Organization', 'LocalBusiness', 'Restaurant', 'Store', 'MusicGroup', 'SportsTeam'];
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    if (in_array($ld['@type'] ?? '', $orgTypes, true)) {
        $entity = $ld;
        break;
    }
}

echo json_encode([
    'slug'        => $slug,
    'type'        => $entity['@type']        ?? null,
    'name'        => $entity['name']         ?? null,
    'description' => $entity['description']  ?? null,
    'url'         => $entity['url']          ?? null,
    'telephone'   => $entity['telephone']    ?? null,
    'address'     => $entity['address']      ?? null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// facebook.mjs — node facebook.mjs cocacola
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const ORG_TYPES = new Set([
  'Organization', 'LocalBusiness', 'Restaurant',
  'Store', 'MusicGroup', 'SportsTeam',
]);

const agent = new HttpsProxyAgent(process.env.PROXY_URL);
const slug  = process.argv[2] ?? 'cocacola';

const { data: html } = await axios.get(`https://www.facebook.com/${slug}/`, {
  httpsAgent: agent, proxy: false, timeout: 60_000,
  headers: {
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
});

const $ = cheerio.load(html);
let entity = null;
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ORG_TYPES.has(ld['@type'])) entity = ld;
  } catch { /* skip malformed blocks */ }
});

console.log(JSON.stringify({
  slug,
  type:        entity?.['@type']      ?? null,
  name:        entity?.name           ?? null,
  description: entity?.description    ?? null,
  url:         entity?.url            ?? null,
  telephone:   entity?.telephone      ?? null,
  address:     entity?.address        ?? null,
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

const ORG_TYPES: &[&str] = &[
    "Organization", "LocalBusiness", "Restaurant",
    "Store", "MusicGroup", "SportsTeam",
];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let slug = std::env::args().nth(1).unwrap_or_else(|| "cocacola".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.facebook.com/{slug}/"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();

    let mut entity = Value::Null;
    'outer: for el in doc.select(&sel) {
        let raw = el.text().collect::<String>();
        if let Ok(ld) = serde_json::from_str::<Value>(&raw) {
            if let Some(t) = ld["@type"].as_str() {
                if ORG_TYPES.contains(&t) {
                    entity = ld;
                    break 'outer;
                }
            }
        }
    }

    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "slug":        slug,
        "type":        entity["@type"],
        "name":        entity["name"],
        "description": entity["description"],
        "url":         entity["url"],
        "telephone":   entity["telephone"],
        "address":     entity["address"],
    }))?);
    Ok(())
}
```

## Adapting to Marketplace listings

Marketplace item pages (`https://www.facebook.com/marketplace/item/<id>/`) sometimes embed a `Product` JSON-LD block. Swap the URL and update the type check:

```javascript
// Node.js snippet — Marketplace item
const { data: html } = await axios.get(
  `https://www.facebook.com/marketplace/item/${itemId}/`, opts
);
// then match ld['@type'] === 'Product'
// Available fields: name, offers.price, offers.priceCurrency, offers.availability
```

In practice, Marketplace redirects unrecognized sessions to a login prompt with increasing frequency, making consistent field-level extraction unreliable without a managed session. A dedicated collector handles session maintenance transparently and is significantly more robust for Marketplace at scale.

## Notes

- The `address` object follows schema.org's `PostalAddress` type: check `streetAddress`, `addressLocality`, `postalCode`, and `addressCountry`.
- Facebook sometimes embeds multiple JSON-LD blocks on a single Page. Iterate through all of them rather than stopping at the first, in case the entity block is not the first script tag.
- Pages in some categories — events, groups, fundraisers — do not follow the Organization/LocalBusiness schema and require a different parsing strategy.
- For GDPR/CCPA compliance, treat `description`, `telephone`, and `address` as potentially personal data when the Page belongs to a sole trader or named individual operating as a business.

## Scaling beyond a few pages

Monitoring hundreds of brand pages, tracking Marketplace pricing across categories, or collecting public post activity at scale means managing rotating IPs, JavaScript rendering infrastructure, session handling, and schema drift as Facebook updates its pages. Bright Data's [Facebook data collector](/goto/bd-facebook/) handles all of that — specify target pages or search queries and receive clean structured JSON on a schedule or via API. Pre-built [datasets](/goto/bd-datasets/) cover bulk historical snapshots without running a scraper from scratch.

*Related: [Instagram scraping guide](/solutions/instagram-scraping/), [LinkedIn scraping guide](/solutions/linkedin-scraping/), [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/), and [proxy types explained](/learn/proxy-types-explained/).*

**[Collect public Facebook data at scale →](/goto/bd-facebook/)**
