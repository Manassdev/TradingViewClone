import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getPerformance, getPortfolio, postOrder, postReset } from '../controllers/paperTradingController.js';

const router = express.Router();
router.use(protect);
router.get('/', getPortfolio);
router.get('/performance', getPerformance);
router.post('/orders', postOrder);
router.post('/reset', postReset);

export default router;
