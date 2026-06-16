import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  console.error("[Database] Error: MONGODB_URI env variable is not set");
  throw new Error("MONGODB_URI env variable is not set");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    console.log("[Database] Using cached MongoDB connection");
    return cached.conn;
  }

  if (!cached.promise) {
    console.log("[Database] Initializing new MongoDB connection...");
    cached.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false })
      .then((conn) => {
        console.log("[Database] Successfully connected to MongoDB Atlas");
        return conn;
      })
      .catch((err) => {
        console.error("[Database] Failed to connect to MongoDB Atlas:", err);
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
