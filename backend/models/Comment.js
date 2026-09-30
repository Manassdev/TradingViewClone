import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  ideaId: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  userName: {
    type: String,
    trim: true,
    default: 'Trader'
  },
  content: {
    type: String,
    required: [true, 'Comment content cannot be empty'],
    maxlength: [2000, 'Comment cannot exceed 2000 characters'],
    trim: true
  },
  parentCommentId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'comments'
});

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;
