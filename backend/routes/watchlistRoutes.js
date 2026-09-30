import express from 'express';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '../controllers/watchlistController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getWatchlist)
  .post(protect, addToWatchlist);

router.post('/add', protect, addToWatchlist);
router.delete('/:id', protect, removeFromWatchlist);

export default router;
