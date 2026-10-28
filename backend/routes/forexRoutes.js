import express from 'express';
import {
  getForexAnalyticsController, getForexCandlesController, getForexQuoteController,
  getForexQuotesController, listForexPairs, searchForex
} from '../controllers/forexController.js';

const router = express.Router();

router.get('/pairs', listForexPairs);
router.get('/search', searchForex);
router.get('/quotes', getForexQuotesController);
router.get('/quotes/:symbol', getForexQuoteController);
router.get('/candles/:symbol', getForexCandlesController);
router.get('/analytics/:symbol', getForexAnalyticsController);

export default router;
