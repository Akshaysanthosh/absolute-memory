import type { Queryable } from '@/server/db';
import type { Item } from '@/shared/types';

export type LibraryOptions = {
  query?: string;
  cursor?: string;
  limit?: number;
  filter?: string;
  topic?: string;
  tag?: string;
  type?: string;
  status?: Item['status'];
  after?: string;
  before?: string;
  semantic?: boolean;
  newestFirst?: boolean;
};

export type LibraryCursor = { date: string; id: string; rank?: number };

const filters = `user_id=$1
  AND ($6::text IS NULL OR CASE WHEN $6='archived' THEN archived ELSE NOT archived END)
  AND CASE $6 WHEN 'favorites' THEN favorite WHEN 'progress' THEN progress>0 AND progress<1 WHEN 'finished' THEN progress>=1 ELSE true END
  AND NOT EXISTS (SELECT 1 FROM unnest($7::text[]) AS selected(tag) WHERE NOT EXISTS(
    SELECT 1 FROM knowledge_tag t WHERE t.item_id=item.id AND t.user_id=$1 AND t.origin!='dismissed' AND t.name=selected.tag))
  AND ($8::text='All types' OR $8=CASE
    WHEN bookmark_type IS NOT NULL THEN 'Bookmarks'
    WHEN source_details ? 'quote' THEN 'Quote'
    WHEN EXISTS(SELECT 1 FROM media_source m WHERE m.item_id=item.id AND m.user_id=$1 AND m.kind IN ('youtube','social')) THEN 'Video'
    WHEN EXISTS(SELECT 1 FROM media_source m WHERE m.item_id=item.id AND m.user_id=$1 AND m.kind='podcast') THEN 'Podcast'
    WHEN EXISTS(SELECT 1 FROM media_source m WHERE m.item_id=item.id AND m.user_id=$1 AND m.kind='audio') THEN 'Audio'
    ELSE CASE kind WHEN 'article' THEN 'Article' WHEN 'note' THEN 'Note' WHEN 'pdf' THEN 'PDF' WHEN 'image' THEN 'Image' WHEN 'spreadsheet' THEN 'Excel' END END)
  AND ($10::text IS NULL OR status=$10)
  AND ($11::timestamptz IS NULL OR created_at >= $11)
  AND ($12::timestamptz IS NULL OR created_at < $12)`;

const rankedItems = `WITH eligible AS (SELECT id FROM item WHERE ${filters}),
  needle AS (SELECT websearch_to_tsquery('english',$4) AS query),
  chunk_matches AS (
    SELECT DISTINCT ON (c.item_id) c.item_id, c.content, ts_rank_cd(c.search,needle.query) AS best
    FROM knowledge_chunk c JOIN eligible e ON e.id=c.item_id CROSS JOIN needle
    WHERE c.user_id=$1 AND c.search @@ needle.query
    ORDER BY c.item_id, best DESC, c.ordinal
  ),
  highlight_matches AS (
    SELECT DISTINCT ON (h.item_id) h.item_id, h.quote,
      ts_rank_cd(to_tsvector('english',h.quote),needle.query) AS best
    FROM highlight h JOIN eligible e ON e.id=h.item_id CROSS JOIN needle
    WHERE h.user_id=$1 AND to_tsvector('english',h.quote) @@ needle.query
    ORDER BY h.item_id, best DESC, h.created_at DESC, h.id DESC
  ),
  lexical AS (
    SELECT i.id AS item_id,
      row_number() OVER (ORDER BY score DESC, i.created_at DESC, i.id DESC) AS position
    FROM item i JOIN eligible e ON e.id=i.id CROSS JOIN needle
    LEFT JOIN chunk_matches c ON c.item_id=i.id
    LEFT JOIN highlight_matches h ON h.item_id=i.id
    CROSS JOIN LATERAL (SELECT
      4 * ts_rank(to_tsvector('english',i.title),needle.query) +
      ts_rank_cd(to_tsvector('english',i.excerpt),needle.query) + COALESCE(c.best,0) + COALESCE(h.best,0) AS score) rank
    WHERE to_tsvector('english',i.title) @@ needle.query OR to_tsvector('english',i.excerpt) @@ needle.query OR c.best IS NOT NULL OR h.best IS NOT NULL OR (NOT EXISTS (
      SELECT 1 FROM regexp_split_to_table(lower($4),'[[:space:]]+') term
      WHERE position(term IN lower(concat_ws(' ',i.title,i.excerpt,i.domain,i.url,
        CASE WHEN NOT EXISTS(SELECT 1 FROM knowledge_chunk kc WHERE kc.item_id=i.id AND kc.user_id=$1)
          THEN (SELECT string_agg(p->>'text',' ') FROM jsonb_array_elements(i.passages) p) END,
        i.source_details->'image'->>'description',i.source_details->'quote'->>'title',
        i.source_details->'product'->>'brand',i.source_details->'product'->>'retailer',i.source_details->'product'->>'color',
        (SELECT string_agg(t.name,' ') FROM knowledge_tag t WHERE t.item_id=i.id AND t.user_id=$1 AND t.origin!='dismissed')
      )))=0))
  ),
  basis AS MATERIALIZED (
    SELECT $9::vector AS query,embedding_model FROM instance_setting
    WHERE singleton AND NOT embedding_invalid AND embedding_dimensions=vector_dims($9::vector) AND embedding_model=$14
  ),
  closest AS (
    SELECT neighbors.* FROM basis CROSS JOIN LATERAL (
      SELECT c.item_id,c.embedding <=> basis.query AS distance
      FROM knowledge_chunk c JOIN eligible e ON e.id=c.item_id
      WHERE c.user_id=$1 AND c.embedding_model=basis.embedding_model AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> basis.query LIMIT 300
    ) neighbors WHERE neighbors.distance<=0.65
  ),
  semantic AS (
    SELECT item_id, row_number() OVER (ORDER BY min(distance),item_id) AS position FROM closest GROUP BY item_id
  ),
  fused AS (
    SELECT item_id,floor(sum(1000000000.0/(60+position)))::integer AS rank
    FROM (SELECT * FROM lexical UNION ALL SELECT * FROM semantic) ranks GROUP BY item_id
  )`;

export async function queryLibraryPage(
  db: Queryable,
  page: {
    userId: string;
    cursor: LibraryCursor | null;
    limit: number;
    query: string;
    tags: (string | undefined)[];
    vector: { vector: string; model: string } | null;
    options: LibraryOptions;
  },
) {
  const { userId, cursor, limit, query, tags, vector, options } = page;
  const withRanking = query ? rankedItems : '';
  const joinRanking = query
    ? 'JOIN fused ON fused.item_id=item.id LEFT JOIN chunk_matches ON chunk_matches.item_id=item.id ' +
      'LEFT JOIN highlight_matches ON highlight_matches.item_id=item.id'
    : '';
  const excerpt = query
    ? 'left(COALESCE(highlight_matches.quote,chunk_matches.content,item.excerpt),300)'
    : 'excerpt';
  const score = query && !options.newestFirst ? 'fused.rank' : '0';
  return db.query<Item & { page_created_at: string; page_rank: number; total_count: string }>(
    `
    ${withRanking}
    SELECT * FROM (SELECT count(*) OVER () AS total_count,id,${score} AS page_rank,kind,bookmark_type,source_details,title,url,domain,source_name,author,${excerpt} AS excerpt,words,status,error,archived,favorite,progress,channel,origin_turn_id,sample_key,
      created_at,updated_at,last_read_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS page_created_at,
      CASE WHEN kind='image' OR source_details ? 'quote' THEN left((SELECT string_agg(p->>'text',' ') FROM jsonb_array_elements(passages) p),12000) END AS searchable_text,
      (SELECT m.stage FROM media_source m WHERE m.item_id=item.id AND m.user_id=item.user_id) AS media_stage,
      (SELECT m.kind FROM media_source m WHERE m.item_id=item.id AND m.user_id=item.user_id) AS media_kind,
      (SELECT m.audio_url FROM media_source m WHERE m.item_id=item.id AND m.user_id=item.user_id AND m.kind='podcast') AS media_url,
      (SELECT j.state FROM knowledge_job j WHERE j.item_id=item.id AND j.user_id=item.user_id) AS knowledge_state,
      COALESCE((SELECT jsonb_agg(t.name ORDER BY t.name) FROM knowledge_tag t
        WHERE t.item_id=item.id AND t.user_id=item.user_id AND t.origin!='dismissed'),'[]'::jsonb) AS tags,
      (SELECT jsonb_build_object('name',f.name,'pages',CASE WHEN item.kind='pdf' THEN f.pages END,
        'sheets',CASE WHEN item.kind='spreadsheet' AND f.method='original workbook with sheet count' THEN f.pages END)
        FROM source_file f WHERE f.item_id=item.id AND f.user_id=item.user_id) AS source_file
    FROM item ${joinRanking} WHERE ${query ? 'item.user_id=$1' : filters}
      ${query ? '' : 'AND length($4::text)=0 AND $9::text IS NULL AND $14::text IS NULL'}
    ) AS matching
    WHERE ($2::timestamptz IS NULL OR (page_rank,created_at,id)<($13::integer,$2::timestamptz,$3::uuid))
      ORDER BY page_rank DESC,created_at DESC,id DESC LIMIT $5`,
    [
      userId,
      cursor?.date ?? null,
      cursor?.id ?? null,
      query,
      limit + 1,
      options.filter ?? null,
      tags,
      options.type ?? 'All types',
      vector?.vector ?? null,
      options.status ?? null,
      options.after ?? null,
      options.before ?? null,
      cursor?.rank ?? 0,
      vector?.model ?? null,
    ],
  );
}
