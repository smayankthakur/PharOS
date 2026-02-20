import 'dotenv/config';
import { Pool } from 'pg';

const resetDb = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Database schema reset complete');
  } finally {
    await pool.end();
  }
};

resetDb().catch((error: unknown) => {
  console.error('Database reset failed', error);
  process.exit(1);
});
