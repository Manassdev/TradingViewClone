const requiredVariables = ['PORT', 'MONGODB_URI', 'JWT_SECRET'];

export const validateEnvironment = () => {
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }
  if ([
    'your_jwt_secret_key_here',
    'replace_with_a_unique_random_secret_of_at_least_32_characters',
    'tradingview_btech_jwt_secret_key_2026_super_secure'
  ].includes(process.env.JWT_SECRET)) {
    throw new Error('JWT_SECRET must be a unique generated secret, not a placeholder.');
  }

  if (!/^mongodb(?:\+srv)?:\/\//i.test(process.env.MONGODB_URI.trim())) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  }
  const connectTimeout = Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 5_000);
  if (!Number.isInteger(connectTimeout) || connectTimeout < 1_000 || connectTimeout > 30_000) {
    throw new Error('MONGODB_CONNECT_TIMEOUT_MS must be an integer from 1000 to 30000.');
  }

  return { port, connectTimeout };
};

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret?.trim()) {
    throw new Error('JWT_SECRET is required. Set it in the backend environment.');
  }
  return secret;
};
