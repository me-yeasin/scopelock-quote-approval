import { MongoClient, type Db } from "mongodb";

// A single, lazily-created MongoClient promise shared across the server
// (Server Actions, Route Handlers, Server Components). The connection is only
// opened the first time getDb() is called, so importing this module never
// throws — even when MONGODB_URI is missing. That keeps the rest of the app
// (build, other routes) working and lets createJob() report a clear,
// user-facing error instead of crashing at import time.

const MONGODB_URI = process.env.MONGODB_URI;

let clientPromise: Promise<MongoClient> | null = null;

function getClientPromise(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;

  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Add your MongoDB connection string to .env.local to enable job storage.",
    );
  }

  // In dev, HMR can re-evaluate this module. Keep the promise on a global so
  // the same connection survives hot reloads instead of opening new ones.
  const globalForMongo = globalThis as unknown as {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (process.env.NODE_ENV === "development" && globalForMongo._mongoClientPromise) {
    clientPromise = globalForMongo._mongoClientPromise;
    return clientPromise;
  }

  const client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();

  if (process.env.NODE_ENV === "development") {
    globalForMongo._mongoClientPromise = clientPromise;
  }

  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db("scopelock");
}

export default getDb;
