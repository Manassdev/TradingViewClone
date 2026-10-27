/* GNews-backed community news feed. Article content is rendered as text, never HTML. */

(() => {
  const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
  const CATEGORY_LABELS = {
    all: 'All News',
    cryptocurrency: 'Cryptocurrency',
    stock_market: 'Stock Market',
    economy: 'Economy',
    regulation: 'Regulation'
  };
  const state = {
    category: 'all',
    allArticles: [],
    categoryArticles: new Map(),
    allMeta: null,
    inFlight: null,
    pendingCategory: null,
    hasSuccessfulResponse: false
  };

  const getElements = () => ({
    grid: document.getElementById('community-news-grid'),
    status: document.getElementById('community-news-status'),
    filters: document.querySelectorAll('[data-news-filter]')
  });

  const formatTimestamp = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Time unavailable'
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  const validExternalUrl = (value) => {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.toString() : null;
    } catch {
      return null;
    }
  };

  const isValidArticle = (article) => article &&
    typeof article.id === 'string' &&
    typeof article.headline === 'string' &&
    typeof article.summary === 'string' &&
    typeof article.publisher === 'string' &&
    Boolean(validExternalUrl(article.url)) &&
    Number.isFinite(Date.parse(article.publishedAt)) &&
    Object.hasOwn(CATEGORY_LABELS, article.category);

  const makeElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const createCard = (article) => {
    const card = makeElement('article', 'community-news-card');
    const imageUrl = validExternalUrl(article.imageUrl);
    if (imageUrl) {
      const imageWrap = makeElement('div', 'community-news-image-wrap');
      const image = makeElement('img', 'community-news-image');
      image.src = imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => imageWrap.remove(), { once: true });
      imageWrap.append(image);
      card.append(imageWrap);
    }

    const body = makeElement('div', 'community-news-card-body');
    const metadata = makeElement('div', 'community-news-card-meta');
    const publisher = makeElement('span', 'community-news-publisher', article.publisher || 'Publisher unavailable');
    const separator = makeElement('span', 'community-news-separator', '·');
    const publishedTime = makeElement('time', 'community-news-published', formatTimestamp(article.publishedAt));
    publishedTime.dateTime = new Date(article.publishedAt).toISOString();
    const category = makeElement('span', 'community-news-category', CATEGORY_LABELS[article.category]);
    metadata.append(publisher, separator, publishedTime, category);

    const title = makeElement('h3', 'community-news-title', article.headline);
    body.append(metadata, title);
    if (article.summary.trim()) body.append(makeElement('p', 'community-news-summary', article.summary));

    const readLink = makeElement('a', 'community-news-read', 'Read Article ↗');
    readLink.href = validExternalUrl(article.url);
    readLink.target = '_blank';
    readLink.rel = 'noopener noreferrer';
    body.append(readLink);
    card.append(body);
    return card;
  };

  const setStatus = (message, stateName = '') => {
    const { status } = getElements();
    if (!status) return;
    status.textContent = message;
    status.dataset.state = stateName;
    status.hidden = !message;
  };

  const articlesForActiveCategory = () => {
    if (state.category === 'all') return state.allArticles;
    if (state.categoryArticles.has(state.category)) return state.categoryArticles.get(state.category).articles;
    return state.allArticles.filter((article) => article.category === state.category);
  };

  const renderNews = () => {
    const { grid, filters } = getElements();
    if (!grid) return;

    const visible = articlesForActiveCategory()
      .filter(isValidArticle)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    grid.replaceChildren(...visible.map(createCard));

    filters.forEach((button) => {
      const active = button.dataset.newsFilter === state.category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (!visible.length) {
      if (state.hasSuccessfulResponse) {
        setStatus(`No ${CATEGORY_LABELS[state.category].toLowerCase()} articles are available right now.`, 'empty');
      }
      return;
    }

    const retrievedAt = state.category === 'all'
      ? state.allMeta?.retrievedAt
      : state.categoryArticles.get(state.category)?.meta?.retrievedAt || state.allMeta?.retrievedAt;
    let message = `Showing ${visible.length} article${visible.length === 1 ? '' : 's'}. Retrieved from GNews ${formatTimestamp(retrievedAt)}.`;
    const meta = state.categoryArticles.get(state.category)?.meta || state.allMeta;
    if (meta?.stale) message += ' The provider is unavailable; showing cached results.';
    if (meta?.partial) message += ' Some news categories could not be refreshed.';
    setStatus(message, meta?.stale || meta?.partial ? 'partial' : 'loaded');
  };

  const requestNews = (category) => {
    if (state.inFlight) {
      state.pendingCategory = category;
      return state.inFlight;
    }

    const apiBase = window.ApiClient?.API_BASE || 'http://localhost:5000/api';
    if (!state.hasSuccessfulResponse) setStatus('Loading community news…', 'loading');

    const url = `${apiBase}/news?category=${encodeURIComponent(category)}`;
    const request = fetch(url, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new Error('The news service returned an unreadable response.');
        }
        if (!response.ok || payload?.success !== true || !Array.isArray(payload.data)) {
          throw new Error(payload?.message || 'Could not load community news.');
        }

        const articles = payload.data.filter(isValidArticle);
        if (category === 'all') {
          state.allArticles = articles;
          state.allMeta = payload.meta || null;
        } else {
          state.categoryArticles.set(category, { articles, meta: payload.meta || null });
        }
        state.hasSuccessfulResponse = true;
        renderNews();
      })
      .catch((error) => {
        if (!state.hasSuccessfulResponse) {
          setStatus(`${error.message || 'Could not load community news.'} Check the backend and GNews configuration.`, 'error');
          return;
        }
        setStatus(`Could not refresh news. Showing the last successful results. ${error.message || ''}`.trim(), 'error');
      })
      .finally(() => {
        state.inFlight = null;
        const pending = state.pendingCategory;
        state.pendingCategory = null;
        if (pending && pending !== category) {
          const categoryCoveredByAll = pending !== 'all' && !state.allMeta?.partial && state.allArticles.length > 0;
          if (categoryCoveredByAll) {
            state.category = pending;
            renderNews();
          } else {
            void requestNews(pending);
          }
        } else if (state.category !== category) {
          renderNews();
        }
      });
    state.inFlight = request;
    return request;
  };

  const selectCategory = (category) => {
    if (!Object.hasOwn(CATEGORY_LABELS, category)) return;
    state.category = category;
    renderNews();
    if (category === 'all' || (!state.allMeta?.partial && state.allArticles.length > 0)) return;
    if (!state.categoryArticles.has(category)) void requestNews(category);
  };

  const initialize = () => {
    const { grid, filters } = getElements();
    if (!grid) return;
    filters.forEach((button) => {
      button.addEventListener('click', () => selectCategory(button.dataset.newsFilter || 'all'));
    });
    void requestNews('all');
    window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (state.inFlight) return;
      void requestNews(state.category === 'all' ? 'all' : state.category);
    }, REFRESH_INTERVAL_MS);
  };

  window.refreshCommunityNews = () => requestNews(state.category);
  window.filterCommunityNews = selectCategory;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
