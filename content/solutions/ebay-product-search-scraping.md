+++
title = "eBay Product Search Scraping: Code Samples (PHP, Node.js, Rust)"
description = "Scrape eBay search results for titles, prices, and conditions with ready-to-run code in PHP, Node.js, and Rust — ideal for price research and market monitoring."
template = "page.html"
+++

Scraping eBay search results gives you market-level pricing data that a single product page can't: you see dozens of competing listings at once, complete with condition grades, shipping costs, and seller ratings. That makes eBay one of the best targets for price benchmarking, resale arbitrage research, and competitive inventory monitoring.

The catch is that eBay's results pages are JavaScript-rendered and protected by bot detection, so plain HTTP requests usually return thin markup or a challenge page. The samples below route requests through [ZenRows](/goto/zenrows/) — a managed scraping browser that handles rendering and fingerprint bypasses on your behalf — and then parse the returned HTML with standard libraries.

## Prerequisites

Sign up for a [ZenRows](/goto/zenrows/) account and set your API key:

```bash
export ZENROWS_API_KEY="your_api_key_here"
```

Each sample accepts a search query as a command-line argument and outputs a JSON array of listings. Each object contains the title, price string, condition label, shipping cost, and canonical listing URL (tracking parameters stripped).

## Understanding eBay Search HTML

eBay renders each result as an `<li class="s-item">` inside `<ul class="srp-results">`. The useful sub-elements are:

| Field | CSS Selector |
|---|---|
| Title | `.s-item__title` |
| Price | `.s-item__price` |
| Condition | `.SECONDARY_INFO` |
| Shipping | `.s-item__shipping` |
| Listing URL | `a.s-item__link` (href attribute) |

The first `s-item` in every results page is always a ghost "Shop on eBay" placeholder row that eBay injects — the samples below filter it out.

## PHP

```php
<?php
// Run: php ebay.php "mechanical keyboard"
$apiKey = getenv('ZENROWS_API_KEY');
$query  = $argv[1] ?? 'mechanical keyboard';

$targetUrl = 'https://www.ebay.com/sch/i.html?' . http_build_query([
    '_nkw' => $query,
    '_sop' => 12,   // sort by best match
]);

$apiUrl = 'https://api.zenrows.com/v1/?' . http_build_query([
    'apikey'    => $apiKey,
    'url'       => $targetUrl,
    'js_render' => 'true',
]);

$ch = curl_init($apiUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 60,
]);
$html = curl_exec($ch);
if ($html === false) {
    fwrite(STDERR, 'Request failed: ' . curl_error($ch) . PHP_EOL);
    exit(1);
}
curl_close($ch);

$doc = new DOMDocument();
@$doc->loadHTML($html);
$xp = new DOMXPath($doc);

$text = fn(DOMNode $ctx, string $q): string =>
    trim($xp->query($q, $ctx)->item(0)?->textContent ?? '');

$items = [];
foreach ($xp->query('//li[contains(@class,"s-item")]') as $li) {
    $title = $text($li, './/*[contains(@class,"s-item__title")]');
    if (!$title || str_starts_with($title, 'Shop on eBay')) continue;

    $href = $xp->query('.//a[contains(@class,"s-item__link")]', $li)
                ->item(0)?->getAttribute('href') ?? '';

    $items[] = [
        'title'     => $title,
        'price'     => $text($li, './/*[contains(@class,"s-item__price")]'),
        'condition' => $text($li, './/*[contains(@class,"SECONDARY_INFO")]'),
        'shipping'  => $text($li, './/*[contains(@class,"s-item__shipping")]'),
        'url'       => strtok($href, '?'),
    ];
}

echo json_encode($items, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// ebay.mjs — node ebay.mjs "mechanical keyboard"
// Install: npm i axios cheerio
import axios from 'axios';
import * as cheerio from 'cheerio';

const apiKey = process.env.ZENROWS_API_KEY;
const query  = process.argv[2] ?? 'mechanical keyboard';

const targetUrl =
  `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=12`;

const { data: html } = await axios.get('https://api.zenrows.com/v1/', {
  params:  { apikey: apiKey, url: targetUrl, js_render: 'true' },
  timeout: 60_000,
});

const $ = cheerio.load(html);
const items = [];

$('li.s-item').each((_, el) => {
  const title = $(el).find('.s-item__title').text().trim();
  if (!title || title.startsWith('Shop on eBay')) return;

  items.push({
    title,
    price:     $(el).find('.s-item__price').first().text().trim(),
    condition: $(el).find('.SECONDARY_INFO').text().trim(),
    shipping:  $(el).find('.s-item__shipping').text().trim(),
    url:       $(el).find('a.s-item__link').attr('href')?.split('?')[0] ?? '',
  });
});

console.log(JSON.stringify(items, null, 2));
```

## Rust

```rust
// Cargo.toml:
//   reqwest  = { version = "0.12", features = ["blocking"] }
//   scraper  = "0.20"
//   serde_json = "1"
//   urlencoding = "2"
use scraper::{Html, Selector};
use serde_json::{json, Value};

fn sel(s: &str) -> Selector { Selector::parse(s).unwrap() }

fn pick_text(root: &scraper::ElementRef, selector: &Selector) -> String {
    root.select(selector)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .unwrap_or_default()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = std::env::var("ZENROWS_API_KEY")?;
    let query   = std::env::args().nth(1).unwrap_or_else(|| "mechanical keyboard".into());

    let target = format!(
        "https://www.ebay.com/sch/i.html?_nkw={}&_sop=12",
        urlencoding::encode(&query)
    );

    let html = reqwest::blocking::Client::new()
        .get("https://api.zenrows.com/v1/")
        .query(&[
            ("apikey",    api_key.as_str()),
            ("url",       target.as_str()),
            ("js_render", "true"),
        ])
        .timeout(std::time::Duration::from_secs(60))
        .send()?
        .text()?;

    let doc       = Html::parse_document(&html);
    let item_sel  = sel("li.s-item");
    let title_sel = sel(".s-item__title");
    let price_sel = sel(".s-item__price");
    let cond_sel  = sel(".SECONDARY_INFO");
    let ship_sel  = sel(".s-item__shipping");
    let link_sel  = sel("a.s-item__link");

    let mut items: Vec<Value> = Vec::new();
    for el in doc.select(&item_sel) {
        let title = pick_text(&el, &title_sel);
        if title.is_empty() || title.starts_with("Shop on eBay") {
            continue;
        }
        let url = el.select(&link_sel)
            .next()
            .and_then(|a| a.value().attr("href"))
            .map(|h| h.split('?').next().unwrap_or(h).to_string())
            .unwrap_or_default();

        items.push(json!({
            "title":     title,
            "price":     pick_text(&el, &price_sel),
            "condition": pick_text(&el, &cond_sel),
            "shipping":  pick_text(&el, &ship_sel),
            "url":       url,
        }));
    }

    println!("{}", serde_json::to_string_pretty(&items)?);
    Ok(())
}
```

## Paginating Through Results

eBay shows up to 240 results per page and uses the `_pgn` parameter for pagination. To walk multiple pages, increment `_pgn` from 1 upward and stop when the results list is empty:

```
https://www.ebay.com/sch/i.html?_nkw=mechanical+keyboard&_sop=12&_pgn=2
```

Add a short pause between requests (one to two seconds) to stay within polite crawl rates.

## Targeting Completed Sales for Price Benchmarks

To get sold prices instead of active asking prices — useful for understanding true market value — add the completed-listings parameters:

```
&LH_Complete=1&LH_Sold=1
```

Sold listings are a much more reliable baseline for pricing decisions than active listings, since active prices reflect what sellers *want* rather than what buyers actually pay.

## Building a Price Monitor

Turn this scraper into a lightweight price monitor:

1. **Run on a schedule** — use a cron job or task queue. Daily is fine for slow-moving categories; hourly suits fast-moving ones like consumer electronics.
2. **Store price history** — write `{query, title, price, timestamp}` to a database or CSV on each run.
3. **Alert on drops** — compare the latest price against a rolling minimum and fire a notification when a new low appears.

The [Amazon Product Tracking](/solutions/amazon-product-tracking/) and [Walmart Product Tracking](/solutions/walmart-product-tracking/) guides use the same store-and-compare pattern with different parsers. To track a single eBay listing by item ID (rather than search results), see [eBay Product Tracking](/solutions/ebay-product-tracking/).

## Notes

- **Selector drift** — eBay's CSS classes are reasonably stable, but they shift with major redesigns. If results come back empty, open the live page in DevTools, inspect a listing card, and update the selectors.
- **Price strings** — prices can be ranges (`$20.00 to $60.00` for lot sales) or include text like "or Best Offer". Store the raw string and parse it downstream, or use a regex to extract the lower bound.
- **Alternative unblocking services** — if you need higher throughput or different billing models, [Bright Data's Web Unlocker](/goto/bd-web-unlocker/) and [Oxylabs](/goto/oxylabs/) are strong alternatives. See our [ZenRows vs. ScraperAPI comparison](/comparisons/zenrows-vs-scraperapi/) and the broader [proxy and scraping tool comparisons](/comparisons/) for a side-by-side view.

*See also: [E-commerce Web Scraping Solutions](/solutions/ecommerce/), [ZenRows review](/reviews/zenrows/), and [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/).*

**[Get started with ZenRows →](/goto/zenrows/)**
