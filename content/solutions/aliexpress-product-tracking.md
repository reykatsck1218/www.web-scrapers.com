+++
title = "AliExpress Product Tracking: Scraper Code Samples (PHP, Node.js, Rust)"
template = "page.html"
+++

AliExpress is a goldmine for dropshippers and product researchers who need to track prices, ratings, and order volumes. Unlike Amazon, AliExpress embeds its product data as a JSON object inside the page (`window.runParams`) rather than in plain HTML — so the reliable approach is to extract and parse that JSON blob. The samples below fetch the page through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) and pull out the title and price.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

> **New to Bright Data?** **7-day free trial, no credit card required.** [Get started →](https://get.brightdata.com/5q1kr89k0efo)

Products are identified by their numeric **item ID** from the URL: `https://www.aliexpress.com/item/<id>.html`.

Each sample uses a small **balanced-brace extractor** to grab the JSON object assigned to `window.runParams` — more robust than a regex against deeply nested JSON.

## PHP

```php
<?php
// Run: php aliexpress.php 1005006789012345
$proxy  = getenv('PROXY_URL');
$itemId = $argv[1] ?? '1005006789012345';

$ch = curl_init("https://www.aliexpress.com/item/$itemId.html");
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

/** Extract the first balanced {...} object that follows $marker. */
function extract_json_after(string $html, string $marker): ?array {
    $pos = strpos($html, $marker);
    if ($pos === false) return null;
    $start = strpos($html, '{', $pos);
    if ($start === false) return null;

    $depth = 0; $inStr = false; $esc = false;
    for ($i = $start, $n = strlen($html); $i < $n; $i++) {
        $c = $html[$i];
        if ($inStr) {
            if ($esc)            $esc = false;
            elseif ($c === '\\') $esc = true;
            elseif ($c === '"')  $inStr = false;
        } elseif ($c === '"')    $inStr = true;
        elseif ($c === '{')      $depth++;
        elseif ($c === '}' && --$depth === 0) {
            return json_decode(substr($html, $start, $i - $start + 1), true);
        }
    }
    return null;
}

$data = extract_json_after($html, 'window.runParams') ?? [];
$d    = $data['data'] ?? $data;

$product = [
    'itemId' => $itemId,
    'title'  => $d['titleModule']['subject'] ?? null,
    'price'  => $d['priceModule']['formatedActivityPrice']
             ?? $d['priceModule']['formatedPrice'] ?? null,
];

echo json_encode($product, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), PHP_EOL;
```

## Node.js

```javascript
// aliexpress.mjs — node aliexpress.mjs 1005006789012345
// Install: npm i axios https-proxy-agent
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent  = new HttpsProxyAgent(process.env.PROXY_URL);
const itemId = process.argv[2] ?? '1005006789012345';

const { data: html } = await axios.get(
  `https://www.aliexpress.com/item/${itemId}.html`,
  { httpsAgent: agent, proxy: false, timeout: 60_000,
    headers: { 'Accept-Language': 'en-US,en;q=0.9' } },
);

function extractJsonAfter(html, marker) {
  const m = html.indexOf(marker);
  if (m === -1) return null;
  const start = html.indexOf('{', m);
  if (start === -1) return null;

  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      return JSON.parse(html.slice(start, i + 1));
    }
  }
  return null;
}

const data = extractJsonAfter(html, 'window.runParams') ?? {};
const d = data.data ?? data;

console.log(JSON.stringify({
  itemId,
  title: d.titleModule?.subject ?? null,
  price: d.priceModule?.formatedActivityPrice ?? d.priceModule?.formatedPrice ?? null,
}, null, 2));
```

## Rust

```rust
// Cargo.toml:
//   reqwest = { version = "0.12", features = ["blocking"] }
//   serde_json = "1"
use serde_json::Value;

fn extract_json_after(html: &str, marker: &str) -> Option<Value> {
    let m = html.find(marker)?;
    let start = html[m..].find('{')? + m;
    let bytes = html.as_bytes();

    let (mut depth, mut in_str, mut esc) = (0i32, false, false);
    for i in start..bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            if esc { esc = false; }
            else if c == '\\' { esc = true; }
            else if c == '"' { in_str = false; }
        } else {
            match c {
                '"' => in_str = true,
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return serde_json::from_str(&html[start..=i]).ok();
                    }
                }
                _ => {}
            }
        }
    }
    None
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let item_id = std::env::args().nth(1).unwrap_or_else(|| "1005006789012345".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.aliexpress.com/item/{item_id}.html"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()?
        .text()?;

    let data = extract_json_after(&html, "window.runParams").unwrap_or(Value::Null);
    let d = if data.get("data").is_some() { &data["data"] } else { &data };

    let price = d["priceModule"]["formatedActivityPrice"]
        .as_str()
        .or_else(|| d["priceModule"]["formatedPrice"].as_str());

    let product = serde_json::json!({
        "itemId": item_id,
        "title": d["titleModule"]["subject"].as_str(),
        "price": price,
    });

    println!("{}", serde_json::to_string_pretty(&product)?);
    Ok(())
}
```

## Notes

- AliExpress changes its `runParams` schema periodically. If `titleModule`/`priceModule` come back empty, dump the extracted JSON and locate the current paths (they're usually still nested under `data`).
- The same JSON object also contains `skuModule` (variant pricing), `storeModule` (seller info), and review counts — useful extras for product tracking.
- To build a tracker, store `{itemId, price, timestamp}` on each run, schedule via cron, and alert on price changes (see the [Amazon tracker](/solutions/amazon-product-tracking/) for the pattern).

*See our [E-commerce Web Scraping Solutions](/solutions/ecommerce/) overview and [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/).*

**[Start your free 7-day Bright Data trial →](https://get.brightdata.com/5q1kr89k0efo)**
