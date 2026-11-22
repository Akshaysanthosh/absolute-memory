import { z } from 'zod';

export class MediaError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public unavailable = false,
  ) {
    super(message);
  }
}
export const segmentSchema = z.object({
  text: z.string().trim().min(1).max(20000),
  offset: z.number().finite().min(0),
  duration: z.number().finite().min(0),
});
export type Segment = z.infer<typeof segmentSchema>;
export type Transcript = { content: Segment[]; lang?: string };
