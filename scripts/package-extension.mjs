import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('dist', { recursive: true });
const output = resolve('dist/absolute-memory-chrome.zip');
rmSync(output, { force: true });
execFileSync('zip', ['-qr', output, '.', '-x', '*/.DS_Store', '.DS_Store'], { cwd: 'extension' });
console.log('Packaged dist/absolute-memory-chrome.zip');
