import express from 'express';
import { registerUser, loginUser, getMe, logoutUser } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { limitLoginAttempts, limitRegistrationAttempts } from '../middleware/authRateLimit.js';

const router = express.Router();

router.post('/register', limitRegistrationAttempts, registerUser);
router.post('/login', limitLoginAttempts, loginUser);
router.post('/logout', protect, logoutUser);
router.get('/me', protect, getMe);

export default router;
