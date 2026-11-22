import {
  claimNextImport,
  completeImportLease,
  retryOrFailImportLease,
  completeSocialFallbackJob,
} from '@/server/repos/import-jobs';
import {
  markItemProcessing,
  readImportSource,
  setImportedDocumentKind,
  finishArticleImport,
  findItemWithSocialSnapshot,
  recordImportStatus,
} from '@/server/repos/items';
import { ensureYouTubeSource, deleteUnscopedMediaSource } from '@/server/repos/media-sources';
import { finishUnavailableSocialTranscript } from '@/server/repos/media-items';
import { reanchorHighlights } from '@/server/services/reading';
import { stageReadingImages } from '@/server/services/import/images';
import { plainReading } from '@/server/services/import/content';
import { storeOriginal } from '@/server/services/document-assets';
import { logEvent } from '@/server/logging/events';
import { getConfig, maximumUploadBytes } from '@/server/config';
import { HttpError } from '@/server/auth/http';
import { imageMime } from '@/shared/image-file';
import { documentTitle } from '@/shared/content-title';
import { recordSource } from '@/server/services/source-raw';
import { applyArxivPaper, arxivId, fetchArxivPaper } from '@/server/services/arxiv';
import { randomUUID } from 'node:crypto';
import { getDatabase, type Database } from '@/server/db';
import { ArticleImportError, fetchArticle } from '@/server/services/extract';

import { processMedia } from '@/server/services/media/worker';
import { MediaError } from '@/shared/media/transcript';
import { youtubeVideoId } from '@/server/services/thumbnails';
import { addAutomaticTags } from '@/server/services/saved-content';
import { tagBookmark } from '@/server/services/bookmarks';

/** Seconds before a failed import is tried again: 15 s, 1 min, 4 min (capped at 15 min), ±20% so retries spread out. */
export function retryDelaySeconds(attempt: number, random = Math.random) {
  const base = Math.min(15 * 4 ** Math.max(0, attempt - 1), 900);
  return Math.round(base * (0.8 + 0.4 * random()));
}
export async function processNext(
  database?: Database,
  extract = fetchArticle,
  userId?: string,
  lookupPaper = fetchArxivPaper,
): Promise<boolean> {
  const db = database || (await getDatabase());
  const job = await db.transaction(async (tx) => {
    const { rows } = await claimNextImport(tx, randomUUID(), userId ?? null);
    if (rows[0]) await markItemProcessing(tx, rows[0].item_id);
    return rows[0];
  });
  if (!job) return false;
  try {
    if (job.attempts > 3)
      throw new Error('Import stopped after three interrupted attempts. Retry when ready.');
    const item = await readImportSource(db, job.item_id);
    if (!item.rows[0]) return true;
    // Existing failed video imports can use the new pipeline when explicitly retried.
    if (youtubeVideoId(item.rows[0].url)) await ensureYouTubeSource(db, job.item_id);
    if (await processMedia(db, job)) return true;
    const article = await extract(item.rows[0].url);
    let pdfPages = 1,
      pdfMethod = 'original PDF from URL';
    if (article.pdf) {
      // Same text extraction as an uploaded PDF (page limits included); no AI careful read here.
      const { extractDocument } = await import('@/server/services/documents');
      const parsed = await extractDocument(
        article.pdf.data,
        article.pdf.name,
        false,
        item.rows[0].user_id,
        AbortSignal.timeout(60_000),
        db,
      );
      const text = parsed.passages
        .map((passage) => passage.text)
        .join('\n\n')
        .trim();
      article.title = documentTitle(article.pdf.name, parsed.suggestedTitle);
      // arXiv PDFs rarely carry a title; the arXiv API has the paper's title, authors and abstract.
      const paperId = arxivId(item.rows[0].url);
      const paper = paperId ? await lookupPaper(paperId) : null;
      article.passages = parsed.passages;
      article.readingHtml = parsed.html;
      article.words = text ? text.split(/\s+/).length : 0;
      article.excerpt = text.slice(0, 300);
      if (paper) applyArxivPaper(article, paperId!, paper);
      pdfPages = parsed.pages;
      pdfMethod = parsed.method === 'text' ? 'PDF text from URL' : 'original PDF from URL';
    } else {
      // An arXiv abstract page parses badly (the submission line reads as the author);
      // the arXiv API gives the real title, authors and abstract.
      const paperId = arxivId(item.rows[0].url);
      const paper = paperId ? await lookupPaper(paperId) : null;
      if (paper) {
        applyArxivPaper(article, paperId!, paper);
        if (paper.abstract) {
          const reading = plainReading(paper.abstract);
          article.passages = reading.passages;
          article.readingHtml = reading.html;
          article.words = paper.abstract.split(/\s+/).length;
        }
      }
    }
    const source = article.image ?? article.pdf;
    let attach: Awaited<ReturnType<typeof storeOriginal>> | undefined;
    if (source) {
      if (source.data.length > maximumUploadBytes())
        throw new ArticleImportError('This file exceeds the upload limit.');
      if (article.image && imageMime(article.image.data) !== article.image.mime) {
        throw new ArticleImportError('This image is invalid.');
      }
      attach = await storeOriginal(db, item.rows[0].user_id, job.item_id, {
        name: source.name,
        data: source.data,
        mime: article.image?.mime ?? 'application/pdf',
        method: article.image ? 'original image from URL' : pdfMethod,
        pages: article.image ? 1 : pdfPages,
      });
    }
    const media = await stageReadingImages(
      db,
      item.rows[0].user_id,
      job.item_id,
      article.readingHtml,
      article.images ?? [],
      article.leadImage,
    );
    const details = {
      ...article.details,
      ...(media.thumbnailUrl ? { thumbnailUrl: media.thumbnailUrl } : {}),
    };
    const committed = await db.transaction(async (tx) => {
      const lease = await completeImportLease(tx, job.id, job.lock_token);
      if (!lease.rows.length) return;
      await media.attach(tx);
      if (attach) {
        await attach(tx);
        await setImportedDocumentKind(tx, job.item_id, article.image ? 'image' : 'pdf');
      }
      await finishArticleImport(
        tx,
        job.item_id,
        article.title,
        article.author,
        article.excerpt,
        JSON.stringify(article.passages),
        article.words,
        article.domain,
        article.bookmarkType ?? null,
        JSON.stringify(details),
        media.html,
        article.sourceName ?? null,
        article.publishedAt ?? null,
      );
      await reanchorHighlights(tx, item.rows[0].user_id, job.item_id, article.passages);
      if (article.bookmarkType) await tagBookmark(tx, job.item_id);
      if (article.tags) await addAutomaticTags(tx, job.item_id, article.tags);
      if (article.raw)
        await recordSource(
          tx,
          job.item_id,
          item.rows[0].user_id,
          article.raw.provider,
          article.raw.data,
        );
      return true;
    });
    // The original remains ready even if optional AI interpretation is unavailable.
    if (committed && article.image && getConfig().AI_BASE_URL && getConfig().AI_MODEL) {
      try {
        const { analyzeSavedImage } = await import('@/server/services/image-analysis');
        await analyzeSavedImage(item.rows[0].user_id, job.item_id, AbortSignal.timeout(20000), db);
      } catch (error) {
        logEvent('warn', 'image.import_analysis_unavailable', error);
      }
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 400) : 'Import failed.';
    const retry =
      job.attempts < 3 &&
      (!(e instanceof MediaError || e instanceof ArticleImportError || e instanceof HttpError) ||
        ('retryable' in e && e.retryable));
    await db.transaction(async (tx) => {
      const lease = await retryOrFailImportLease(
        tx,
        job.id,
        job.lock_token,
        retry ? 'queued' : 'failed',
        reason,
        retryDelaySeconds(job.attempts),
      );
      if (lease.rows.length) {
        const snapshot = await findItemWithSocialSnapshot(tx, job.item_id);
        if (!retry && snapshot.rows.length) {
          await finishUnavailableSocialTranscript(tx, job.item_id, reason);
          await deleteUnscopedMediaSource(tx, job.item_id);
          await completeSocialFallbackJob(tx, job.id);
          await tagBookmark(tx, job.item_id);
        } else
          await recordImportStatus(
            tx,
            job.item_id,
            retry ? 'pending' : 'failed',
            retry ? 'Retrying import…' : reason,
          );
      }
    });
  }
  return true;
}
export async function runBatch(userId?: string, database?: Database) {
  const started = Date.now();
  let processed = 0;
  while (processed < 3 && Date.now() - started < 45_000) {
    if (!(await processNext(database, fetchArticle, userId))) break;
    processed++;
  }
  return processed;
}
