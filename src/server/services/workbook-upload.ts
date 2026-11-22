import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { HttpError } from '@/server/auth/http';
import { workbookLimits } from '@/shared/workbook-policy';

export async function verifyWorkbook(data: Uint8Array, signal: AbortSignal) {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(Buffer.from(data), { lazyEntries: true, validateEntrySizes: true }, (error, file) =>
      error ? reject(error) : resolve(file),
    );
  }).catch(() => {
    throw new HttpError(400, 'Choose a valid .xlsx workbook.');
  });
  try {
    if (zip.entryCount > workbookLimits.archiveEntries)
      throw new HttpError(413, 'This workbook contains too many files to preview.');
    const names = new Set<string>();
    let bytes = 0;
    await new Promise<void>((resolve, reject) => {
      zip.once('error', reject);
      zip.once('end', resolve);
      zip.on('entry', (entry: Entry) => {
        try {
          signal.throwIfAborted();
          if (names.has(entry.fileName) || entry.isEncrypted())
            throw new HttpError(400, 'This workbook is encrypted or invalid.');
          names.add(entry.fileName);
          bytes += entry.uncompressedSize;
          if (bytes > workbookLimits.archiveBytes)
            throw new HttpError(413, 'The workbook expands beyond the preview limit.');
          if (entry.fileName.endsWith('/')) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error) {
              reject(error);
              return;
            }
            stream.once('error', reject);
            stream.once('end', () => zip.readEntry());
            stream.resume();
          });
        } catch (error) {
          reject(error);
        }
      });
      zip.readEntry();
    });
    if (
      !names.has('[Content_Types].xml') ||
      !names.has('xl/workbook.xml') ||
      names.has('xl/vbaProject.bin')
    ) {
      throw new HttpError(400, 'Choose a valid .xlsx workbook without macros.');
    }
    return [...names].filter((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name)).length;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'This workbook could not be read.');
  } finally {
    zip.close();
  }
}
