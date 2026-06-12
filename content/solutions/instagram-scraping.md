+++
title = "How to Scrape Public Instagram Data: Profiles, Posts, and Hashtags"
description = "Scrape public Instagram profiles, posts, and hashtag feeds by parsing embedded JSON-LD, with ready-to-run code samples in PHP, Node.js, and Rust."
template = "page.html"
+++

Instagram is among the richest sources of public social data on the web — brand sentiment, influencer reach, competitor engagement, and trending content all surface through its public-facing pages. This guide covers what you can realistically collect from Instagram **without authentication**, why naive scrapers fail within minutes, and working code that extracts structured profile data from public pages.

## Public data vs. authenticated data

The boundary matters both technically and legally:

- **Public data** — profiles, posts, and hashtag pages visible to a logged-out visitor in a browser. This is the only safe target for automated collection.
- **Authenticated data** — feeds, Stories, DMs, or anything that requires a login. Instagram's Terms of Use explicitly prohibit automated access to the logged-in experience, and doing so risks account bans and legal exposure.

Everything below targets **logged-out public pages only**. Instagram's ToS also restricts automated access to public pages; weigh that against your use case and, for commercial applications, review the relevant platform terms and seek counsel. This guide is technical documentation, not legal advice.

## What public Instagram pages expose

For a public profile (`https://www.instagram.com/<username>/`), Instagram embeds a `ProfilePage` JSON-LD block containing a `Person` entity with the account's display name, username, bio, and profile image URL. Post pages (`/p/<shortcode>/`) carry a `CreativeWork` block with the caption and publish timestamp. Hashtag pages (`/explore/tags/<tag>/`) are the most JavaScript-heavy and effectively require a fully rendered DOM.

JSON-LD is the most stable parsing target across all these pages — far more durable than CSS selectors, which break on every layout experiment Instagram runs.

## Why DIY scraping breaks fast

Instagram is one of the most aggressively defended scraping targets on the web:

- **Datacenter IPs are blocked immediately.** You need [residential proxies](/goto/bd-residential/) that present as genuine browser sessions from real consumer ISPs.
- **Heavy JavaScript rendering.** Public pages ship minimal HTML to unrecognized clients. The full content only appears after client-side hydration, so a plain HTTP request often returns a login wall or empty shell.
- **Fingerprinting and rate limits.** Browser fingerprint checks, TLS fingerprinting, and per-IP rate limits combine to make rotating bare proxies insufficient at any meaningful volume.
- **Frequent markup changes.** Even when you reach the page, CSS-selector-based parsers break on every redesign — JSON-LD stays stable through them.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

The samples below route all requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/), which handles JavaScript rendering, browser fingerprinting, CAPTCHA solving, and IP rotation automatically. Supply your zone credentials in `PROXY_URL`.

> **No account yet?** [Explore the Instagram data collector →](/goto/bd-instagram/)

Profiles are identified by username (`natgeo`, `nasa`, etc.).

## PHP

```php
<?php
// Run: php instagram.php natgeo
$proxy    = getenv('PROXY_URL');
$username = $argv[1] ?? 'natgeo';

$ch = curl_init("https://www.instagram.com/{$username}/");
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

$person = null;
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld   = json_decode($node->textContent, true);
    $type = $ld['@type'] ?? '';
    if ($type === 'ProfilePage' && isset($ld['mainEntity'])) {
        $person = $ld['mainEntity'];
        break;
    }
    if ($type === 'Person') { $person = $ld; break; }
}

$img = $person['image']['url'] ?? ($person['image'] ?? null);
echo json_encode([
    'username'    => $username,
    'name'        => $person['name']          ?? null,
    'handle'      => $person['alternateName'] ?? null,
    'description' => $person['description']   ?? null,
    'image'       => $img,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// instagram.mjs — node instagram.mjs natgeo
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent    = new HttpsProxyAgent(process.env.PROXY_URL);
const username = process.argv[2] ?? 'natgeo';

const { data: html } = await axios.get(`https://www.instagram.com/${username}/`, {
  httpsAgent: agent, proxy: false, timeout: 60_000,
  headers: {
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
});

const $ = cheerio.load(html);
let person = null;
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'ProfilePage' && ld.mainEntity) person = ld.mainEntity;
    else if (ld['@type'] === 'Person') person = ld;
  } catch { /* skip malformed blocks */ }
});

console.log(JSON.stringify({
  username,
  name:        person?.name          ?? null,
  handle:      person?.alternateName ?? null,
  description: person?.description   ?? null,
  image:       person?.image?.url    ?? person?.image ?? null,
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
    let username = std::env::args().nth(1).unwrap_or_else(|| "natgeo".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.instagram.com/{username}/"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();

    let mut person = Value::Null;
    for el in doc.select(&sel) {
        let raw = el.text().collect::<String>();
        if let Ok(ld) = serde_json::from_str::<Value>(&raw) {
            match ld["@type"].as_str() {
                Some("ProfilePage") if ld["mainEntity"].is_object() => {
                    person = ld["mainEntity"].clone();
                    break;
                }
                Some("Person") => { person = ld; break; }
                _ => {}
            }
        }
    }

    let image_url = person["image"]["url"]
        .as_str()
        .or_else(|| person["image"].as_str())
        .map(|s| Value::String(s.to_owned()))
        .unwrap_or(Value::Null);

    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "username": username,
        "name": person["name"],
        "handle": person["alternateName"],
        "description": person["description"],
        "image": image_url,
    }))?);
    Ok(())
}
```

## Adapting to posts and hashtags

Swap the URL and the `@type` check to hit other public endpoints:

| Target | URL pattern | JSON-LD `@type` | Key fields |
|--------|-------------|-----------------|------------|
| Post | `/p/<shortcode>/` | `CreativeWork` | `caption`, `datePublished`, `author` |
| Hashtag | `/explore/tags/<tag>/` | — (JS-rendered grid) | Use the collector API |

Hashtag pages and post grids require full browser rendering. The Web Unlocker handles this transparently, but expect higher latency than static-HTML targets.

## Notes

- `alternateName` is the `@username` handle; `name` is the display name shown on the profile.
- Like counts and follower counts are not exposed in JSON-LD — they appear in the JS-rendered DOM. Accessing them via the collector API is more reliable than parsing the DOM directly.
- For GDPR/CCPA compliance, treat bio text and profile images as personal data even when publicly posted.
- Instagram's public JSON-LD targets desktop rendering; the `Accept` header above steers the response away from mobile fallback pages.

## Scaling beyond individual profiles

Monitoring hundreds of accounts or tracking hashtag volume requires IP rotation, rate-limit awareness, rendering infrastructure, and ongoing schema maintenance as Instagram updates its pages. Bright Data's [Instagram data collector](/goto/bd-instagram/) abstracts all of that — specify a list of usernames, hashtags, or post URLs and receive clean structured JSON on a schedule. For bulk historical analysis, pre-built [datasets](/goto/bd-datasets/) are often faster to acquire than running a scraper from scratch.

*Related: [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/), [proxy types explained](/learn/proxy-types-explained/), and the [LinkedIn scraping guide](/solutions/linkedin-scraping/).*

**[Collect public Instagram data at scale →](/goto/bd-instagram/)**
