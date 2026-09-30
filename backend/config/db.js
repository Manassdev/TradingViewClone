import mongoose from 'mongoose';

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim()) {
    throw new Error('MONGODB_URI is required. Set it in the backend environment.');
  }
  const isAtlas = uri.includes('mongodb+srv://') || uri.includes('mongodb.net');
  const targetLabel = isAtlas ? 'MongoDB Atlas Cluster' : 'Local MongoDB Instance';

  try {
    const conn = await mongoose.connect(uri);

    console.log(`[MongoDB] Successfully connected to ${targetLabel} (${conn.connection.host}/${conn.connection.name})`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection error to ${targetLabel}.`);
    throw new Error('MongoDB connection failed. Verify MONGODB_URI and that the database is reachable.');
  }
};

export default connectDB;
