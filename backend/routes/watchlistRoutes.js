import express from 'express';
import {
  addToWatchlist, createWatchlist, deleteWatchlist, getWatchlist, getWatchlists,
  removeFromWatchlist, renameWatchlist, reorderWatchlist
} from '../controllers/namedWatchlistController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getWatchlist)
  .post(protect, addToWatchlist);

router.get('/lists', protect, getWatchlists);
router.post('/lists', protect, createWatchlist);
router.patch('/lists/:id', protect, renameWatchlist);
router.delete('/lists/:id', protect, deleteWatchlist);
router.put('/lists/:id/reorder', protect, reorderWatchlist);
router.delete('/:id', protect, removeFromWatchlist);

export default router;
