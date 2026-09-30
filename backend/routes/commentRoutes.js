import express from 'express';
import { getCommentsByIdea, createComment, deleteComment } from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/:ideaId', getCommentsByIdea);
router.post('/', protect, createComment);
router.delete('/:id', protect, deleteComment);

export default router;
