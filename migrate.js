import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Force IPv4 DNS resolution (Supabase free tier is IPv6-only, which many systems can't route)
dns.setDefaultResultOrder('ipv4first');

const migrationsDir = path.join(__dirname, 'supabase', 'migrations');

// Require DATABASE_URL from environment
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

async function migrate() {
  console.log('Connecting to database...');

  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected!\n');

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Get already-executed migrations
    const { rows: executed } = await client.query('SELECT name FROM _migrations ORDER BY name');
    const executedSet = new Set(executed.map(r => r.name));

    // Get migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    let ran = 0;
    for (const file of files) {
      if (executedSet.has(file)) {
        console.log(`  SKIP  ${file} (already executed)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`  RUN   ${file}...`);

      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        console.log(`  DONE  ${file}`);
        ran++;
      } catch (err) {
        console.error(`  FAIL  ${file}: ${err.message}`);
        throw err;
      }
    }

    console.log(`\n${ran} migration(s) executed. ${files.length - ran} skipped.`);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
