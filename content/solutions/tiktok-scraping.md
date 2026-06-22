+++
title = "How to Scrape Public TikTok Data: Videos, Profiles, and Trend Sentiment"
description = "Scrape public TikTok video pages and creator profiles by parsing embedded JSON-LD, with ready-to-run code samples in PHP, Node.js, and Rust."
template = "page.html"
+++

TikTok has become one of the most significant sources of real-time consumer sentiment on the web. Brand mentions travel at viral speed, trending sounds signal cultural shifts days before mainstream media, and creator commentary surfaces product reception in a way that structured review data rarely captures. This guide covers what you can realistically extract from TikTok **without authentication**, why naive scrapers fail almost instantly, and working code that parses structured video and profile data from public pages.

## Public data vs. authenticated data

The boundary matters both technically and legally:

- **Public data** — video pages, creator profiles, and Discover/trending content visible to a logged-out visitor in a browser. This is the only appropriate target for automated collection.
- **Authenticated data** — personal feeds, private accounts, direct messages, and anything behind a login wall. TikTok's Terms of Service explicitly prohibit automated access to the authenticated experience, and doing so creates significant legal and account risk.

Everything below targets **logged-out public pages only**. TikTok's ToS also restricts automated access to its public pages; weigh that against your use case and, for commercial applications, seek legal counsel before deploying at scale. This guide is technical documentation, not legal advice.

## What public TikTok pages expose

TikTok embeds `<script type="application/ld+json">` blocks on its public pages that surface structured data without JavaScript rendering:

| Page type | URL pattern | JSON-LD `@type` | Key fields |
|-----------|-------------|-----------------|------------|
| Video | `/@<user>/video/<id>` | `VideoObject` | `name`, `description`, `author`, `datePublished`, `thumbnailUrl` |
| Creator profile | `/@<username>` | `ProfilePage` + `Person` | `name`, `alternateName`, `description`, `image` |

The `VideoObject` block on a video page is particularly rich for sentiment work: `name` (the caption/description), `author.name`, and `datePublished` are consistently available. For trend analysis, tracking caption text across a corpus of viral videos gives you the raw signal for keyword frequency, hashtag co-occurrence, and sentiment scoring with a downstream NLP layer.

JSON-LD is the most stable parsing target across these pages — CSS selectors break on every redesign, while schema-driven structured data persists through layout changes.

## Why DIY TikTok scraping breaks fast

TikTok is one of the most defended scraping targets outside of the major social platforms:

- **Datacenter IPs are blocked on first contact.** TikTok's edge infrastructure rejects cloud provider ranges immediately. You need [residential proxies](/goto/bd-residential/) that present as genuine consumer traffic from real ISPs.
- **Heavy JavaScript gating.** Unrecognized requests receive a minimal shell or a redirect to the app store. The full structured content — including the JSON-LD blocks — appears only after JavaScript hydration, requiring a rendering-capable proxy layer rather than a plain HTTP client.
- **TLS and browser fingerprinting.** TikTok runs concurrent fingerprint checks against request headers, TLS parameters, and behavioral signals. Bare proxy rotation fails quickly at any meaningful request volume.
- **Geo-restrictions and localization.** Content availability varies by region. An IP in the wrong geography may receive empty pages, age-gate prompts, or region-restricted content blocks — none of which surface as explicit errors.

See [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) and [proxy types explained](/learn/proxy-types-explained/) for deeper background on these defenses.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

The samples below route all requests through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/), which handles JavaScript rendering, fingerprint evasion, CAPTCHA solving, and IP rotation automatically. Supply your zone credentials in `PROXY_URL`.

> **No account yet?** [Explore the TikTok data collector →](/goto/bd-tiktok/)

Videos are identified by their numeric ID from the URL: `https://www.tiktok.com/@<username>/video/<videoId>`.

## PHP

```php
<?php
// Run: php tiktok.php @nasa 7123456789012345678
$proxy   = getenv('PROXY_URL');
$user    = $argv[1] ?? '@nasa';
$videoId = $argv[2] ?? '7123456789012345678';

$ch = curl_init("https://www.tiktok.com/{$user}/video/{$videoId}");
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

$video = null;
foreach ($xp->query('//script[@type="application/ld+json"]') as $node) {
    $ld = json_decode($node->textContent, true);
    if (($ld['@type'] ?? '') === 'VideoObject') { $video = $ld; break; }
}

$author = $video['author'] ?? [];
echo json_encode([
    'videoId'       => $videoId,
    'caption'       => $video['name']          ?? null,
    'description'   => $video['description']   ?? null,
    'author'        => $author['name']          ?? (is_string($author) ? $author : null),
    'datePublished' => $video['datePublished']  ?? null,
    'thumbnail'     => $video['thumbnailUrl']   ?? null,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// tiktok.mjs — node tiktok.mjs @nasa 7123456789012345678
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent   = new HttpsProxyAgent(process.env.PROXY_URL);
const user    = process.argv[2] ?? '@nasa';
const videoId = process.argv[3] ?? '7123456789012345678';

const { data: html } = await axios.get(
  `https://www.tiktok.com/${user}/video/${videoId}`,
  {
    httpsAgent: agent, proxy: false, timeout: 60_000,
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }
);

const $ = cheerio.load(html);
let video = null;
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'VideoObject') video = ld;
  } catch { /* skip malformed blocks */ }
});

const authorName = typeof video?.author === 'string'
  ? video.author
  : video?.author?.name ?? null;

console.log(JSON.stringify({
  videoId,
  caption:       video?.name          ?? null,
  description:   video?.description   ?? null,
  author:        authorName,
  datePublished: video?.datePublished  ?? null,
  thumbnail:     video?.thumbnailUrl   ?? null,
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
    let user     = args.next().unwrap_or_else(|| "@nasa".into());
    let video_id = args.next().unwrap_or_else(|| "7123456789012345678".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(format!("https://www.tiktok.com/{user}/video/{video_id}"))
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()?
        .text()?;

    let doc = Html::parse_document(&html);
    let sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();

    let mut video = Value::Null;
    for el in doc.select(&sel) {
        let raw = el.text().collect::<String>();
        if let Ok(ld) = serde_json::from_str::<Value>(&raw) {
            if ld["@type"] == "VideoObject" { video = ld; break; }
        }
    }

    let author_name = match &video["author"] {
        Value::String(s) => Value::String(s.clone()),
        obj if obj.is_object() => obj["name"].clone(),
        _ => Value::Null,
    };

    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "videoId":       video_id,
        "caption":       video["name"],
        "description":   video["description"],
        "author":        author_name,
        "datePublished": video["datePublished"],
        "thumbnail":     video["thumbnailUrl"],
    }))?);
    Ok(())
}
```

## Adapting to creator profiles

Swap the URL and change the type check to collect public creator data:

```javascript
// Node.js snippet — creator profile
const { data: html } = await axios.get(
  `https://www.tiktok.com/@${username}`, opts
);
// Match ld['@type'] === 'ProfilePage' && ld.mainEntity
// or ld['@type'] === 'Person' directly
// Available fields: name, alternateName (handle), description, image
```

The `alternateName` field carries the `@handle`; `description` is the bio text. Profile pages are lighter to parse than video pages and useful for building creator inventories or monitoring brand accounts.

## Using TikTok data for sentiment analysis

The pipeline for trend sentiment typically looks like this:

1. **Collect** captions (`VideoObject.name`) and publication dates for a target keyword or hashtag corpus.
2. **Normalize** the text: strip hashtags into a separate column, lowercase, remove emoji or encode them as sentiment-bearing tokens.
3. **Score** with a pre-trained model (VADER for speed, a fine-tuned BERT variant for accuracy) or a commercial sentiment API.
4. **Aggregate** daily or weekly to detect sentiment shifts. Correlate against launch dates, press cycles, or competitor events.

The structured output from the scrapers above feeds directly into step 1 without additional parsing. Pair it with the [Instagram scraping guide](/solutions/instagram-scraping/) and [Facebook scraping guide](/solutions/facebook-scraping/) to build a cross-platform sentiment view.

## Notes

- TikTok sometimes embeds the `VideoObject` block inside a larger `@graph` array rather than as a top-level object — check both `ld['@type']` and each element of `ld['@graph']` if the top-level search comes up empty.
- `description` and `name` often contain the same caption text; `name` tends to be truncated while `description` carries the full caption with hashtags.
- View counts, like counts, and share counts are not exposed in JSON-LD. They appear in a JavaScript `__UNIVERSAL_DATA_FOR_REHYDRATION__` window object that the Web Unlocker can retrieve after rendering, but the structure of that object changes frequently.
- For GDPR/CCPA compliance, treat creator bio text and display names as potentially personal data even when posted publicly.
- Hashtag and Discover pages (`/tag/<hashtag>`) are fully JavaScript-rendered grids with no useful JSON-LD; a dedicated collector is the practical path for bulk hashtag collection.

## Scaling for trend monitoring

Tracking hashtag volume, monitoring brand mentions, or building a cross-creator sentiment dashboard at any meaningful scale means managing residential IP rotation, JavaScript rendering infrastructure, TikTok's aggressive fingerprint checks, and the frequent structural changes TikTok ships to its frontend. Bright Data's [TikTok data collector](/goto/bd-tiktok/) abstracts all of that — specify target usernames, video IDs, or hashtags and receive clean structured JSON without managing any scraping infrastructure. For large historical pulls, pre-built [datasets](/goto/bd-datasets/) are often faster to acquire than running a scraper from scratch.

*Related: [Instagram scraping guide](/solutions/instagram-scraping/), [Facebook scraping guide](/solutions/facebook-scraping/), [LinkedIn scraping guide](/solutions/linkedin-scraping/), [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/), [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/), and [proxy types explained](/learn/proxy-types-explained/).*

**[Collect public TikTok data at scale →](/goto/bd-tiktok/)**
