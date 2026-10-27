import { createHash } from 'node:crypto';

export const NEWS_CATEGORIES = Object.freeze({
  cryptocurrency: {
    label: 'Cryptocurrency',
    query: '(cryptocurrency OR crypto OR bitcoin OR ethereum OR blockchain)'
  },
  stock_market: {
    label: 'Stock Market',
    query: '("stock market" OR stocks OR equities OR "S&P 500" OR Nasdaq OR "Dow Jones")'
  },
  economy: {
    label: 'Economy',
    query: '(economy OR inflation OR GDP OR "interest rates" OR "central bank" OR employment)'
  },
  regulation: {
    label: 'Regulation',
    query: '("financial regulation" OR "crypto regulation" OR "SEC rule" OR "SEC approval" OR "crypto legislation" OR "banking regulation")'
  }
});

export const VALID_NEWS_CATEGORIES = Object.freeze(['all', ...Object.keys(NEWS_CATEGORIES)]);

const CATEGORY_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_DAILY_PROVIDER_REQUESTS = 90;
const PROVIDER_MIN_INTERVAL_MS = 1100;
const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_ARTICLES_PER_QUERY = 10;

export class NewsServiceError extends Error {
  constructor(message, status = 503, retryAfter = 30) {
    super(message);
    this.name = 'NewsServiceError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const toHttpUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
};

const canonicalArticleUrl = (value) => {
  const parsed = toHttpUrl(value);
  if (!parsed) return null;
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) parsed.searchParams.delete(key);
  }
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString();
};

const normalizeArticle = (article, category) => {
  if (!article || typeof article !== 'object') return null;
  const headline = typeof article.title === 'string' ? article.title.trim() : '';
  const originalUrl = typeof article.url === 'string' ? article.url.trim() : '';
  const validUrl = toHttpUrl(originalUrl);
  const canonicalUrl = canonicalArticleUrl(originalUrl);
  const publishedAt = typeof article.publishedAt === 'string' ? new Date(article.publishedAt) : null;
  if (!headline || !validUrl || !canonicalUrl || !publishedAt || !Number.isFinite(publishedAt.getTime())) return null;

  const providerId = typeof article.id === 'string' ? article.id.trim() : '';
  const id = providerId || createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 24);
  const imageUrl = toHttpUrl(article.image)?.toString() || null;
  return {
    id,
    headline,
    summary: typeof article.description === 'string' ? article.description.trim() : '',
    publisher: typeof article.source?.name === 'string' ? article.source.name.trim() : '',
    url: originalUrl,
    publishedAt: publishedAt.toISOString(),
    category,
    imageUrl
  };
};

const sortAndDeduplicate = (articles) => {
  const unique = new Map();
  for (const article of articles) {
    const key = canonicalArticleUrl(article.url);
    if (key && !unique.has(key)) unique.set(key, article);
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
};

const utcDayKey = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);
const secondsUntilUtcReset = (timestamp) => Math.max(1, Math.ceil((Date.parse(`${utcDayKey(timestamp)}T00:00:00.000Z`) + 86_400_000 - timestamp) / 1000));

export const createNewsService = ({
  fetchImpl = (...args) => globalThis.fetch(...args),
  getApiKey = () => process.env.GNEWS_API_KEY,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) => {
  const categoryCache = new Map();
  const categoryRequests = new Map();
  let providerQueue = Promise.resolve();
  let lastProviderRequestAt = 0;
  let quotaDay = '';
  let dailyRequestCount = 0;

  const requestProvider = (category) => {
    const run = providerQueue.then(async () => {
      const apiKey = getApiKey()?.trim();
      if (!apiKey) throw new NewsServiceError('News is not configured yet. Add GNEWS_API_KEY to the backend environment.', 503, 300);

      const currentTime = now();
      const currentDay = utcDayKey(currentTime);
      if (currentDay !== quotaDay) {
        quotaDay = currentDay;
        dailyRequestCount = 0;
      }
      if (dailyRequestCount >= MAX_DAILY_PROVIDER_REQUESTS) {
        throw new NewsServiceError('The news provider request allowance is temporarily exhausted. Please try again after 00:00 UTC.', 503, secondsUntilUtcReset(currentTime));
      }

      const waitMs = Math.max(0, lastProviderRequestAt + PROVIDER_MIN_INTERVAL_MS - currentTime);
      if (waitMs) await sleep(waitMs);
      const requestTime = now();
      if (utcDayKey(requestTime) !== quotaDay) {
        quotaDay = utcDayKey(requestTime);
        dailyRequestCount = 0;
      }
      if (dailyRequestCount >= MAX_DAILY_PROVIDER_REQUESTS) {
        throw new NewsServiceError('The news provider request allowance is temporarily exhausted. Please try again after 00:00 UTC.', 503, secondsUntilUtcReset(requestTime));
      }
      dailyRequestCount += 1;
      lastProviderRequestAt = requestTime;

      const params = new URLSearchParams({
        q: NEWS_CATEGORIES[category].query,
        lang: 'en',
        max: String(MAX_ARTICLES_PER_QUERY),
        in: 'title,description',
        nullable: 'description,image',
        sortby: 'publishedAt'
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
      try {
        const response = await fetchImpl(`https://gnews.io/api/v4/search?${params}`, {
          method: 'GET',
          headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
          signal: controller.signal
        });
        if (!response.ok) {
          const status = response.status === 429 || response.status === 403 ? 503 : 502;
          const retryHeader = Number(response.headers?.get?.('retry-after'));
          const retryAfter = Number.isFinite(retryHeader) && retryHeader > 0
            ? Math.min(86_400, retryHeader)
            : response.status === 403 ? secondsUntilUtcReset(now()) : 30;
          const message = response.status === 401 || response.status === 400
            ? 'The news provider rejected the request. Check the GNEWS_API_KEY configuration.'
            : response.status === 403
              ? 'The news provider daily request allowance has been reached. Please try again after 00:00 UTC.'
              : response.status === 429
                ? 'The news provider is receiving requests too quickly. Please try again shortly.'
                : 'The news provider is temporarily unavailable.';
          throw new NewsServiceError(message, status, retryAfter);
        }

        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new NewsServiceError('The news provider returned unreadable data.', 502, 30);
        }
        if (!payload || !Array.isArray(payload.articles)) {
          throw new NewsServiceError('The news provider returned an unexpected response.', 502, 30);
        }
        const articles = sortAndDeduplicate(payload.articles
          .map((article) => normalizeArticle(article, category))
          .filter(Boolean));
        const retrievedAt = new Date(now()).toISOString();
        const result = {
          articles,
          totalArticles: Number.isFinite(Number(payload.totalArticles)) ? Number(payload.totalArticles) : articles.length,
          retrievedAt,
          expiresAt: now() + CATEGORY_CACHE_TTL_MS
        };
        categoryCache.set(category, result);
        return { ...result, cached: false, stale: false };
      } catch (error) {
        if (error instanceof NewsServiceError) throw error;
        if (error.name === 'AbortError') throw new NewsServiceError('The news provider request timed out. Please try again.', 504, 30);
        throw new NewsServiceError('The news provider is temporarily unavailable. Please try again.', 502, 30);
      } finally {
        clearTimeout(timeout);
      }
    });
    providerQueue = run.then(() => undefined, () => undefined);
    return run;
  };

  const getCategory = (category) => {
    const cached = categoryCache.get(category);
    if (cached && cached.expiresAt > now()) return Promise.resolve({ ...cached, cached: true, stale: false });
    if (categoryRequests.has(category)) return categoryRequests.get(category);

    const request = requestProvider(category)
      .catch((error) => {
        if (cached) return { ...cached, cached: true, stale: true, providerError: error.message };
        throw error;
      })
      .finally(() => categoryRequests.delete(category));
    categoryRequests.set(category, request);
    return request;
  };

  const getNews = async (category = 'all') => {
    if (!VALID_NEWS_CATEGORIES.includes(category)) {
      throw new NewsServiceError('Choose a supported news category.', 400, 0);
    }

    if (category !== 'all') {
      const result = await getCategory(category);
      return {
        success: true,
        data: result.articles,
        meta: {
          category,
          retrievedAt: result.retrievedAt,
          cached: result.cached,
          stale: result.stale,
          partial: false,
          totalArticles: result.totalArticles,
          source: 'GNews'
        }
      };
    }

    const results = await Promise.allSettled(Object.keys(NEWS_CATEGORIES).map((key) => getCategory(key)));
    const available = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    if (!available.length) {
      const firstFailure = results.find((result) => result.status === 'rejected');
      throw firstFailure?.reason || new NewsServiceError('News is temporarily unavailable. Please try again.', 503, 30);
    }

    const articles = sortAndDeduplicate(available.flatMap((result) => result.articles)).slice(0, 40);
    const retrievedAt = available.map((result) => result.retrievedAt).sort().at(-1);
    const stale = available.some((result) => result.stale);
    const partial = available.length !== Object.keys(NEWS_CATEGORIES).length;
    return {
      success: true,
      data: articles,
      meta: {
        category: 'all',
        retrievedAt,
        cached: available.every((result) => result.cached),
        stale,
        partial,
        totalArticles: available.reduce((sum, result) => sum + result.totalArticles, 0),
        source: 'GNews'
      }
    };
  };

  return { getNews };
};

export const newsService = createNewsService();
