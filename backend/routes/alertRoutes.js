import express from 'express';
import { getAlerts, createAlert, updateAlert, deleteAlert } from '../controllers/alertController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getAlerts)
  .post(protect, createAlert);

router.route('/:id')
  .put(protect, updateAlert)
  .delete(protect, deleteAlert);

export default router;
