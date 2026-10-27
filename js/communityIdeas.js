/* Binance-backed community ideas with safe DOM rendering and single-flight refresh. */

(() => {
  const REFRESH_INTERVAL_MS = 60_000;
  const SUPPORTED_ID = /^binance-(BTCUSDT|ETHUSDT|BNBUSDT|SOLUSDT|XRPUSDT)-(sma-bullish-crossover|sma-bearish-crossover|resistance-breakout|support-breakdown|positive-momentum|negative-momentum)$/;
  const IDEA_KINDS = new Set([
    'sma-bullish-crossover', 'sma-bearish-crossover', 'resistance-breakout',
    'support-breakdown', 'positive-momentum', 'negative-momentum'
  ]);
  const FILTER_LABELS = {
    all: 'All ideas',
    bullish: 'Bullish',
    bearish: 'Bearish',
    breakout: 'Breakout',
    moving_average: 'Moving Average'
  };
  const KIND_LABELS = {
    'sma-bullish-crossover': 'Moving average crossover',
    'sma-bearish-crossover': 'Moving average crossover',
    'resistance-breakout': 'Resistance breakout',
    'support-breakdown': 'Support breakdown',
    'positive-momentum': 'Positive momentum',
    'negative-momentum': 'Negative momentum'
  };
  const state = {
    ideas: [],
    meta: null,
    filter: 'all',
    inFlight: null,
    hasSuccessfulResponse: false,
    error: ''
  };

  const getElements = () => ({
    grid: document.getElementById('community-ideas-grid'),
    status: document.getElementById('community-ideas-status'),
    filters: document.querySelectorAll('[data-idea-filter]')
  });

  const formatTimestamp = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Timestamp unavailable'
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  const isValidIdea = (idea) => idea &&
    typeof idea.id === 'string' && SUPPORTED_ID.test(idea.id) &&
    typeof idea.symbol === 'string' &&
    idea.id === `binance-${idea.symbol}-${idea.kind}` &&
    IDEA_KINDS.has(idea.kind) &&
    typeof idea.title === 'string' &&
    typeof idea.description === 'string' &&
    ['bullish', 'bearish'].includes(idea.signal) &&
    Number.isFinite(Number(idea.price)) && Number(idea.price) > 0 &&
    typeof idea.interval === 'string' &&
    typeof idea.source === 'string' &&
    Number.isFinite(Date.parse(idea.generatedAt)) &&
    Number.isFinite(Date.parse(idea.priceTimestamp));

  const makeElement = (tag, className = '', text = undefined) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const formatPrice = (value) => {
    const price = Number(value);
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: price < 1 ? 6 : 2
    }).format(price);
  };

  const toChartPoints = (idea) => (Array.isArray(idea.chartData) ? idea.chartData : [])
    .filter((point) => point && Number.isFinite(Date.parse(point.time)) && Number.isFinite(Number(point.value)) && Number(point.value) > 0)
    .map((point) => ({ time: Date.parse(point.time), value: Number(point.value) }))
    .sort((a, b) => a.time - b.time)
    .slice(-24);

  const createChartPreview = (idea) => {
    const preview = makeElement('div', 'idea-chart-preview');
    const points = toChartPoints(idea);
    const previewLabel = makeElement('span', 'idea-chart-label', `Completed ${idea.interval} closes`);
    preview.append(previewLabel);

    if (points.length < 2) {
      preview.append(makeElement('p', 'idea-chart-unavailable', 'Chart preview unavailable'));
      return preview;
    }

    const width = 320;
    const height = 92;
    const padding = 8;
    const values = points.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = maximum - minimum;
    const plotHeight = height - padding * 2;
    const plotWidth = width - padding * 2;
    const coordinates = points.map((point, index) => {
      const x = padding + index * plotWidth / (points.length - 1);
      const y = spread === 0
        ? height / 2
        : padding + ((maximum - point.value) / spread) * plotHeight;
      return { x, y };
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('idea-chart-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${idea.symbol} Binance chart from ${points.length} completed ${idea.interval} candles`);

    [0.25, 0.5, 0.75].forEach((ratio) => {
      const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      gridLine.setAttribute('x1', String(padding));
      gridLine.setAttribute('x2', String(width - padding));
      gridLine.setAttribute('y1', String(padding + plotHeight * ratio));
      gridLine.setAttribute('y2', String(padding + plotHeight * ratio));
      gridLine.setAttribute('class', 'idea-chart-gridline');
      svg.append(gridLine);
    });

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', coordinates.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
    line.setAttribute('class', `idea-chart-line ${idea.signal}`);
    svg.append(line);

    const latest = coordinates.at(-1);
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    marker.setAttribute('cx', latest.x.toFixed(2));
    marker.setAttribute('cy', latest.y.toFixed(2));
    marker.setAttribute('r', '3.5');
    marker.setAttribute('class', `idea-chart-marker ${idea.signal}`);
    svg.append(marker);

    preview.append(svg, makeElement('span', 'idea-chart-data-count', `${points.length} completed candles · ${idea.source}`));
    return preview;
  };

  const createTimestamp = (label, value, className) => {
    const wrapper = makeElement('span', className);
    wrapper.append(document.createTextNode(`${label} `));
    const time = makeElement('time', '', formatTimestamp(value));
    time.dateTime = new Date(value).toISOString();
    wrapper.append(time);
    return wrapper;
  };

  const createCard = (idea) => {
    const card = makeElement('article', 'idea-card dynamic-idea-card');
    const cardHeader = makeElement('div', 'idea-card-header');
    const asset = makeElement('div', 'idea-card-asset');
    const baseAsset = idea.symbol.endsWith('USDT') ? idea.symbol.slice(0, -4) : idea.symbol;
    const assetSymbol = makeElement('span', 'idea-asset-symbol', baseAsset);
    assetSymbol.setAttribute('aria-hidden', 'true');
    const assetDetails = makeElement('div', 'idea-asset-details');
    assetDetails.append(
      makeElement('strong', 'idea-asset-name', baseAsset),
      makeElement('span', 'idea-trading-pair', `${baseAsset} / USDT · ${idea.source}`)
    );
    asset.append(assetSymbol, assetDetails);
    const signal = makeElement('span', `idea-signal-badge ${idea.signal}`, idea.signal === 'bullish' ? 'Bullish' : 'Bearish');
    cardHeader.append(asset, signal);

    const title = makeElement('h3', 'idea-title', idea.title);
    const preview = createChartPreview(idea);

    const details = makeElement('div', 'idea-card-body');
    const priceRow = makeElement('div', 'idea-price-row');
    const priceLabel = makeElement('span', 'idea-price-label', 'Latest market price');
    const price = makeElement('strong', 'idea-market-price', formatPrice(idea.price));
    price.append(makeElement('span', 'idea-price-quote', ' USDT'));
    priceRow.append(priceLabel, price);

    const facts = makeElement('div', 'idea-card-facts');
    facts.append(
      makeElement('span', 'idea-kind-pill', KIND_LABELS[idea.kind]),
      makeElement('span', 'idea-timeframe', `Signal timeframe · ${idea.interval}`)
    );

    const rationale = makeElement('div', 'idea-rationale');
    rationale.append(
      makeElement('span', 'idea-rationale-label', 'Reason for signal'),
      makeElement('p', 'idea-summary', idea.description)
    );

    const footer = makeElement('div', 'idea-card-footer');
    const timestamps = makeElement('div', 'idea-card-timestamps');
    timestamps.append(
      createTimestamp('Generated', idea.generatedAt, 'idea-generated-time'),
      createTimestamp('Price updated', idea.priceTimestamp, 'idea-price-time')
    );
    const viewAnalysis = makeElement('a', 'idea-view-analysis', 'View Analysis ↗');
    viewAnalysis.href = `idea.html?id=${encodeURIComponent(idea.id)}`;
    viewAnalysis.setAttribute('aria-label', `View analysis for ${idea.symbol}`);
    footer.append(timestamps, viewAnalysis);
    details.append(priceRow, facts, rationale, footer);

    card.append(cardHeader, title, preview, details);
    return card;
  };

  const createFeedbackCard = (stateName, title, message, actionLabel = '') => {
    const card = makeElement('article', 'idea-feedback-card');
    card.dataset.state = stateName;
    card.append(
      makeElement('span', 'idea-feedback-mark', stateName === 'loading' ? '···' : '—'),
      makeElement('h3', 'idea-feedback-title', title),
      makeElement('p', 'idea-feedback-message', message)
    );
    if (actionLabel) {
      const refresh = makeElement('button', 'idea-refresh-button', actionLabel);
      refresh.type = 'button';
      refresh.addEventListener('click', () => { void refreshIdeas(); });
      card.append(refresh);
    }
    return card;
  };

  const setStatus = (message, stateName = '') => {
    const { status } = getElements();
    if (!status) return;
    status.textContent = message;
    status.dataset.state = stateName;
    status.hidden = !message;
  };

  const getVisibleIdeas = () => {
    if (state.filter === 'all') return state.ideas;
    if (state.filter === 'bullish' || state.filter === 'bearish') {
      return state.ideas.filter((idea) => idea.signal === state.filter);
    }
    if (state.filter === 'breakout') {
      return state.ideas.filter((idea) => ['resistance-breakout', 'support-breakdown'].includes(idea.kind));
    }
    if (state.filter === 'moving_average') {
      return state.ideas.filter((idea) => idea.kind.startsWith('sma-'));
    }
    return [];
  };

  const renderIdeas = () => {
    const { grid, filters } = getElements();
    if (!grid) return;

    filters.forEach((button) => {
      button.classList.toggle('active', button.dataset.ideaFilter === state.filter);
      button.setAttribute('aria-pressed', String(button.dataset.ideaFilter === state.filter));
    });

    if (!state.hasSuccessfulResponse && !state.error) {
      grid.replaceChildren(createFeedbackCard('loading', 'Loading market ideas', 'Retrieving current Binance signals and completed candle data.'));
      return;
    }

    if (!state.hasSuccessfulResponse && state.error) {
      grid.replaceChildren(createFeedbackCard('error', 'Market ideas are unavailable', state.error, 'Try Again'));
      return;
    }

    if (!state.ideas.length) {
      grid.replaceChildren(createFeedbackCard(
        'empty',
        'No signals right now',
        'Current Binance market data does not meet the configured rules for a qualifying signal.',
        'Refresh Ideas'
      ));
      const insufficient = state.meta?.insufficientSymbols || [];
      const suffix = insufficient.length ? ` Candle history was insufficient for: ${insufficient.join(', ')}.` : '';
      setStatus(`No qualifying signals were returned by the current market analysis.${suffix}`, 'empty');
      return;
    }

    const visible = getVisibleIdeas();
    if (!visible.length) {
      grid.replaceChildren(createFeedbackCard(
        'empty',
        `No ${FILTER_LABELS[state.filter]} ideas right now`,
        `No signals currently match the ${FILTER_LABELS[state.filter]} filter. Try another filter or refresh the current analysis.`,
        'Refresh Ideas'
      ));
      setStatus(`No ${FILTER_LABELS[state.filter]} ideas currently match the selected filter.`, 'empty');
      return;
    }

    grid.replaceChildren(...visible.map(createCard));
    const unavailable = state.meta?.unavailableSymbols || [];
    const refreshed = state.meta?.cached
      ? `Using cached market data generated ${formatTimestamp(state.meta.generatedAt)}.`
      : `Market analysis generated ${formatTimestamp(state.meta?.generatedAt)}.`;
    const partial = unavailable.length ? ` Some pairs were unavailable: ${unavailable.join(', ')}.` : '';
    const insufficient = state.meta?.insufficientSymbols || [];
    const shortHistory = insufficient.length ? ` Insufficient completed candle history for: ${insufficient.join(', ')}.` : '';
    setStatus(`${refreshed}${partial}${shortHistory}`, unavailable.length ? 'partial' : 'loaded');
  };

  const refreshIdeas = () => {
    if (state.inFlight) return state.inFlight;

    const apiBase = window.ApiClient?.API_BASE || 'http://localhost:5000/api';
    state.error = '';
    if (!state.hasSuccessfulResponse) {
      setStatus('Loading current Binance market signals…', 'loading');
      renderIdeas();
    } else {
      setStatus('Refreshing Binance market signals…', 'loading');
    }

    const request = fetch(`${apiBase}/market/ideas`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new Error('The market service returned an unreadable response.');
        }
        if (!response.ok || payload?.success !== true || !Array.isArray(payload.data)) {
          throw new Error(payload?.message || 'Could not load cryptocurrency ideas.');
        }
        state.ideas = payload.data.filter(isValidIdea);
        state.meta = payload.meta || null;
        state.hasSuccessfulResponse = true;
        state.error = '';
        renderIdeas();
      })
      .catch((error) => {
        if (!state.hasSuccessfulResponse) {
          state.error = `${error.message || 'Could not load cryptocurrency ideas.'} Start the backend and try again.`;
          setStatus(state.error, 'error');
          renderIdeas();
          return;
        }
        setStatus(`Could not refresh market data. Showing the last successful result from ${formatTimestamp(state.meta?.generatedAt)}.`, 'error');
      })
      .finally(() => {
        state.inFlight = null;
      });
    state.inFlight = request;
    return state.inFlight;
  };

  const initialize = () => {
    const { grid, filters } = getElements();
    if (!grid) return;
    filters.forEach((button) => {
      button.addEventListener('click', () => {
        const selected = button.dataset.ideaFilter || 'all';
        if (!Object.hasOwn(FILTER_LABELS, selected)) return;
        state.filter = selected;
        renderIdeas();
      });
    });
    void refreshIdeas();
    window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refreshIdeas();
    }, REFRESH_INTERVAL_MS);
  };

  window.refreshCommunityIdeas = refreshIdeas;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
