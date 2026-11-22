import { canTranscribe } from '@/server/services/media/audio';
import { mediaEnabled } from '@/server/services/media/tools';
import { getConfig, maximumUploadBytes } from '@/server/config';
import { isInstanceOwner } from '@/server/auth/owner';
import { getDatabase } from '@/server/db';
import { getChatModel, getEmbeddingModel } from '@/server/providers';
import { embeddingAvailability } from '@/server/services/embeddings';
import type { Capabilities } from '@/shared/capabilities';

export function configuredCapabilities(): Capabilities {
  const config = getConfig();
  return {
    ai: Boolean(config.AI_BASE_URL && config.AI_MODEL),
    embeddings: Boolean(
      config.EMBEDDINGS_MODEL && (config.EMBEDDINGS_BASE_URL ?? config.AI_BASE_URL),
    ),
    embeddingNeedsRebuild: false,
    transcription: Boolean(config.TRANSCRIPTION_BASE_URL && config.TRANSCRIPTION_MODEL),
    media: mediaEnabled(),
    mediaUpload: canTranscribe(),
    uploadBytes: maximumUploadBytes(),
    email: Boolean(config.SMTP_URL),
    oauth: Boolean(config.GOOGLE_CLIENT_ID || config.GITHUB_CLIENT_ID),
  };
}

export async function getCapabilities(userId?: string): Promise<Capabilities> {
  const flags = configuredCapabilities();
  if (!userId && !flags.embeddings) return flags;
  const db = await getDatabase();
  const [embedding, owner] = await Promise.all([
    flags.embeddings ? embeddingAvailability(db) : null,
    userId ? isInstanceOwner(userId, db) : false,
  ]);
  const capabilities = embedding
    ? { ...flags, embeddings: embedding.enabled, embeddingNeedsRebuild: embedding.mismatch }
    : flags;
  if (!owner) return capabilities;
  const config = getConfig();
  return {
    ...capabilities,
    model: config.AI_MODEL,
    embeddingModel: config.EMBEDDINGS_MODEL,
    transcriptionModel: config.TRANSCRIPTION_MODEL,
  };
}

export async function testProviderConnections(signal: AbortSignal) {
  const chat = getChatModel();
  const embeddings = getEmbeddingModel();
  const results: { provider: string; ok: boolean; detail: string }[] = [];
  if (chat) {
    try {
      const response = await chat.generateText({
        instructions: 'This is a connectivity check. Do not use tools or external sources.',
        prompt: 'Reply with OK.',
        maxOutputTokens: 12,
        abortSignal: signal,
      });
      if (!response.text.trim()) throw new Error('Empty response');
      results.push({ provider: 'Chat', ok: true, detail: chat.name });
    } catch {
      results.push({ provider: 'Chat', ok: false, detail: 'Check the endpoint, key, and model.' });
    }
  }

  if (embeddings) {
    try {
      const response = await embeddings.embed(['Absolute Memory connectivity check']);
      results.push({
        provider: 'Embeddings',
        ok: true,
        detail: `${response.dimensions} dimensions`,
      });
    } catch {
      results.push({
        provider: 'Embeddings',
        ok: false,
        detail: 'Check the endpoint, key, model, and dimensions.',
      });
    }
  }
  return results;
}
