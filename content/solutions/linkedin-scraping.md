+++
title = "How to Scrape LinkedIn Data: Public Profiles, Companies, and Jobs"
description = "A practical guide to scraping public LinkedIn data — what's possible, the legal limits, why DIY breaks, and how to collect profiles, companies, and jobs at scale."
template = "page.html"
+++

LinkedIn is the richest source of professional data on the web — profiles, companies, job postings, and hiring signals that power recruiting tools, lead generation, and market research. It's also one of the **hardest and most legally sensitive** targets to scrape. This guide covers what you can realistically collect, where the limits are, and the approaches that actually hold up at scale.

## What "scraping LinkedIn" actually means

There's a critical distinction that determines both feasibility and legality:

- **Public data** — pages visible to a logged-out visitor (public profiles, company pages, public job listings). The landmark *hiQ Labs v. LinkedIn* litigation established that scraping **publicly accessible** data is generally not a Computer Fraud and Abuse Act violation.
- **Authenticated data** — anything behind a login. Accessing it requires accepting LinkedIn's User Agreement, which **prohibits scraping**. Automating logged-in accounts risks bans and legal exposure.

The practical rule: **stick to public, logged-out data, and never automate logged-in accounts.** Everything below assumes public data only. Consult counsel for your specific use case — this is guidance, not legal advice.

## Why DIY LinkedIn scraping breaks fast

Even on public pages, LinkedIn is aggressive:

- **Heavy bot detection.** Datacenter IPs are blocked almost immediately; you need [residential proxies](/goto/bd-residential/) that present as real users.
- **Rate limits and challenges.** Volume triggers CAPTCHAs and soft blocks within a handful of requests per IP.
- **Constant markup churn.** Profile and company DOM structures change often, breaking selector-based scrapers.
- **JavaScript rendering.** Much of the page hydrates client-side, so plain HTTP requests miss data unless you render or hit the underlying endpoints.

A minimal public-company fetch through an unblocking proxy looks like this — useful for low volume, but fragile:

```javascript
// linkedin-company.mjs — node linkedin-company.mjs stripe
// Install: npm i axios https-proxy-agent cheerio
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

const agent = new HttpsProxyAgent(process.env.PROXY_URL);
const slug  = process.argv[2] ?? 'stripe';

const { data: html } = await axios.get(`https://www.linkedin.com/company/${slug}`, {
  httpsAgent: agent, proxy: false, timeout: 60_000,
  headers: { 'Accept-Language': 'en-US,en;q=0.9' },
});

// Public company pages expose an Organization JSON-LD block.
const $ = cheerio.load(html);
let org = {};
$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const ld = JSON.parse($(el).text());
    if (ld['@type'] === 'Organization') org = ld;
  } catch { /* skip */ }
});

console.log(JSON.stringify({
  name: org.name ?? null,
  url: org.url ?? null,
  employees: org.numberOfEmployees?.value ?? null,
  description: org.description ?? null,
}, null, 2));
```

This works for a few requests. At hundreds or thousands, you'll spend most of your time fighting blocks and patching selectors instead of using the data.

## The scalable approach: managed collection

For production LinkedIn data, the economics favor a managed collector that handles proxies, rendering, anti-bot, and schema maintenance for you. Bright Data's [LinkedIn data collector](/goto/bd-linkedin/) returns structured public profile, company, and job records via API or scheduled delivery — you specify inputs and receive clean JSON, with the unblocking infrastructure abstracted away.

For analysis that doesn't need real-time freshness, pre-built [datasets](/goto/bd-datasets/) are often the better buy: large, ready-to-query snapshots of public LinkedIn data without running any scraper at all. See our [datasets vs. web scraping](/learn/datasets-vs-web-scraping/) breakdown for when buying beats building.

## Common use cases

- **Recruiting & sourcing** — public profiles matching role, skills, and location.
- **Lead generation** — company size, industry, and decision-maker signals.
- **Job market intelligence** — posting volume, titles, and hiring trends by company or sector.
- **Competitive monitoring** — headcount growth and org changes over time.

## Staying compliant and unblocked

- Public data only; never automate authenticated sessions.
- Respect rate limits — pace requests and rotate [residential IPs](/goto/bd-residential/).
- Collect only what you need, and review data-protection rules (GDPR/CCPA) for personal data.
- For the full anti-bot playbook, see [How to Avoid Getting Blocked](/learn/how-to-avoid-getting-blocked/).

*Related: [Web Scraping with Python](/learn/web-scraping-with-python/), the [Bright Data review](/reviews/bright-data/), and our [proxy types explained](/learn/proxy-types-explained/) guide.*

**[Collect public LinkedIn data at scale with Bright Data →](/goto/bd-linkedin/)**
