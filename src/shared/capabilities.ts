export type Capabilities = {
  ai: boolean;
  embeddings: boolean;
  embeddingNeedsRebuild: boolean;
  transcription: boolean;
  media: boolean;
  mediaUpload: boolean;
  uploadBytes: number;
  email: boolean;
  oauth: boolean;
  model?: string;
  embeddingModel?: string;
  transcriptionModel?: string;
};
