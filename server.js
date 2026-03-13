require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Ensure logs directory exists
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ============================================================
// DOMAIN REPUTATION DATABASE
// Scores: 0-100 (higher = more credible, lower = more fake)
// ============================================================
const DOMAIN_REPUTATION = {
  // ─── Highly Credible Wire Services (90-100) ───────────────
  'reuters.com':        { score: 98, category: 'credible',    label: 'Reuters (Wire Service)' },
  'apnews.com':         { score: 97, category: 'credible',    label: 'AP News (Wire Service)' },
  'afp.com':            { score: 95, category: 'credible',    label: 'AFP (Wire Service)' },
  'bbc.com':            { score: 96, category: 'credible',    label: 'BBC News' },
  'bbc.co.uk':          { score: 96, category: 'credible',    label: 'BBC News' },
  'theguardian.com':    { score: 91, category: 'credible',    label: 'The Guardian' },
  'economist.com':      { score: 93, category: 'credible',    label: 'The Economist' },
  'ft.com':             { score: 92, category: 'credible',    label: 'Financial Times' },
  'wsj.com':            { score: 91, category: 'credible',    label: 'Wall Street Journal' },
  'nytimes.com':        { score: 90, category: 'credible',    label: 'New York Times' },
  'washingtonpost.com': { score: 89, category: 'credible',    label: 'Washington Post' },
  'npr.org':            { score: 93, category: 'credible',    label: 'NPR' },
  'pbs.org':            { score: 91, category: 'credible',    label: 'PBS' },
  'bloomberg.com':      { score: 90, category: 'credible',    label: 'Bloomberg' },

  // ─── Credible Broadcast & Print (80-90) ──────────────────
  'abcnews.go.com':     { score: 85, category: 'credible',    label: 'ABC News' },
  'cbsnews.com':        { score: 84, category: 'credible',    label: 'CBS News' },
  'nbcnews.com':        { score: 83, category: 'credible',    label: 'NBC News' },
  'cnn.com':            { score: 82, category: 'credible',    label: 'CNN' },
  'msnbc.com':          { score: 76, category: 'credible',    label: 'MSNBC (Left-Leaning)' },
  'usatoday.com':       { score: 82, category: 'credible',    label: 'USA Today' },
  'latimes.com':        { score: 83, category: 'credible',    label: 'Los Angeles Times' },
  'chicagotribune.com': { score: 81, category: 'credible',    label: 'Chicago Tribune' },
  'bostonglobe.com':    { score: 83, category: 'credible',    label: 'Boston Globe' },
  'seattletimes.com':   { score: 81, category: 'credible',    label: 'Seattle Times' },
  'politico.com':       { score: 85, category: 'credible',    label: 'Politico' },
  'thehill.com':        { score: 80, category: 'credible',    label: 'The Hill' },
  'axios.com':          { score: 86, category: 'credible',    label: 'Axios' },
  'time.com':           { score: 82, category: 'credible',    label: 'TIME Magazine' },
  'forbes.com':         { score: 80, category: 'credible',    label: 'Forbes' },
  'newsweek.com':       { score: 74, category: 'credible',    label: 'Newsweek' },
  'vox.com':            { score: 78, category: 'credible',    label: 'Vox (Left-Center)' },
  'theatlantic.com':    { score: 83, category: 'credible',    label: 'The Atlantic' },
  'newyorker.com':      { score: 85, category: 'credible',    label: 'The New Yorker' },
  'wired.com':          { score: 81, category: 'credible',    label: 'WIRED' },
  'arstechnica.com':    { score: 82, category: 'credible',    label: 'Ars Technica' },
  'techcrunch.com':     { score: 78, category: 'credible',    label: 'TechCrunch' },
  'engadget.com':       { score: 76, category: 'credible',    label: 'Engadget' },
  'theverge.com':       { score: 79, category: 'credible',    label: 'The Verge' },

  // ─── Scientific / Government (95-100) ────────────────────
  'nature.com':         { score: 99, category: 'scientific',  label: 'Nature (Scientific Journal)' },
  'science.org':        { score: 99, category: 'scientific',  label: 'Science Magazine' },
  'sciencemag.org':     { score: 99, category: 'scientific',  label: 'Science Magazine' },
  'nih.gov':            { score: 99, category: 'scientific',  label: 'NIH (US Gov)' },
  'cdc.gov':            { score: 97, category: 'scientific',  label: 'CDC (US Gov)' },
  'who.int':            { score: 95, category: 'scientific',  label: 'World Health Organization' },
  'nasa.gov':           { score: 98, category: 'scientific',  label: 'NASA (US Gov)' },
  'fda.gov':            { score: 95, category: 'scientific',  label: 'FDA (US Gov)' },
  'mayoclinic.org':     { score: 93, category: 'scientific',  label: 'Mayo Clinic' },
  'webmd.com':          { score: 75, category: 'credible',    label: 'WebMD' },
  'healthline.com':     { score: 72, category: 'credible',    label: 'Healthline' },

  // ─── International Credible ───────────────────────────────
  'aljazeera.com':      { score: 78, category: 'credible',    label: 'Al Jazeera' },
  'dw.com':             { score: 88, category: 'credible',    label: 'Deutsche Welle' },
  'france24.com':       { score: 85, category: 'credible',    label: 'France 24' },
  'abc.net.au':         { score: 87, category: 'credible',    label: 'ABC Australia' },
  'cbc.ca':             { score: 88, category: 'credible',    label: 'CBC (Canada)' },
  'theglobeandmail.com':{ score: 84, category: 'credible',    label: 'Globe and Mail' },
  'independent.co.uk':  { score: 78, category: 'credible',    label: 'The Independent' },
  'telegraph.co.uk':    { score: 78, category: 'credible',    label: 'The Telegraph' },
  'thetimes.co.uk':     { score: 82, category: 'credible',    label: 'The Times (UK)' },

  // ─── Fact-Checkers (85-95) ────────────────────────────────
  'snopes.com':         { score: 92, category: 'factchecker', label: 'Snopes (Fact Checker)' },
  'politifact.com':     { score: 90, category: 'factchecker', label: 'PolitiFact (Fact Checker)' },
  'factcheck.org':      { score: 91, category: 'factchecker', label: 'FactCheck.org' },
  'fullfact.org':       { score: 89, category: 'factchecker', label: 'Full Fact (UK)' },
  'leadstories.com':    { score: 83, category: 'factchecker', label: 'Lead Stories (Fact Checker)' },
  'checkyourfact.com':  { score: 80, category: 'factchecker', label: 'Check Your Fact' },
  'verifythis.com':     { score: 78, category: 'factchecker', label: 'Verify This' },
  'misbar.com':         { score: 76, category: 'factchecker', label: 'Misbar (Fact Checker)' },
  'truthorfiction.com': { score: 78, category: 'factchecker', label: 'Truth or Fiction' },
  'mediabiasfactcheck.com': { score: 80, category: 'factchecker', label: 'Media Bias/Fact Check' },

  // ─── Mixed / Biased But Not Fake (30-60) ─────────────────
  'breitbart.com':      { score: 28, category: 'questionable', label: 'Breitbart (Far-Right Bias)' },
  'zerohedge.com':      { score: 25, category: 'questionable', label: 'ZeroHedge (Conspiracy-Adjacent)' },
  'oann.com':           { score: 22, category: 'questionable', label: 'OAN (Low Credibility)' },
  'newsmax.com':        { score: 42, category: 'mixed',        label: 'Newsmax (Mixed Credibility)' },
  'dailywire.com':      { score: 44, category: 'mixed',        label: 'Daily Wire (Right-Leaning)' },
  'theblaze.com':       { score: 33, category: 'questionable', label: 'The Blaze (Far-Right)' },
  'dailycaller.com':    { score: 40, category: 'mixed',        label: 'Daily Caller (Right-Leaning)' },
  'thefederalist.com':  { score: 40, category: 'mixed',        label: 'The Federalist (Right-Leaning)' },
  'townhall.com':       { score: 38, category: 'mixed',        label: 'Townhall (Right-Leaning)' },
  'huffpost.com':       { score: 62, category: 'mixed',        label: 'HuffPost (Left-Leaning)' },
  'salon.com':          { score: 55, category: 'mixed',        label: 'Salon (Left-Leaning)' },
  'motherjones.com':    { score: 60, category: 'mixed',        label: 'Mother Jones (Left-Leaning)' },
  'mediamatters.org':   { score: 45, category: 'mixed',        label: 'Media Matters (Left-Wing Advocacy)' },
  'occupydemocrats.com':{ score: 28, category: 'questionable', label: 'Occupy Democrats (Left-Wing Propaganda)' },
  'addictinginfo.com':  { score: 25, category: 'questionable', label: 'Addicting Info (Left-Wing Bias)' },
  'palmerreport.com':   { score: 18, category: 'questionable', label: 'Palmer Report (Low Credibility)' },
  'rawstory.com':       { score: 55, category: 'mixed',        label: 'Raw Story (Left-Leaning)' },
  'alternet.org':       { score: 45, category: 'mixed',        label: 'AlterNet (Left Bias)' },
  'commondreams.org':   { score: 50, category: 'mixed',        label: 'Common Dreams (Far-Left)' },
  'truthdig.com':       { score: 48, category: 'mixed',        label: 'Truthdig (Left-Leaning)' },

  // ─── State-Controlled Media ───────────────────────────────
  'rt.com':             { score: 18, category: 'questionable', label: 'RT (Russian State Media)' },
  'sputniknews.com':    { score: 15, category: 'questionable', label: 'Sputnik (Russian State Media)' },
  'xinhuanet.com':      { score: 25, category: 'questionable', label: 'Xinhua (Chinese State Media)' },
  'globaltimes.cn':     { score: 20, category: 'questionable', label: 'Global Times (Chinese State Media)' },
  'cgtn.com':           { score: 22, category: 'questionable', label: 'CGTN (Chinese State Media)' },
  'presstv.ir':         { score: 15, category: 'questionable', label: 'Press TV (Iranian State Media)' },

  // ─── Known Fake / Misinformation (0-15) ──────────────────
  'infowars.com':            { score: 3,  category: 'fake', label: 'Infowars (Conspiracy/Fake)' },
  'naturalnews.com':         { score: 3,  category: 'fake', label: 'Natural News (Pseudoscience/Fake)' },
  'beforeitsnews.com':       { score: 3,  category: 'fake', label: 'Before It\'s News (Fake News Hub)' },
  'worldnewsdailyreport.com':{ score: 2,  category: 'fake', label: 'World News Daily Report (Fake)' },
  'empirenews.net':          { score: 2,  category: 'fake', label: 'Empire News (Satirical Fake)' },
  'nationalreport.net':      { score: 2,  category: 'fake', label: 'National Report (Satirical Fake)' },
  'huzlers.com':             { score: 2,  category: 'fake', label: 'Huzlers (Satirical Fake)' },
  'abcnews.com.co':          { score: 1,  category: 'fake', label: 'Fake ABC News Clone' },
  'cnn.com.de':              { score: 1,  category: 'fake', label: 'Fake CNN Clone' },
  'thepoliticalinsider.com': { score: 12, category: 'fake', label: 'The Political Insider (Fake News)' },
  'yournewswire.com':        { score: 3,  category: 'fake', label: 'YourNewsWire (Fake News)' },
  'newsbusters.org':         { score: 25, category: 'questionable', label: 'NewsBusters (Right-Wing Media Criticism)' },
  'westernjournal.com':      { score: 22, category: 'questionable', label: 'Western Journal (Low Credibility)' },
  'epochtimes.com':          { score: 20, category: 'questionable', label: 'Epoch Times (Falun Gong / Right-Wing Bias)' },
  'thegatewayпунdit.com':    { score: 5,  category: 'fake', label: 'Gateway Pundit (Extreme Right / Fake)' },
  'thegatewayпundIt.com':    { score: 5,  category: 'fake', label: 'Gateway Pundit (Extreme Right / Fake)' },
  'thegatewaypundit.com':    { score: 5,  category: 'fake', label: 'Gateway Pundit (Extreme Right / Fake)' },
  'wnd.com':                 { score: 10, category: 'fake', label: 'WorldNetDaily (Far-Right / Low Credibility)' },
  'veteranstoday.com':       { score: 5,  category: 'fake', label: 'Veterans Today (Conspiracy / Fake)' },
  'activistpost.com':        { score: 8,  category: 'fake', label: 'Activist Post (Conspiracy)' },
  'globalresearch.ca':       { score: 8,  category: 'fake', label: 'Global Research (Conspiracy)' },
  'zengardner.com':          { score: 5,  category: 'fake', label: 'Zen Gardner (Conspiracy)' },
  'wakingtimes.com':         { score: 8,  category: 'fake', label: 'Waking Times (Pseudoscience)' },
  'collective-evolution.com':{ score: 8,  category: 'fake', label: 'Collective Evolution (Pseudoscience)' },

  // ─── Satire (Clearly Labeled) (10-20) ────────────────────
  'theonion.com':            { score: 18, category: 'satire', label: 'The Onion (Satire)' },
  'clickhole.com':           { score: 18, category: 'satire', label: 'ClickHole (Satire)' },
  'thebabylonbee.com':       { score: 18, category: 'satire', label: 'The Babylon Bee (Conservative Satire)' },
  'duffelblog.com':          { score: 18, category: 'satire', label: 'Duffel Blog (Military Satire)' },
  'waterfordwhispersnews.com':{ score:18, category: 'satire', label: 'Waterford Whispers News (Satire)' },
  'newsthump.com':           { score: 18, category: 'satire', label: 'NewsThump (UK Satire)' },
  'newsbiscuit.com':         { score: 18, category: 'satire', label: 'NewsBiscuit (UK Satire)' },
};

// ============================================================
// FAKE NEWS LANGUAGE INDICATORS
// ============================================================
const SENSATIONAL_PHRASES = [
  'YOU WON\'T BELIEVE', 'SHOCKING', 'BOMBSHELL', 'MUST SEE', 'BREAKING:',
  'EXCLUSIVE:', 'THEY DON\'T WANT YOU TO KNOW', 'THE TRUTH ABOUT', 'EXPOSED:',
  'SHARE BEFORE DELETED', 'MAINSTREAM MEDIA WON\'T TELL YOU', 'DEEP STATE',
  'WAKE UP SHEEPLE', 'FALSE FLAG', 'CRISIS ACTOR', 'HOAX EXPOSED',
  'NEW WORLD ORDER', 'THEY\'RE HIDING THIS', 'COVER-UP', 'SMOKING GUN',
  'WHAT THEY\'RE NOT TELLING YOU', 'BANNED VIDEO', 'CENSORED',
  'SECRET REVEALED', 'MIRACLE CURE', 'DOCTORS HATE THIS',
];

const EMOTIONAL_WORDS = [
  'outrageous', 'horrifying', 'disgusting', 'terrifying', 'unbelievable',
  'incredible', 'explosive', 'scandalous', 'devastating', 'shocking',
  'alarming', 'jaw-dropping', 'mind-blowing', 'enraging', 'sickening',
];

// ============================================================
// UTILITY HEADERS FOR WEB REQUESTS
// ============================================================
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive',
};

// ============================================================
// 1. ARTICLE SCRAPER
// ============================================================
async function scrapeArticle(url) {
  const domain = new URL(url).hostname.replace(/^www\./, '');
  const base = { url, domain, title: '', author: '', publishDate: '', description: '', content: '', outboundLinks: [], scraped: false };

  try {
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 20000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // Remove noise
    $('script, style, nav, footer, aside, .ad, .advertisement, .cookie-banner, .social-share').remove();

    // Title
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      $('title').text().trim() || '';

    // Author
    const author =
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('[rel="author"]').first().text().trim() ||
      $('[class*="author"]').first().text().trim() ||
      $('[class*="byline"]').first().text().trim() ||
      $('[itemprop="author"]').first().text().trim() || '';

    // Publish date
    const publishDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="publication_date"]').attr('content') ||
      $('meta[name="date"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      $('time').first().text().trim() || '';

    // Description
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') || '';

    // Main content
    let content = '';
    const contentSelectors = [
      'article', '[role="main"]', '.article-body', '.story-body', '.post-content',
      '#article-body', '.entry-content', '.content-body', '.article-content',
      '.news-article', '.post-body', '[class*="article"]', 'main',
    ];
    for (const sel of contentSelectors) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 200) {
        content = el.text().trim();
        break;
      }
    }
    if (!content) content = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 8000);

    // Outbound links
    const links = new Set();
    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr('href');
        if (!href) return;
        const abs = href.startsWith('http') ? href : new URL(href, url).href;
        const linkDomain = new URL(abs).hostname.replace(/^www\./, '');
        if (linkDomain !== domain) links.add(abs);
      } catch (_) { /* skip */ }
    });

    return {
      ...base,
      title: title.substring(0, 300),
      author: author.substring(0, 200),
      publishDate,
      description: description.substring(0, 500),
      content: content.substring(0, 10000),
      outboundLinks: [...links].slice(0, 50),
      scraped: true,
    };
  } catch (err) {
    return { ...base, error: err.message };
  }
}

// ============================================================
// 2. GOOGLE NEWS RSS SEARCH (FREE)
// ============================================================
async function searchGoogleNews(query) {
  try {
    const encoded = encodeURIComponent(query.substring(0, 100));
    const rss = await axios.get(
      `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`,
      { headers: { 'User-Agent': 'FakeNewsID/1.0' }, timeout: 12000 }
    );

    const $ = cheerio.load(rss.data, { xmlMode: true });
    const results = [];

    $('item').each((i, el) => {
      if (i >= 25) return false;
      const title = $(el).find('title').text().replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const pubDate = $(el).find('pubDate').text();
      const sourceEl = $(el).find('source');
      const sourceName = sourceEl.text().replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const sourceUrl = sourceEl.attr('url') || '';
      // Google News wraps links; prefer source URL
      const rawLink = $(el).find('link').text().trim() || $(el).find('guid').text().trim();

      if (sourceUrl || rawLink) {
        results.push({
          title,
          link: sourceUrl || rawLink,
          pubDate,
          source: sourceName,
        });
      }
    });

    return results;
  } catch (err) {
    console.warn('Google News RSS error:', err.message);
    return [];
  }
}

// ============================================================
// 3. NEWS API SEARCH (requires NEWSAPI_KEY)
// ============================================================
async function searchNewsAPI(query) {
  if (!process.env.NEWSAPI_KEY) return [];
  try {
    const res = await axios.get('https://newsapi.org/v2/everything', {
      params: { q: query.substring(0, 100), sortBy: 'relevancy', pageSize: 20, language: 'en' },
      headers: { 'X-Api-Key': process.env.NEWSAPI_KEY },
      timeout: 10000,
    });
    return (res.data.articles || []).map(a => ({
      title: a.title,
      link: a.url,
      pubDate: a.publishedAt,
      source: a.source?.name || '',
      description: a.description || '',
    }));
  } catch (err) {
    console.warn('NewsAPI error:', err.message);
    return [];
  }
}

// ============================================================
// 4. BING NEWS SEARCH (requires BING_NEWS_KEY)
// ============================================================
async function searchBingNews(query) {
  if (!process.env.BING_NEWS_KEY) return [];
  try {
    const res = await axios.get('https://api.bing.microsoft.com/v7.0/news/search', {
      params: { q: query, count: 20, freshness: 'Month' },
      headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_NEWS_KEY },
      timeout: 10000,
    });
    return (res.data.value || []).map(item => ({
      title: item.name,
      link: item.url,
      pubDate: item.datePublished,
      source: item.provider?.[0]?.name || '',
    }));
  } catch (err) {
    console.warn('Bing News error:', err.message);
    return [];
  }
}

// ============================================================
// 5. REDDIT SEARCH (FREE)
// ============================================================
async function searchReddit(query) {
  try {
    const encoded = encodeURIComponent(query.substring(0, 100));
    const res = await axios.get(
      `https://www.reddit.com/search.json?q=${encoded}&sort=relevance&limit=15&t=year`,
      { headers: { 'User-Agent': 'FakeNewsID/1.0 (news-credibility-checker)' }, timeout: 10000 }
    );
    return (res.data?.data?.children || []).map(p => ({
      title: p.data.title,
      link: p.data.url,
      redditLink: `https://www.reddit.com${p.data.permalink}`,
      subreddit: p.data.subreddit,
      score: p.data.score,
      numComments: p.data.num_comments,
      created: new Date(p.data.created_utc * 1000).toISOString(),
      author: p.data.author,
    }));
  } catch (err) {
    console.warn('Reddit search error:', err.message);
    return [];
  }
}

// ============================================================
// 6. TWITTER/X SEARCH (requires TWITTER_BEARER_TOKEN)
// ============================================================
async function searchTwitter(query) {
  if (!process.env.TWITTER_BEARER_TOKEN) return [];
  try {
    const encoded = encodeURIComponent(`${query.substring(0, 80)} -is:retweet lang:en`);
    const res = await axios.get(
      `https://api.twitter.com/2/tweets/search/recent?query=${encoded}&max_results=50&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=name,username,public_metrics`,
      { headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` }, timeout: 10000 }
    );
    const users = {};
    (res.data?.includes?.users || []).forEach(u => { users[u.id] = u; });
    return (res.data?.data || []).map(tweet => {
      const user = users[tweet.author_id];
      return {
        id: tweet.id,
        text: tweet.text,
        created: tweet.created_at,
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        replies: tweet.public_metrics?.reply_count || 0,
        author: user ? `@${user.username}` : 'unknown',
        authorFollowers: user?.public_metrics?.followers_count || 0,
        link: `https://twitter.com/i/web/status/${tweet.id}`,
      };
    });
  } catch (err) {
    console.warn('Twitter search error:', err.message);
    return [];
  }
}

// ============================================================
// 7. SNOPES FACT-CHECK SEARCH (FREE)
// ============================================================

// Map Snopes verdict text → our factChecked key
function parseSnopesRating(raw) {
  const s = raw.toLowerCase().trim();
  if (s.includes('false') && !s.includes('mostly') && !s.includes('mixture')) return 'false';
  if (s.includes('mostly false')) return 'mostly-false';
  if (s.includes('mixture') || s.includes('mixed') || s.includes('unverified') ||
      s.includes('outdated') || s.includes('legend') || s.includes('research in progress') ||
      s.includes('correct attribution')) return 'mixed';
  if (s.includes('mostly true')) return 'mostly-true';
  if (s.includes('true') && !s.includes('mostly') && !s.includes('false')) return 'true';
  if (s.includes('satire')) return 'mostly-false'; // labeled satire = intentionally fake
  return null;
}

// Scrape a single Snopes article page for its verdict badge
async function scrapeSnopesRating(articleUrl) {
  try {
    const res = await axios.get(articleUrl, {
      headers: BROWSER_HEADERS,
      timeout: 12000,
    });
    const $ = cheerio.load(res.data);

    // Snopes uses several selectors across its layout versions
    const ratingText =
      $('span.rating_title_wrap').first().text().trim() ||
      $('h3.rating_title_wrap').first().text().trim() ||
      $('[class*="rating_title"]').first().text().trim() ||
      $('[class*="fact-check__badge"]').first().text().trim() ||
      $('[class*="claim-check__badge"]').first().text().trim() ||
      $('span.rating').first().text().trim() ||
      // Newer Snopes layout stores it in a <span> inside .fact_check
      $('.fact_check span').first().text().trim() ||
      $('div.title_rating span').first().text().trim() || '';

    return ratingText ? parseSnopesRating(ratingText) : null;
  } catch (_) {
    return null;
  }
}

// Search Snopes directly and return structured results with ratings
async function searchSnopes(query) {
  try {
    const encoded = encodeURIComponent(query.substring(0, 80));
    const res = await axios.get(`https://www.snopes.com/?s=${encoded}`, {
      headers: BROWSER_HEADERS,
      timeout: 14000,
    });

    const $ = cheerio.load(res.data);
    const hits = [];

    // Collect candidate result links from the search page
    $('article, .card, .media, .result-item').each((i, el) => {
      if (i >= 5) return false;
      const anchor = $(el).find('h2 a, h3 a, h4 a, .title a, a[href*="/fact-check/"]').first();
      const title  = anchor.text().trim();
      const href   = anchor.attr('href');
      if (title && href && href.includes('snopes.com')) {
        // Grab any inline rating badge already rendered on the search page
        const inlineRating =
          $(el).find('[class*="rating_title"], [class*="rating-title"], .badge, .label').first().text().trim();
        hits.push({ title, link: href, inlineRating });
      }
    });

    if (hits.length === 0) return { results: [], verdict: null };

    // Try to get a rating — first from inline badge, then by scraping the article
    let verdict = null;
    for (const hit of hits) {
      if (hit.inlineRating) {
        verdict = parseSnopesRating(hit.inlineRating);
      }
      if (!verdict) {
        verdict = await scrapeSnopesRating(hit.link);
      }
      if (verdict) break;
    }

    return {
      results: hits.map(h => ({
        title:      h.title,
        link:       h.link,
        source:     'Snopes',
        pubDate:    null,
        reputation: { score: 92, category: 'factchecker', label: 'Snopes (Fact Checker)' },
        domain:     'snopes.com',
        rating:     h.inlineRating || null,
      })),
      verdict, // null | 'false' | 'mostly-false' | 'mixed' | 'mostly-true' | 'true'
    };
  } catch (err) {
    console.warn('Snopes search error:', err.message);
    return { results: [], verdict: null };
  }
}

// ============================================================
// 7b. WAYBACK MACHINE (FREE)
// ============================================================
async function checkWaybackMachine(url) {
  try {
    const res = await axios.get('http://web.archive.org/cdx/search/cdx', {
      params: {
        url,
        output: 'json',
        limit: 15,
        fl: 'timestamp,original,statuscode,length',
        filter: 'statuscode:200',
        collapse: 'timestamp:8', // One per day
      },
      timeout: 12000,
    });

    if (!res.data || res.data.length <= 1) return [];
    const [, ...rows] = res.data;
    return rows.map(row => ({
      timestamp: row[0],
      date: `${row[0].substring(0, 4)}-${row[0].substring(4, 6)}-${row[0].substring(6, 8)}`,
      archiveUrl: `https://web.archive.org/web/${row[0]}/${row[1]}`,
      status: row[2],
      length: row[3],
    }));
  } catch (err) {
    console.warn('Wayback Machine error:', err.message);
    return [];
  }
}

// ============================================================
// 8. DOMAIN REPUTATION LOOKUP
// ============================================================
function getDomainReputation(domain) {
  const clean = domain.replace(/^www\./, '').toLowerCase();
  if (DOMAIN_REPUTATION[clean]) return { ...DOMAIN_REPUTATION[clean], domain: clean };

  // Check parent domain (e.g. news.example.com → example.com)
  const parts = clean.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (DOMAIN_REPUTATION[parent]) return { ...DOMAIN_REPUTATION[parent], domain: clean };
  }

  return { score: 50, category: 'unknown', label: 'Unknown Source', domain: clean };
}

// ============================================================
// 9. CONTENT QUALITY ANALYSIS
// ============================================================
function analyzeContent(title, content) {
  let score = 80;
  const issues = [];
  const positives = [];
  const fullText = `${title} ${content}`.toUpperCase();
  const titleUpper = title.toUpperCase();

  // Sensational phrases
  const foundPhrases = SENSATIONAL_PHRASES.filter(p => fullText.includes(p));
  if (foundPhrases.length > 0) {
    score -= Math.min(30, foundPhrases.length * 8);
    issues.push(`Sensational language detected: "${foundPhrases.slice(0, 3).map(p => p.toLowerCase()).join('", "')}"`);
  }

  // Emotional words
  const foundEmotion = EMOTIONAL_WORDS.filter(w => fullText.includes(w.toUpperCase()));
  if (foundEmotion.length >= 3) {
    score -= 10;
    issues.push(`Heavy emotional language (${foundEmotion.length} emotional words detected)`);
  }

  // Excessive caps in title
  const capsRatio = (title.match(/[A-Z]/g) || []).length / Math.max(title.replace(/\s/g, '').length, 1);
  if (capsRatio > 0.6 && title.length > 15) {
    score -= 20;
    issues.push('Headline is mostly capital letters');
  }

  // Excessive punctuation
  if (/!!+/.test(title)) { score -= 10; issues.push('Multiple exclamation marks in headline'); }
  if (/\?\?+/.test(title)) { score -= 8; issues.push('Multiple question marks in headline'); }

  // Question headline (Betteridge's law)
  if (title.trimEnd().endsWith('?') && title.length > 20) {
    score -= 5;
    issues.push("Headline posed as a question (often implies the answer is 'no')");
  }

  // Content length
  if (content.length < 100) { score -= 25; issues.push('Extremely short article — almost no content'); }
  else if (content.length < 400) { score -= 12; issues.push('Short article with limited detail'); }
  else if (content.length > 2000) { positives.push('Substantial article length'); score += 5; }

  // Has citations/sources
  const hasCitations = /according to|said in a statement|told reporters|confirmed that|spokesperson|official said|study found|research shows|published in|university of|professor|dr\./i.test(content);
  if (hasCitations) { positives.push('Contains named sources or citations'); score += 5; }
  else if (content.length > 300) { score -= 10; issues.push('No cited sources found in article text'); }

  // Has a dateline or location
  const hasDateline = /^[A-Z][A-Z ,]+[–—-]/.test(content.substring(0, 50));
  if (hasDateline) { positives.push('Includes dateline location'); score += 3; }

  // Numeric facts/statistics suggest research
  const numericCount = (content.match(/\d+(\.\d+)?%|\$[\d,]+|\d+ (people|patients|cases|deaths)/gi) || []).length;
  if (numericCount > 3) { positives.push('Contains statistics and data'); score += 5; }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    positives,
  };
}

// ============================================================
// 10. FAKE PROBABILITY CALCULATION
// Higher return value = more likely fake (0.0 to 1.0)
// ============================================================
function calculateFakeProbability(factors) {
  const {
    domainScore,             // 0–100 (higher = more credible)
    domainCategory,          // 'credible' | 'fake' | 'satire' | 'questionable' | 'mixed' | 'unknown' …
    corroborationCount,      // number of credible sources corroborating
    contentScore,            // 0–100 (higher = better quality)
    questionableSourceCount, // number of low-credibility sources pushing same story
    factChecked,             // null | 'false' | 'mostly-false' | 'mixed' | 'mostly-true' | 'true'
    redditMentions,          // integer
    twitterMentions,         // integer
    waybackSnapshots,        // integer
  } = factors;

  // ── Hard floors by domain category ───────────────────────
  // Known-fake and satire domains should always score above a baseline
  // regardless of what the rest of the signals say.
  const CATEGORY_FLOORS = {
    fake:        0.85,  // known misinformation sites — always "Likely Fake News"
    satire:      0.90,  // satire sites — content is intentionally fabricated
    questionable:0.62,  // low-credibility / extreme-bias sites — at minimum "Questionable"
  };
  const floor = CATEGORY_FLOORS[domainCategory] ?? 0;

  // ── Domain score contribution (weight 0.35) ───────────────
  // Higher weight than before so a known-bad source decisively drives the score up.
  const domainContrib = (100 - domainScore) / 100;

  // ── Corroboration (weight 0.23) ───────────────────────────
  // More credible outlets covering the same story = less likely fake.
  const corrobContrib =
    corroborationCount >= 10 ? 0.05 :
    corroborationCount >= 5  ? 0.12 :
    corroborationCount >= 3  ? 0.25 :
    corroborationCount >= 1  ? 0.42 :
    0.72; // No credible corroboration at all

  // ── Content quality (weight 0.15) ─────────────────────────
  const contentContrib = (100 - contentScore) / 100;

  // ── Fact check (weight 0.22 if available, else 0) ─────────
  const factCheckMap = {
    'false':       0.97,
    'mostly-false':0.84,
    'mixed':       0.55,
    'mostly-true': 0.20,
    'true':        0.04,
  };
  const factContrib = factChecked ? (factCheckMap[factChecked] ?? 0.5) : null;

  // ── Questionable amplification (weight 0.05) ─────────────
  const amplContrib = questionableSourceCount > 3 ? 0.85 : questionableSourceCount > 0 ? 0.65 : 0.20;

  // ── Build weighted sum ─────────────────────────────────────
  const hasFactCheck = factContrib !== null;
  const weights = {
    domain:       0.35,
    corroboration:0.23,
    content:      0.15,
    factCheck:    hasFactCheck ? 0.22 : 0,
    amplification:0.05,
  };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const raw =
    (weights.domain       / totalWeight) * domainContrib +
    (weights.corroboration/ totalWeight) * corrobContrib +
    (weights.content      / totalWeight) * contentContrib +
    (weights.factCheck    / totalWeight) * (factContrib ?? 0) +
    (weights.amplification/ totalWeight) * amplContrib;

  // Apply category floor, then clamp to [0.01, 0.99]
  return Math.min(0.99, Math.max(floor, Math.max(0.01, raw)));
}

// ============================================================
// 11. BUILD LINK GRAPH DATA
// ============================================================
function buildLinkGraph(originalUrl, relatedSources, redditPosts, twitterData) {
  const originalDomain = new URL(originalUrl).hostname.replace(/^www\./, '');
  const nodes = new Map();
  const linksSet = new Set();
  const links = [];

  const origRep = getDomainReputation(originalDomain);
  nodes.set(originalDomain, {
    id: originalDomain,
    label: origRep.label.split(' (')[0] || originalDomain,
    type: 'origin',
    reputation: origRep,
    url: originalUrl,
    date: null,
    size: 22,
  });

  // News sources
  for (const source of relatedSources) {
    try {
      if (!source.link || !source.link.startsWith('http')) continue;
      const sd = new URL(source.link).hostname.replace(/^www\./, '');
      if (sd === originalDomain) continue;

      const rep = getDomainReputation(sd);

      if (!nodes.has(sd)) {
        nodes.set(sd, {
          id: sd,
          label: source.source || sd,
          type: 'news',
          reputation: rep,
          url: source.link,
          date: source.pubDate || null,
          size: Math.max(8, Math.min(18, rep.score / 6)),
        });
      }

      const lk = `${originalDomain}→${sd}`;
      if (!linksSet.has(lk)) {
        linksSet.add(lk);
        links.push({ source: originalDomain, target: sd, type: 'corroborating' });
      }
    } catch (_) { /* skip bad URLs */ }
  }

  // Reddit
  if (redditPosts && redditPosts.length > 0) {
    nodes.set('reddit.com', {
      id: 'reddit.com', label: 'Reddit', type: 'social',
      reputation: { score: 65, category: 'social', label: 'Social Media – Reddit' },
      url: `https://www.reddit.com/search/?q=${encodeURIComponent(redditPosts[0]?.title || '')}`,
      date: redditPosts[0]?.created,
      size: Math.min(16, 8 + Math.floor(redditPosts.length * 0.8)),
    });
    links.push({ source: originalDomain, target: 'reddit.com', type: 'social' });
  }

  // Twitter/X
  if (twitterData && twitterData.length > 0) {
    nodes.set('twitter.com', {
      id: 'twitter.com', label: 'Twitter / X', type: 'social',
      reputation: { score: 60, category: 'social', label: 'Social Media – Twitter/X' },
      url: 'https://twitter.com',
      date: twitterData[0]?.created,
      size: Math.min(16, 8 + Math.floor(twitterData.length * 0.4)),
    });
    links.push({ source: originalDomain, target: 'twitter.com', type: 'social' });
  }

  return {
    nodes: Array.from(nodes.values()),
    links,
  };
}

// ============================================================
// 12. LOGGING
// ============================================================
function logSearch(data) {
  try {
    const id = uuidv4();
    const ts = new Date().toISOString();
    const entry = { id, timestamp: ts, ...data };

    // Individual JSON log
    const safeTs = ts.replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(LOGS_DIR, `${safeTs}_${id.substring(0, 8)}.json`),
      JSON.stringify(entry, null, 2),
      'utf8'
    );

    // Master text log
    const pct = ((data.fakeProbability || 0) * 100).toFixed(1);
    const line = `[${ts}] VERDICT: ${data.verdict || 'N/A'} (${pct}%) | Domain: ${data.domain || 'N/A'} | Sources: ${data.sourcesFound || 0} | URL: ${data.url}\n`;
    fs.appendFileSync(path.join(LOGS_DIR, 'searches.log'), line, 'utf8');

    return id;
  } catch (err) {
    console.error('Logging error:', err.message);
    return null;
  }
}

// ============================================================
// MAIN ANALYSIS ENDPOINT
// ============================================================
app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try { new URL(url); }
  catch (_) { return res.status(400).json({ error: 'Invalid URL format' }); }

  console.log(`\n[${new Date().toISOString()}] Analyzing: ${url}`);

  try {
    // ─── Step 1: Scrape ───────────────────────────────────
    console.log('  [1/7] Scraping article...');
    const article = await scrapeArticle(url);

    // Build search query from title or fallback to domain
    const searchQuery = article.title
      ? article.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120)
      : new URL(url).hostname;

    // ─── Steps 2–5: Parallel search ──────────────────────
    console.log('  [2/7] Searching Google News RSS...');
    console.log('  [3/7] Searching NewsAPI / Bing...');
    console.log('  [4/7] Searching Reddit...');
    console.log('  [5/7] Checking Wayback Machine & Twitter...');

    const [gnRes, naRes, bnRes, rdRes, twRes, wbRes, snRes] = await Promise.allSettled([
      searchGoogleNews(searchQuery),
      searchNewsAPI(searchQuery),
      searchBingNews(searchQuery),
      searchReddit(searchQuery),
      searchTwitter(searchQuery),
      checkWaybackMachine(url),
      searchSnopes(searchQuery),
    ]);

    const googleNews   = gnRes.status === 'fulfilled' ? gnRes.value : [];
    const newsApi      = naRes.status === 'fulfilled' ? naRes.value : [];
    const bingNews     = bnRes.status === 'fulfilled' ? bnRes.value : [];
    const reddit       = rdRes.status === 'fulfilled' ? rdRes.value : [];
    const twitter      = twRes.status === 'fulfilled' ? twRes.value : [];
    const wayback      = wbRes.status === 'fulfilled' ? wbRes.value : [];
    const snopesData   = snRes.status === 'fulfilled' ? snRes.value : { results: [], verdict: null };
    const snopesVerdict = snopesData.verdict; // null | 'false' | 'mostly-false' | 'mixed' | 'mostly-true' | 'true'

    if (snopesVerdict) {
      console.log(`  ℹ Snopes verdict found: ${snopesVerdict}`);
    }

    // Combine all news sources; Snopes results are pre-enriched
    const allNews = [...googleNews, ...newsApi, ...bingNews];

    // ─── Step 6: Domain & content analysis ───────────────
    console.log('  [6/7] Analyzing credibility...');
    const domainRep = getDomainReputation(article.domain);
    const contentAnalysis = analyzeContent(article.title, article.content);

    // Enrich each source with reputation
    const enrichedSources = allNews.map(s => {
      try {
        const d = new URL(s.link).hostname.replace(/^www\./, '');
        return { ...s, domain: d, reputation: getDomainReputation(d) };
      } catch (_) {
        return { ...s, domain: '', reputation: { score: 50, category: 'unknown', label: 'Unknown' } };
      }
    });

    // Merge Snopes results into the enriched list (already have reputation set)
    const snopesEnriched = snopesData.results.map(r => ({ ...r }));
    const allEnriched    = [...enrichedSources, ...snopesEnriched];

    const credibleSources     = allEnriched.filter(s => s.reputation.score >= 80);
    const questionableSources = allEnriched.filter(s => s.reputation.score < 40);
    const factCheckerSources  = allEnriched.filter(s => s.reputation.category === 'factchecker');

    // ─── Step 7: Score ────────────────────────────────────
    console.log('  [7/7] Calculating fake probability...');
    const factors = {
      domainScore:             domainRep.score,
      domainCategory:          domainRep.category,
      corroborationCount:      credibleSources.length,
      contentScore:            contentAnalysis.score,
      questionableSourceCount: questionableSources.length,
      factChecked:             snopesVerdict,   // set from Snopes, null if not found
      redditMentions:          reddit.length,
      twitterMentions:         twitter.length,
      waybackSnapshots:        wayback.length,
    };

    const fakeProbability = calculateFakeProbability(factors);
    const fakePct = Math.round(fakeProbability * 100);

    const verdict =
      fakeProbability >= 0.80 ? 'Likely Fake News' :
      fakeProbability >= 0.60 ? 'Questionable / Unverified' :
      fakeProbability >= 0.40 ? 'Uncertain — Verify Independently' :
      fakeProbability >= 0.20 ? 'Likely Credible' :
      'Credible / Well-Sourced';

    const confidence =
      (credibleSources.length > 8 || factCheckerSources.length > 0) ? 'High' :
      credibleSources.length > 3 ? 'Medium' : 'Low';

    // ─── Build graph ──────────────────────────────────────
    const linkGraph = buildLinkGraph(url, allEnriched.slice(0, 35), reddit, twitter);

    // ─── Build timeline ───────────────────────────────────
    const timelineEvents = [];
    if (article.publishDate) {
      timelineEvents.push({
        date: article.publishDate, source: article.domain,
        title: article.title || url, url, type: 'origin', reputation: domainRep,
      });
    }
    allEnriched.forEach(s => {
      if (s.pubDate) {
        timelineEvents.push({
          date: s.pubDate, source: s.domain || s.source,
          title: s.title, url: s.link, type: 'news', reputation: s.reputation,
        });
      }
    });
    reddit.slice(0, 8).forEach(p => {
      timelineEvents.push({
        date: p.created, source: `r/${p.subreddit}`,
        title: p.title, url: p.redditLink, type: 'reddit',
      });
    });
    timelineEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

    // ─── Compile result ───────────────────────────────────
    const result = {
      url,
      article: {
        title:       article.title,
        author:      article.author,
        domain:      article.domain,
        publishDate: article.publishDate,
        description: article.description,
        scraped:     article.scraped,
      },
      analysis: {
        fakeProbability,
        fakeProbabilityPercent: fakePct,
        verdict,
        confidence,
        domainReputation: domainRep,
        contentAnalysis,
        factors: {
          domainScore:            domainRep.score,
          credibleSourcesCount:   credibleSources.length,
          totalNewsFound:         allNews.length,
          questionableSources:    questionableSources.length,
          factCheckersFound:      factCheckerSources.length,
          snopesVerdict:          snopesVerdict,
          redditMentions:         reddit.length,
          twitterMentions:        twitter.length,
          waybackSnapshots:       wayback.length,
        },
      },
      linkGraph,
      timeline: timelineEvents.slice(0, 60),
      sources: {
        news:         allEnriched.slice(0, 40),
        reddit:       reddit.slice(0, 15),
        twitter:      twitter.slice(0, 15),
        wayback:      wayback.slice(0, 10),
        factCheckers: factCheckerSources.slice(0, 5),
      },
      apiStatus: {
        googleNews: true,
        newsApi:    !!process.env.NEWSAPI_KEY,
        bingNews:   !!process.env.BING_NEWS_KEY,
        reddit:     true,
        twitter:    !!process.env.TWITTER_BEARER_TOKEN,
        wayback:    true,
      },
    };

    // ─── Log ──────────────────────────────────────────────
    logSearch({
      url,
      title:           article.title,
      domain:          article.domain,
      author:          article.author,
      fakeProbability,
      verdict,
      confidence,
      sourcesFound:    allNews.length,
      credibleSources: credibleSources.length,
      redditMentions:  reddit.length,
      twitterMentions: twitter.length,
    });

    console.log(`  ✓ Done — ${verdict} (${fakePct}%)`);
    res.json(result);

  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
});

// ============================================================
// LOGS ENDPOINTS
// ============================================================
app.get('/api/logs', (req, res) => {
  try {
    const masterLog = path.join(LOGS_DIR, 'searches.log');
    if (!fs.existsSync(masterLog)) return res.json({ logs: [] });
    const content = fs.readFileSync(masterLog, 'utf8');
    const logs = content.trim().split('\n').filter(Boolean).reverse().slice(0, 200);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs/detail', (req, res) => {
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort().reverse().slice(0, 50);

    const logs = files.map(filename => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, filename), 'utf8'));
        return {
          id:              data.id,
          timestamp:       data.timestamp,
          url:             data.url,
          title:           data.title,
          domain:          data.domain,
          fakeProbability: data.fakeProbability,
          verdict:         data.verdict,
          confidence:      data.confidence,
          sourcesFound:    data.sourcesFound,
          credibleSources: data.credibleSources,
        };
      } catch (_) { return null; }
    }).filter(Boolean);

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   FakeNewsID — Fake News Tracker & ID    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n  App:   http://localhost:${PORT}`);
  console.log(`  Logs:  ${LOGS_DIR}`);
  console.log('\n  API Status:');
  console.log(`  ✓ Google News RSS  (free, no key needed)`);
  console.log(`  ✓ Reddit Search    (free, no key needed)`);
  console.log(`  ✓ Wayback Machine  (free, no key needed)`);
  console.log(`  ${process.env.NEWSAPI_KEY    ? '✓' : '○'} NewsAPI.org        ${process.env.NEWSAPI_KEY    ? '(configured)' : '(optional — add NEWSAPI_KEY to .env)'}`);
  console.log(`  ${process.env.TWITTER_BEARER_TOKEN ? '✓' : '○'} Twitter/X         ${process.env.TWITTER_BEARER_TOKEN ? '(configured)' : '(optional — add TWITTER_BEARER_TOKEN to .env)'}`);
  console.log(`  ${process.env.BING_NEWS_KEY  ? '✓' : '○'} Bing News          ${process.env.BING_NEWS_KEY  ? '(configured)' : '(optional — add BING_NEWS_KEY to .env)'}`);
  console.log('');
});
