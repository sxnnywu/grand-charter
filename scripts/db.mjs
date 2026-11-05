import { readdir, readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import pg from 'pg';

const { Client } = pg;

for (const file of ['.env.local', '.env']) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function migrate(client) {
  const directory = new URL('../db/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();

  // Hold the lock until commit so two setup runs cannot apply the same migration.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('grand-charter-migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await client.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map(({ filename }) => filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    await client.query(await readFile(new URL(file, directory), 'utf8'));
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }
}

async function main() {
  const command = process.argv[2];
  if (command !== 'migrate' && command !== 'seed') {
    throw new Error('Usage: node scripts/db.mjs <migrate|seed>');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL or copy .env.example to .env.local.');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('BEGIN');
    if (command === 'migrate') {
      await migrate(client);
    } else {
      await client.query(await readFile(new URL('../db/seed.sql', import.meta.url), 'utf8'));
    }
    await client.query('COMMIT');
    console.log(command === 'migrate' ? 'Migrations are up to date.' : 'Demo data is ready.');
  } finally {
    // Closing the connection rolls back any transaction that failed before commit.
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
