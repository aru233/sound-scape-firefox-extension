// content-analysis.js
// Analyzes page content to determine the appropriate soundscape category.
// No ML — uses URL patterns, meta tags, keyword scoring, heading weights, and DOM heuristics.

const CATEGORIES = {
  nature:   { color: '#4ade80', accent: '#052e16', icon: '🌿', label: 'Nature',   sub: 'Wind, leaves & birdsong' },
  tech:     { color: '#818cf8', accent: '#1e1b4b', icon: '⚡', label: 'Tech',     sub: 'Server hum & data blips' },
  space:    { color: '#c084fc', accent: '#2e1065', icon: '🌌', label: 'Space',    sub: 'Cosmic drones & pings' },
  news:     { color: '#f87171', accent: '#450a0a', icon: '📡', label: 'News',     sub: 'Tension & urgency' },
  commerce: { color: '#fbbf24', accent: '#451a03', icon: '🛍️', label: 'Commerce', sub: 'Soft muzak & dings' },
  calm:     { color: '#67e8f9', accent: '#083344', icon: '☁️', label: 'Calm',     sub: 'Breathing tones & warmth' },
  focus:    { color: '#a78bfa', accent: '#2e1065', icon: '🎯', label: 'Focus',    sub: 'Binaural beats & silence' },
  rain:     { color: '#93c5fd', accent: '#1e3a5f', icon: '🌧️', label: 'Rain',     sub: 'Rainfall & distant thunder' },
  cafe:     { color: '#d4a96a', accent: '#2a1a00', icon: '☕', label: 'Cafe',     sub: 'Lo-fi warmth & chatter' },
};

// URL hostname patterns (fast first-pass) — +15 points on match
const URL_PATTERNS = {
  tech:     /github|gitlab|stackoverflow|npmjs|dev\.to|vercel|netlify|heroku|aws\.|gcp\.|azure|docker|kubernetes|ubuntu|hackernews|ycombinator|producthunt|codepen|replit|leetcode|hackerrank|devdocs|caniuse|mdn|w3schools|digitalocean|cloudflare|fastly|datadog|sentry\.io|figma\.com|linear\.app|notion\.so|docs\.google/,
  nature:   /nationalgeographic|nature\.com|wilderness|hiking|gardening|birdwatch|ecology|conservation|wwf|audubon|nps\.gov|allaboutbirds|inaturalist|merlinbird|iucnredlist|rewilding/,
  space:    /nasa|esa\.int|arxiv|spacex|jpl\.nasa|astronomy|astrophysics|space\.com|skyandtelescope|heavens-above|stellarium|caltech\.edu|stsci\.edu/,
  news:     /nytimes|bbc\.|cnn\.|reuters|apnews|theguardian|washingtonpost|politico|axios|theatlantic|economist|wsj\.|bloomberg|nbcnews|abcnews|foxnews|npr\.org|aljazeera|derspiegel|lemonde|corriere|techcrunch|theverge|wired\.com/,
  commerce: /amazon\.|ebay\.|etsy\.|shopify|walmart\.|target\.|bestbuy|wayfair|chewy\.|zappos|newegg|aliexpress|wish\.com|rakuten|homedepot|ikea\.|costco\.|macys\.|nordstrom/,
  focus:    /notion\.so|docs\.google|obsidian\.md|roamresearch|workflowy|remnote|logseq|todoist|asana\.com|trello\.com|basecamp\.com|confluence|clickup\.com|monday\.com|jira\.|airtable\.com/,
  rain:     /weather|forecast|wunderground|weather\.gov|accuweather|weather\.com|windy\.com|ventusky|darksky|meteoblue|metoffice\.gov|bom\.gov/,
  cafe:     /lofi\.cafe|brain\.fm|endel\.io|noisli|mynoise|spotify\.com|soundcloud\.com|youtube\.com\/watch/,
};

// Keyword dictionaries — weighted terms per category
const KEYWORDS = {
  tech: {
    high: ['javascript','typescript','python','golang','rust','react','angular','vue','docker','kubernetes','api','endpoint','database','algorithm','deployment','git','commit','branch','merge','pull request','agile','scrum','server','cloud','microservice','devops','pipeline','nodejs','webpack','linting','debug','open source','repository','linux','terminal','bash','shell','cpu','gpu','memory','latency','throughput','bandwidth','function','class','variable','array','loop','async','cache','compiler','runtime','sdk','cli','npm','pip','cargo','llm','neural','model','inference','token','prompt','embedding'],
    low:  ['software','computer','program','application','web','mobile','tech','digital','virtual','data','network','internet','protocol','framework','library','module','thread','index','deploy','build','test','engineer','developer'],
  },
  nature: {
    high: ['forest','ocean','river','mountain','wildlife','ecosystem','biodiversity','rainforest','savanna','tundra','coral','reef','glacier','volcano','earthquake','tornado','hurricane','pollination','migration','hibernation','predator','prey','habitat','species','extinction','conservation','plant','animal','bird','fish','insect','mammal','reptile','amphibian','mushroom','moss','fern','seed','root','bloom','petal','tide','wave','current','atmosphere','soil','photosynthesis','canopy','wetland','prairie','desert','alpine'],
    low:  ['nature','natural','green','earth','tree','flower','garden','park','trail','outdoor','hiking','camping','wilderness','water','sky','wind','rain','sun','season','wild','coast','lake','stream'],
  },
  space: {
    high: ['galaxy','nebula','quasar','pulsar','black hole','supernova','neutron star','dark matter','dark energy','cosmic','orbit','spacecraft','telescope','hubble','james webb','mars','jupiter','saturn','exoplanet','light year','parsec','redshift','gravitational','astronaut','payload','trajectory','solar wind','magnetosphere','spectroscopy','cosmology','big bang','multiverse','quantum','relativity','einstein','hawking','wormhole','singularity','event horizon','accretion','kuiper belt','oort cloud'],
    low:  ['space','planet','star','moon','universe','astronomy','astrophysics','nasa','rocket','satellite','comet','asteroid','meteor','eclipse','constellation','cosmos','void','launch','orbit'],
  },
  news: {
    high: ['election','congress','parliament','senate','president','minister','policy','legislation','bill','treaty','sanction','crisis','conflict','war','ceasefire','protest','economy','inflation','recession','gdp','unemployment','federal reserve','central bank','stock market','geopolitics','diplomacy','summit','alliance','scandal','investigation','indictment','verdict','testimony','hearing','briefing','exclusive','breaking','analysis','editorial','journalist','correspondent','deadline','headline','bulletin','dispatch'],
    low:  ['news','report','breaking','update','latest','today','politics','government','official','spokesperson','source','announced','confirmed','denied','claim','accuse','warn','react'],
  },
  commerce: {
    high: ['price','cart','checkout','shipping','delivery','return','refund','warranty','discount','coupon','promo','sale','deal','offer','product','sku','inventory','stock','order','purchase','buy','sold','merchant','seller','vendor','marketplace','review','rating','stars','wishlist','subscription','membership','billing','invoice','payment','credit card','paypal','add to cart','free shipping','limited time','bundle','upsell','loyalty'],
    low:  ['shop','store','brand','item','buy','sell','cost','free','cheap','limited','exclusive','popular','trending','recommended','new','gift','basket'],
  },
  calm: {
    high: ['meditation','mindfulness','breathing','yoga','zen','philosophy','poetry','prose','essay','journal','diary','memoir','biography','reflection','contemplation','gratitude','stillness','serenity','tranquil','peaceful','gentle','slow','rest','sleep','dream','ritual','habit','therapy','wellness','healing','comfort','warmth','nostalgia','story','narrative','literature','art','music','painting','photograph','watercolor','sketching','journaling','gratitude','affirmation','mantra','retreat','sanctuary'],
    low:  ['read','write','think','feel','learn','grow','explore','wonder','imagine','create','relax','breathe','simple','quiet','beautiful','calm','peaceful','soft','gentle','slow'],
  },
  focus: {
    high: ['task','goal','productivity','concentration','workflow','milestone','deadline','sprint','kanban','backlog','project','objective','deliverable','agenda','schedule','priority','action item','outline','checklist','tracker','retrospective','planning','deep work','pomodoro','time block','gtd','eisenhower','focus mode','distraction free','flow state','cognitive','executive function','attention','study session','exam','research','thesis','dissertation'],
    low:  ['focus','work','study','notes','todo','done','today','list','organize','manage','track','plan','write','review','draft','edit'],
  },
  rain: {
    high: ['rain','drizzle','shower','storm','thunder','lightning','forecast','precipitation','humidity','downpour','flood','cloudy','overcast','monsoon','typhoon','cyclone','gale','squall','rainfall','puddle','umbrella','wet','damp','mist','fog','hail','sleet','snow','blizzard','frost','dew','condensation'],
    low:  ['weather','cloud','wet','cold','grey','damp','umbrella','waterproof','temperature','wind','chilly','cozy','blanket'],
  },
  cafe: {
    high: ['coffee','espresso','latte','cappuccino','barista','brew','roast','lofi','lo-fi','chill','playlist','ambient','study music','focus music','background music','vinyl','cassette','jazz','bossa nova','acoustic','indie','hip hop','beats','instrumental','chillhop','synthwave','vaporwave','aesthetic','cozy','cafe','coffeehouse'],
    low:  ['music','listen','relax','vibe','chill','study','background','cafe','cozy','warm','mellow','groove','mood'],
  },
};

// ── Fast URL-only analysis (DOM-free, safe at document_start) ────────────────
function analyzeURL() {
  const url = window.location.hostname + window.location.pathname;
  for (const [cat, pattern] of Object.entries(URL_PATTERNS)) {
    if (pattern.test(url)) return { category: cat, fast: true };
  }
  // Title-only pass (available very early)
  const title = document.title.toLowerCase();
  if (title) {
    let best = 'calm', bestScore = 0;
    for (const [cat, dict] of Object.entries(KEYWORDS)) {
      let score = 0;
      dict.high.forEach(term => { if (title.includes(term)) score += 3; });
      dict.low.forEach(term => { if (title.includes(term)) score += 1; });
      if (score > bestScore) { bestScore = score; best = cat; }
    }
    if (bestScore >= 3) return { category: best, fast: true };
  }
  return { category: 'calm', fast: true };
}

// ── Full DOM analysis ────────────────────────────────────────────────────────

// Use TreeWalker instead of cloneNode — avoids expensive DOM copy
function extractPageText() {
  if (!document.body) return '';
  const skip = new Set(['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript']);
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        let el = node.parentElement;
        while (el && el !== document.body) {
          if (skip.has(el.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  const parts = [];
  let total = 0;
  let node;
  while ((node = walker.nextNode()) && total < 8000) {
    const t = node.textContent.trim();
    if (t) { parts.push(t); total += t.length; }
  }
  return parts.join(' ').toLowerCase();
}

function extractMeta() {
  const get = (sel) => document.querySelector(sel)?.content || '';
  return [
    get('meta[name="keywords"]'),
    get('meta[property="og:description"]'),
    get('meta[name="description"]'),
    get('meta[property="og:type"]'),
    document.title,
  ].join(' ').toLowerCase();
}

// Title and H1/H2 carry stronger signal — scored separately at double weight
function extractHeadings() {
  if (!document.body) return document.title.toLowerCase();
  const parts = [document.title];
  document.querySelectorAll('h1, h2').forEach(h => parts.push(h.textContent));
  return parts.join(' ').toLowerCase();
}

function scoreText(text, dict) {
  let score = 0;
  const words = new Set(text.split(/\s+/));
  dict.high.forEach(term => { if (text.includes(term)) score += term.includes(' ') ? 4 : 2; });
  dict.low.forEach(term => { if (words.has(term)) score += 1; });
  return score;
}

function domHeuristics() {
  if (!document.body) return {};
  const hints = {};
  const codeBlocks = document.querySelectorAll('pre, code, .highlight, .hljs, [class*="language-"]').length;
  const images = document.querySelectorAll('img').length;
  const paragraphs = document.querySelectorAll('p').length;
  const editables = document.querySelectorAll('input[type=text], textarea, [contenteditable="true"]').length;
  const video = document.querySelectorAll('video, [class*="player"], [class*="video"]').length;
  const articles = document.querySelectorAll('article, [role="article"], .post, .entry').length;
  if (codeBlocks > 3) hints.tech = 12;
  if (images > 10 && paragraphs < 5) hints.nature = 5;
  if (editables > 3 && paragraphs < 3) hints.focus = 8;
  if (articles > 0 && paragraphs > 8) hints.calm = 4;
  if (video > 0) hints.cafe = 3;
  return hints;
}

function analyzePage() {
  const url = window.location.hostname + window.location.pathname;
  const text = extractPageText();
  const meta = extractMeta();
  const headings = extractHeadings();
  const combined = text + ' ' + meta;
  const scores = {};

  for (const [cat, pattern] of Object.entries(URL_PATTERNS)) {
    if (pattern.test(url)) scores[cat] = (scores[cat] || 0) + 15;
  }
  for (const [cat, dict] of Object.entries(KEYWORDS)) {
    scores[cat] = (scores[cat] || 0) + scoreText(combined, dict);
    // Headings/title count double
    scores[cat] = (scores[cat] || 0) + scoreText(headings, dict);
  }
  for (const [cat, bonus] of Object.entries(domHeuristics())) {
    scores[cat] = (scores[cat] || 0) + bonus;
  }

  let best = 'calm', bestScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = cat; }
  }

  return { category: best, scores, meta: CATEGORIES[best] };
}

window.__soundscape_analyze     = analyzePage;
window.__soundscape_analyze_url = analyzeURL;
window.__soundscape_categories  = CATEGORIES;
