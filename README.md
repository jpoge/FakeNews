# FakeNewsID — Fake News Identifier & Tracker

A self-hosted web app that takes any article URL, traces the story across the web, builds an interactive link graph of where it appears, and calculates a fake news probability score.

---

## What it does

1. **Scrapes the article** — extracts title, author, publish date, and body text from the submitted URL using standard metadata tags and common article HTML patterns.

2. **Searches the web for the same story** — queries Google News RSS (free), Reddit (free), the Wayback Machine (free), and optionally NewsAPI.org, Twitter/X, and Bing News (optional API keys). Results are deduplicated and enriched with credibility data.

3. **Checks domain reputation** — every domain is looked up against a built-in database of 100+ news sources, rated 0–100 for credibility, with categories: `credible`, `mixed`, `questionable`, `fake`, `satire`, `factchecker`, `scientific`.

4. **Analyzes content quality** — the headline and body are scanned for sensational phrases ("YOU WON'T BELIEVE", "BOMBSHELL", etc.), emotional language, excessive capitalization, missing citations, and article length.

5. **Calculates a fake probability score** — a weighted algorithm combining all signals produces a score from 0% (credible) to 100% (likely fake).

6. **Renders an interactive link graph** — a D3.js force-directed graph shows every site covering the story as a node, color-coded by credibility, with edges showing corroboration relationships and social media spread.

7. **Builds a timeline** — all sources are sorted chronologically, so you can see where the story originated and how it spread.

8. **Logs every search** — results are written to the `logs/` folder as individual JSON files and a rolling `searches.log` text file.

---

## Fake Probability Scoring

The score is computed from five weighted factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Domain reputation | 30% | Credibility score of the article's source domain (0–100) |
| Corroboration | 28% | Number of credible outlets (score ≥ 80) covering the same story |
| Content quality | 15% | Sensational language, caps, missing citations, article length |
| Fact-checker coverage | 22% | Whether a fact-checker site has reviewed the story |
| Questionable amplification | 5% | Number of low-credibility sites spreading the story |

**Verdicts:**

| Score | Verdict |
|-------|---------|
| 0–20% | Credible / Well-Sourced |
| 20–40% | Likely Credible |
| 40–60% | Uncertain — Verify Independently |
| 60–80% | Questionable / Unverified |
| 80–100% | Likely Fake News |

---

## Setup

**Requirements:** Node.js 18 or later

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Configure API keys for expanded search coverage
cp .env.example .env
#   Edit .env and fill in any keys you have

# 3. Start the server
node server.js

# 4. Open the app
#   http://localhost:3000
```

The app works immediately without any API keys using Google News RSS, Reddit, and the Wayback Machine — all free.

---

## API Keys (Optional)

Copy `.env.example` to `.env` and add keys to unlock additional data sources:

| Variable | Source | Free Tier |
|----------|--------|-----------|
| `NEWSAPI_KEY` | [newsapi.org](https://newsapi.org) | 100 requests/day |
| `TWITTER_BEARER_TOKEN` | [developer.twitter.com](https://developer.twitter.com) | Basic tier |
| `BING_NEWS_KEY` | [Azure Cognitive Services](https://azure.microsoft.com/en-us/products/ai-services/bing-news-search) | 3,000 calls/month free |

---

## Data Sources

| Source | Cost | What it provides |
|--------|------|-----------------|
| Google News RSS | Free | News articles matching the story headline |
| Reddit JSON API | Free | Reddit posts and discussions linking to or discussing the story |
| Wayback Machine CDX API | Free | Historical snapshots of the article URL |
| NewsAPI.org | Free tier | Aggregated news from thousands of outlets |
| Twitter / X API v2 | Free tier | Recent tweets mentioning the story |
| Bing News Search | Free tier | Bing-indexed news articles |

---

## Link Graph

The link graph is an interactive D3.js force-directed visualization:

- **Nodes** represent domains where the story appears
- **Node color** indicates credibility:
  - Purple — the analyzed source article
  - Green — credible news source
  - Dark purple — fact-checker
  - Amber — mixed credibility
  - Orange — questionable source
  - Red — low credibility / known fake news
  - Cyan — social media platform
  - Gray — unknown source
- **Node size** scales with domain credibility score
- **Edges** show corroboration (solid) or social media links (dashed)
- **Interactions:** drag nodes to rearrange, scroll to zoom, click any node to open the source

---

## Logs

Every analysis is saved to the `logs/` directory:

- `searches.log` — one line per search with timestamp, verdict, fake %, domain, and URL
- `TIMESTAMP_UUID.json` — full JSON result for each search, including all sources found, scores, and the link graph data

The **Log History** tab in the app displays recent searches with their verdicts. Clicking any row re-runs the analysis.

---

## Project Structure

```
FakeNewsID/
├── server.js          # Node.js/Express backend — all analysis logic
├── index.html         # Single-page frontend
├── styles.css         # CSS (responsive, CSS variables)
├── app.js             # Frontend JS (D3.js graph, gauge, timeline, etc.)
├── package.json       # Node dependencies
├── .env.example       # API key template
└── logs/              # Auto-generated search logs
```

---

## Limitations

- **Social media is partially limited** — Facebook and Instagram do not provide public APIs for content search. Twitter/X requires a developer account. Reddit is fully searchable without any key.
- **Paywalled articles** may not scrape correctly if the source blocks bots or requires a login.
- **The domain reputation database** covers ~100+ major outlets. Unknown or niche domains receive a neutral score (50/100) rather than being flagged automatically.
- **No claim is infallible** — the probability score is a heuristic based on available signals, not a definitive verdict. Always read critically and cross-reference primary sources.
