import { DEFAULT_UPLOAD_MB } from '@/shared/input-limits';
import { z } from 'zod';

const blank = (value: unknown) => (value === '' ? undefined : value);
const optionalText = z.preprocess(blank, z.string().min(1).optional());
const httpUrl = z.url({ protocol: /^https?$/ });
const optionalHttpUrl = z.preprocess(blank, httpUrl.optional());
const flag = (fallback: boolean) =>
  z
    .preprocess(blank, z.enum(['true', 'false']).optional())
    .transform((value) => (value === undefined ? fallback : value === 'true'));
const positiveInteger = z.preprocess(
  blank,
  z.coerce.number().int().positive().max(1_000_000).optional(),
);

export const configSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development')
      .describe('Application mode. Containers use production and development uses local defaults.'),
    APP_URL: z
      .preprocess(blank, httpUrl.default('http://localhost:3000'))
      .transform((value) => new URL(value))
      .refine(
        (url) => !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
        {
          message: 'Use an origin without credentials, a path, a query or a fragment',
        },
      )
      .transform((url) => url.origin)
      .describe(
        'Browser origin, including the scheme and any non-default port. Supply an HTTPS origin behind TLS.',
      ),
    AUTH_SECRET: optionalText.describe(
      'Session signing secret. Production requires at least 32 characters. Keep the same value across restarts and replicas.',
    ),
    DATABASE_URL: z
      .preprocess(blank, z.url({ protocol: /^postgres(?:ql)?$/ }).optional())
      .describe('PostgreSQL connection URL. Leave unset to use PGlite in Lite.'),
    DATA_DIR: z
      .preprocess(blank, z.string().min(1).default('./data'))
      .describe('Directory for local files and the PGlite database. The container uses /data.'),
    ROLE: z
      .preprocess(blank, z.enum(['all', 'web', 'worker']).default('all'))
      .describe('Process role. Use all in Lite, or web and worker in Standard.'),
    MIGRATE_ON_START: flag(true).describe('Apply pending schema migrations at startup.'),
    ALLOW_SIGNUP: flag(false).describe(
      'Allow public registration once the instance has an owner. Invitations work with signup closed.',
    ),
    AI_BASE_URL: optionalHttpUrl.describe(
      'OpenAI-compatible chat base URL. Required when AI_MODEL is set.',
    ),
    AI_API_KEY: optionalText.describe('Optional key for the chat endpoint.'),
    AI_MODEL: optionalText.describe(
      'Chat model ID. Enables chat and summaries when the endpoint is configured.',
    ),
    AI_STRUCTURED_OUTPUT: z
      .preprocess(blank, z.enum(['auto', 'json_schema', 'json_object', 'prompt']).default('auto'))
      .describe('Structured chat responses. Use auto, json_schema, json_object, or prompt.'),
    EMBEDDINGS_BASE_URL: optionalHttpUrl.describe(
      'Embedding base URL. Defaults to the chat endpoint when set.',
    ),
    EMBEDDINGS_API_KEY: optionalText.describe(
      'Optional embedding key. Reuses the chat key when using the chat endpoint.',
    ),
    EMBEDDINGS_MODEL: optionalText.describe(
      'Embedding model ID. Enables the semantic search index.',
    ),
    EMBEDDINGS_DIMENSIONS: positiveInteger
      .refine((value) => value === undefined || value <= 2000, 'Use at most 2000 dimensions')
      .describe('Vector width, up to 2000. Learns the width from the first response if unset.'),
    TRANSCRIPTION_BASE_URL: optionalHttpUrl.describe(
      'OpenAI-compatible transcription base URL. Required with TRANSCRIPTION_MODEL.',
    ),
    TRANSCRIPTION_API_KEY: optionalText.describe('Optional key for the transcription endpoint.'),
    TRANSCRIPTION_MODEL: optionalText.describe('Transcription model ID.'),
    MEDIA_ENABLED: z
      .preprocess(blank, z.enum(['true', 'false']).optional())
      .transform((value) => (value === undefined ? undefined : value === 'true'))
      .describe('Enable media tooling. Automatically detects availability when unset.'),
    MEDIA_MAX_DURATION_MINUTES: positiveInteger
      .transform((value) => value ?? 180)
      .describe('Maximum duration of media submitted for audio processing.'),
    YTDLP_COOKIES_FILE: optionalText.describe(
      'Path to an optional Netscape cookie file for authorized yt-dlp downloads.',
    ),
    STORAGE_DRIVER: z
      .preprocess(blank, z.enum(['local', 's3']).default('local'))
      .describe('Store originals and temporary artifacts with local or s3 storage.'),
    S3_ENDPOINT: optionalHttpUrl.describe('Optional S3-compatible service URL.'),
    S3_REGION: optionalText.describe('Bucket region. Required for S3.'),
    S3_BUCKET: optionalText.describe('Bucket name. Required for S3.'),
    S3_ACCESS_KEY_ID: optionalText.describe('S3 access credential. Required for S3.'),
    S3_SECRET_ACCESS_KEY: optionalText.describe('S3 secret credential. Required for S3.'),
    S3_FORCE_PATH_STYLE: flag(false).describe(
      'Use bucket names in the path for services that require path-style URLs.',
    ),
    SMTP_URL: z
      .preprocess(blank, z.url({ protocol: /^smtps?$/ }).optional())
      .describe('SMTP or SMTPS connection URL for password reset email.'),
    MAIL_FROM: optionalText.describe(
      'Sender address for password reset email. Required with SMTP_URL.',
    ),
    GOOGLE_CLIENT_ID: optionalText.describe('Google OAuth client ID.'),
    GOOGLE_CLIENT_SECRET: optionalText.describe('Google OAuth client secret.'),
    GITHUB_CLIENT_ID: optionalText.describe('GitHub OAuth client ID.'),
    GITHUB_CLIENT_SECRET: optionalText.describe('GitHub OAuth client secret.'),
    MAX_UPLOAD_MB: positiveInteger
      .transform((value) => value ?? DEFAULT_UPLOAD_MB)
      .describe(
        'Maximum size of an individual file in MiB. Portable ZIP import has a separate cap.',
      ),
    TRANSFER_MAX_UPLOAD_MB: positiveInteger
      .transform((value) => value ?? 256)
      .refine((value) => value <= 2048)
      .describe('Maximum compressed or plain transfer upload size in MiB.'),
    TRANSFER_MAX_EXPANDED_MB: positiveInteger
      .transform((value) => value ?? 512)
      .refine((value) => value <= 4096)
      .describe('Maximum total uncompressed size of a library archive in MiB.'),
    TRANSFER_MAX_ENTRY_MB: positiveInteger
      .transform((value) => value ?? 64)
      .refine((value) => value <= 1024)
      .describe('Maximum uncompressed size of one archive entry in MiB.'),
    TRANSFER_MAX_ENTRIES: positiveInteger
      .transform((value) => value ?? 100000)
      .describe('Maximum number of entries in a library archive.'),
    TRANSFER_MAX_METADATA_MB: positiveInteger
      .transform((value) => value ?? 64)
      .refine((value) => value <= 256)
      .describe('Maximum aggregate bytes of library archive metadata in MiB.'),
    ALLOW_PRIVATE_NETWORK_FETCH: flag(false).describe(
      'Allow capture fetching from private networks. Defaults to blocking those destinations.',
    ),
    ALLOW_REMOTE_IMAGES: flag(false).describe(
      'Allow the browser to load third-party images referenced by saved content.',
    ),
    TRUST_PROXY: flag(false).describe(
      'Use the X-Real-IP request header from a trusted proxy for client rate limits.',
    ),
    LOG_LEVEL: z
      .preprocess(blank, z.enum(['debug', 'info', 'warn', 'error']).default('info'))
      .describe('Minimum application log level. Choose debug, info, warn, or error.'),

    REDDIT_CLIENT_ID: optionalText.describe('Reddit OAuth client ID for post retrieval.'),
    REDDIT_CLIENT_SECRET: optionalText.describe('Reddit OAuth client secret.'),
    INTEGRATION_API_ENABLED: flag(true).describe('Enable the personal API and integrations.'),
    AM_TEST_DB: z
      .literal('memory')
      .optional()
      .describe(
        'Test-only setting. The memory value starts a temporary in-memory PGlite database.',
      ),
  })
  .superRefine((config, ctx) => {
    const invalid = (key: keyof typeof config, message: string) =>
      ctx.addIssue({ code: 'custom', path: [key], message });
    if (config.NODE_ENV === 'production' && (config.AUTH_SECRET?.length ?? 0) < 32) {
      invalid('AUTH_SECRET', 'Provide at least 32 characters');
    }
    if (config.ROLE !== 'all' && !config.DATABASE_URL) {
      invalid('DATABASE_URL', 'Required when web and worker run separately');
    }
    if (config.AI_MODEL && !config.AI_BASE_URL) invalid('AI_BASE_URL', 'Required with AI_MODEL');
    if (config.EMBEDDINGS_MODEL && !config.EMBEDDINGS_BASE_URL && !config.AI_BASE_URL) {
      invalid('EMBEDDINGS_BASE_URL', 'Configure an embeddings endpoint or AI_BASE_URL');
    }
    if (config.TRANSCRIPTION_MODEL && !config.TRANSCRIPTION_BASE_URL) {
      invalid('TRANSCRIPTION_BASE_URL', 'Required with TRANSCRIPTION_MODEL');
    }
    if (config.STORAGE_DRIVER === 's3') {
      for (const key of [
        'S3_BUCKET',
        'S3_REGION',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!config[key]) invalid(key, 'Required for S3 storage');
      }
    }
    for (const [identifier, secret] of [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
      ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
      ['SMTP_URL', 'MAIL_FROM'],
    ] as const) {
      if (config[identifier] && !config[secret]) invalid(secret, `Required with ${identifier}`);
      if (!config[identifier] && config[secret]) invalid(identifier, `Required with ${secret}`);
    }
  });

export type Config = z.output<typeof configSchema>;

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);
  if (result.success) return result.data;
  const errors = result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid Absolute Memory configuration:\n${errors.join('\n')}`);
}

export function getConfig(): Config {
  return parseConfig(process.env);
}

export function maximumUploadBytes() {
  return getConfig().MAX_UPLOAD_MB * 1024 * 1024;
}
