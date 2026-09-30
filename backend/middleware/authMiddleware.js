import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtSecret } from '../config/env.js';

const readToken = (req) => {
  const authHeader = req.header('Authorization') || req.header('x-auth-token');
  if (!authHeader) return { error: 'Authentication token is required.' };

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : authHeader.trim();
  if (!token || token.split('.').length !== 3) {
    return { error: 'A valid bearer token is required.' };
  }

  try {
    return { decoded: jwt.verify(token, getJwtSecret()) };
  } catch (error) {
    return { error: error.name === 'TokenExpiredError' ? 'Authentication token has expired.' : 'Authentication token is invalid.' };
  }
};

export const protect = async (req, res, next) => {
  const { decoded, error } = readToken(req);
  if (error) {
    return res.status(401).json({ success: false, message: error });
  }

  try {
    const user = await User.findById(decoded.id).select('+tokenVersion');
    if (!user || decoded.ver !== (user.tokenVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Authentication session is no longer valid. Please log in again.' });
    }

    req.user = decoded;
    return next();
  } catch (err) {
    return next(err);
  }
};

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.header('Authorization') || req.header('x-auth-token');
  if (!authHeader) return next();

  const { decoded } = readToken(req);
  if (!decoded) return next();

  try {
    const user = await User.findById(decoded.id).select('+tokenVersion');
    if (user && decoded.ver === (user.tokenVersion || 0)) req.user = decoded;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default protect;
