const WINDOW_MS = 15 * 60 * 1_000;
const MAX_TRACKED_CLIENTS = 10_000;

const createAuthRateLimit = ({ limit, label }) => {
  const attempts = new Map();
  let lastPruneAt = 0;

  return (req, res, next) => {
    const now = Date.now();
    if (now - lastPruneAt > WINDOW_MS) {
      for (const [key, value] of attempts) {
        if (value.resetAt <= now) attempts.delete(key);
      }
      lastPruneAt = now;
    }

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      if (attempts.size >= MAX_TRACKED_CLIENTS) {
        const oldestKey = attempts.keys().next().value;
        if (oldestKey !== undefined) attempts.delete(oldestKey);
      }
      current = { count: 0, resetAt: now + WINDOW_MS };
      attempts.set(key, current);
    }

    current.count += 1;
    if (current.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1_000))));
      return res.status(429).json({
        success: false,
        message: `Too many ${label} attempts. Please try again later.`
      });
    }
    return next();
  };
};

export const limitLoginAttempts = createAuthRateLimit({ limit: 10, label: 'login' });
export const limitRegistrationAttempts = createAuthRateLimit({ limit: 5, label: 'registration' });
