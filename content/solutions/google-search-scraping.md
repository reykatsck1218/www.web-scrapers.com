+++
title = "Google Search Scraping: Code Samples (PHP, Node.js, Rust)"
description = "Scrape Google Search results into structured JSON with ready-to-run code samples in PHP, Node.js, and Rust using a SERP API."
template = "page.html"
[extra]
og_image = "assets/og/solutions-google-search-scraping.png"
+++

Scraping Google Search results powers rank tracking, SERP monitoring, keyword research, and competitive intelligence. The catch: Google is one of the hardest targets on the web, with aggressive bot detection that blocks raw requests almost immediately. The reliable way to do this in production is through a **SERP API** that handles unblocking and returns structured results.

The samples below use [Bright Data's SERP API](/reviews/bright-data-serp-api/), which accepts a normal Google search URL with `brd_json=1` and returns parsed JSON (organic results, ranks, links, and snippets) instead of raw HTML.

## Prerequisites

Set a `PROXY_URL` environment variable pointing at your SERP API zone:

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<serp_zone>:<password>@brd.superproxy.io:33335"
```

> **No account yet?** [Get started →](/goto/bd-web-unlocker/)

## PHP

```php
<?php
// Run: php google.php "web scraping tools"
// Requires the bundled cURL + JSON extensions.

$proxy = getenv('PROXY_URL');
$query = $argv[1] ?? 'web scraping tools';

$url = 'https://www.google.com/search?' . http_build_query([
    'q'        => $query,
    'gl'       => 'us',   // country
    'hl'       => 'en',   // language
    'brd_json' => 1,      // ask the SERP API for parsed JSON instead of HTML
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_PROXY          => $proxy,
    CURLOPT_SSL_VERIFYPEER => false, // or install Bright Data's CA certificate
    CURLOPT_TIMEOUT        => 60,
]);

$response = curl_exec($ch);
if ($response === false) {
    fwrite(STDERR, 'Request failed: ' . curl_error($ch) . PHP_EOL);
    exit(1);
}
curl_close($ch);

$data = json_decode($response, true);
foreach ($data['organic'] ?? [] as $r) {
    printf("%d. %s\n   %s\n   %s\n\n",
        $r['rank']        ?? 0,
        $r['title']       ?? '',
        $r['link']        ?? '',
        $r['description'] ?? ''
    );
}
```

## Node.js

```javascript
// google.mjs — run: node google.mjs "web scraping tools"
// Install: npm i axios https-proxy-agent
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent(process.env.PROXY_URL);
const query = process.argv[2] ?? 'web scraping tools';

const url = 'https://www.google.com/search?' + new URLSearchParams({
  q: query, gl: 'us', hl: 'en', brd_json: '1',
});

const { data } = await axios.get(url, {
  httpsAgent: agent,
  proxy: false,        // route everything through the agent
  timeout: 60_000,
});

for (const r of data.organic ?? []) {
  console.log(`${r.rank}. ${r.title}\n   ${r.link}\n   ${r.description ?? ''}\n`);
}
```

## Rust

```rust
// Cargo.toml:
//   reqwest = { version = "0.12", features = ["blocking", "json"] }
//   serde_json = "1"
use serde_json::Value;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let query = std::env::args().nth(1).unwrap_or_else(|| "web scraping tools".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true) // or install Bright Data's CA
        .build()?;

    let data: Value = client
        .get("https://www.google.com/search")
        .query(&[("q", query.as_str()), ("gl", "us"), ("hl", "en"), ("brd_json", "1")])
        .send()?
        .json()?;

    if let Some(results) = data["organic"].as_array() {
        for r in results {
            println!(
                "{}. {}\n   {}\n   {}\n",
                r["rank"],
                r["title"].as_str().unwrap_or(""),
                r["link"].as_str().unwrap_or(""),
                r["description"].as_str().unwrap_or("")
            );
        }
    }
    Ok(())
}
```

## Notes

- The SERP API returns far more than organic results — `data` also includes `ads`, `related_searches`, `people_also_ask`, and pagination. Inspect the full JSON to see every field.
- For rank tracking, run this on a schedule and store each result's `rank` per keyword over time.
- Want raw HTML instead of JSON? Drop the `brd_json` parameter and parse the markup yourself (selectors change often, which is why JSON is recommended).

*Struggling with blocks on your own setup? Read [How to Avoid Getting Blocked While Web Scraping](/learn/how-to-avoid-getting-blocked/) and our [Bright Data SERP API review](/reviews/bright-data-serp-api/).*

**[Get started with Bright Data →](/goto/bd-web-unlocker/)**
