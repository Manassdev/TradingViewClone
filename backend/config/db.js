import mongoose from 'mongoose';

const connectionTimeoutMs = Number(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 5_000;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim()) {
    throw new Error('MONGODB_URI is required. Set it in the backend environment.');
  }
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri.trim())) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  }
  const isAtlas = uri.trim().startsWith('mongodb+srv://');
  const targetLabel = isAtlas ? 'MongoDB Atlas Cluster' : 'Local MongoDB Instance';

  try {
    const conn = await mongoose.connect(uri.trim(), {
      serverSelectionTimeoutMS: connectionTimeoutMs,
      connectTimeoutMS: connectionTimeoutMs
    });

    console.log(`[MongoDB] Connected to ${targetLabel} (database: ${conn.connection.name}).`);
    return conn;
  } catch (error) {
    const cause = [error?.code, error?.cause?.code, error?.name].filter(Boolean).join(' ');
    const hint = /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|ServerSelectionError/i.test(cause)
      ? (isAtlas
        ? 'Check the Atlas cluster status, IP access list, DNS, and network connectivity.'
        : 'Check that the MongoDB service is installed and running at the host and port in MONGODB_URI.')
      : 'Check that MONGODB_URI is valid and the database is reachable.';
    console.error(`[MongoDB] Could not connect to ${targetLabel}. ${hint}`);
    throw new Error(`MongoDB connection failed. ${hint}`);
  }
};

export default connectDB;
