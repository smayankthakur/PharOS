import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

const ensureMigrationsTable = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

const getAppliedMigrationIds = async (pool: Pool): Promise<Set<string>> => {
  const result = await pool.query<{ id: string }>('SELECT id FROM migrations');
  return new Set(result.rows.map((row) => row.id));
};

const runMigrations = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrationIds(pool);

    const migrationsDir = join(process.cwd(), 'packages', 'db', 'migrations');
    const migrationFiles = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const fileName of migrationFiles) {
      if (applied.has(fileName)) {
        continue;
      }

      const fullPath = join(migrationsDir, fileName);
      const sql = await readFile(fullPath, 'utf8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO migrations (id) VALUES ($1)', [fileName]);
        await client.query('COMMIT');
        console.log(`Applied migration: ${fileName}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    console.log('Migrations complete');
  } finally {
    await pool.end();
  }
};

runMigrations().catch((error: unknown) => {
  console.error('Migration failed', error);
  process.exit(1);
});
