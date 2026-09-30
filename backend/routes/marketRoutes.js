import express from 'express';
import { getKlines, getTicker24hr, getMarketStatus } from '../controllers/marketController.js';

const router = express.Router();

router.get('/klines', getKlines);
router.get('/ticker', getTicker24hr);
router.get('/status', getMarketStatus);

export default router;
