+++
title = "Scrape YouTube Video & Channel Data: Code Guide"
description = "Extract YouTube video titles, view counts, and channel data from embedded JSON-LD metadata with PHP, Node.js, and Rust code samples."
template = "page.html"
date = 2026-10-01

[extra]
faq = [
  { q = "Is scraping YouTube public data legal?", a = "YouTube's Terms of Service prohibit automated access and systematic downloading of its content. US court decisions have generally held that automated collection of publicly visible, non-login-gated data is not a CFAA violation in itself, but YouTube's terms and applicable copyright and database law still apply. Review the ToS and seek legal advice before building a production scraper, especially for commercial use cases." },
  { q = "What data is publicly visible on a YouTube video page?", a = "Title, channel name, description, upload date, duration, view count, and thumbnail URL are all exposed to anonymous visitors without a login and are embedded in the page's JSON-LD VideoObject block. Like counts and comment data are visible in the rendered page but are not part of the JSON-LD." },
  { q = "Why do YouTube scrapers get blocked?", a = "YouTube detects datacenter IP ranges and returns CAPTCHAs or stripped-down responses to high-volume requests. TLS fingerprinting and HTTP/2 header order checks are also applied. Residential proxies that present real household IPs are the most reliable way to avoid these blocks." },
  { q = "Does YouTube have an official data API?", a = "Yes — the YouTube Data API v3 allows fetching video metadata, channel stats, and search results within quota limits. For analytics or moderate-scale use cases the API is the easier path. Scraping is most relevant when you need data unavailable via the API or volume that exceeds API quotas." },
]
+++

YouTube is the world's largest video platform and a rich source of public data for market researchers, content strategists, and trend analysts. Every public video page exposes its core metadata — title, channel, view count, duration, upload date — in a `<script type="application/ld+json">` block that follows the `VideoObject` schema. That JSON-LD block is far more stable than scraping rendered DOM elements, which break whenever YouTube updates its UI.

This guide covers what data YouTube embeds, why a plain HTTP client is not enough, and provides working code samples in PHP, Node.js, and Rust that fetch through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) and parse the structured metadata.

## Public video data vs. account data

YouTube does not require a login to watch public videos or read their metadata. The data in scope for scraping without authentication includes:

- **Public** — video title, description, channel name, upload date, duration, thumbnail URL, and view count (in the JSON-LD), plus subtitles and publicly listed playlists.
- **Gated** — subscriber counts, like/dislike history, private playlists, analytics dashboards, and comment threading all require a login or the YouTube Data API v3.

YouTube's Terms of Service prohibit automated access, so review the relevant terms and seek appropriate legal advice before deploying at scale. The samples below only target what an anonymous visitor can see.

## Where the data lives: JSON-LD VideoObject

Every public YouTube video page includes a JSON-LD block in its `<head>`:

```html
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "VideoObject",
  "name": "Video Title Here",
  "description": "Video description...",
  "thumbnailUrl": ["https://i.ytimg.com/vi/<id>/hqdefault.jpg"],
  "uploadDate": "2025-03-15T00:00:00+00:00",
  "duration": "PT12M45S",
  "author": {
    "@type": "Person",
    "name": "Channel Name",
    "url": "https://www.youtube.com/@channelname"
  },
  "interactionStatistic": [
    {
      "@type": "InteractionCounter",
      "interactionType": { "@type": "WatchAction" },
      "userInteractionCount": 4820000
    }
  ]
}
</script>
```

`duration` follows ISO 8601: `PT12M45S` means 12 minutes 45 seconds. `userInteractionCount` under `WatchAction` is the view count. This structure has been stable for years because it is part of YouTube's SEO metadata — Google relies on it to power rich results in search.

## A note on `ytInitialData`

YouTube also embeds a large JavaScript object called `ytInitialData` in every page:

```html
<script>var ytInitialData = {...};</script>
```

This contains the full client-side rendering tree — related videos, comments, sidebar content, and richer channel data including subscriber counts. The internal key structure changes with YouTube's build pipeline, however, making it significantly harder to maintain than JSON-LD. For long-running scrapers, JSON-LD is the right starting point; `ytInitialData` is worth reaching for only when you need data not covered by JSON-LD.

## Why plain HTTP clients fail

YouTube serves different responses based on IP reputation. A bare `curl` or `fetch` call from a datacenter IP typically returns one of:

- A **CAPTCHA** challenge page instead of video HTML.
- A consent or cookie wall that blocks content access in certain regions.
- A stripped response that omits the JSON-LD block entirely.

YouTube also detects scripted clients through TLS fingerprinting and HTTP/2 header ordering. Routing through a residential proxy that presents a genuine household IP resolves these issues and is the most reliable path to consistently receiving the full page HTML.

> **No proxy set up yet?** <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Get started with Bright Data's Web Unlocker →</a>

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

Video URLs follow the pattern `https://www.youtube.com/watch?v=<video_id>`. The eleven-character `video_id` is the identifier used across YouTube's platform — it appears in the URL and in every share link.

## PHP

```php
<?php
// Run: php youtube.php dQw4w9WgXcQ
$proxy   = getenv('PROXY_URL');
$videoId = $argv[1] ?? 'dQw4w9WgXcQ';

$ch = curl_init("https://www.youtube.com/watch?v=$videoId");
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

if (!$video) { fwrite(STDERR, "No VideoObject found — page may be blocked.\n"); exit(1); }

// Extract view count from interactionStatistic array.
$views = null;
foreach ($video['interactionStatistic'] ?? [] as $stat) {
    if (($stat['interactionType']['@type'] ?? '') === 'WatchAction') {
        $views = $stat['userInteractionCount'];
        break;
    }
}

echo json_encode([
    'id'          => $videoId,
    'title'       => $video['name']           ?? null,
    'channel'     => $video['author']['name'] ?? null,
    'channel_url' => $video['author']['url']  ?? null,
    'upload_date' => $video['uploadDate']     ?? null,
    'duration'    => $video['duration']       ?? null,
    'views'       => $views,
    'description' => substr($video['description'] ?? '', 0, 200),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// youtube.mjs — node youtube.mjs dQw4w9WgXcQ
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent   = new HttpsProxyAgent(process.env.PROXY_URL);
const videoId = process.argv[2] ?? 'dQw4w9WgXcQ';

const { data: html } = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
  httpsAgent: agent,
  proxy: false,
  timeout: 60_000,
  headers: {
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
});

const $ = cheerio.load(html);
let video = null;
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'VideoObject') video = ld;
  } catch { /* skip malformed blocks */ }
});

if (!video) throw new Error('No VideoObject found — page may be blocked');

const watchStat = video.interactionStatistic?.find(
  s => s.interactionType?.['@type'] === 'WatchAction'
);

console.log(JSON.stringify({
  id:          videoId,
  title:       video.name           ?? null,
  channel:     video.author?.name   ?? null,
  channel_url: video.author?.url    ?? null,
  upload_date: video.uploadDate     ?? null,
  duration:    video.duration       ?? null,
  views:       watchStat?.userInteractionCount ?? null,
  description: (video.description ?? '').slice(0, 200),
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
    let video_id = std::env::args().nth(1).unwrap_or_else(|| "dQw4w9WgXcQ".into());
    let url = format!("https://www.youtube.com/watch?v={video_id}");

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let html = client
        .get(&url)
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

    if video.is_null() {
        return Err("No VideoObject found — page may be blocked".into());
    }

    let views = video["interactionStatistic"]
        .as_array()
        .and_then(|stats| {
            stats.iter().find(|s| s["interactionType"]["@type"] == "WatchAction")
        })
        .and_then(|s| s["userInteractionCount"].as_u64());

    let description = video["description"]
        .as_str()
        .unwrap_or("")
        .chars()
        .take(200)
        .collect::<String>();

    let out = serde_json::json!({
        "id":          video_id,
        "title":       video["name"],
        "channel":     video["author"]["name"],
        "channel_url": video["author"]["url"],
        "upload_date": video["uploadDate"],
        "duration":    video["duration"],
        "views":       views,
        "description": description,
    });

    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}
```

## Notes

- `duration` is ISO 8601 (e.g. `PT12M45S`). Parse it with a regex or a duration library if you need total seconds.
- YouTube's JSON-LD omits like counts — those are buried inside the `ytInitialData` JavaScript object embedded lower in the page, but that key path changes with builds.
- The JSON-LD block is in the document `<head>`, so it arrives early in the byte stream. You can abort the HTTP response once you have parsed it to reduce bandwidth.
- Channel subscriber counts are absent from the JSON-LD. For those you would need to parse `ytInitialData` or use the YouTube Data API v3.
- YouTube personalizes results by viewer location; US-based residential IPs avoid regional content restrictions on public videos and return English-language metadata by default.

## Scaling beyond a few videos

A single-script approach works for ad hoc lookups, but monitoring channels, tracking trending content, or building a research dataset at scale means managing proxy rotation, rate limiting, and scheduled re-scrapes across thousands of video IDs.

Bright Data maintains <a href="/goto/bd-datasets/" rel="sponsored noopener">pre-built YouTube datasets</a> covering video metadata, channel statistics, and trending data that can be delivered on a schedule without you building or maintaining scraping infrastructure. For building your own scalable pipeline, the [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/) covers the proxy and unblocking layer in detail. The [how to avoid getting blocked](/learn/how-to-avoid-getting-blocked/) guide covers the broader anti-detection considerations that apply to YouTube and other high-traffic platforms.

For the wider picture of public social data collection, see the [Social Media Scraping](/solutions/social-media-scraping/) pillar, which ties together YouTube alongside Instagram, TikTok, Facebook, and LinkedIn. Our [Web Scraping Use Cases](/solutions/web-scraping-use-cases/) overview maps video analytics to the tooling decisions involved.

**<a href="/goto/bd-datasets/" rel="sponsored noopener">Get YouTube video data at scale with Bright Data →</a>**

## FAQ

### Is scraping YouTube public data legal?

YouTube's Terms of Service prohibit automated access and systematic downloading of its content. US court decisions have generally held that automated collection of publicly visible, non-login-gated data is not a CFAA violation in itself, but YouTube's terms and applicable copyright and database law still apply. Review the ToS and seek legal advice before building a production scraper, especially for commercial use cases.

### What data is publicly visible on a YouTube video page?

Title, channel name, description, upload date, duration, view count, and thumbnail URL are all exposed to anonymous visitors without a login and are embedded in the page's JSON-LD VideoObject block. Like counts and comment data are visible in the rendered page but are not part of the JSON-LD.

### Why do YouTube scrapers get blocked?

YouTube detects datacenter IP ranges and returns CAPTCHAs or stripped-down responses to high-volume requests. TLS fingerprinting and HTTP/2 header order checks are also applied. Residential proxies that present real household IPs are the most reliable way to avoid these blocks.

### Does YouTube have an official data API?

Yes — the YouTube Data API v3 allows fetching video metadata, channel stats, and search results within quota limits. For analytics or moderate-scale use cases the API is the easier path. Scraping is most relevant when you need data unavailable via the API or volume that exceeds API quotas.
