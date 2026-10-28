import express from 'express';
import { getCommentsByIdea, createComment, editComment, deleteComment } from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/:ideaId', getCommentsByIdea);
router.post('/', protect, createComment);
router.patch('/:id', protect, editComment);
router.delete('/:id', protect, deleteComment);

export default router;
