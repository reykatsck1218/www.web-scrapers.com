+++
title = "Web Scraping with Java: Jsoup, OkHttp & Proxies"
description = "Scrape the web in Java using Jsoup and OkHttp, extract JSON-LD structured data, route requests through a proxy, and run concurrent scrapers with ExecutorService."
template = "page.html"
date = 2026-10-12

[extra]
faq = [
  { q = "Is Java a good language for web scraping?", a = "Yes, especially in enterprise environments that already run Java. Jsoup is one of the most mature HTML parsers available across any language — its CSS selector API is clean, its error tolerance is excellent, and it handles real-world malformed markup without flinching. OkHttp adds a production-grade HTTP client with connection pooling, HTTP/2, automatic retries, and first-class proxy support. The main trade-off is verbosity compared to Python, but the tooling, type safety, and JVM performance make Java a solid scraping platform." },
  { q = "What Java libraries do I need for web scraping?", a = "The core stack is Jsoup (HTML parsing with CSS selectors, version 1.17+), OkHttp (HTTP client with proxy and interceptor support, version 4.x), and Jackson or Gson for JSON parsing. Add java.util.concurrent for thread pools. All are available on Maven Central and install via Maven or Gradle with a single dependency line." },
  { q = "How do I route Java OkHttp requests through a proxy?", a = "Construct a java.net.Proxy with the proxy host and port, then pass it to OkHttpClient.Builder via .proxy(proxy). For authenticated proxies, add an Authenticator via .proxyAuthenticator() that returns credentials for 407 challenges. Store credentials in environment variables, not in source code. For managed proxy TLS interception, add a custom SSLSocketFactory that trusts the proxy's CA certificate." },
  { q = "Can Java scrape JavaScript-rendered pages?", a = "Not with Jsoup or OkHttp alone — both fetch raw HTML before any JavaScript executes. For JavaScript-heavy targets, point OkHttp at a managed rendering endpoint such as Bright Data's Web Unlocker, which returns fully rendered HTML through a proxy-compatible interface without you running a headless browser yourself." },
]
+++

Java is not the trendiest choice for web scraping, but in enterprise environments where the backend already runs on the JVM, it is often the pragmatic one. Jsoup is one of the most battle-tested HTML parsers available in any language. OkHttp is a production-grade HTTP client with connection pooling, HTTP/2, and first-class proxy support. Together they give you a complete, well-maintained scraping stack that integrates cleanly into larger Java applications.

This guide covers everything from a minimal page fetch to a production-ready scraper that routes through a proxy, parses HTML and embedded JSON-LD, and processes a URL queue concurrently with an `ExecutorService`.

## Prerequisites and Dependencies

Add these to your `pom.xml` (Maven) or `build.gradle` (Gradle):

**Maven:**

```xml
<dependencies>
  <dependency>
    <groupId>org.jsoup</groupId>
    <artifactId>jsoup</artifactId>
    <version>1.18.1</version>
  </dependency>
  <dependency>
    <groupId>com.squareup.okhttp3</groupId>
    <artifactId>okhttp</artifactId>
    <version>4.12.0</version>
  </dependency>
  <dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
    <version>2.17.1</version>
  </dependency>
</dependencies>
```

**Gradle:**

```groovy
implementation 'org.jsoup:jsoup:1.18.1'
implementation 'com.squareup.okhttp3:okhttp:4.12.0'
implementation 'com.fasterxml.jackson.core:jackson-databind:2.17.1'
```

All three are on Maven Central. You do not need anything beyond a standard JDK 17+ installation.

## Fetching a Page with OkHttp

Jsoup has a built-in `connect()` method, but it lacks the proxy configurability and interceptor chain that OkHttp provides. Use OkHttp for the transport layer and Jsoup purely for HTML parsing:

```java
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

public class BasicScraper {

    private static final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();

    public static Document fetchPage(String url) throws IOException {
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent",
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/124.0.0.0 Safari/537.36")
                .header("Accept-Language", "en-US,en;q=0.9")
                .build();

        try (Response response = client.newCall(request).execute()) {
            String html = response.body().string();
            return Jsoup.parse(html, url); // base URI for relative link resolution
        }
    }

    public static void main(String[] args) throws IOException {
        Document doc = fetchPage("https://books.toscrape.com/");
        System.out.printf("%d bytes fetched%n", doc.html().length());
    }
}
```

Three habits to establish immediately:

- **Always set a `User-Agent` header.** The default OkHttp string is an instant bot signal on most protected sites.
- **Always set timeouts.** Without them, a stalled connection blocks the thread indefinitely.
- **Pass the base URI to `Jsoup.parse`.** It resolves relative `href` and `src` attributes to absolute URLs, which matters when you follow links.

## Parsing HTML with Jsoup

Jsoup's CSS selector API is expressive and forgiving — it handles real-world malformed HTML the same way a browser does:

```java
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

public class BookScraper {

    public static void scrapeBooks(Document doc) {
        Elements items = doc.select("article.product_pod");

        for (Element item : items) {
            String title = item.select("h3 > a").attr("title");
            String price = item.select("p.price_color").text().trim();
            System.out.printf("%s — %s%n", title, price);
        }
    }
}
```

Key points:

- `.select(cssSelector)` returns an `Elements` collection; it never throws even when nothing matches.
- `.attr("title")` reads an HTML attribute; `.text()` concatenates all text nodes inside an element, including nested ones.
- `.first()` and `.last()` are safe on empty `Elements` — they return `null`, not an exception.

## Extracting JSON-LD Structured Data

Many e-commerce and content sites embed a `<script type="application/ld+json">` block containing a clean `Product`, `Article`, or `BreadcrumbList` object. Targeting this block is more reliable than CSS selectors tied to layout class names:

```java
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

public class JsonLdExtractor {

    private static final ObjectMapper mapper = new ObjectMapper();

    public static JsonNode extractJsonLd(Document doc, String schemaType) {
        for (Element script : doc.select("script[type=application/ld+json]")) {
            try {
                JsonNode node = mapper.readTree(script.data());
                if (schemaType.equals(node.path("@type").asText(null))) {
                    return node;
                }
            } catch (Exception ignored) {
                // malformed JSON-LD block — skip
            }
        }
        return null;
    }
}
```

This is the same extraction strategy used in our [eBay Product Tracking](/solutions/ebay-product-tracking/) and [Amazon Product Tracking](/solutions/amazon-product-tracking/) guides — the JSON-LD block is the most stable data target on any page that includes it. Check for it before writing CSS selectors against the visual layout.

## Routing Requests Through a Proxy

Scaling past a few hundred requests without a proxy pool is a fast path to IP-based blocking. OkHttp has first-class proxy support through `java.net.Proxy`:

```java
import okhttp3.Authenticator;
import okhttp3.Credentials;
import okhttp3.OkHttpClient;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URI;

public class ProxyClientFactory {

    public static OkHttpClient build() {
        String proxyUrl = System.getenv("PROXY_URL");
        // e.g. http://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:22225

        URI uri = URI.create(proxyUrl);
        Proxy proxy = new Proxy(Proxy.Type.HTTP,
                new InetSocketAddress(uri.getHost(), uri.getPort()));

        String userInfo = uri.getUserInfo();
        Authenticator auth = null;
        if (userInfo != null) {
            String[] parts = userInfo.split(":", 2);
            String credential = Credentials.basic(parts[0], parts[1]);
            auth = (route, response) -> response.request().newBuilder()
                    .header("Proxy-Authorization", credential)
                    .build();
        }

        OkHttpClient.Builder builder = new OkHttpClient.Builder()
                .proxy(proxy)
                .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS);

        if (auth != null) builder.proxyAuthenticator(auth);

        return builder.build();
    }
}
```

For targets that actively block scrapers, a raw rotating proxy pool often isn't enough — you also need browser fingerprint management, TLS fingerprint matching, and CAPTCHA solving. Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a> wraps all of that behind a single proxy-compatible endpoint: your OkHttp code stays identical while the service handles IP rotation, fingerprinting, and challenge resolution transparently. See our [Bright Data Web Unlocker review](/reviews/bright-data-web-unlocker/) for a detailed breakdown.

Not sure which proxy tier matches your target? [Proxy types explained](/learn/proxy-types-explained/) compares datacenter, residential, ISP, and mobile proxies so you can pick the right product for the protection level your target deploys.

## Concurrent Scraping with ExecutorService

Java's `ExecutorService` provides a bounded thread pool that keeps memory predictable under a large URL queue:

```java
import okhttp3.OkHttpClient;
import org.jsoup.nodes.Document;

import java.util.List;
import java.util.concurrent.*;

public class ConcurrentScraper {

    private static final int THREAD_COUNT = 20;

    public static void scrapeAll(List<String> urls) throws InterruptedException {
        OkHttpClient client = ProxyClientFactory.build();
        ExecutorService pool = Executors.newFixedThreadPool(THREAD_COUNT);

        for (String url : urls) {
            pool.submit(() -> {
                try {
                    // polite delay: 0.8 – 1.4 s random jitter
                    Thread.sleep(800 + ThreadLocalRandom.current().nextLong(600));
                    Document doc = fetchPage(client, url);
                    String title = doc.title();
                    System.out.printf("OK  %s → %s%n", url, title);
                } catch (Exception e) {
                    System.err.printf("ERR %s: %s%n", url, e.getMessage());
                }
            });
        }

        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.MINUTES);
    }

    private static Document fetchPage(OkHttpClient client, String url) throws Exception {
        okhttp3.Request request = new okhttp3.Request.Builder()
                .url(url)
                .header("User-Agent",
                        "Mozilla/5.0 (compatible; JavaScraper/1.0)")
                .build();
        try (okhttp3.Response response = client.newCall(request).execute()) {
            return Jsoup.parse(response.body().string(), url);
        }
    }
}
```

The random jitter (0.8–1.4 s) matters — uniform timing is itself a bot signal. `OkHttpClient` is thread-safe and maintains an internal connection pool, so a single instance is shared across all threads without synchronization. For pagination strategies beyond simple page numbers, see the [pagination guide](/learn/handling-pagination/).

## Handling JavaScript-Rendered Pages

OkHttp fetches what the server sends before any JavaScript executes. If view-source shows the data but your scraper does not find it, check whether the data is:

1. **In a hidden JSON blob** — look for `window.__INITIAL_STATE__`, `window.__NEXT_DATA__`, or similar inside `<script>` tags. Select them with `doc.select("script:not([src])")` and parse with Jackson.
2. **Fetched from an API** — open DevTools → Network → XHR/Fetch and look for JSON endpoints the browser calls. Hitting those directly is faster and more reliable than rendering the page.
3. **Truly rendered client-side** — for these, point OkHttp at Bright Data's <a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Web Unlocker</a>, which renders the page in a real browser server-side and returns the fully rendered HTML through the same proxy-compatible interface your existing code already uses.

## Saving Results to JSON

Write collected records with Jackson:

```java
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.File;
import java.util.List;

public class ResultWriter {

    private static final ObjectMapper mapper = new ObjectMapper();

    public static void saveJson(List<String[]> records, String path) throws Exception {
        ArrayNode array = mapper.createArrayNode();
        for (String[] r : records) {
            ObjectNode node = mapper.createObjectNode();
            node.put("title", r[0]);
            node.put("price", r[1]);
            array.add(node);
        }
        mapper.writerWithDefaultPrettyPrinter().writeValue(new File(path), array);
        System.out.printf("Saved %d records to %s%n", records.size(), path);
    }
}
```

## Scaling Up

Beyond the techniques above:

- **Retry logic** — implement an OkHttp `Interceptor` that catches 429 and 5xx responses and retries with exponential back-off before the response reaches your application code.
- **Connection pool sizing** — tune `OkHttpClient.Builder().connectionPool(new ConnectionPool(maxIdleConnections, keepAliveDuration, unit))` when you have many concurrent workers sharing one client.
- **Managed data collection** — when the target is a major platform (Amazon, LinkedIn, social media), building and maintaining a Java scraper often costs more than using a provider's ready-made product. See [Datasets vs. Web Scraping](/learn/datasets-vs-web-scraping/) to weigh that decision.

For a broader view of scraping strategies, see our [web scraping use cases overview](/solutions/web-scraping-use-cases/) and compare proxy providers in our [reviews section](/reviews/).

**<a href="/goto/bd-web-unlocker/" rel="sponsored noopener">Start scraping at scale with Bright Data's Web Unlocker →</a>**

## FAQ

### Is Java a good language for web scraping?

Yes, especially in enterprise environments that already run Java. Jsoup is one of the most mature HTML parsers available across any language — its CSS selector API is clean, its error tolerance is excellent, and it handles real-world malformed markup without flinching. OkHttp adds a production-grade HTTP client with connection pooling, HTTP/2, automatic retries, and first-class proxy support. The main trade-off is verbosity compared to Python, but the tooling, type safety, and JVM performance make Java a solid scraping platform.

### What Java libraries do I need for web scraping?

The core stack is Jsoup (HTML parsing with CSS selectors, version 1.17+), OkHttp (HTTP client with proxy and interceptor support, version 4.x), and Jackson or Gson for JSON parsing. Add `java.util.concurrent` for thread pools. All are available on Maven Central and install via Maven or Gradle with a single dependency line.

### How do I route Java OkHttp requests through a proxy?

Construct a `java.net.Proxy` with the proxy host and port, then pass it to `OkHttpClient.Builder` via `.proxy(proxy)`. For authenticated proxies, add an `Authenticator` via `.proxyAuthenticator()` that returns credentials for 407 challenges. Store credentials in environment variables, not in source code. For managed proxy TLS interception, add a custom `SSLSocketFactory` that trusts the proxy's CA certificate.

### Can Java scrape JavaScript-rendered pages?

Not with Jsoup or OkHttp alone — both fetch raw HTML before any JavaScript executes. For JavaScript-heavy targets, point OkHttp at a managed rendering endpoint such as Bright Data's Web Unlocker, which returns fully rendered HTML through a proxy-compatible interface without you running a headless browser yourself.
