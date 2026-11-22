/** Where a raw response came from. Matches the CHECK constraint in the database baseline. */
export type RawProvider = 'reddit' | 'article' | 'extension' | 'podcast';
/** Standard facts pulled out of any provider's response. Every field is optional. */
export type SourceFacts = {
  provider: RawProvider;
  text?: string; // post text, caption or selftext
  description?: string; // video/page description (not the post itself)
  authorName?: string;
  authorHandle?: string; // @username or u/name
  postedAt?: string; // ISO date the source was published
  hashtags?: string[];
  stats?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    score?: number;
    capturedAt: string;
  };
  mediaType?: string; // video | image | carousel | post | article
  duration?: number; // seconds
  language?: string;
  community?: string; // subreddit or similar
  siteName?: string;
};
