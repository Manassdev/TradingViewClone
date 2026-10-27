import { NewsServiceError, VALID_NEWS_CATEGORIES, newsService } from '../services/newsService.js';

export const createNewsController = (service = newsService) => async (req, res) => {
  const rawCategory = req.query?.category;
  if (rawCategory !== undefined && typeof rawCategory !== 'string') {
    return res.status(400).json({ success: false, message: 'Choose a supported news category.' });
  }
  const category = rawCategory === undefined ? 'all' : rawCategory.trim().toLowerCase();
  if (!VALID_NEWS_CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'Choose a supported news category.' });
  }

  try {
    const result = await service.getNews(category);
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    const status = error instanceof NewsServiceError ? error.status : 503;
    if (error.retryAfter > 0) res.set('Retry-After', String(error.retryAfter));
    return res.status(status).json({
      success: false,
      message: error instanceof NewsServiceError ? error.message : 'News is temporarily unavailable. Please try again.'
    });
  }
};

export const getNews = createNewsController();
