import express from 'express';
import {
  getIndiaAnalytics, getIndiaCandlesController, getIndiaIndices, getIndiaMarketStatusController,
  getIndiaQuoteController, getIndiaQuotesController, listIndiaInstruments, searchIndia
} from '../controllers/indiaController.js';

const router = express.Router();
router.get('/instruments', listIndiaInstruments);
router.get('/search', searchIndia);
router.get('/quotes', getIndiaQuotesController);
router.get('/quotes/:exchange/:symbol', getIndiaQuoteController);
router.get('/candles/:exchange/:symbol', getIndiaCandlesController);
router.get('/indices', getIndiaIndices);
router.get('/market-status', getIndiaMarketStatusController);
router.get('/analytics', getIndiaAnalytics);
export default router;
