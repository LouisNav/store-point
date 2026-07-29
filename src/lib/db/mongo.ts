// Mongo connection (lazy, cached). Safe to call multiple times.
// Never throws at boot — we tolerate unreachable Mongo and run offline.

import mongoose from 'mongoose';
import { env } from '@/env';

let connecting: Promise<typeof mongoose | null> | null = null;

export function getMongo(): Promise<typeof mongoose | null> {
  if (connecting) return connecting;
  const uri = env().MONGODB_URI;
  if (!uri) return Promise.resolve(null);

  connecting = (async () => {
    try {
      const conn = await mongoose.connect(uri, {
        dbName: env().MONGODB_DB,
        serverSelectionTimeoutMS: 3000,
        bufferCommands: false,
      });
      // eslint-disable-next-line no-console
      console.log('[mongo] connected');
      return conn;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[mongo] unreachable, running offline:', (e as Error).message);
      // Reset so a future call can retry.
      connecting = null;
      return null;
    }
  })();
  return connecting;
}

export async function isMongoReachable(): Promise<boolean> {
  if (!env().MONGODB_URI) return false;
  try {
    const conn = await mongoose.connect(env().MONGODB_URI, {
      dbName: env().MONGODB_DB,
      serverSelectionTimeoutMS: 2000,
      bufferCommands: false,
    });
    await conn.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}

export async function closeMongo() {
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  connecting = null;
}
