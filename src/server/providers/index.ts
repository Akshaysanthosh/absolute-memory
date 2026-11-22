import { smtpPasswordResetSender } from './smtp';
import { join } from 'node:path';
import { getConfig } from '@/server/config';
import { LocalStorage } from './storage/local';
import { S3Storage } from './storage/s3';
import type { StorageProvider } from './storage/types';

import { createChatModel } from './chat';
import { createEmbeddingModel } from './embeddings';
import { analyze, summarize, type KnowledgeProvider } from './knowledge';
import { createTranscriber } from './transcription';

export { StructuredOutputError } from './chat';

export function getChatModel() {
  const config = getConfig();
  if (!config.AI_BASE_URL || !config.AI_MODEL) return null;
  return createChatModel(
    { baseURL: config.AI_BASE_URL, apiKey: config.AI_API_KEY, model: config.AI_MODEL },
    config.AI_STRUCTURED_OUTPUT,
  );
}

export function requireChatModel() {
  const model = getChatModel();
  if (!model) throw new Error('No AI provider is configured.');
  return model;
}

export function getEmbeddingModel() {
  const config = getConfig();
  const baseURL = config.EMBEDDINGS_BASE_URL ?? config.AI_BASE_URL;
  if (!baseURL || !config.EMBEDDINGS_MODEL) return null;
  return createEmbeddingModel(
    {
      baseURL,
      apiKey: config.EMBEDDINGS_API_KEY ?? config.AI_API_KEY,
      model: config.EMBEDDINGS_MODEL,
    },
    config.EMBEDDINGS_DIMENSIONS,
  );
}

export function getTranscriber() {
  const config = getConfig();
  if (!config.TRANSCRIPTION_BASE_URL || !config.TRANSCRIPTION_MODEL) return null;
  return createTranscriber({
    baseURL: config.TRANSCRIPTION_BASE_URL,
    apiKey: config.TRANSCRIPTION_API_KEY,
    model: config.TRANSCRIPTION_MODEL,
  });
}

export const liveKnowledgeProvider: KnowledgeProvider = {
  analyze: (text) => analyze(requireChatModel(), text),
  summarize: (text) => summarize(requireChatModel(), text),
  async embed(texts) {
    const model = getEmbeddingModel();
    if (!model) throw new Error('No embedding provider is configured.');
    const result = await model.embed(texts);
    return {
      value: result.vectors,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: 0,
    };
  },
};
export type { Analysis, KnowledgeProvider, Measured } from './knowledge';
export { readStorageBytes } from './storage/types';
export type { StorageProvider } from './storage/types';

export function getPasswordResetSender() {
  const { SMTP_URL, MAIL_FROM } = getConfig();
  return SMTP_URL && MAIL_FROM ? smtpPasswordResetSender(SMTP_URL, MAIL_FROM) : undefined;
}

let s3: S3Storage | undefined;

export function getStorage(): StorageProvider {
  const config = getConfig();
  if (config.STORAGE_DRIVER === 's3') {
    s3 ??= new S3Storage(config.S3_BUCKET!, {
      region: config.S3_REGION!,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID!,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
      },
    });
    return s3;
  }
  return new LocalStorage(join(config.DATA_DIR, 'files'));
}
