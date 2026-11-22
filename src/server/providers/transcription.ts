import type { Readable } from 'node:stream';
import { z } from 'zod';
import { endpointFetch, type ModelEndpoint } from './chat';

const responseSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  segments: z
    .array(
      z.object({
        text: z.string().trim(),
        start: z.number().finite().nonnegative(),
        end: z.number().finite().nonnegative(),
      }),
    )
    .optional(),
});

export function createTranscriber(endpoint: ModelEndpoint) {
  return {
    name: endpoint.model,
    async transcribe(
      file: Readable,
      options: { signal?: AbortSignal; maxBytes: number; language?: string },
    ) {
      let size = 0;
      const chunks: Uint8Array[] = [];
      for await (const chunk of file) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > options.maxBytes)
          throw new Error('Audio exceeds the transcription upload limit.');
        chunks.push(bytes);
      }
      if (!size) throw new Error('The audio file is empty.');

      const form = new FormData();
      form.append(
        'file',
        new Blob([Uint8Array.from(Buffer.concat(chunks))], { type: 'audio/wav' }),
        'recording.wav',
      );
      form.append('model', endpoint.model);
      form.append('response_format', 'verbose_json');
      if (options.language) form.append('language', options.language);

      const timeout = AbortSignal.timeout(120_000);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      const url = endpoint.baseURL.replace(/\/+$/, '') + '/audio/transcriptions';
      const response = await endpointFetch(url, {
        method: 'POST',
        body: form,
        signal,
        headers: endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : undefined,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Transcription provider returned HTTP ${response.status}.`);
      }
      const result = responseSchema.parse(await response.json());
      const segments =
        result.segments
          ?.filter((segment) => segment.text && segment.end >= segment.start)
          .map((segment) => ({
            text: segment.text,
            offset: Math.round(segment.start * 1000),
            duration: Math.round((segment.end - segment.start) * 1000),
          })) ?? [];
      return {
        text: result.text,
        language: result.language,
        segments: segments.length
          ? segments
          : result.text.trim()
            ? [{ text: result.text.trim(), offset: 0, duration: 0 }]
            : [],
      };
    },
  };
}
