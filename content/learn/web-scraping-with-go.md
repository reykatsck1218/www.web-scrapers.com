+++
title = "Web Scraping with Go: net/http, goquery & Proxies"
description = "Scrape the web with Go using net/http and goquery, extract JSON-LD structured data, route through a proxy, and scale with goroutines."
template = "page.html"
date = 2026-10-05

[extra]
faq = [
  { q = "Is Go a good language for web scraping?", a = "Yes. Go's standard library includes a production-quality HTTP client, and the goroutine model makes concurrent scraping straightforward without the overhead of OS threads. The goquery package gives you jQuery-style CSS selectors on top of Go's html.Node tree. The result is a fast, statically typed scraper that compiles to a single binary with no runtime dependencies." },
  { q = "Which Go packages do I need for web scraping?", a = "The minimal stack is net/http (standard library HTTP client), golang.org/x/net/html (HTML parser), and github.com/PuerkitoBio/goquery (CSS-selector API over the HTML tree). For JSON-LD and API responses the standard library encoding/json is sufficient. Add a sync.WaitGroup or errgroup for concurrency." },
  { q = "How do I route Go HTTP requests through a proxy?", a = "Create an http.Transport with ProxyURL set to your proxy address, then pass it to an http.Client. Store the proxy URL in a PROXY_URL environment variable — never hard-code credentials. For managed proxies that use a self-signed certificate, set TLSClientConfig.InsecureSkipVerify to true on the transport." },
  { q = "Can Go scrape JavaScript-rendered pages?", a = "Not with net/http alone — it fetches the raw HTML the server sends before any JavaScript runs. For JS-heavy targets, check first whether the data is embedded in a window.__NEXT_DATA__ or XHR/fetch call you can hit directly. If the page truly needs full rendering, route requests through a managed browser endpoint like Bright Data's Web Unlocker, which returns rendered HTML through the same proxy-compatible interface." },
]
+++

Go is a compelling choice for web scraping projects that need to be fast, easy to deploy, and simple to maintain. Unlike Python, there is no package manager drama or virtual-environment friction: `go build` produces a single static binary you can copy anywhere. Unlike Java, the memory footprint is small. And unlike Rust, the learning curve is gentle enough that a scraper can be production-ready in an afternoon.

This guide covers everything from a minimal page fetch to a concurrent scraper that routes through a proxy, extracts JSON-LD structured data, follows pagination, and saves results to disk.

## Project Setup

You need Go 1.21 or newer. Initialize a module and add goquery:

```bash
mkdir go-scraper && cd go-scraper
go mod init go-scraper
go get github.com/PuerkitoBio/goquery
```

That's the full dependency list. `net/http`, `encoding/json`, `sync`, and `os` are all standard library.

## Fetching a Page

```go
package main

import (
    "fmt"
    "io"
    "net/http"
    "time"
)

func main() {
    client := &http.Client{Timeout: 30 * time.Second}

    req, err := http.NewRequest("GET", "https://books.toscrape.com/", nil)
    if err != nil {
        panic(err)
    }
    req.Header.Set("User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "+
            "AppleWebKit/537.36 (KHTML, like Gecko) "+
            "Chrome/124.0.0.0 Safari/537.36")

    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Printf("%d bytes fetched\n", len(body))
}
```

Two habits worth establishing early:

- **Always set a `User-Agent` header.** The default Go `http.Client` sends `Go-http-client/1.1`, which is an immediate bot signal on most protected sites.
- **Always set a `Timeout`.** Without one, a stalled TCP connection blocks the goroutine forever.

## Parsing HTML with goquery

goquery wraps Go's `golang.org/x/net/html` parser with a jQuery-style API. Selectors compile internally and calls chain cleanly:

```go
package main

import (
    "fmt"
    "net/http"
    "time"

    "github.com/PuerkitoBio/goquery"
)

func main() {
    client := &http.Client{Timeout: 30 * time.Second}
    req, _ := http.NewRequest("GET", "https://books.toscrape.com/", nil)
    req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; GoScraper/1.0)")

    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    doc, err := goquery.NewDocumentFromReader(resp.Body)
    if err != nil {
        panic(err)
    }

    doc.Find("article.product_pod").Each(func(i int, s *goquery.Selection) {
        title, _ := s.Find("h3 > a").Attr("title")
        price := s.Find("p.price_color").Text()
        fmt.Printf("%s — %s\n", title, price)
    })
}
```

Key points:

- `goquery.NewDocumentFromReader` parses directly from the response body without buffering the entire HTML string first.
- `.Find()` takes standard CSS selectors. Nested `.Find()` calls are scoped to the parent selection, so `s.Find("h3 > a")` searches only within the current `article`.
- `.Attr()` returns `(value, exists)` — use the second return to distinguish a missing attribute from an empty one.

## Extracting JSON-LD Structured Data

Many e-commerce and content pages embed a `<script type="application/ld+json">` block containing a clean `Product`, `Article`, or `BreadcrumbList` object. Targeting this block is more reliable than CSS selectors tied to layout class names that change with every redesign:

```go
import (
    "encoding/json"
    "strings"

    "github.com/PuerkitoBio/goquery"
)

func extractJSONLD(doc *goquery.Document, schemaType string) map[string]interface{} {
    var result map[string]interface{}
    doc.Find(`script[type="application/ld+json"]`).Each(func(_ int, s *goquery.Selection) {
        if result != nil {
            return
        }
        var v map[string]interface{}
        if err := json.Unmarshal([]byte(strings.TrimSpace(s.Text())), &v); err != nil {
            return
        }
        if v["@type"] == schemaType {
            result = v
        }
    })
    return result
}
```

This is the same extraction pattern used in our [eBay Product Tracking](/solutions/ebay-product-tracking/) and [Amazon Product Tracking](/solutions/amazon-product-tracking/) guides. Check for a JSON-LD block before writing fragile CSS selectors — it is the most stable extraction target on any page that includes one.

## Routing Through a Proxy

Scaling past a few hundred requests without a proxy pool almost always ends in IP-based blocking. Route every request through a proxy by configuring an `http.Transport`:

```go
package main

import (
    "crypto/tls"
    "fmt"
    "net/http"
    "net/url"
    "os"
    "time"

    "github.com/PuerkitoBio/goquery"
)

func main() {
    proxyURL, err := url.Parse(os.Getenv("PROXY_URL"))
    if err != nil {
        panic("PROXY_URL is required: " + err.Error())
    }

    transport := &http.Transport{
        Proxy: http.ProxyURL(proxyURL),
        TLSClientConfig: &tls.Config{
            InsecureSkipVerify: true, // required for managed proxy TLS
        },
    }
    client := &http.Client{
        Transport: transport,
        Timeout:   60 * time.Second,
    }

    req, _ := http.NewRequest("GET", "https://example.com/", nil)
    req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; GoScraper/1.0)")

    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    doc, _ := goquery.NewDocumentFromReader(resp.Body)
    fmt.Println(doc.Find("title").Text())
}
```

Set `PROXY_URL` before running:

```bash
export PROXY_URL="http://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:22225"
go run main.go
```

For targets that actively fight scrapers, a raw rotating proxy pool often is not enough — you also need browser fingerprint management, TLS fingerprint matching, and CAPTCHA solving. Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a> wraps all of that behind a single proxy-compatible endpoint: your `http.Client` code stays identical, while the service handles IP rotation, fingerprinting, and challenge resolution transparently. See our [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/) for a detailed breakdown of what it does.

Not sure which proxy tier fits your target? [Proxy types explained](/learn/proxy-types-explained/) compares datacenter, residential, ISP, and mobile proxies so you can pick the right product for the protection level your target deploys.

## Pagination: Following "Next" Links

Most listing pages paginate. Resolve relative links against a base URL using `net/url`:

```go
import (
    "net/url"
    "time"
)

func scrapeAllPages(client *http.Client, start string) ([]map[string]string, error) {
    var results []map[string]string
    currentURL := start

    for currentURL != "" {
        req, _ := http.NewRequest("GET", currentURL, nil)
        req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; GoScraper/1.0)")

        resp, err := client.Do(req)
        if err != nil {
            return nil, err
        }
        doc, _ := goquery.NewDocumentFromReader(resp.Body)
        resp.Body.Close()

        doc.Find("article.product_pod").Each(func(_ int, s *goquery.Selection) {
            title, _ := s.Find("h3 > a").Attr("title")
            price := s.Find("p.price_color").Text()
            results = append(results, map[string]string{"title": title, "price": price})
        })

        nextHref, exists := doc.Find("li.next a").Attr("href")
        if !exists {
            break
        }
        base, _ := url.Parse(currentURL)
        next, _ := url.Parse(nextHref)
        currentURL = base.ResolveReference(next).String()

        // 0.9–1.5 s jitter — uniform timing is a bot signal
        time.Sleep(time.Duration(900+time.Now().UnixNano()%600) * time.Millisecond)
    }
    return results, nil
}
```

For pagination patterns beyond simple "next" links — offset parameters, cursor tokens, infinite scroll — see the [pagination guide](/learn/handling-pagination/).

## Concurrent Scraping with Goroutines

For high-throughput jobs, fetch pages concurrently using goroutines and a `sync.WaitGroup`. The `http.Client` is safe to share across goroutines:

```go
package main

import (
    "fmt"
    "net/http"
    "sync"
    "time"

    "github.com/PuerkitoBio/goquery"
)

func fetchTitle(client *http.Client, pageURL string, wg *sync.WaitGroup, results chan<- string) {
    defer wg.Done()

    req, _ := http.NewRequest("GET", pageURL, nil)
    req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; GoScraper/1.0)")

    resp, err := client.Do(req)
    if err != nil {
        return
    }
    defer resp.Body.Close()

    doc, _ := goquery.NewDocumentFromReader(resp.Body)
    results <- doc.Find("title").Text()
}

func main() {
    client := &http.Client{Timeout: 30 * time.Second}

    urls := []string{
        "https://books.toscrape.com/catalogue/page-1.html",
        "https://books.toscrape.com/catalogue/page-2.html",
        "https://books.toscrape.com/catalogue/page-3.html",
    }

    var wg sync.WaitGroup
    ch := make(chan string, len(urls))

    for _, u := range urls {
        wg.Add(1)
        go fetchTitle(client, u, &wg, ch)
    }

    wg.Wait()
    close(ch)

    for title := range ch {
        fmt.Println(title)
    }
}
```

Because `http.Client` maintains an internal connection pool and is designed for concurrent use, cloning is not needed — pass the pointer to every goroutine. For large fan-outs, consider using a semaphore (a buffered channel of empty structs) to cap the number of in-flight requests and avoid hammering the target.

## Saving Results to JSON

Write collected records to a JSON file with the standard library:

```go
import (
    "encoding/json"
    "os"
)

// Inside main, after collecting results:
out, _ := json.MarshalIndent(results, "", "  ")
os.WriteFile("output.json", out, 0644)
fmt.Printf("Saved %d records to output.json\n", len(results))
```

For CSV output, use the standard `encoding/csv` package:

```go
import (
    "encoding/csv"
    "os"
)

f, _ := os.Create("output.csv")
defer f.Close()
w := csv.NewWriter(f)
w.Write([]string{"title", "price"})
for _, row := range results {
    w.Write([]string{row["title"], row["price"]})
}
w.Flush()
```

## Handling JavaScript-Rendered Pages

`net/http` fetches what the server sends before any JavaScript executes. If view-source shows the data but your scraper does not find it, check whether:

1. **The data is in a hidden JSON blob** — look for `window.__INITIAL_STATE__`, `window.__NEXT_DATA__`, or similar in `<script>` tags. Parse them with `encoding/json` directly after extracting the raw string with goquery.
2. **The data comes from an API** — open DevTools → Network → Fetch/XHR, find the JSON endpoint the browser calls, and hit it directly in Go. This is faster and more stable than scraping the rendered page.
3. **The page is truly client-side rendered** — for these, route `http.Client` requests through Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a>, which renders the page in a real browser server-side and returns fully rendered HTML through the same proxy-compatible interface your existing code already uses.

## Scaling Up

Beyond the techniques above:

- **Connection pooling** is automatic with Go's `http.Client`. Reuse the same client across all requests rather than constructing a new one per fetch.
- **Retry logic** — implement exponential back-off on 429 and 5xx responses. A simple helper with `time.Sleep` and a max-attempts counter is usually sufficient.
- **Managed data collection** — when the target is a major platform (Amazon, LinkedIn, social media), building and maintaining a Go scraper often costs more than using a provider's ready-made product. See [Datasets vs. Web Scraping](/learn/datasets-vs-web-scraping/) to weigh that decision.

For a broader view of scraping strategies across languages and use cases, see our [web scraping use cases overview](/solutions/web-scraping-use-cases/) and compare proxy providers in our [reviews section](/reviews/).

**<a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Start scraping at scale with Bright Data's Web Unlocker →</a>**

## FAQ

### Is Go a good language for web scraping?

Yes. Go's standard library includes a production-quality HTTP client, and the goroutine model makes concurrent scraping straightforward without the overhead of OS threads. The goquery package gives you jQuery-style CSS selectors on top of Go's html.Node tree. The result is a fast, statically typed scraper that compiles to a single binary with no runtime dependencies.

### Which Go packages do I need for web scraping?

The minimal stack is `net/http` (standard library HTTP client), `golang.org/x/net/html` (HTML parser), and `github.com/PuerkitoBio/goquery` (CSS-selector API over the HTML tree). For JSON-LD and API responses the standard library `encoding/json` is sufficient. Add a `sync.WaitGroup` or `errgroup` for concurrency.

### How do I route Go HTTP requests through a proxy?

Create an `http.Transport` with `ProxyURL` set to your proxy address, then pass it to an `http.Client`. Store the proxy URL in a `PROXY_URL` environment variable — never hard-code credentials. For managed proxies that use a self-signed certificate, set `TLSClientConfig.InsecureSkipVerify` to `true` on the transport.

### Can Go scrape JavaScript-rendered pages?

Not with `net/http` alone — it fetches the raw HTML the server sends before any JavaScript runs. For JS-heavy targets, check first whether the data is embedded in a `window.__NEXT_DATA__` or XHR/fetch call you can hit directly. If the page truly needs full rendering, route requests through a managed browser endpoint like Bright Data's Web Unlocker, which returns rendered HTML through the same proxy-compatible interface.
