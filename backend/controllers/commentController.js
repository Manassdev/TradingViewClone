import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import User from '../models/User.js';

const MAX_COMMENT_LENGTH = 2000;
const isStableIdeaId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);

const serializeComment = (comment) => ({
  _id: String(comment._id),
  ideaId: String(comment.ideaId),
  userId: String(comment.userId),
  userName: comment.userName || 'Trader',
  content: comment.content,
  parentCommentId: comment.parentCommentId ? String(comment.parentCommentId) : null,
  createdAt: comment.createdAt
});

const sendCommentError = (res, operation, error) => {
  console.error(`[Comments] ${operation} failed:`, error.message);
  return res.status(500).json({ success: false, message: 'Unable to process the comment request.' });
};

// @desc Get comments for an article/idea
// @route GET /api/comments/:ideaId
// @access Public
export const getCommentsByIdea = async (req, res) => {
  try {
    const { ideaId } = req.params;
    if (!isStableIdeaId(ideaId)) {
      return res.status(400).json({ success: false, message: 'A valid article ID is required.' });
    }

    const queryIds = [ideaId];
    if (mongoose.Types.ObjectId.isValid(ideaId)) {
      queryIds.push(new mongoose.Types.ObjectId(ideaId));
    }

    const comments = await Comment.find({ ideaId: { $in: queryIds } }).sort({ createdAt: 1 }).lean();
    const data = comments.map(serializeComment);
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return sendCommentError(res, 'read', error);
  }
};

// @desc Add a comment to an article/idea
// @route POST /api/comments
// @access Private
export const createComment = async (req, res) => {
  try {
    const { ideaId, content, parentCommentId } = req.body || {};
    if (!isStableIdeaId(ideaId)) {
      return res.status(400).json({ success: false, message: 'A valid article ID is required.' });
    }
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Comment content cannot be empty.' });
    }
    const cleanContent = content.trim();
    if (cleanContent.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ success: false, message: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters.` });
    }
    if (parentCommentId && !mongoose.Types.ObjectId.isValid(parentCommentId)) {
      return res.status(400).json({ success: false, message: 'Parent comment ID is invalid.' });
    }

    const user = await User.findById(req.user.id).select('name username').lean();
    if (!user) {
      return res.status(401).json({ success: false, message: 'Your account is no longer available. Please log in again.' });
    }

    const created = await Comment.create({
      ideaId,
      userId: req.user.id,
      userName: user.name || user.username || req.user.name || 'Trader',
      content: cleanContent,
      parentCommentId: parentCommentId || null,
      createdAt: new Date()
    });

    return res.status(201).json({
      success: true,
      message: 'Comment posted successfully.',
      data: serializeComment(created)
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Comment data is invalid.' });
    }
    return sendCommentError(res, 'create', error);
  }
};

// @desc Delete a comment owned by the authenticated user
// @route DELETE /api/comments/:id
// @access Private
export const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Comment ID is invalid.' });
    }

    const comment = await Comment.findById(id).lean();
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found.' });
    }
    if (String(comment.userId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can delete only your own comments.' });
    }

    await Comment.deleteOne({ _id: id, userId: comment.userId });
    return res.json({ success: true, message: 'Comment deleted successfully.' });
  } catch (error) {
    return sendCommentError(res, 'delete', error);
  }
};
