import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database, Queryable } from './index';

const migrationsDirectory = () => join(process.cwd(), 'db', 'migrations');
const migrationPattern = /^\d{4}_[a-z0-9_]+$/;

export async function migrationFiles(directory = migrationsDirectory()) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) =>
      entry.isDirectory()
        ? migrationPattern.test(entry.name)
        : entry.isFile() &&
          entry.name.endsWith('.sql') &&
          migrationPattern.test(entry.name.slice(0, -4)),
    )
    .map((entry) => entry.name)
    .sort();
  const versions = new Set<string>();
  for (const file of files) {
    const version = file.slice(0, 4);
    if (versions.has(version)) throw new Error(`Duplicate migration version ${version}.`);
    versions.add(version);
  }
  return files;
}

async function readMigration(directory: string, name: string) {
  const path = join(directory, name);
  if (name.endsWith('.sql')) return readFile(path, 'utf8');
  // Versioned directories group a migration's statements into one atomic application.
  const parts = (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
  if (!parts.length) throw new Error(`Migration ${name} has no SQL files.`);
  return (await Promise.all(parts.map((part) => readFile(join(path, part), 'utf8')))).join('\n');
}

async function lockMigrations(tx: Queryable, driver: Database['driver']) {
  if (driver === 'postgres') {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('absolute-memory:migrations'))");
  }
}

export async function migrate(database: Database, directory = migrationsDirectory()) {
  const files = await migrationFiles(directory);
  await database.transaction(async (tx) => {
    await lockMigrations(tx, database.driver);
    await tx.query(
      'CREATE TABLE IF NOT EXISTS schema_migration (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
  });

  for (const file of files) {
    const version = file.slice(0, 4);
    const sql = await readMigration(directory, file);
    await database.transaction(async (tx) => {
      await lockMigrations(tx, database.driver);
      const { rows } = await tx.query('SELECT version FROM schema_migration WHERE version=$1', [
        version,
      ]);
      if (rows.length) return;
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migration(version) VALUES($1)', [version]);
    });
  }
}
