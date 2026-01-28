const recommendationsData = {
    "Amazon": {
        "No-Code": [
            { name: "Bright Data Web Scraper IDE", link: "/reviews/bright-data/", description: "Excellent for complex Amazon scraping without code." },
            { name: "Oxylabs Web Scraper API", link: "/reviews/oxylabs/", description: "Powerful API for high-volume Amazon data." },
            { name: "ScraperAPI", link: "/reviews/scraperapi/", description: "Robust API for scalable Amazon data extraction." }
        ],
        "Python": [
            { name: "Bright Data Residential Proxies (Python)", link: "/reviews/bright-data/", description: "Unmatched success rates for Python scripts on Amazon." },
            { name: "Zenrows (Python)", link: "/reviews/zenrows/", description: "Simplifies Amazon scraping with anti-bot bypass." },
            { name: "ScraperAPI (Python)", link: "/reviews/scraperapi/", description: "Easy integration for Python projects." }
        ],
        "Node.js": [
            { name: "Bright Data Residential Proxies (Node.js)", link: "/reviews/bright-data/", description: "Reliable and fast for Node.js Amazon projects." },
            { name: "ScraperAPI (Node.js)", link: "/reviews/scraperapi/", description: "Scalable API for Node.js Amazon scraping." },
            { name: "Zenrows (Node.js)", link: "/reviews/zenrows/", description: "Effortless Amazon scraping with Node.js." }
        ]
    },
    "Google": {
        "No-Code": [
            { name: "Bright Data Search Engine Crawler", link: "/reviews/bright-data/", description: "Specialized for Google SERP data collection." },
            { name: "Oxylabs SERP Scraper API", link: "/reviews/oxylabs/", description: "AI-powered Google scraping with high accuracy." },
            { name: "Zenrows No-Code Solution", link: "/reviews/zenrows/", description: "Quickly extract Google data without coding." }
        ],
        "Python": [
            { name: "Bright Data Residential Proxies (Python)", link: "/reviews/bright-data/", description: "Superior for large-scale Google data extraction." },
            { name: "Zenrows (Python)", link: "/reviews/zenrows/", description: "Effective for bypassing Google's anti-bot measures." },
            { name: "Oxylabs (Python)", link: "/reviews/oxylabs/", description: "High performance proxies for Python Google scraping." }
        ],
        "Node.js": [
            { name: "Bright Data Residential Proxies (Node.js)", link: "/reviews/bright-data/", description: "Consistent performance for Node.js Google scraping." },
            { name: "ScraperAPI (Node.js)", link: "/reviews/scraperapi/", description: "Robust API for Google data with Node.js." },
            { name: "Oxylabs (Node.js)", link: "/reviews/oxylabs/", description: "Fast and reliable for Node.js Google projects." }
        ]
    },
    "Social": {
        "No-Code": [
            { name: "Bright Data Data Collector", link: "/reviews/bright-data/", description: "Managed data collection from social media platforms." },
            { name: "Oxylabs Public Data Gathering", link: "/reviews/oxylabs/", description: "Tailored solutions for social media data." },
            { name: "Zenrows No-Code Solution", link: "/reviews/zenrows/", description: "Effortless social media data extraction." }
        ],
        "Python": [
            { name: "Bright Data Mobile Proxies (Python)", link: "/reviews/bright-data/", description: "Best for social media, avoiding blocks." },
            { name: "Zenrows (Python)", link: "/reviews/zenrows/", description: "Simplifies social media scraping." },
            { name: "Oxylabs (Python)", link: "/reviews/oxylabs/", description: "Reliable proxies for Python social scraping." }
        ],
        "Node.js": [
            { name: "Bright Data Mobile Proxies (Node.js)", link: "/reviews/bright-data/", description: "High success rates on social platforms with Node.js." },
            { name: "ScraperAPI (Node.js)", link: "/reviews/scraperapi/", description: "Dedicated API for social data." },
            { name: "Zenrows (Node.js)", link: "/reviews/zenrows/", description: "Streamlined social media scraping with Node.js." }
        ]
    },
    "Other": {
        "No-Code": [
            { name: "Bright Data Web Unlocker", link: "/reviews/bright-data/", description: "Automated solution for any target, no code needed." },
            { name: "Oxylabs Web Scraper API", link: "/reviews/oxylabs/", description: "Versatile API for various web scraping needs." },
            { name: "Zenrows No-Code Solution", link: "/reviews/zenrows/", description: "General-purpose scraping without coding." }
        ],
        "Python": [
            { name: "Bright Data Residential Proxies (Python)", link: "/reviews/bright-data/", description: "Flexible and powerful for diverse Python projects." },
            { name: "Zenrows (Python)", link: "/reviews/zenrows/", description: "General-purpose scraping API for Python." },
            { name: "Oxylabs (Python)", link: "/reviews/oxylabs/", description: "Reliable proxies for diverse Python scraping." }
        ],
        "Node.js": [
            { name: "Bright Data Residential Proxies (Node.js)", link: "/reviews/bright-data/", description: "Robust infrastructure for any Node.js scraping task." },
            { name: "ScraperAPI (Node.js)", link: "/reviews/scraperapi/", description: "Reliable API for general Node.js scraping." },
            { name: "Oxylabs (Node.js)", link: "/reviews/oxylabs/", description: "Efficient proxies for various Node.js scraping projects." }
        ]
    }
};

function updateRecommendations() {
    const scrapeTarget = document.getElementById('scrape-target').value;
    const preferredStack = document.getElementById('preferred-stack').value;
    const recommendationsOutput = document.getElementById('recommendations-output');

    let recommendations = [];

    if (recommendationsData[scrapeTarget] && recommendationsData[scrapeTarget][preferredStack]) {
        recommendations = recommendationsData[scrapeTarget][preferredStack];
    }

    recommendationsOutput.innerHTML = ''; // Clear previous recommendations

    if (recommendations.length > 0) {
        const heading = document.createElement('h4');
        heading.textContent = 'Our Top Recommendations for You:';
        recommendationsOutput.appendChild(heading);

        recommendations.forEach(rec => {
            const card = document.createElement('div');
            card.classList.add('recommendation-card');

            const name = document.createElement('h5');
            name.textContent = rec.name;
            card.appendChild(name);

            const description = document.createElement('p');
            description.textContent = rec.description;
            card.appendChild(description);

            const link = document.createElement('a');
            link.href = rec.link;
            link.textContent = 'View Review';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            card.appendChild(link);

            recommendationsOutput.appendChild(card);
        });
    } else {
        recommendationsOutput.innerHTML = '<p>No specific recommendations found for your selection. Explore our <a href="/reviews/">full list of reviews</a>.</p>';
    }
}

// Attach event listeners to dropdowns and the button
document.getElementById('scrape-target').addEventListener('change', updateRecommendations);
document.getElementById('preferred-stack').addEventListener('change', updateRecommendations);
document.getElementById('view-matches-button').addEventListener('click', (event) => {
    event.preventDefault(); // Prevent default button behavior
    updateRecommendations();
});

// Initial call to display recommendations on page load
updateRecommendations();