+++
title = "Scrape Zillow Listings: Prices & Property Data"
description = "Extract Zillow property listings, prices, bedroom counts, and details from embedded Next.js JSON with working PHP, Node.js, and Rust scrapers."
template = "page.html"
date = 2026-09-21
[extra]
faq = [
  { q = "Is scraping Zillow legal?", a = "Zillow's Terms of Service prohibit automated scraping of its data, and its listing data is licensed from MLSs under contracts that carry their own restrictions. That said, court decisions in the US have generally held that automated collection of publicly visible, non-login-gated data is not a copyright or CFAA violation on its own. The legal picture depends heavily on your use case, jurisdiction, and data volume — always review the relevant ToS and seek legal advice before deploying at scale." },
  { q = "How does Zillow embed its listing data?", a = "Zillow property pages are built with Next.js and embed a complete JSON payload in a <script id='__NEXT_DATA__' type='application/json'> tag. This block contains all the data the page needs to render, including price, beds, baths, square footage, lot size, and listing status, without requiring a separate API call. It is far more stable than scraping rendered HTML with CSS selectors." },
  { q = "Why do Zillow scrapers get blocked?", a = "Zillow geo-targets aggressively and returns soft-blocked or incomplete responses to datacenter IP ranges. It also fingerprints TLS handshakes and HTTP/2 settings to detect scraping clients. Residential proxies that present genuine household IPs are the most effective way to avoid these blocks." },
  { q = "What Zillow data is publicly accessible without a login?", a = "Listing price, address, beds, baths, square footage, lot size, year built, listing status (For Sale / For Rent / Sold), days on market, price history, photos, and the Zestimate are all visible to anonymous visitors and are present in the __NEXT_DATA__ payload." },
]
+++

Zillow is the dominant US real estate marketplace — used by investors to track price trends, landlords to benchmark rental rates, and analysts to study housing market shifts. Its listing pages expose rich structured data including prices, bedroom and bathroom counts, lot sizes, tax history, and Zestimates. The good news is that Zillow, like most Next.js applications, embeds all this data in a single JSON payload in the page HTML, making it far more reliable to extract than scraping CSS selectors through a rendered DOM.

This guide explains where that data lives, why plain HTTP clients still fail without the right proxy setup, and provides working code samples in PHP, Node.js, and Rust that fetch through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) and parse the embedded JSON.

## Public listing data vs. account data

Zillow does not require a login to browse listings, and everything a visitor can see on a property page counts as public data for scraping purposes:

- **Public** — list price, address, beds/baths, square footage, lot size, year built, listing status, days on market, price history, photos, and the Zestimate.
- **Gated** — saved searches, agent contacts, Zillow Offers pricing for your own home, and mortgage pre-approval data all require an account and are off-limits for automated collection.

The code samples below only target the public, anonymous view. Zillow's Terms of Service restrict automated collection even of public data for commercial purposes — review the relevant terms and seek appropriate advice before deploying at scale.

## Where the data lives: `__NEXT_DATA__`

Zillow property detail pages are built with Next.js, which renders each page server-side and injects a complete JSON snapshot into:

```html
<script id="__NEXT_DATA__" type="application/json">{ … }</script>
```

The top-level structure is:

```
__NEXT_DATA__
  └── props
        └── pageProps
              └── gdpClientCache   ← JSON-encoded string (double-encoded)
```

`gdpClientCache` is itself a JSON-encoded string that must be parsed a second time. After that second parse, its keys are hash-prefixed strings (one per listing on the page), and each value has a `property` object containing the full listing record: `price`, `bedrooms`, `bathrooms`, `livingArea`, `lotAreaValue`, `yearBuilt`, `homeStatus`, `daysOnZillow`, `zestimate`, and much more.

This structure has been stable across Zillow's design iterations because it is a build-time artifact, not rendered markup.

## Why plain HTTP clients fail

Even though the data is embedded in HTML, a naive `curl` or bare `fetch` call typically returns one of:

- A **403** with a `cf-ray` header — Cloudflare blocking the datacenter IP.
- A **200** with a captcha or "Something went wrong" page — a soft block served specifically to scrapers.
- A **200** with a stripped-down HTML response lacking the `__NEXT_DATA__` block entirely.

Zillow applies geo-targeted IP blocking (datacenter ranges fail almost immediately), TLS fingerprinting (default library TLS stacks are identified and throttled), and HTTP/2 header order checks. Routing through a residential proxy that presents genuine household-level IPs resolves all three vectors.

<a href="/goto/bd-residential/" rel="sponsored noopener">Bright Data's residential proxy network</a> covers IPs across every US state and city, which is useful for Zillow because its listing results and pricing can vary by the apparent geographic origin of the request.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<residential_zone>:<password>@brd.superproxy.io:22225"
```

> **No Bright Data account yet?** <a href="/goto/bd-residential/" rel="sponsored noopener">Get started with residential proxies →</a>

The property URL format is:

```
https://www.zillow.com/homedetails/<address-slug>/<zpid>_zpid/
```

Replace the URL in the samples with any live Zillow property URL.

## PHP

```php
<?php
// Run: php zillow.php "https://www.zillow.com/homedetails/123-main-st-anytown-ca-90210/12345678_zpid/"
$proxy = getenv('PROXY_URL');
$url   = $argv[1] ?? 'https://www.zillow.com/homedetails/1-bedrooms/1_zpid/';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_PROXY          => $proxy,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_HTTPHEADER     => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ],
]);
$html = curl_exec($ch);
curl_close($ch);

// Extract the __NEXT_DATA__ JSON block embedded by Next.js.
$doc = new DOMDocument();
@$doc->loadHTML($html);
$xp = new DOMXPath($doc);

$nextDataJson = null;
foreach ($xp->query('//script[@id="__NEXT_DATA__"]') as $node) {
    $nextDataJson = $node->textContent;
    break;
}

if (!$nextDataJson) { fwrite(STDERR, "No __NEXT_DATA__ block found — page may be blocked.\n"); exit(1); }

$nextData  = json_decode($nextDataJson, true);
$gdpRaw    = $nextData['props']['pageProps']['gdpClientCache'] ?? null;
if (!$gdpRaw) { fwrite(STDERR, "gdpClientCache missing from payload.\n"); exit(1); }

$gdpCache  = json_decode($gdpRaw, true);
$firstKey  = array_key_first($gdpCache);
$property  = $gdpCache[$firstKey]['property'] ?? [];

echo json_encode([
    'zpid'        => $property['zpid']          ?? null,
    'address'     => $property['streetAddress'] ?? null,
    'city'        => $property['city']          ?? null,
    'state'       => $property['state']         ?? null,
    'zipcode'     => $property['zipcode']       ?? null,
    'price'       => $property['price']         ?? null,
    'bedrooms'    => $property['bedrooms']      ?? null,
    'bathrooms'   => $property['bathrooms']     ?? null,
    'living_area' => $property['livingArea']    ?? null,
    'year_built'  => $property['yearBuilt']     ?? null,
    'home_status' => $property['homeStatus']    ?? null,
    'zestimate'   => $property['zestimate']     ?? null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// zillow.mjs — node zillow.mjs <url>
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent = new HttpsProxyAgent(process.env.PROXY_URL);
const url   = process.argv[2] ?? 'https://www.zillow.com/homedetails/1-bedrooms/1_zpid/';

const { data: html } = await axios.get(url, {
  httpsAgent: agent,
  proxy: false,
  timeout: 60_000,
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
});

const $ = cheerio.load(html);
const rawJson = $('#__NEXT_DATA__').text();

if (!rawJson) throw new Error('No __NEXT_DATA__ block — page may be blocked');

const nextData = JSON.parse(rawJson);
const gdpCache = JSON.parse(nextData.props.pageProps.gdpClientCache);
const firstKey = Object.keys(gdpCache)[0];
const property = gdpCache[firstKey].property ?? {};

console.log(JSON.stringify({
  zpid:        property.zpid          ?? null,
  address:     property.streetAddress ?? null,
  city:        property.city          ?? null,
  state:       property.state         ?? null,
  zipcode:     property.zipcode       ?? null,
  price:       property.price         ?? null,
  bedrooms:    property.bedrooms      ?? null,
  bathrooms:   property.bathrooms     ?? null,
  living_area: property.livingArea    ?? null,
  year_built:  property.yearBuilt     ?? null,
  home_status: property.homeStatus    ?? null,
  zestimate:   property.zestimate     ?? null,
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
    let url = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "https://www.zillow.com/homedetails/1-bedrooms/1_zpid/".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let sel = Selector::parse(r#"script#__NEXT_DATA__"#).unwrap();

    let raw_json = doc
        .select(&sel)
        .next()
        .ok_or("No __NEXT_DATA__ block — page may be blocked")?
        .text()
        .collect::<String>();

    let next_data: Value = serde_json::from_str(&raw_json)?;
    let gdp_raw = next_data["props"]["pageProps"]["gdpClientCache"]
        .as_str()
        .ok_or("gdpClientCache missing")?;

    let gdp_cache: Value = serde_json::from_str(gdp_raw)?;
    let first_key = gdp_cache
        .as_object()
        .and_then(|m| m.keys().next().cloned())
        .ok_or("empty gdpClientCache")?;
    let property = &gdp_cache[&first_key]["property"];

    let out = serde_json::json!({
        "zpid":        property["zpid"],
        "address":     property["streetAddress"],
        "city":        property["city"],
        "state":       property["state"],
        "zipcode":     property["zipcode"],
        "price":       property["price"],
        "bedrooms":    property["bedrooms"],
        "bathrooms":   property["bathrooms"],
        "living_area": property["livingArea"],
        "year_built":  property["yearBuilt"],
        "home_status": property["homeStatus"],
        "zestimate":   property["zestimate"],
    });

    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}
```

## Notes

- `homeStatus` values include `FOR_SALE`, `FOR_RENT`, `RECENTLY_SOLD`, and `OFF_MARKET`. Filter by this field when you only want active listings.
- The Zestimate is Zillow's own automated valuation — it is present on most residential listings but absent on many commercial or newly listed properties.
- `livingArea` is in square feet. `lotAreaValue` and `lotAreaUnits` are separate fields; units can be `sqft` or `acres` depending on the listing.
- Price history is available under `property.priceHistory` — an array of `{ date, price, event }` objects, useful for tracking how a listing's ask price has changed.
- The `__NEXT_DATA__` key structure has been stable since Zillow migrated to Next.js, but `gdpClientCache` is a Zillow-specific addition and could change with a major front-end rebuild.
- For ZIP-code or city-level search results (not individual property pages), Zillow uses a separate internal search API at `/search/GetSearchPageState.htm`. The same proxy setup applies; the response is a JSON object with a `cat1.searchResults.mapResults` array.

## Scraping at scale

Monitoring hundreds of ZIP codes or tracking price changes across a large property portfolio requires more than a single script — it means managing proxy rotation, handling soft blocks and captcha responses, and scheduling regular re-scrapes on a cron. A residential proxy that assigns a unique IP per request and rotates through US city-level IPs is the most important infrastructure piece.

<a href="/goto/bd-residential/" rel="sponsored noopener">Bright Data's residential proxies</a> are well-suited for Zillow specifically because they cover US geo-targets at city and state granularity, which matters when Zillow adjusts listing presentation by the viewer's apparent location. For the broader picture on proxy selection for real estate and other data projects, see our [proxy types explained](/learn/proxy-types-explained/) guide and [how to avoid getting blocked](/learn/how-to-avoid-getting-blocked/).

For a wider look at how real estate fits alongside travel data collection, the [Travel Data Scraping](/solutions/travel-data-scraping/) pillar covers adjacent use cases. Our [Web Scraping Use Cases](/solutions/web-scraping-use-cases/) overview maps real estate price intelligence to the tooling decisions involved.

**<a href="/goto/bd-residential/" rel="sponsored noopener">Scrape Zillow at scale with Bright Data residential proxies →</a>**

## FAQ

### Is scraping Zillow legal?

Zillow's Terms of Service prohibit automated scraping of its data, and its listing data is licensed from MLSs under contracts that carry their own restrictions. That said, court decisions in the US have generally held that automated collection of publicly visible, non-login-gated data is not a copyright or CFAA violation on its own. The legal picture depends heavily on your use case, jurisdiction, and data volume — always review the relevant ToS and seek legal advice before deploying at scale.

### How does Zillow embed its listing data?

Zillow property pages are built with Next.js and embed a complete JSON payload in a `<script id="__NEXT_DATA__" type="application/json">` tag. This block contains all the data the page needs to render, including price, beds, baths, square footage, lot size, and listing status, without requiring a separate API call. It is far more stable than scraping rendered HTML with CSS selectors.

### Why do Zillow scrapers get blocked?

Zillow geo-targets aggressively and returns soft-blocked or incomplete responses to datacenter IP ranges. It also fingerprints TLS handshakes and HTTP/2 settings to detect scraping clients. Residential proxies that present genuine household IPs are the most effective way to avoid these blocks.

### What Zillow data is publicly accessible without a login?

Listing price, address, beds, baths, square footage, lot size, year built, listing status (For Sale / For Rent / Sold), days on market, price history, photos, and the Zestimate are all visible to anonymous visitors and are present in the `__NEXT_DATA__` payload.
