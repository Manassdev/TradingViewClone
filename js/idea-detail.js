const ideasData = {
  "mm-channel-breakout": {
    id: "mm-channel-breakout",
    title: "M&M Strong Bullish Expansion with Channel Breakout",
    symbol: "M&M",
    exchange: "NSE",
    timeframe: "1D",
    direction: "LONG",
    badge: "Editor's picks",
    date: "21 hours ago",
    author: "simpletradewithpatience",
    authorReputation: 12450,
    authorFollowers: 840,
    authorIdeas: 112,
    views: 1240,
    comments: 2,
    likes: 8,
    price: "3,502.00",
    change: "+0.05%",
    description: `
      <h3>Market Structure Snapshot | NSE: M&M | Daily</h3>
      <p><strong>Closing Price:</strong> 3,502.00</p>
      <p><strong>Core Trend:</strong> Uptrend</p>
      <p><strong>Market State:</strong> Bullish Expansion / Breakout Phase</p>
      <p><strong>Price Structure:</strong> Strong bullish price expansion following a period of consolidation, with price now approaching the next resistance cluster.</p>
      
      <h3>Operational Price Grid & Key Reference Levels</h3>
      <p><strong>Model Reference Level:</strong> 3,504.90</p>
      <p><strong>Hard Invalidation Level:</strong> 3,057.70</p>
      <p><strong>Structural Risk:</strong> 447.20 (12.76%)</p>
      <p><strong>Resistance Levels:</strong> R1 3,537.23 | R2 3,577.47 | R3 3,640.03</p>
      <p><strong>Support Levels:</strong> S1 3,434.43 | S2 3,366.87 | S3 3,331.63</p>
      <p><strong>Range Structure:</strong> Recent consolidation followed by bullish expansion</p>
      <p><strong>Higher Timeframe Observation Zone:</strong> 3,640+</p>
      
      <h3>Momentum, Participation & CPR Data</h3>
      <p><strong>Volume:</strong> 3.30 Million Shares</p>
      <p><strong>20-Day Average Volume:</strong> 2.55 Million Shares</p>
      <p><strong>Volume Ratio:</strong> ~1.29x average</p>
      <p><strong>Volume Character:</strong> Above-Average Participation</p>
      <p><strong>Current Bias:</strong> BULLISH — WATCH FOR PULLBACKS</p>
    `
  },
  "tatatech-stage2": {
    id: "tatatech-stage2",
    title: "#TATATECH - Stage 2 BO in WTF",
    symbol: "TATATECH",
    exchange: "NSE",
    timeframe: "1D",
    direction: "LONG",
    badge: "Popular",
    date: "Aug 9",
    author: "MMT_MakeMoneyTrading",
    authorReputation: 5410,
    authorFollowers: 320,
    authorIdeas: 45,
    views: 890,
    comments: 3,
    likes: 8,
    price: "1,048.50",
    change: "+1.25%",
    description: `
      <h3>Technical Analysis Snapshot | TATATECH | Daily</h3>
      <p><strong>Core Trend:</strong> Reversal / Stage 2 Breakout</p>
      <p><strong>Market State:</strong> Decisive Breakout from Accumulation Range</p>
      <p><strong>Analysis:</strong> Tata Technologies has successfully broken out of its Stage 1 accumulation base. The breakout is backed by exceptional volume expansion, indicating strong institutional interest and participation.</p>
      
      <h3>Key Price Grid & Operational Levels</h3>
      <p><strong>Breakout Level:</strong> 1,020.00</p>
      <p><strong>Immediate Target:</strong> 1,120.00 | Secondary Target: 1,180.00</p>
      <p><strong>Support Zone:</strong> 1,010.00 - 1,025.00</p>
      <p><strong>Stop Loss / Invalidation:</strong> Below 975.00</p>
      
      <h3>Volume & Momentum Metrics</h3>
      <p><strong>Volume Expansion:</strong> 3.2x relative to the 20-day average, indicating significant buying pressure.</p>
      <p><strong>Relative Strength (RS) Line:</strong> Setting new 52-week highs, showing clear outperformance relative to the benchmark index.</p>
      <p><strong>MACD Indicator:</strong> Bullish crossover completed above the zero line with widening histograms.</p>
    `
  },
  "eternal-golden-cross": {
    id: "eternal-golden-cross",
    title: "ETERNAL - Swing Trade Setup-Golden Cross Over",
    symbol: "ETERNAL",
    exchange: "NSE",
    timeframe: "1D",
    direction: "LONG",
    badge: "Popular",
    date: "Aug 8",
    author: "DrPrashantVerma",
    authorReputation: 21890,
    authorFollowers: 1450,
    authorIdeas: 284,
    views: 2450,
    comments: 5,
    likes: 50,
    price: "315.00",
    change: "+0.16%",
    description: `
      <h3>Weekly Structure & Swing Setup | ETERNAL</h3>
      <p><strong>Current Market Price (CMP):</strong> ₹315.00</p>
      <p><strong>Elliott Wave Context:</strong> Showing a constructive weekly structure pointing to the start of a fresh Wave 3 impulsive advance.</p>
      <p><strong>Golden Cross Trigger:</strong> 50 EMA has crossed above the 200 EMA on the daily timeframe, a major long-term bullish trend confirmation.</p>
      
      <h3>Trade Setup & Levels</h3>
      <p><strong>Major Structural Low (Support):</strong> ₹212.00 - ₹213.00</p>
      <p><strong>Entry Range:</strong> ₹310.00 - ₹320.00</p>
      <p><strong>Target 1:</strong> ₹380.00 | Target 2: ₹440.00</p>
      <p><strong>Stop Loss:</strong> Close below ₹280.00</p>
      
      <h3>Participation Character</h3>
      <p><strong>Volume Character:</strong> Steady accumulation with volume expanding on up-days and contracting during consolidation pullbacks. This distribution pattern strongly confirms the Golden Cross swing setup.</p>
    `
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const ideaId = urlParams.get('id') || 'mm-channel-breakout';
  const data = ideasData[ideaId];

  if (!data) {
    document.body.innerHTML = '<div style="padding:40px; text-align:center;"><h2>Idea not found</h2><a href="index.html">Go back home</a></div>';
    return;
  }

  // Populate DOM elements
  document.getElementById('page-title').innerText = `${data.title} — TradingView`;
  document.getElementById('breadcrumb-title').innerText = data.title;
  document.getElementById('idea-title').innerText = data.title;
  document.getElementById('symbol-info').innerText = `${data.exchange}:${data.symbol}`;
  document.getElementById('direction-info').innerText = data.direction;
  document.getElementById('badge-info').innerText = data.badge;
  document.getElementById('date-info').innerText = data.date;
  document.getElementById('stats-likes').innerText = data.likes;
  document.getElementById('stats-comments').innerText = data.comments;
  document.getElementById('stats-views').innerText = data.views.toLocaleString();
  
  const avatarLetter = data.author[0].toUpperCase();
  document.getElementById('author-avatar-badge').innerText = avatarLetter;
  document.getElementById('author-avatar-widget').innerText = avatarLetter;
  document.getElementById('author-name').innerText = data.author;
  document.getElementById('author-name-widget').innerText = data.author;
  document.getElementById('author-reputation-val').innerText = data.authorReputation.toLocaleString();
  document.getElementById('profile-reputation').innerText = (data.authorReputation / 1000).toFixed(1) + 'k';
  document.getElementById('profile-followers').innerText = data.authorFollowers;
  document.getElementById('profile-ideas').innerText = data.authorIdeas;
  
  document.getElementById('idea-description').innerHTML = data.description;

  // Initialize and draw chart
  const canvas = document.getElementById('idea-chart');
  if (canvas) {
    // Setup canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    const ctx = canvas.getContext('2d');
    
    if (ideaId === 'mm-channel-breakout') {
      drawMmChart(ctx, canvas.width, canvas.height);
    } else if (ideaId === 'tatatech-stage2') {
      drawTatatechChart(ctx, canvas.width, canvas.height);
    } else if (ideaId === 'eternal-golden-cross') {
      drawEternalChart(ctx, canvas.width, canvas.height);
    }
  }

  // The discussion uses the existing stable idea slug as its comment key.
  if (window.initializeIdeaComments) window.initializeIdeaComments(ideaId);
});

// 1. M&M Chart drawing logic (Channel Breakout)
function drawMmChart(ctx, w, h) {
  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Grid
  drawChartGrid(ctx, w, h);

  // Title info overlay
  ctx.fillStyle = '#131722';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Mahindra & Mahindra Ltd. · 1D · NSE', 20, 30);

  // Consolidation box
  ctx.fillStyle = 'rgba(41, 98, 255, 0.05)';
  ctx.strokeStyle = 'rgba(41, 98, 255, 0.3)';
  ctx.lineWidth = 1;
  const boxX1 = w * 0.15;
  const boxY1 = h * 0.45;
  const boxW = w * 0.45;
  const boxH = h * 0.25;
  ctx.fillRect(boxX1, boxY1, boxW, boxH);
  ctx.strokeRect(boxX1, boxY1, boxW, boxH);

  // Text inside consolidation zone
  ctx.fillStyle = '#2962ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('CONSOLIDATION CHANNEL', boxX1 + 15, boxY1 + 25);

  // Generate M&M price candles
  const candlesCount = 35;
  const candleW = Math.floor(w * 0.75 / candlesCount) - 4;
  const points = [];

  for (let i = 0; i < candlesCount; i++) {
    const x = (w * 0.8 / candlesCount) * i + w * 0.08;
    let open, close, high, low;

    if (i < 20) {
      // Alternating range
      const mid = h * 0.57;
      open = mid + Math.sin(i * 1.5) * 40;
      close = mid + Math.sin((i + 1) * 1.5) * 40;
      high = Math.min(open, close) - 15 - Math.random() * 10;
      low = Math.max(open, close) + 15 + Math.random() * 10;
    } else {
      // Bullish breakout
      const start = h * 0.57 + Math.sin(20 * 1.5) * 40;
      const progress = i - 20;
      open = start - progress * 15;
      close = start - (progress + 1) * 15 - (progress === 0 ? 25 : 0); // extra gap on breakout candle
      high = Math.min(open, close) - 10 - Math.random() * 10;
      low = Math.max(open, close) + 5 + Math.random() * 5;
    }

    drawCandle(ctx, x, candleW, open, close, high, low);
    points.push({ x: x + candleW / 2, y: close });
  }

  // Draw breakout line indicator
  const breakoutPt = points[21];
  ctx.strokeStyle = '#089981';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(breakoutPt.x, breakoutPt.y, 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#089981';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('BREAKOUT', breakoutPt.x + 15, breakoutPt.y - 15);

  // Support / Resistance Horizontal Lines
  drawLevelLine(ctx, w, h * 0.45, 'Resistance (3,537.23)', '#f23645');
  drawLevelLine(ctx, w, h * 0.70, 'Support (3,434.43)', '#089981');
}

// 2. TATATECH Chart drawing logic (Stage 2 BO)
function drawTatatechChart(ctx, w, h) {
  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  drawChartGrid(ctx, w, h);

  ctx.fillStyle = '#131722';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Tata Technologies Ltd. · 1D · NSE', 20, 30);

  // Stage 1 accumulation line
  ctx.fillStyle = 'rgba(8, 153, 129, 0.05)';
  ctx.strokeStyle = 'rgba(8, 153, 129, 0.3)';
  ctx.lineWidth = 1;
  const accumX = w * 0.35;
  const accumY = h * 0.62;
  const accumW = w * 0.35;
  const accumH = h * 0.15;
  ctx.fillRect(accumX, accumY, accumW, accumH);
  ctx.strokeRect(accumX, accumY, accumW, accumH);

  ctx.fillStyle = '#089981';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('STAGE 1 ACCUMULATION', accumX + 15, accumY + 25);

  // Generate TATATECH candles
  const candlesCount = 35;
  const candleW = Math.floor(w * 0.75 / candlesCount) - 4;
  const points = [];

  for (let i = 0; i < candlesCount; i++) {
    const x = (w * 0.8 / candlesCount) * i + w * 0.08;
    let open, close, high, low;

    if (i < 12) {
      // Downwards drop
      open = h * 0.35 + i * 15;
      close = h * 0.35 + (i + 1) * 15;
      high = Math.min(open, close) - 10;
      low = Math.max(open, close) + 10;
    } else if (i < 25) {
      // Sideways accum
      const base = h * 0.68;
      open = base + Math.sin(i) * 20;
      close = base + Math.sin(i + 1) * 20;
      high = Math.min(open, close) - 8;
      low = Math.max(open, close) + 8;
    } else {
      // Stage 2 breakout
      const start = h * 0.68 + Math.sin(25) * 20;
      const progress = i - 25;
      open = start - progress * 22;
      close = start - (progress + 1) * 22 - (progress === 0 ? 30 : 0);
      high = Math.min(open, close) - 12;
      low = Math.max(open, close) + 5;
    }

    drawCandle(ctx, x, candleW, open, close, high, low);
    points.push({ x: x + candleW / 2, y: close });
  }

  // Draw arrow and indicator
  const boPt = points[26];
  ctx.strokeStyle = '#2962ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(boPt.x - 25, boPt.y + 25);
  ctx.lineTo(boPt.x - 5, boPt.y + 5);
  ctx.lineTo(boPt.x - 12, boPt.y + 5);
  ctx.moveTo(boPt.x - 5, boPt.y + 5);
  ctx.lineTo(boPt.x - 5, boPt.y + 12);
  ctx.stroke();

  ctx.fillStyle = '#2962ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('Stage 2 BO', boPt.x - 65, boPt.y + 40);

  // Support / Resistance Lines
  drawLevelLine(ctx, w, h * 0.62, 'Breakout Neckline (1,020.00)', '#2962ff');
  drawLevelLine(ctx, w, h * 0.77, 'Accumulation Support (975.00)', '#f23645');
}

// 3. ETERNAL Chart drawing logic (Golden Cross Over)
function drawEternalChart(ctx, w, h) {
  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  drawChartGrid(ctx, w, h);

  ctx.fillStyle = '#131722';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Eternal Ltd. · 1D · NSE', 20, 30);

  // Generate ETERNAL candles (U-shape curve)
  const candlesCount = 35;
  const candleW = Math.floor(w * 0.75 / candlesCount) - 4;
  const points = [];

  for (let i = 0; i < candlesCount; i++) {
    const x = (w * 0.8 / candlesCount) * i + w * 0.08;
    let open, close, high, low;

    // Curved trend: high -> low -> high
    const factor = (i - 18) / 10;
    const base = h * 0.60 + (factor * factor) * 35;
    open = base;
    
    // next close
    const nextFactor = (i + 1 - 18) / 10;
    close = h * 0.60 + (nextFactor * nextFactor) * 35;
    
    // Slight randomness
    const noise = (Math.random() - 0.5) * 15;
    open += noise;
    close += (Math.random() - 0.5) * 15;

    high = Math.min(open, close) - 10 - Math.random() * 8;
    low = Math.max(open, close) + 10 + Math.random() * 8;

    drawCandle(ctx, x, candleW, open, close, high, low);
    points.push({ x: x + candleW / 2, y: close });
  }

  // Draw 50 EMA and 200 EMA lines
  const points50 = [];
  const points200 = [];

  points.forEach((p, idx) => {
    // 50 EMA reacts faster to curve
    const factor = (idx - 18) / 10;
    const y50 = h * 0.62 + (factor * factor) * 28 + (idx > 18 ? -25 : 15);
    points50.push({ x: p.x, y: y50 });

    // 200 EMA reacts slower
    const y200 = h * 0.66 + (idx - 18) * 1.5;
    points200.push({ x: p.x, y: y200 });
  });

  // Stroke 200 EMA (Orange)
  ctx.strokeStyle = '#ff6d00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points200[0].x, points200[0].y);
  for (let i = 1; i < points200.length; i++) {
    ctx.lineTo(points200[i].x, points200[i].y);
  }
  ctx.stroke();
  ctx.fillStyle = '#ff6d00';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('200 EMA', points200[points200.length - 1].x - 45, points200[points200.length - 1].y - 8);

  // Stroke 50 EMA (Blue)
  ctx.strokeStyle = '#2962ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points50[0].x, points50[0].y);
  for (let i = 1; i < points50.length; i++) {
    ctx.lineTo(points50[i].x, points50[i].y);
  }
  ctx.stroke();
  ctx.fillStyle = '#2962ff';
  ctx.fillText('50 EMA', points50[points50.length - 1].x - 45, points50[points50.length - 1].y - 8);

  // Crossover index (where 50 crosses 200)
  const crossIdx = 23;
  const crossPt = points50[crossIdx];
  ctx.strokeStyle = '#e65100';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(crossPt.x, crossPt.y, 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#e65100';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('Golden Cross', crossPt.x + 12, crossPt.y - 12);

  // Support line
  drawLevelLine(ctx, w, h * 0.78, 'Major Support Zone (212.00)', '#f23645');
}

// Helper: draw grid lines on chart canvas
function drawChartGrid(ctx, w, h) {
  ctx.strokeStyle = 'rgba(19, 23, 34, 0.04)';
  ctx.lineWidth = 0.8;
  // horizontal
  for (let y = 40; y < h; y += 45) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  // vertical
  for (let x = 30; x < w; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
}

// Helper: draw single candlestick
function drawCandle(ctx, x, w, open, close, high, low) {
  const isUp = close < open;
  ctx.strokeStyle = isUp ? '#089981' : '#f23645';
  ctx.fillStyle = isUp ? '#089981' : '#f23645';
  ctx.lineWidth = 1.5;

  // Wick
  ctx.beginPath();
  ctx.moveTo(x + w / 2, high);
  ctx.lineTo(x + w / 2, low);
  ctx.stroke();

  // Body
  ctx.fillRect(x, Math.min(open, close), w, Math.max(1.5, Math.abs(close - open)));
}

// Helper: draw horizontal technical level lines
function drawLevelLine(ctx, w, y, label, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.setLineDash([]); // reset

  ctx.fillStyle = color;
  ctx.font = '9px monospace';
  ctx.fillText(label, w - 160, y - 4);
}
