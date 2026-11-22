import { readFileSync, writeFileSync } from 'node:fs';
import { configSchema } from '../src/server/config';

const target = new URL('../docs/configuration.md', import.meta.url);
const rows = Object.entries(configSchema.shape).map(([name, schema]) => {
  const parsed = schema.safeParse(undefined);
  if (!schema.description) throw new Error(`Add a description for ${name}.`);
  const fallback = parsed.success && parsed.data !== undefined ? `\`${parsed.data}\`` : 'Unset';
  return `| \`${name}\` | ${fallback} | ${schema.description} |`;
});
const generated = `# Configuration

Generated from the server's Zod schema. Run \`npm run docs:config\` after a schema change.

Set these variables in the server environment. For local development use \`.env.local\`. Standard Compose reads \`.env\`. Keep credentials out of version control. The schema rejects invalid combinations during startup.

| Variable | Default | Description |
| --- | --- | --- |
${rows.join('\n')}

## Docker Compose and helper settings

| Variable | Description |
| --- | --- |
| \`AM_PORT\` | Host port published by the Lite helper and Standard Compose. Defaults to 3000. Match \`APP_URL\` to your browser's origin. |
| \`POSTGRES_PASSWORD\` | Password for Standard Compose's database. Generate a random value with \`openssl rand -hex 24\`. |
| \`MINIO_IMAGE\` | Optional local MinIO image tag for the storage override. |
| \`PORT\`, \`HOSTNAME\` | Listener settings for Next.js standalone. In Docker, defaults are \`3000\` and \`0.0.0.0\`. |
| \`NEXT_TELEMETRY_DISABLED\` | Set to \`1\` by the application scripts and container. |

See the [provider recipes](providers.md) and [deployment guide](getting-started.md).
`;
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== generated)
    throw new Error('docs/configuration.md is out of date. Run npm run docs:config.');
} else {
  writeFileSync(target, generated);
}
