/* =========================================================================
   The Scraper Selector — interactive recommendation widget
   Updates results instantly as the user changes Target / Stack / Budget.
   Bright Data is surfaced as the "Top Pick" with a pitch that adapts to
   every selection. Swap the AFFILIATE_URL constant for your referral link.
   ========================================================================= */

// Bright Data referral link.
const AFFILIATE_URL = "https://get.brightdata.com/5q1kr89k0efo";

// ScraperAPI affiliate link.
const SCRAPERAPI_URL = "https://www.scraperapi.com/?fp_ref=web-guru-scraping";

const state = { target: "Amazon", stack: "No-Code", budget: "$$" };

/* ---- Bright Data top pick: best-fit product per (target, stack) ---------- */
const brightDataProduct = {
    Amazon: {
        "No-Code": { name: "Bright Data Web Scraper IDE", link: "/reviews/bright-data/" },
        "Python":  { name: "Bright Data Scraping Browser", link: "/learn/bright-data-scraping-browser/" },
        "Node.js": { name: "Bright Data Scraping Browser", link: "/learn/bright-data-scraping-browser/" }
    },
    Google: {
        "No-Code": { name: "Bright Data SERP API",         link: "/reviews/bright-data/" },
        "Python":  { name: "Bright Data Scraping Browser", link: "/learn/bright-data-scraping-browser/" },
        "Node.js": { name: "Bright Data Scraping Browser", link: "/learn/bright-data-scraping-browser/" }
    },
    Social: {
        "No-Code": { name: "Bright Data Data Collector",   link: "/reviews/bright-data/" },
        "Python":  { name: "Bright Data Scraping Browser", link: "/learn/bright-data-scraping-browser/" },
        "Node.js": { name: "Bright Data Scraping Browser", link: "/learn/bright-data-scraping-browser/" }
    },
    Other: {
        "No-Code": { name: "Bright Data Web Unlocker",     link: "/reviews/bright-data/" },
        "Python":  { name: "Bright Data Scraping Browser", link: "/learn/bright-data-scraping-browser/" },
        "Node.js": { name: "Bright Data Scraping Browser", link: "/learn/bright-data-scraping-browser/" }
    }
};

const targetBlurb = {
    Amazon: "Unmatched success rates against Amazon's aggressive anti-bot defenses.",
    Google: "Specialized SERP collection with accurate, geo-targeted results.",
    Social: "Residential & mobile IPs that stay unblocked on social platforms.",
    Other:  "A flexible unlocking engine that handles virtually any target."
};

const budgetPitch = {
    "$":   "Start on pay-as-you-go from just $5/GB — no monthly minimums, plus a 7-day free trial (no credit card).",
    "$$":  "Scale affordably with growth plans and up to 37% off on annual billing.",
    "$$$": "Enterprise-grade reliability with 99.9%+ success rates and dedicated 24/7 support."
};

/* ---- Alternatives pool (non-Bright Data) --------------------------------- */
const priceTier = { Smartproxy: 1, ScraperAPI: 1, Zenrows: 2, Oxylabs: 3 };

const alternatives = {
    Amazon: {
        "No-Code": [
            { name: "Oxylabs Web Scraper API", provider: "Oxylabs", link: "/reviews/oxylabs/", description: "Powerful managed API for high-volume Amazon data." },
            { name: "ScraperAPI", provider: "ScraperAPI", link: SCRAPERAPI_URL, description: "Robust, affordable API for scalable Amazon extraction." }
        ],
        "Python": [
            { name: "Zenrows (Python)", provider: "Zenrows", link: "/reviews/zenrows/", description: "Simplifies Amazon scraping with built-in anti-bot bypass." },
            { name: "ScraperAPI (Python)", provider: "ScraperAPI", link: SCRAPERAPI_URL, description: "Easy integration and a generous free tier for Python." }
        ],
        "Node.js": [
            { name: "ScraperAPI (Node.js)", provider: "ScraperAPI", link: SCRAPERAPI_URL, description: "Scalable API for Node.js Amazon scraping." },
            { name: "Zenrows (Node.js)", provider: "Zenrows", link: "/reviews/zenrows/", description: "Effortless Amazon scraping with Node.js." }
        ]
    },
    Google: {
        "No-Code": [
            { name: "Oxylabs SERP Scraper API", provider: "Oxylabs", link: "/reviews/oxylabs/", description: "AI-powered Google scraping with high accuracy." },
            { name: "Zenrows No-Code", provider: "Zenrows", link: "/reviews/zenrows/", description: "Quickly extract Google data without writing code." }
        ],
        "Python": [
            { name: "Zenrows (Python)", provider: "Zenrows", link: "/reviews/zenrows/", description: "Effective at bypassing Google's anti-bot measures." },
            { name: "Oxylabs (Python)", provider: "Oxylabs", link: "/reviews/oxylabs/", description: "High-performance proxies for Python SERP scraping." }
        ],
        "Node.js": [
            { name: "ScraperAPI (Node.js)", provider: "ScraperAPI", link: SCRAPERAPI_URL, description: "Robust API for Google data with Node.js." },
            { name: "Oxylabs (Node.js)", provider: "Oxylabs", link: "/reviews/oxylabs/", description: "Fast, reliable proxies for Node.js SERP projects." }
        ]
    },
    Social: {
        "No-Code": [
            { name: "Oxylabs Public Data API", provider: "Oxylabs", link: "/reviews/oxylabs/", description: "Tailored managed solutions for social media data." },
            { name: "Zenrows No-Code", provider: "Zenrows", link: "/reviews/zenrows/", description: "Effortless social media data extraction." }
        ],
        "Python": [
            { name: "Zenrows (Python)", provider: "Zenrows", link: "/reviews/zenrows/", description: "Simplifies social media scraping in Python." },
            { name: "Oxylabs (Python)", provider: "Oxylabs", link: "/reviews/oxylabs/", description: "Reliable proxies for Python social scraping." }
        ],
        "Node.js": [
            { name: "ScraperAPI (Node.js)", provider: "ScraperAPI", link: SCRAPERAPI_URL, description: "Dedicated API for social data in Node.js." },
            { name: "Zenrows (Node.js)", provider: "Zenrows", link: "/reviews/zenrows/", description: "Streamlined social media scraping with Node.js." }
        ]
    },
    Other: {
        "No-Code": [
            { name: "Oxylabs Web Scraper API", provider: "Oxylabs", link: "/reviews/oxylabs/", description: "Versatile API for a wide range of scraping needs." },
            { name: "Zenrows No-Code", provider: "Zenrows", link: "/reviews/zenrows/", description: "General-purpose scraping without writing code." }
        ],
        "Python": [
            { name: "Zenrows (Python)", provider: "Zenrows", link: "/reviews/zenrows/", description: "General-purpose scraping API for Python." },
            { name: "Smartproxy (Python)", provider: "Smartproxy", link: "/reviews/smartproxy/", description: "Affordable, beginner-friendly proxies for Python." }
        ],
        "Node.js": [
            { name: "ScraperAPI (Node.js)", provider: "ScraperAPI", link: SCRAPERAPI_URL, description: "Reliable API for general Node.js scraping." },
            { name: "Smartproxy (Node.js)", provider: "Smartproxy", link: "/reviews/smartproxy/", description: "Budget-friendly proxies for Node.js projects." }
        ]
    }
};

/* ---- Render -------------------------------------------------------------- */
function buildTopPick() {
    const product = brightDataProduct[state.target][state.stack];
    const isScrapingBrowser = product.link.indexOf("scraping-browser") !== -1;
    return {
        product: product,
        learnLink: product.link,
        isScrapingBrowser: isScrapingBrowser,
        blurb: targetBlurb[state.target],
        pitch: budgetPitch[state.budget]
    };
}

function buildAlternatives() {
    const list = (alternatives[state.target] && alternatives[state.target][state.stack]) || [];
    const budgetRank = { "$": 1, "$$": 2, "$$$": 3 }[state.budget];
    // Sort so providers closest to the chosen budget tier appear first.
    return list.slice().sort(function (a, b) {
        const da = Math.abs((priceTier[a.provider] || 2) - budgetRank);
        const db = Math.abs((priceTier[b.provider] || 2) - budgetRank);
        return da - db;
    });
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

function render() {
    const out = document.getElementById("recommendations-output");
    if (!out) return;

    const top = buildTopPick();
    const alts = buildAlternatives();

    let html = "";
    html += '<p class="recommendations-output__summary">Best match for ' +
        '<strong>' + escapeHtml(state.target) + '</strong> · ' +
        '<strong>' + escapeHtml(state.stack) + '</strong> · ' +
        '<strong>' + escapeHtml(state.budget) + '</strong></p>';

    // Top pick (Bright Data)
    html += '<div class="rec-top">';
    html += '<span class="rec-top__badge">★ Top Pick</span>';
    html += '<h4 class="rec-top__name">' + escapeHtml(top.product.name) + '</h4>';
    html += '<p class="rec-top__blurb">' + escapeHtml(top.blurb) + '</p>';
    html += '<p class="rec-top__pitch">' + escapeHtml(top.pitch) + '</p>';
    html += '<div class="rec-top__actions">';
    html += '<a class="btn btn--primary" href="' + AFFILIATE_URL + '" target="_blank" rel="sponsored noopener noreferrer">Start Free Trial →</a>';
    html += '<a class="btn btn--secondary" href="' + top.learnLink + '">' +
        (top.isScrapingBrowser ? "Read the Guide" : "Read Review") + '</a>';
    html += '</div></div>';

    // Alternatives
    if (alts.length) {
        html += '<p class="rec-alt__heading">Other strong options</p>';
        html += '<div class="rec-alt__grid">';
        alts.forEach(function (rec) {
            const external = /^https?:\/\//.test(rec.link);
            html += '<div class="recommendation-card">';
            html += '<h5>' + escapeHtml(rec.name) + '</h5>';
            html += '<p>' + escapeHtml(rec.description) + '</p>';
            if (external) {
                html += '<a href="' + rec.link + '" target="_blank" rel="sponsored noopener noreferrer">Visit Site →</a>';
            } else {
                html += '<a href="' + rec.link + '">View Review</a>';
            }
            html += '</div>';
        });
        html += '</div>';
    }

    out.innerHTML = html;
}

/* ---- Interaction: pill buttons update state instantly -------------------- */
function initSelector() {
    const groups = document.querySelectorAll(".selector-group[data-field]");
    groups.forEach(function (group) {
        const field = group.getAttribute("data-field");
        group.addEventListener("click", function (e) {
            const btn = e.target.closest(".selector-option");
            if (!btn || !group.contains(btn)) return;
            state[field] = btn.getAttribute("data-value");
            group.querySelectorAll(".selector-option").forEach(function (b) {
                const active = b === btn;
                b.classList.toggle("is-active", active);
                b.setAttribute("aria-checked", active ? "true" : "false");
            });
            render();
        });
    });

    // Optional CTA button — results are already live, so just nudge focus.
    const viewBtn = document.getElementById("view-matches-button");
    if (viewBtn) {
        viewBtn.addEventListener("click", function (e) {
            e.preventDefault();
            const out = document.getElementById("recommendations-output");
            if (out) {
                out.classList.remove("recommendations-output--pulse");
                void out.offsetWidth; // force reflow to restart the animation
                out.classList.add("recommendations-output--pulse");
                out.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        });
    }

    render();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSelector);
} else {
    initSelector();
}
