import type { Passage } from '@/shared/passages';
import type { SourceFacts } from '@/shared/source-facts';
export type SourceDetails = {
  titleEdited?: boolean;
  /** Standard facts pulled from the provider's raw response (see item_source_raw). */
  source?: SourceFacts;
  thumbnailUrl?: string;
  social?: {
    platform: string;
    transcriptUnavailable?: boolean;
    transcriptError?: string;
    post?: {
      platform: string;
      title: string;
      author: string;
      text: string;
      images: { url: string; alt: string }[];
      video: boolean;
    };
  };
  quote?: { url: string; title: string };
  image?: { description: string; brand: string };
  product?: { retailer: string; brand: string; color: string; price: string };
};
export type Item = {
  source_details?: SourceDetails | null;
  searchable_text?: string;
  bookmark_type?: 'website' | 'product' | null;
  source_file?: { name: string; pages?: number; sheets?: number } | null;
  origin_turn_id?: string | null;
  /** Set on sample saves copied into a new library; null for the user's own saves. */
  sample_key?: string | null;
  thumbnail?: {
    url: string;
    alt: string;
    source: 'article' | 'youtube' | 'document';
    fallbackUrl?: string;
  } | null;
  reading_ready?: boolean;
  media_stage?: 'metadata' | 'upload' | 'native' | 'generate' | 'poll' | 'complete' | null;
  media_url?: string | null;
  media_kind?: 'youtube' | 'podcast' | 'audio' | 'social' | null;
  tags?: string[];
  knowledge_state?: string;
  id: string;
  user_id: string;
  kind: 'article' | 'note' | 'pdf' | 'image' | 'spreadsheet';
  title: string;
  url: string | null;
  domain: string | null;
  source_name?: string | null;
  author: string | null;
  excerpt: string;
  passages: Passage[];
  reading_html: string;
  words: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error: string | null;
  archived: boolean;
  favorite: boolean;
  progress: number;
  channel: string;
  created_at: string;
  updated_at: string;
  last_read_at: string | null;
};
