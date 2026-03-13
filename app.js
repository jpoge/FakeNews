/* ═══════════════════════════════════════════════════════════
   FakeNewsID — Frontend Application
   ═══════════════════════════════════════════════════════════ */

'use strict';

const API_BASE = 'http://localhost:3000';

// ── App state ─────────────────────────────────────────────
let currentResult   = null;
let currentGraphSvg = null;
let graphZoom       = null;

// ── Color maps ────────────────────────────────────────────
const CAT_COLOR = {
  credible:    '#16a34a',
  scientific:  '#16a34a',
  factchecker: '#7c3aed',
  mixed:       '#d97706',
  questionable:'#ea580c',
  fake:        '#dc2626',
  satire:      '#f59e0b',
  social:      '#0891b2',
  origin:      '#6366f1',
  unknown:     '#94a3b8',
};

const VERDICT_COLOR = {
  'Likely Fake News':               '#dc2626',
  'Questionable / Unverified':      '#ea580c',
  'Uncertain — Verify Independently':'#d97706',
  'Likely Credible':                '#16a34a',
  'Credible / Well-Sourced':        '#16a34a',
};

// ── Utility ───────────────────────────────────────────────
function qs(id) { return document.getElementById(id); }

function scoreColor(score) {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#d97706';
  if (score >= 40) return '#ea580c';
  return '#dc2626';
}

function probColor(prob) {
  if (prob <= 0.25) return '#16a34a';
  if (prob <= 0.50) return '#d97706';
  if (prob <= 0.75) return '#ea580c';
  return '#dc2626';
}

function fmtDate(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (_) { return str; }
}

function fmtTime(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return str; }
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ── Section switching ─────────────────────────────────────
function switchSection(name) {
  ['analyze', 'logs'].forEach(s => {
    qs(`section-${s}`)?.classList.toggle('hidden', s !== name);
    qs(`nav${s.charAt(0).toUpperCase() + s.slice(1)}`)?.classList.toggle('active', s === name);
  });
  if (name === 'logs') loadLogs();
}

function showHome() {
  switchSection('analyze');
  qs('heroArea').classList.remove('hidden');
  qs('progressSection').classList.add('hidden');
  qs('resultsSection').classList.add('hidden');
  qs('errorBanner').classList.add('hidden');
  qs('urlInput').value = '';
  qs('analyzeBtn').classList.remove('loading');
  qs('analyzeBtn').querySelector('.btn-label').textContent = 'Analyze';
}

// ── Tabs ──────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => {
    const id = p.id.replace('tab-', '');
    p.classList.toggle('active', id === name);
    p.classList.toggle('hidden', id !== name);
  });

  // Render graph lazily (needs DOM to be visible for dimensions)
  if (name === 'graph' && currentResult && !qs('linkGraphContainer').dataset.rendered) {
    renderLinkGraph(currentResult.linkGraph);
    qs('linkGraphContainer').dataset.rendered = '1';
  }
}

// ── Error banner ──────────────────────────────────────────
function showError(msg) {
  qs('errorMsg').textContent = msg;
  qs('errorBanner').classList.remove('hidden');
}
function dismissError() { qs('errorBanner').classList.add('hidden'); }

// ── Progress steps ────────────────────────────────────────
const STEP_DELAYS = [0, 800, 1800, 3200, 5000];

function animateProgress() {
  const steps = document.querySelectorAll('.prog-step');
  steps.forEach(s => { s.classList.remove('active', 'done'); });

  let i = 0;
  function activate() {
    if (i > 0) steps[i - 1].classList.remove('active');
    if (i > 0) steps[i - 1].classList.add('done');
    if (i < steps.length) {
      steps[i].classList.add('active');
      i++;
      setTimeout(activate, STEP_DELAYS[i] - (STEP_DELAYS[i - 1] || 0) + 400);
    }
  }
  activate();
}

// ── Main analysis ─────────────────────────────────────────
async function analyzeUrl() {
  const url = qs('urlInput').value.trim();
  if (!url) { showError('Please enter an article URL.'); return; }

  try { new URL(url); }
  catch (_) { showError('Please enter a valid URL (starting with http:// or https://).'); return; }

  // UI transition
  dismissError();
  qs('heroArea').classList.add('hidden');
  qs('resultsSection').classList.add('hidden');
  qs('progressSection').classList.remove('hidden');
  qs('progressUrl').textContent = url;
  qs('analyzeBtn').classList.add('loading');
  qs('analyzeBtn').querySelector('.btn-label').textContent = 'Analyzing…';

  // Animate steps
  animateProgress();

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    currentResult = data;

    // Mark all steps done
    document.querySelectorAll('.prog-step').forEach(s => {
      s.classList.remove('active');
      s.classList.add('done');
    });

    await new Promise(r => setTimeout(r, 400));

    qs('progressSection').classList.add('hidden');
    renderResults(data);
    qs('resultsSection').classList.remove('hidden');

  } catch (err) {
    qs('progressSection').classList.add('hidden');
    qs('heroArea').classList.remove('hidden');
    showError(`Analysis failed: ${err.message}`);
  } finally {
    qs('analyzeBtn').classList.remove('loading');
    qs('analyzeBtn').querySelector('.btn-label').textContent = 'Analyze';
  }
}

// ── Render all results ────────────────────────────────────
function renderResults(data) {
  const { article, analysis, linkGraph, timeline, sources, apiStatus } = data;
  const prob    = analysis.fakeProbability;
  const probPct = analysis.fakeProbabilityPercent;
  const verdict = analysis.verdict;
  const domRep  = analysis.domainReputation;
  const factors = analysis.factors;
  const content = analysis.contentAnalysis;

  // Timestamp
  qs('resultsTimestamp').textContent = `Analyzed ${fmtTime(new Date().toISOString())}`;

  // ── Article card
  const domCat  = domRep.category;
  qs('articleDomainBadge').innerHTML =
    `<span class="cat-${domCat}">${domRep.label}</span>`;
  qs('articleDomainBadge').className = `article-badge bg-${domCat}`;

  qs('articleTitle').textContent = article.title || data.url;

  qs('metaAuthor').textContent = article.author ? `✍️ ${article.author}` : '';
  qs('metaDate').textContent   = article.publishDate ? `📅 ${fmtDate(article.publishDate)}` : '';

  const metaLink = qs('metaLink');
  metaLink.href        = data.url;
  metaLink.textContent = `🔗 ${article.domain}`;

  qs('articleDesc').textContent = article.description || '';

  // ── Gauge
  renderGauge(prob);

  // ── Verdict card text
  const vColor = probColor(prob);
  qs('verdictLabel').textContent  = verdict;
  qs('verdictLabel').style.color  = vColor;
  qs('verdictConfidence').textContent = `Confidence: ${analysis.confidence}`;
  qs('verdictDomain').textContent = `Source: ${article.domain}`;
  qs('verdictDomain').className   = `verdict-domain bg-${domCat} cat-${domCat}`;

  // ── Stats bar
  qs('statSources').textContent  = factors.totalNewsFound;
  qs('statCredible').textContent = factors.credibleSourcesCount;
  qs('statReddit').textContent   = factors.redditMentions;
  qs('statTwitter').textContent  = factors.twitterMentions;
  qs('statArchive').textContent  = factors.waybackSnapshots;
  qs('statCredible').style.color = factors.credibleSourcesCount >= 5 ? 'var(--green)' : factors.credibleSourcesCount > 0 ? 'var(--amber)' : 'var(--red)';

  // ── Tabs: reset to overview
  qs('linkGraphContainer').removeAttribute('data-rendered');
  switchTab('overview');

  // ── Overview panels
  renderFactors(factors, domRep, content, prob);
  renderContentAnalysis(content);
  renderApiStatus(apiStatus);
  renderFactCheckers(sources.factCheckers);

  // ── Other tabs
  renderTimeline(timeline);
  renderSources(sources.news, sources.wayback);
  renderSocialMedia(sources.reddit, sources.twitter, apiStatus);
}

// ── Gauge (D3 semicircular arc) ───────────────────────────
function renderGauge(prob) {
  const svg   = d3.select('#gaugeSvg');
  svg.selectAll('*').remove();

  const W = 220, H = 130;
  const cx = W / 2, cy = H - 12;
  const R = 80, thick = 22;

  // Background track
  const bgArc = d3.arc()
    .innerRadius(R - thick).outerRadius(R)
    .startAngle(-Math.PI / 2).endAngle(Math.PI / 2);
  svg.append('path').attr('d', bgArc()).attr('fill', '#e2e8f0').attr('transform', `translate(${cx},${cy})`);

  // Colored fill
  const color  = d3.interpolateRgb('#16a34a', '#dc2626')(prob);
  const fillArc = d3.arc()
    .innerRadius(R - thick).outerRadius(R)
    .startAngle(-Math.PI / 2)
    .endAngle(-Math.PI / 2 + prob * Math.PI);

  svg.append('path')
    .attr('fill', color)
    .attr('transform', `translate(${cx},${cy})`)
    .attr('d', fillArc())
    .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,.15))');

  // Needle
  const angle = -Math.PI / 2 + prob * Math.PI;
  const nx = cx + (R - thick / 2) * Math.cos(angle);
  const ny = cy + (R - thick / 2) * Math.sin(angle);
  svg.append('circle').attr('cx', nx).attr('cy', ny).attr('r', 5)
    .attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 2);

  // Center dot
  svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 6)
    .attr('fill', '#475569').attr('stroke', '#fff').attr('stroke-width', 2);

  // Percentage text
  svg.append('text')
    .attr('x', cx).attr('y', cy - 28)
    .attr('text-anchor', 'middle')
    .attr('font-size', '32px').attr('font-weight', '800')
    .attr('fill', color).attr('font-family', 'Inter, sans-serif')
    .text(`${Math.round(prob * 100)}%`);

  svg.append('text')
    .attr('x', cx).attr('y', cy - 10)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#94a3b8')
    .attr('font-family', 'Inter, sans-serif')
    .text('Fake Probability');

  // Scale labels
  svg.append('text').attr('x', cx - R + 2).attr('y', cy + 16)
    .attr('font-size', '10px').attr('fill', '#94a3b8').text('0%');
  svg.append('text').attr('x', cx + R - 14).attr('y', cy + 16)
    .attr('font-size', '10px').attr('fill', '#94a3b8').text('100%');
}

// ── Overview: Factors ─────────────────────────────────────
const SNOPES_VERDICT_LABELS = {
  'false':        { text: 'FALSE — Snopes rated this story false',              score: 2  },
  'mostly-false': { text: 'MOSTLY FALSE — Snopes rated this mostly false',      score: 15 },
  'mixed':        { text: 'MIXED / UNVERIFIED — Snopes rated this as mixed',    score: 45 },
  'mostly-true':  { text: 'MOSTLY TRUE — Snopes rated this mostly true',        score: 80 },
  'true':         { text: 'TRUE — Snopes confirmed this story as true',         score: 98 },
};

function renderFactors(factors, domRep, content, prob) {
  const el = qs('factorsList');

  const snopesEntry = factors.snopesVerdict && SNOPES_VERDICT_LABELS[factors.snopesVerdict];

  const items = [
    {
      label: 'Domain Credibility',
      desc: domRep.label,
      value: domRep.score,
    },
    {
      label: 'Corroboration',
      desc: `${factors.credibleSourcesCount} credible source(s) cover this story`,
      value: Math.min(100, factors.credibleSourcesCount * 10),
    },
    {
      label: 'Content Quality',
      desc: `${content.issues.length} issue(s) found, ${content.positives.length} positive signal(s)`,
      value: content.score,
    },
    {
      label: 'Questionable Amplification',
      desc: `${factors.questionableSources} low-credibility source(s) spreading story`,
      value: Math.max(0, 100 - factors.questionableSources * 20),
    },
    {
      label: 'Fact-Checker Coverage',
      desc: snopesEntry
        ? snopesEntry.text
        : factors.factCheckersFound > 0
          ? `${factors.factCheckersFound} fact-checker source(s) found`
          : 'No Snopes or fact-checker coverage found',
      value: snopesEntry
        ? snopesEntry.score
        : factors.factCheckersFound > 0 ? 85 : 40,
    },
  ];

  el.innerHTML = items.map(item => {
    const bar = Math.max(2, item.value);
    const col = scoreColor(item.value);
    return `
      <div class="factor-item">
        <div class="factor-header">
          <span>${escHtml(item.label)}</span>
          <span class="factor-score" style="color:${col}">${item.value}/100</span>
        </div>
        <div class="factor-bar-bg">
          <div class="factor-bar-fill" style="width:${bar}%;background:${col}"></div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${escHtml(item.desc)}</div>
      </div>`;
  }).join('');
}

// ── Overview: Content Analysis ────────────────────────────
function renderContentAnalysis(content) {
  const el = qs('contentAnalysis');
  const col = scoreColor(content.score);

  const issuesHtml = content.issues.length
    ? `<p style="font-size:13px;font-weight:600;color:var(--text2);margin:12px 0 6px">Issues detected:</p>
       <ul class="issue-list">
         ${content.issues.map(i => `<li><span class="issue-icon" style="color:var(--red)">⚠</span>${escHtml(i)}</li>`).join('')}
       </ul>`
    : '<p style="font-size:13px;color:var(--green);margin-top:12px">✓ No major content quality issues detected</p>';

  const posHtml = content.positives.length
    ? `<ul class="positive-list" style="margin-top:8px">
         ${content.positives.map(p => `<li><span class="issue-icon" style="color:var(--green)">✓</span>${escHtml(p)}</li>`).join('')}
       </ul>`
    : '';

  el.innerHTML = `
    <div class="content-score-row">
      <div class="content-score-badge" style="color:${col}">${content.score}</div>
      <div>
        <div class="content-score-label" style="font-weight:700">Quality Score</div>
        <div class="content-score-sub">out of 100</div>
      </div>
      <div class="factor-bar-bg" style="flex:1;margin-left:12px">
        <div class="factor-bar-fill" style="width:${content.score}%;background:${col}"></div>
      </div>
    </div>
    ${issuesHtml}
    ${posHtml}
  `;
}

// ── Overview: API Status ──────────────────────────────────
function renderApiStatus(apiStatus) {
  const el = qs('apiStatusPanel');
  const services = [
    { name: 'Google News RSS', key: 'googleNews', always: true },
    { name: 'Reddit Search',   key: 'reddit',     always: true },
    { name: 'Wayback Machine', key: 'wayback',     always: true },
    { name: 'NewsAPI.org',     key: 'newsApi',     always: false },
    { name: 'Twitter / X',     key: 'twitter',     always: false },
    { name: 'Bing News',       key: 'bingNews',    always: false },
  ];

  el.innerHTML = services.map(s => {
    const active = apiStatus[s.key] || s.always;
    const label  = active ? 'Active' : 'Not configured';
    return `
      <div class="api-status-item">
        <span class="api-status-name">${s.name}</span>
        <span class="api-status-badge ${active ? 'ok' : 'off'}">${label}</span>
      </div>`;
  }).join('');
}

// ── Overview: Fact Checkers ───────────────────────────────
function renderFactCheckers(factCheckers) {
  const el = qs('factCheckList');
  if (!factCheckers || factCheckers.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text3)">No fact-checker sites found covering this story. This does not necessarily indicate fake news — many stories are simply not reviewed by fact-checkers.</p>';
    return;
  }
  el.innerHTML = factCheckers.map(fc => `
    <div class="source-row">
      <div class="source-row-info">
        <div class="source-title"><a href="${escHtml(fc.link)}" target="_blank" rel="noopener">${escHtml(fc.title)}</a></div>
        <div class="source-meta">${escHtml(fc.source)} · ${fmtDate(fc.pubDate)}</div>
      </div>
      <a class="source-link-btn" href="${escHtml(fc.link)}" target="_blank" rel="noopener">Open</a>
    </div>`).join('');
}

// ── Link Graph ────────────────────────────────────────────
function renderLinkGraph(graphData) {
  const container = qs('linkGraphContainer');
  container.innerHTML = '';

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:15px">No link graph data available for this article.</div>';
    return;
  }

  const W = container.clientWidth  || 900;
  const H = container.clientHeight || 560;

  const svg = d3.select('#linkGraphContainer')
    .append('svg')
    .attr('width', W).attr('height', H);

  // Defs: arrowhead
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 28).attr('refY', 0)
    .attr('markerWidth', 7).attr('markerHeight', 7)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#cbd5e1');

  defs.append('marker')
    .attr('id', 'arrow-social')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 28).attr('refY', 0)
    .attr('markerWidth', 7).attr('markerHeight', 7)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#7dd3fc');

  const g = svg.append('g');

  // Zoom
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', event => g.attr('transform', event.transform));
  svg.call(zoom);
  graphZoom = { svg, zoom };
  currentGraphSvg = svg;

  // Deep copy nodes & links for D3
  const nodes = graphData.nodes.map(n => ({ ...n }));
  const links = graphData.links.map(l => ({ ...l }));

  // Simulation
  const sim = d3.forceSimulation(nodes)
    .force('link',      d3.forceLink(links).id(d => d.id).distance(d => d.type === 'social' ? 160 : 120))
    .force('charge',    d3.forceManyBody().strength(-350))
    .force('center',    d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide().radius(d => (d.size || 10) + 14));

  // Fix origin node at center
  const origin = nodes.find(n => n.type === 'origin');
  if (origin) { origin.fx = W / 2; origin.fy = H / 2; }

  // Links
  const link = g.append('g').selectAll('line')
    .data(links).enter().append('line')
    .attr('stroke',       d => d.type === 'social' ? '#7dd3fc' : '#cbd5e1')
    .attr('stroke-width', d => d.type === 'social' ? 1.5 : 1)
    .attr('stroke-dasharray', d => d.type === 'social' ? '5,3' : null)
    .attr('marker-end',   d => `url(#${d.type === 'social' ? 'arrow-social' : 'arrow'})`);

  // Node groups
  const node = g.append('g').selectAll('g')
    .data(nodes).enter().append('g')
    .attr('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => {
        if (!e.active) sim.alphaTarget(0);
        // Keep origin pinned; release others
        if (d.type !== 'origin') { d.fx = null; d.fy = null; }
      })
    )
    .on('click',     (_, d) => { if (d.url) window.open(d.url, '_blank'); })
    .on('mouseover', (e, d) => showNodeTooltip(e, d))
    .on('mousemove', (e)    => moveTooltip(e))
    .on('mouseout',  ()     => hideTooltip());

  // Circle
  node.append('circle')
    .attr('r',            d => d.size || 10)
    .attr('fill',         d => CAT_COLOR[d.type === 'origin' ? 'origin' : (d.reputation?.category || 'unknown')])
    .attr('stroke',       '#fff')
    .attr('stroke-width', 2)
    .style('filter',      d => d.type === 'origin' ? 'drop-shadow(0 0 8px rgba(99,102,241,.6))' : 'none');

  // Label
  node.append('text')
    .attr('y', d => (d.size || 10) + 13)
    .attr('text-anchor', 'middle')
    .attr('font-size',   '10px')
    .attr('fill',        '#475569')
    .attr('font-family', 'Inter, sans-serif')
    .attr('pointer-events', 'none')
    .text(d => d.label.length > 22 ? d.label.substring(0, 20) + '…' : d.label);

  sim.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Legend
  const legendEl = qs('graphLegend');
  const legendItems = [
    { color: CAT_COLOR.origin,      label: 'Source Article' },
    { color: CAT_COLOR.credible,    label: 'Credible News' },
    { color: CAT_COLOR.factchecker, label: 'Fact Checker' },
    { color: CAT_COLOR.mixed,       label: 'Mixed Credibility' },
    { color: CAT_COLOR.questionable,label: 'Questionable' },
    { color: CAT_COLOR.fake,        label: 'Low Credibility / Fake' },
    { color: CAT_COLOR.social,      label: 'Social Media' },
    { color: CAT_COLOR.unknown,     label: 'Unknown Source' },
  ];
  legendEl.innerHTML = legendItems.map(l =>
    `<div class="legend-item"><div class="legend-dot" style="background:${l.color}"></div>${escHtml(l.label)}</div>`
  ).join('');
}

function resetGraphZoom() {
  if (graphZoom) {
    graphZoom.svg.transition().duration(500).call(
      graphZoom.zoom.transform, d3.zoomIdentity
    );
  }
}

// ── Graph tooltip ─────────────────────────────────────────
function showNodeTooltip(event, d) {
  const tt = qs('graphTooltip');
  const rep = d.reputation || {};
  tt.innerHTML = `
    <div class="tt-title">${escHtml(d.label)}</div>
    <div class="tt-label">${escHtml(rep.label || 'Unknown')}</div>
    <div class="tt-score" style="color:${scoreColor(rep.score || 50)}">Credibility: ${rep.score ?? '?'}/100</div>
    ${d.date ? `<div class="tt-label">Date: ${fmtDate(d.date)}</div>` : ''}
    ${d.url ? '<div class="tt-label" style="margin-top:4px">Click to open ↗</div>' : ''}
  `;
  tt.classList.remove('hidden');
  moveTooltip(event);
}
function moveTooltip(event) {
  const tt = qs('graphTooltip');
  tt.style.left = (event.clientX + 14) + 'px';
  tt.style.top  = (event.clientY - 14) + 'px';
}
function hideTooltip() { qs('graphTooltip').classList.add('hidden'); }

// ── Timeline ──────────────────────────────────────────────
function renderTimeline(events) {
  const el = qs('timelineContainer');
  if (!events || events.length === 0) {
    el.innerHTML = '<p style="color:var(--text3);font-size:14px">No timeline data available. Article dates may not have been detected.</p>';
    return;
  }

  const typeColorMap = { origin: '#6366f1', news: '#16a34a', reddit: '#ea580c', social_reddit: '#ea580c' };

  el.innerHTML = `<div class="timeline-list">` + events.map(ev => {
    const cat   = ev.reputation?.category || (ev.type === 'reddit' ? 'social' : 'unknown');
    const color = typeColorMap[ev.type] || CAT_COLOR[cat] || '#94a3b8';
    const label = ev.reputation?.label || (ev.type === 'reddit' ? 'Reddit' : ev.source);
    return `
      <div class="tl-item">
        <div class="tl-dot" style="background:${color}"></div>
        <div class="tl-date">${fmtDate(ev.date)}</div>
        <div class="tl-card">
          <div class="tl-source">
            ${ev.type === 'origin' ? '<span class="tl-origin-marker">Origin</span>' : ''}
            <span class="tl-source-name">${escHtml(ev.source)}</span>
            ${ev.reputation ? `<span class="tl-cred-badge bg-${cat} cat-${cat}">${ev.reputation.score}/100</span>` : ''}
          </div>
          <div class="tl-title">
            ${ev.url
              ? `<a href="${escHtml(ev.url)}" target="_blank" rel="noopener">${escHtml(ev.title || ev.url)}</a>`
              : escHtml(ev.title || ev.source)
            }
          </div>
        </div>
      </div>`;
  }).join('') + `</div>`;
}

// ── Sources Table ─────────────────────────────────────────
let _allSources = [];

function renderSources(news, wayback) {
  _allSources = news || [];
  renderSourceTable('all');
  renderWayback(wayback);
}

function filterSources(filter, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSourceTable(filter);
}

function renderSourceTable(filter) {
  const el = qs('sourcesTable');
  let sources = _allSources;

  if (filter !== 'all') {
    sources = sources.filter(s => {
      const cat = s.reputation?.category || 'unknown';
      if (filter === 'credible')    return ['credible', 'scientific', 'factchecker'].includes(cat);
      if (filter === 'mixed')       return cat === 'mixed';
      if (filter === 'questionable')return ['questionable', 'fake', 'satire'].includes(cat);
      return true;
    });
  }

  if (sources.length === 0) {
    el.innerHTML = `<p style="color:var(--text3);font-size:14px;padding:16px 0">No sources match this filter.</p>`;
    return;
  }

  el.innerHTML = sources.map(s => {
    const cat   = s.reputation?.category || 'unknown';
    const score = s.reputation?.score ?? 50;
    const col   = scoreColor(score);
    return `
      <div class="source-row" data-cat="${cat}">
        <div class="source-row-info">
          <div class="source-title">
            <a href="${escHtml(s.link)}" target="_blank" rel="noopener">${escHtml(s.title || s.link)}</a>
          </div>
          <div class="source-meta">${escHtml(s.source || s.domain)} · ${fmtDate(s.pubDate)}</div>
          <div class="source-meta" style="font-size:11px;margin-top:1px">${escHtml(s.reputation?.label || 'Unknown source')}</div>
        </div>
        <div class="source-cred">
          <div class="source-score" style="color:${col}">${score}</div>
          <div class="source-cat cat-${cat}">${cat}</div>
        </div>
        <a class="source-link-btn" href="${escHtml(s.link)}" target="_blank" rel="noopener">Open ↗</a>
      </div>`;
  }).join('');
}

function renderWayback(wayback) {
  const card = qs('waybackCard');
  const el   = qs('waybackList');

  if (!wayback || wayback.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text3)">No Wayback Machine snapshots found for this URL.</p>';
    return;
  }

  card.classList.remove('hidden');
  el.innerHTML = wayback.map(wb => `
    <div class="wb-item">
      <span class="wb-date">📅 ${wb.date}</span>
      <a class="wb-link" href="${escHtml(wb.archiveUrl)}" target="_blank" rel="noopener">View archived version ↗</a>
    </div>`).join('');
}

// ── Social Media ──────────────────────────────────────────
function renderSocialMedia(reddit, twitter, apiStatus) {
  const el = qs('socialContent');

  let html = '<div class="social-grid">';

  // Reddit
  html += `<div class="panel-card">
    <h3 class="panel-title">Reddit <span style="font-size:13px;color:var(--text3);font-weight:400">(${reddit.length} mentions)</span></h3>`;
  if (reddit.length > 0) {
    html += reddit.map(p => `
      <div class="reddit-post">
        <div class="reddit-subreddit">r/${escHtml(p.subreddit)}</div>
        <div class="reddit-title">
          <a href="${escHtml(p.redditLink)}" target="_blank" rel="noopener">${escHtml(p.title)}</a>
        </div>
        <div class="reddit-stats">
          <span>⬆ ${p.score} upvotes</span>
          <span>💬 ${p.numComments} comments</span>
          <span>📅 ${fmtDate(p.created)}</span>
        </div>
      </div>`).join('');
  } else {
    html += '<p style="font-size:13px;color:var(--text3)">No Reddit mentions found.</p>';
  }
  html += '</div>';

  // Twitter
  html += `<div class="panel-card">
    <h3 class="panel-title">Twitter / X
      <span style="font-size:13px;color:var(--text3);font-weight:400">(${twitter.length} recent tweets)</span>
    </h3>`;
  if (!apiStatus.twitter) {
    html += `<div style="padding:16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;font-size:13px;color:var(--text2)">
      <strong>Twitter/X not configured.</strong><br><br>
      To enable Twitter search, add your <code style="font-size:12px;background:var(--bg);padding:1px 4px;border-radius:3px">TWITTER_BEARER_TOKEN</code> to the <code style="font-size:12px;background:var(--bg);padding:1px 4px;border-radius:3px">.env</code> file.<br><br>
      Get a free token at <a href="https://developer.twitter.com" target="_blank" rel="noopener">developer.twitter.com</a>
    </div>`;
  } else if (twitter.length > 0) {
    html += twitter.map(t => `
      <div class="tweet-item">
        <div class="tweet-author">${escHtml(t.author)} ${t.authorFollowers > 10000 ? '· 🔵 ' + (t.authorFollowers/1000).toFixed(0) + 'K followers' : ''}</div>
        <div class="tweet-text">${escHtml(t.text)}</div>
        <div class="tweet-stats">
          <span>❤ ${t.likes}</span>
          <span>🔁 ${t.retweets}</span>
          <span>💬 ${t.replies}</span>
          <span>📅 ${fmtDate(t.created)}</span>
          <a href="${escHtml(t.link)}" target="_blank" rel="noopener" style="color:var(--accent)">View ↗</a>
        </div>
      </div>`).join('');
  } else {
    html += '<p style="font-size:13px;color:var(--text3)">No recent tweets found for this story.</p>';
  }
  html += '</div>';
  html += '</div>'; // .social-grid

  el.innerHTML = html;
}

// ── Logs page ─────────────────────────────────────────────
async function loadLogs() {
  const el = qs('logsContainer');
  el.innerHTML = '<div class="logs-empty">Loading…</div>';
  try {
    const res = await fetch(`${API_BASE}/api/logs/detail`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const logs = data.logs || [];

    if (logs.length === 0) {
      el.innerHTML = '<div class="logs-empty">No searches logged yet. Analyze a URL to get started.</div>';
      return;
    }

    el.innerHTML = logs.map(log => {
      const prob  = Math.round((log.fakeProbability || 0) * 100);
      const col   = probColor(log.fakeProbability || 0.5);
      const vcol  = VERDICT_COLOR[log.verdict] || '#94a3b8';
      const vbg   = log.fakeProbability > 0.75 ? 'var(--red-light)'  :
                    log.fakeProbability > 0.55 ? 'var(--orange-light)':
                    log.fakeProbability > 0.35 ? 'var(--amber-light)' :
                    'var(--green-light)';
      return `
        <div class="log-row" onclick="reAnalyzeFromLog(${JSON.stringify(log.url)})">
          <div class="log-prob" style="color:${col}">${prob}%</div>
          <div class="log-info">
            <div class="log-title">${escHtml(log.title || log.url)}</div>
            <div class="log-url">${escHtml(log.url)}</div>
          </div>
          <div class="log-verdict" style="background:${vbg};color:${vcol}">${escHtml(log.verdict || '—')}</div>
          <div class="log-time">${fmtTime(log.timestamp)}</div>
        </div>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<div class="logs-empty">Failed to load logs: ${escHtml(err.message)}</div>`;
  }
}

function reAnalyzeFromLog(url) {
  switchSection('analyze');
  qs('urlInput').value = url;
  analyzeUrl();
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Show API status in hero
  fetch(`${API_BASE}/api/logs`)
    .catch(() => {})
    .then(() => {
      // Server is running — silently ok
    });

  const heroApis = qs('heroApis');
  heroApis.innerHTML = [
    { name: 'Google News', always: true },
    { name: 'Reddit',      always: true },
    { name: 'Wayback Machine', always: true },
    { name: 'NewsAPI', key: 'NEWSAPI_KEY' },
    { name: 'Twitter/X', key: 'TWITTER_BEARER_TOKEN' },
  ].map(s =>
    `<div class="api-dot">
      <div class="api-dot-circle on"></div>
      <span>${s.name}</span>
    </div>`
  ).join('');

  // Allow drop-to-analyze
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
    if (text && text.startsWith('http')) {
      qs('urlInput').value = text.trim();
      if (qs('section-logs').classList.contains('hidden')) {
        analyzeUrl();
      }
    }
  });
});
