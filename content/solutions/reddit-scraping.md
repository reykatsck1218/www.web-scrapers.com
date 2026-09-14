+++
title = "Scrape Public Reddit Posts, Subreddits & Comments"
description = "Scrape public Reddit subreddits, posts, and comments by querying Reddit's JSON API, with ready-to-run scraper code samples in PHP, Node.js, and Rust."
template = "page.html"
date = 2026-09-14
[extra]
faq = [
  { q = "Does Reddit allow web scraping?", a = "Reddit permits scraping public pages at low rates under its robots.txt, but restricts commercial use of user-generated content. Always review Reddit's Terms of Service, Privacy Policy, and Developer Terms before large-scale collection, and respect rate limits." },
  { q = "What is the .json trick for Reddit scraping?", a = "Appending .json to any reddit.com URL — for example /r/python.json or a post URL with .json — returns the page's structured data as machine-readable JSON, making Reddit one of the most straightforward targets for structured extraction." },
  { q = "Why do Reddit scrapers get blocked?", a = "Reddit rate-limits by IP and blocks datacenter ranges outright. It also enforces a User-Agent policy and returns HTTP 429 when requests arrive too fast. Residential proxies that rotate IPs and send a descriptive User-Agent header reduce blocks significantly." },
  { q = "What public Reddit data can I collect without a login?", a = "Public subreddit listings, post titles, vote scores, comment counts, author names, selftext bodies, and post metadata are all available to anonymous requests. Private subreddits, user DMs, and suspended accounts require authentication and are off-limits for scraping." },
]
+++

Reddit hosts some of the richest publicly available community data on the internet — upvoted sentiment, niche expert discussions, real-time trend signals, and structured Q&A threads that span virtually every industry. Unlike most social platforms, Reddit has long exposed its data in a machine-readable format by design, making it unusually accessible to structured collection — if you know how to approach it correctly.

This guide covers how to extract public Reddit posts, subreddit listings, and comment threads using Reddit's built-in JSON endpoints, why naive scrapers still fail at scale, and working code samples in PHP, Node.js, and Rust that route through the [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) to handle IP blocks reliably.

## Public data vs. authenticated data

The boundary matters both technically and legally:

- **Public data** — subreddit listings, post titles and bodies, comment threads, and vote scores visible to a logged-out visitor. This is the realistic target for automated collection.
- **Authenticated data** — saved posts, notification feeds, moderation queues, or anything that requires an account session. Reddit's Terms of Service prohibit automated access to the logged-in experience.

Everything below targets **public, anonymous endpoints only**. Reddit's Terms restrict automated access even to public pages for certain commercial uses — review the relevant terms for your use case before deploying at scale. This guide is technical documentation, not legal advice.

## The .json trick — Reddit's built-in API

Reddit's most scraper-friendly feature is that every public URL has a corresponding JSON representation: just append `.json` to any `reddit.com` URL.

| URL | JSON equivalent | Returns |
|-----|-----------------|---------|
| `reddit.com/r/python/` | `reddit.com/r/python.json` | Top hot posts listing |
| `reddit.com/r/python/top.json?t=week` | (already JSON) | Top posts, past week |
| `reddit.com/r/python/comments/<id>.json` | (already JSON) | Post + comment tree |
| `reddit.com/search.json?q=web+scraping` | (already JSON) | Site-wide search results |

The response is a standard Reddit `Listing` object: a `data.children` array where each element has a `kind` (`t3` for posts, `t1` for comments) and a `data` object carrying the actual fields.

This structured JSON output is far more reliable than CSS-selector-based HTML parsing, which breaks on every redesign. The `.json` endpoint has been stable for years and is the approach recommended throughout this guide.

## Why scrapers still fail

Even with the `.json` endpoint, naive scrapers run into trouble quickly:

- **IP rate limits.** Reddit enforces per-IP request limits and returns HTTP 429 when you exceed them. Datacenter IPs hit limits faster and are often pre-blocked.
- **User-Agent requirements.** Reddit explicitly requires a descriptive `User-Agent` header in the format `<platform>:<app>/<version> (by /u/<username>)`. Requests with default library user-agents (`python-requests/2.x`, `curl/7.x`) are rejected or severely throttled.
- **Dynamic anti-bot layers.** At volume, Reddit adds Cloudflare-style challenges in front of its endpoints. These require a browser fingerprint to pass, not a plain HTTP request.

The samples below handle the User-Agent requirement and route through the Web Unlocker to deal with IP rotation and challenge pages automatically.

## Prerequisites

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<unblocker_zone>:<password>@brd.superproxy.io:22225"
```

> **No Bright Data account yet?** <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Get started with the Web Unlocker →</a>

The code below fetches the top posts for a given subreddit. Replace `python` with any public subreddit name.

## PHP

```php
<?php
// Run: php reddit.php python
$proxy     = getenv('PROXY_URL');
$subreddit = $argv[1] ?? 'python';

$ch = curl_init("https://www.reddit.com/r/{$subreddit}/top.json?limit=25&t=day");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_PROXY          => $proxy,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_HTTPHEADER     => [
        'Accept: application/json',
        'User-Agent: cli:web-scraping-guide/1.0 (by /u/scraping_examples)',
    ],
]);
$body = curl_exec($ch);
curl_close($ch);

$listing  = json_decode($body, true);
$children = $listing['data']['children'] ?? [];

$posts = [];
foreach ($children as $child) {
    $d = $child['data'] ?? [];
    $posts[] = [
        'id'           => $d['id']            ?? null,
        'title'        => $d['title']         ?? null,
        'author'       => $d['author']        ?? null,
        'score'        => $d['score']         ?? null,
        'num_comments' => $d['num_comments']  ?? null,
        'url'          => $d['url']           ?? null,
        'created_utc'  => $d['created_utc']  ?? null,
    ];
}

echo json_encode($posts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
```

## Node.js

```javascript
// reddit.mjs — node reddit.mjs python
// Install: npm i axios https-proxy-agent
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent     = new HttpsProxyAgent(process.env.PROXY_URL);
const subreddit = process.argv[2] ?? 'python';

const { data: listing } = await axios.get(
  `https://www.reddit.com/r/${subreddit}/top.json?limit=25&t=day`,
  {
    httpsAgent: agent,
    proxy: false,
    timeout: 60_000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'cli:web-scraping-guide/1.0 (by /u/scraping_examples)',
    },
  }
);

const posts = (listing.data.children ?? []).map(({ data: d }) => ({
  id:           d.id           ?? null,
  title:        d.title        ?? null,
  author:       d.author       ?? null,
  score:        d.score        ?? null,
  num_comments: d.num_comments ?? null,
  url:          d.url          ?? null,
  created_utc:  d.created_utc  ?? null,
}));

console.log(JSON.stringify(posts, null, 2));
```

## Rust

```rust
// Cargo.toml:
//   reqwest = { version = "0.12", features = ["blocking"] }
//   serde_json = "1"
use serde_json::Value;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subreddit = std::env::args().nth(1).unwrap_or_else(|| "python".into());

    let client = reqwest::blocking::Client::builder()
        .proxy(reqwest::Proxy::all(std::env::var("PROXY_URL")?)?)
        .danger_accept_invalid_certs(true)
        .build()?;

    let body: Value = client
        .get(format!(
            "https://www.reddit.com/r/{subreddit}/top.json?limit=25&t=day"
        ))
        .header("Accept", "application/json")
        .header(
            "User-Agent",
            "cli:web-scraping-guide/1.0 (by /u/scraping_examples)",
        )
        .send()?
        .json()?;

    let children = body["data"]["children"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let posts: Vec<Value> = children
        .iter()
        .map(|child| {
            let d = &child["data"];
            serde_json::json!({
                "id":           d["id"],
                "title":        d["title"],
                "author":       d["author"],
                "score":        d["score"],
                "num_comments": d["num_comments"],
                "url":          d["url"],
                "created_utc":  d["created_utc"],
            })
        })
        .collect();

    println!("{}", serde_json::to_string_pretty(&posts)?);
    Ok(())
}
```

## Fetching post comments

Swap the URL template to pull the comment tree for a specific post. Append `.json` to the post's permalink and Reddit returns a two-element array: `[0]` is the post itself, `[1]` is the comment listing.

```
https://www.reddit.com/r/{subreddit}/comments/{post_id}.json?limit=50&depth=3
```

Each comment element has `kind = "t1"` and the same `data` structure with `body`, `author`, `score`, and `replies` (a nested `Listing`).

## Adapting for search and cross-subreddit queries

| Goal | URL pattern |
|------|-------------|
| Search one subreddit | `/r/<sub>/search.json?q=<query>&restrict_sr=1` |
| Site-wide search | `/search.json?q=<query>&sort=relevance&t=month` |
| New posts (firehose) | `/r/<sub>/new.json?limit=100` |
| Hot posts | `/r/<sub>/hot.json` |
| Rising posts | `/r/<sub>/rising.json` |

All accept the same proxy and User-Agent setup above. Pagination uses the `after` cursor from `data.after` in the response — pass it as `&after=<value>` in the next request to walk through all pages.

## Notes

- The `score` field represents net upvotes. Reddit fuzzes scores on new posts to deter vote-manipulation bots, so early scores are approximate.
- `author` is a string username; deleted or suspended accounts return `[deleted]` or `[removed]`.
- `selftext` contains the post body for text posts. It is empty for link posts and `[removed]` for moderator-deleted content.
- `created_utc` is a Unix timestamp in UTC. Multiply by 1000 for JavaScript `Date` compatibility.
- Reddit's anonymous rate limit sits around 100 requests per minute per IP — stay well below that. For production crawls, a rotating residential proxy pool is essential (see [proxy types explained](/learn/proxy-types-explained/)).
- `subreddit_type` in the post object reveals whether the subreddit is `public`, `restricted`, or `private`. Only `public` subreddits are accessible without authentication.

## Scaling to multiple subreddits

Monitoring dozens of subreddits for brand mentions, trend signals, or competitor intelligence requires rotating IPs, respecting rate limits across parallel workers, and handling temporary bans gracefully. The [Bright Data Web Unlocker](/reviews/bright-data-web-unlocker/) handles IP rotation and Cloudflare challenge pages transparently, so your code only needs to parse the JSON it receives. For avoiding blocks at higher request rates, the [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/) guide covers the broader strategy.

Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a> is well-suited for Reddit at scale — it presents genuine residential IPs with correct browser signals, eliminating the most common failure modes. For sentiment analysis workflows that span Reddit alongside other platforms, our [Social Media Scraping](/solutions/social-media-scraping/) overview maps out the full landscape.

**<a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Scrape Reddit at scale with Bright Data →</a>**

## FAQ

### Does Reddit allow web scraping?

Reddit permits scraping public pages at low rates under its robots.txt, but restricts commercial use of user-generated content. Always review Reddit's Terms of Service, Privacy Policy, and Developer Terms before large-scale collection, and respect rate limits.

### What is the .json trick for Reddit scraping?

Appending .json to any reddit.com URL — for example /r/python.json or a post URL with .json — returns the page's structured data as machine-readable JSON, making Reddit one of the most straightforward targets for structured extraction.

### Why do Reddit scrapers get blocked?

Reddit rate-limits by IP and blocks datacenter ranges outright. It also enforces a User-Agent policy and returns HTTP 429 when requests arrive too fast. Residential proxies that rotate IPs and send a descriptive User-Agent header reduce blocks significantly.

### What public Reddit data can I collect without a login?

Public subreddit listings, post titles, vote scores, comment counts, author names, selftext bodies, and post metadata are all available to anonymous requests. Private subreddits, user DMs, and suspended accounts require authentication and are off-limits for scraping.
