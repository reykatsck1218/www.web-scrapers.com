+++
title = "Web Scraping with Rust: reqwest, scraper & Proxies"
description = "Scrape the web with Rust using reqwest and the scraper crate, extract JSON-LD structured data, route through a proxy, and scale to production."
template = "page.html"
date = 2026-09-24

[extra]
faq = [
  { q = "Is Rust a good language for web scraping?", a = "Yes. Rust's async I/O (via Tokio) makes it excellent for high-throughput, concurrent scraping. The reqwest crate handles HTTP with proxy support built in, and the scraper crate parses HTML with CSS selectors. The main trade-off is a steeper learning curve than Python or Node.js, but the result is a fast, memory-safe scraper with no runtime overhead." },
  { q = "Which crates do I need to scrape the web in Rust?", a = "The minimal stack is reqwest (HTTP client with TLS and proxy support), scraper (CSS-selector HTML parsing built on html5ever), and serde_json (for JSON-LD and API responses). Add tokio for the async runtime and tokio-retry or backoff for retry logic. Everything installs via Cargo with no system-level dependencies beyond a C linker." },
  { q = "How do I route Rust reqwest requests through a proxy?", a = "Build the Client with reqwest::Client::builder().proxy(reqwest::Proxy::all(proxy_url)?).build()?. For a self-signed proxy certificate (common with managed unlockers), chain .danger_accept_invalid_certs(true). Store the proxy URL in a PROXY_URL environment variable so credentials never appear in source code." },
  { q = "Can Rust scrape JavaScript-rendered pages?", a = "Not with reqwest alone — it fetches the raw HTML the server sends before any client-side JavaScript runs. For JavaScript-heavy targets, point reqwest at a managed rendering endpoint such as Bright Data's Web Unlocker, which returns fully rendered HTML through a proxy-compatible interface without you operating a headless browser." },
]
+++

Rust is an unusual choice for web scraping — most people reach for Python or Node.js — but it earns its place when throughput matters. An async Rust scraper running on Tokio can handle thousands of concurrent HTTP connections in a single process with predictable memory usage and no garbage-collection pauses. If you are already writing Rust, or if your scraping job is a bottleneck that Python's GIL and interpreter overhead make worse, Rust is a genuinely strong option.

This guide covers everything from a minimal page fetch to a production-ready scraper that routes through a proxy, parses HTML and embedded JSON-LD, follows pagination, and saves results to disk.

## Prerequisites and Cargo Setup

You need Rust 1.75 or newer (install via [rustup](https://rustup.rs/)). Create a new binary crate and add the dependencies:

```bash
cargo new rust-scraper && cd rust-scraper
```

`Cargo.toml` dependencies:

```toml
[dependencies]
reqwest  = { version = "0.12", features = ["blocking", "socks"] }
scraper  = "0.20"
serde_json = "1"
tokio    = { version = "1", features = ["full"] }
```

All examples below compile against these versions. The `blocking` feature on reqwest gives synchronous wrappers when you do not need the async overhead for a small script; the async examples use `tokio::main`.

## Fetching a Page

The simplest possible fetch — synchronous, no proxy:

```rust
// src/main.rs
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                     AppleWebKit/537.36 (KHTML, like Gecko) \
                     Chrome/124.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let html = client
        .get("https://books.toscrape.com/")
        .send()?
        .text()?;

    println!("{} bytes fetched", html.len());
    Ok(())
}
```

Two habits to establish early:

- **Always set a `user_agent`.** The default `reqwest/<version>` string is an instant bot signal on most protected sites.
- **Always set a `timeout`.** Without one, a stalled connection hangs the thread indefinitely.

## Parsing HTML with the scraper Crate

The `scraper` crate builds on Mozilla's `html5ever` parser (the same engine used in Servo) and exposes a CSS-selector API:

```rust
use scraper::{Html, Selector};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; RustScraper/1.0)")
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let html = client.get("https://books.toscrape.com/").send()?.text()?;
    let doc = Html::parse_document(&html);

    let item_sel  = Selector::parse("article.product_pod").unwrap();
    let title_sel = Selector::parse("h3 > a").unwrap();
    let price_sel = Selector::parse("p.price_color").unwrap();

    for item in doc.select(&item_sel) {
        let title = item.select(&title_sel).next()
            .and_then(|el| el.value().attr("title"))
            .unwrap_or("");
        let price = item.select(&price_sel).next()
            .map(|el| el.text().collect::<String>())
            .unwrap_or_default();
        println!("{} — {}", title, price.trim());
    }
    Ok(())
}
```

Key points:

- `Selector::parse` takes standard CSS selectors. Compile them once outside your loop — selector compilation is the expensive part.
- `.attr("title")` fetches an HTML attribute; `.text().collect::<String>()` concatenates all text nodes inside an element.
- The html5ever parser tolerates malformed markup without panicking, the same way a real browser does.

## Extracting JSON-LD Structured Data

Many e-commerce and content sites embed a `<script type="application/ld+json">` block containing a clean `Product`, `Article`, or `BreadcrumbList` object. Targeting this block is more reliable than CSS selectors tied to layout class names:

```rust
use scraper::{Html, Selector};
use serde_json::Value;

fn extract_json_ld(html: &str, schema_type: &str) -> Option<Value> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();

    for el in doc.select(&sel) {
        let raw = el.text().collect::<String>();
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if v["@type"].as_str() == Some(schema_type) {
                return Some(v);
            }
        }
    }
    None
}
```

This is the same pattern used across our [eBay Product Tracking](/solutions/ebay-product-tracking/) and [Amazon Product Tracking](/solutions/amazon-product-tracking/) guides — the JSON-LD block is the most stable extraction target on any page that includes it. Check for it before writing fragile CSS selectors against the layout.

## Routing Through a Proxy

Scaling past a few hundred requests without a proxy pool is a fast path to IP-based blocking. Route every request through a proxy by configuring the `Client` at build time:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proxy_url = std::env::var("PROXY_URL")?;

    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; RustScraper/1.0)")
        .proxy(reqwest::Proxy::all(&proxy_url)?)
        .danger_accept_invalid_certs(true) // required for managed proxy TLS
        .timeout(std::time::Duration::from_secs(60))
        .build()?;

    let html = client.get("https://example.com/").send()?.text()?;
    println!("{} bytes", html.len());
    Ok(())
}
```

Set `PROXY_URL` before running:

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:22225"
cargo run
```

For targets that actively block scrapers, a raw rotating proxy pool often isn't enough — you also need browser fingerprint management, TLS fingerprint matching, and CAPTCHA solving. Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a> wraps all of that behind a single proxy-compatible endpoint: your `reqwest` code stays identical, while the service handles IP rotation, fingerprinting, and challenge resolution transparently. See our [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/) for a detailed breakdown of what it does.

Not sure which proxy tier matches your target? [Proxy types explained](/learn/proxy-types-explained/) compares datacenter, residential, ISP, and mobile proxies so you can pick the right product for the protection level your target deploys.

## Pagination: Following "Next" Links

Most listing pages paginate. A simple loop that resolves relative links against the current URL:

```rust
use scraper::{Html, Selector};
use url::Url; // add url = "2" to Cargo.toml

fn scrape_all_pages(
    client: &reqwest::blocking::Client,
    start: &str,
) -> Result<Vec<(String, String)>, Box<dyn std::error::Error>> {
    let item_sel  = Selector::parse("article.product_pod").unwrap();
    let title_sel = Selector::parse("h3 > a").unwrap();
    let price_sel = Selector::parse("p.price_color").unwrap();
    let next_sel  = Selector::parse("li.next a").unwrap();

    let mut results = Vec::new();
    let mut current = Url::parse(start)?;

    loop {
        println!("Fetching {current}");
        let html = client.get(current.as_str()).send()?.text()?;
        let doc  = Html::parse_document(&html);

        for item in doc.select(&item_sel) {
            let title = item.select(&title_sel).next()
                .and_then(|el| el.value().attr("title"))
                .unwrap_or("").to_string();
            let price = item.select(&price_sel).next()
                .map(|el| el.text().collect::<String>())
                .unwrap_or_default();
            results.push((title, price.trim().to_string()));
        }

        match doc.select(&next_sel).next()
            .and_then(|el| el.value().attr("href"))
        {
            Some(rel) => { current = current.join(rel)?; }
            None      => break,
        }

        std::thread::sleep(std::time::Duration::from_millis(
            900 + rand::random::<u64>() % 600, // 0.9–1.5 s jitter
        ));
    }
    Ok(results)
}
```

The random sleep jitter (0.9–1.5 s) matters: uniform timing is itself a bot signal. For pagination strategies beyond simple "next" links — offset parameters, cursor tokens, infinite scroll — see the [pagination guide](/learn/handling-pagination/).

## Async Scraping with Tokio

For high-throughput jobs that need to fetch hundreds of pages in parallel, switch to the async reqwest API:

```rust
use reqwest::Client;
use scraper::{Html, Selector};
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proxy_url = std::env::var("PROXY_URL")?;

    let client = Client::builder()
        .user_agent("Mozilla/5.0 (compatible; RustScraper/1.0)")
        .proxy(reqwest::Proxy::all(&proxy_url)?)
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(60))
        .build()?;

    let urls = vec![
        "https://books.toscrape.com/catalogue/page-1.html",
        "https://books.toscrape.com/catalogue/page-2.html",
        "https://books.toscrape.com/catalogue/page-3.html",
    ];

    let title_sel = Selector::parse("h3 > a").unwrap();

    let fetches: Vec<_> = urls.iter().map(|url| {
        let client = client.clone();
        let url = url.to_string();
        let sel = title_sel.clone();
        tokio::spawn(async move {
            let html = client.get(&url).send().await?.text().await?;
            let doc = Html::parse_document(&html);
            let titles: Vec<String> = doc.select(&sel)
                .filter_map(|el| el.value().attr("title"))
                .map(str::to_string)
                .collect();
            Ok::<_, reqwest::Error>((url, titles))
        })
    }).collect();

    for task in fetches {
        let (url, titles) = task.await??;
        println!("{}: {} titles", url, titles.len());
    }

    Ok(())
}
```

Each spawned task runs concurrently on the Tokio thread pool. Because `reqwest::Client` is `Clone` and internally reference-counted, cloning it is cheap — all clones share the same connection pool.

## Saving Results to JSON

Write your collected records to a JSON file with `serde_json`:

```rust
use serde_json::json;
use std::fs;

// Inside main, after collecting results:
let output: Vec<_> = results.iter().map(|(title, price)| {
    json!({ "title": title, "price": price })
}).collect();

fs::write("output.json", serde_json::to_string_pretty(&output)?)?;
println!("Saved {} records to output.json", output.len());
```

For CSV output, add the `csv` crate (`csv = "1"`) and use `csv::Writer`:

```rust
let mut wtr = csv::Writer::from_path("output.csv")?;
wtr.write_record(["title", "price"])?;
for (title, price) in &results {
    wtr.write_record([title, price])?;
}
wtr.flush()?;
```

## Handling JavaScript-Rendered Pages

`reqwest` fetches what the server sends before any JavaScript executes. If view-source shows the data but your scraper does not find it, check whether the data is:

1. **In a hidden JSON blob** — look for `window.__INITIAL_STATE__`, `window.__NEXT_DATA__`, or similar in `<script>` tags. Parse them with `serde_json` directly.
2. **Fetched from an API** — open DevTools → Network → XHR and look for JSON endpoints the browser calls. Hitting those directly is faster and more reliable.
3. **Truly rendered client-side** — for these, point `reqwest` at Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a>, which renders the page in a real browser server-side and returns the fully rendered HTML through the same proxy-compatible interface your existing code already uses.

## Scaling Up

Beyond the techniques above:

- **Connection pooling** is free with `reqwest`: the `Client` maintains a pool internally. Reuse the same client across all requests rather than constructing a new one per fetch.
- **Retry logic** — add the `backoff` crate (`backoff = "0.4"`) for exponential back-off on 429 and 5xx responses.
- **Managed data collection** — when the target is a major platform (Amazon, LinkedIn, social media), building and maintaining a Rust scraper often costs more than using a provider's ready-made product. See [Datasets vs. Web Scraping](/learn/datasets-vs-web-scraping/) to weigh that decision.

For a broader view of scraping strategies across languages, see our [web scraping use cases overview](/solutions/web-scraping-use-cases/) and compare proxy providers in our [reviews section](/reviews/).

**<a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Start scraping at scale with Bright Data's Web Unlocker →</a>**

## FAQ

### Is Rust a good language for web scraping?

Yes. Rust's async I/O (via Tokio) makes it excellent for high-throughput, concurrent scraping. The `reqwest` crate handles HTTP with proxy support built in, and the `scraper` crate parses HTML with CSS selectors. The main trade-off is a steeper learning curve than Python or Node.js, but the result is a fast, memory-safe scraper with no runtime overhead.

### Which crates do I need to scrape the web in Rust?

The minimal stack is `reqwest` (HTTP client with TLS and proxy support), `scraper` (CSS-selector HTML parsing built on html5ever), and `serde_json` (for JSON-LD and API responses). Add `tokio` for the async runtime and `tokio-retry` or `backoff` for retry logic. Everything installs via Cargo with no system-level dependencies beyond a C linker.

### How do I route Rust reqwest requests through a proxy?

Build the `Client` with `reqwest::Client::builder().proxy(reqwest::Proxy::all(proxy_url)?).build()?`. For a self-signed proxy certificate (common with managed unlockers), chain `.danger_accept_invalid_certs(true)`. Store the proxy URL in a `PROXY_URL` environment variable so credentials never appear in source code.

### Can Rust scrape JavaScript-rendered pages?

Not with `reqwest` alone — it fetches the raw HTML the server sends before any client-side JavaScript runs. For JavaScript-heavy targets, point `reqwest` at a managed rendering endpoint such as Bright Data's Web Unlocker, which returns fully rendered HTML through a proxy-compatible interface without you operating a headless browser.
