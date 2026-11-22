import test from 'node:test';
import assert from 'node:assert/strict';
import { socialVideoPlatform, contentPlatform } from '../../src/shared/media/social';

test('social recognition accepts individual supported links, not profiles or lookalike domains', () => {
  for (const [url, platform] of [
    ['https://www.instagram.com/reel/ABC_123/', 'Instagram'],
    ['https://www.tiktok.com/@reader/video/12345', 'TikTok'],
    ['https://vm.tiktok.com/ABC123/', 'TikTok'],
    ['https://x.com/reader/status/12345', 'X'],
    ['https://www.facebook.com/reel/12345/', 'Facebook'],
    ['https://www.facebook.com/watch/?v=12345', 'Facebook'],
  ])
    assert.equal(socialVideoPlatform(url), platform);
  for (const url of [
    'https://instagram.com/reader',
    'https://instagram.com.evil.test/reel/123',
    'https://x.com/home',
    'https://facebook.com/watch/',
    'https://tiktok.com/@reader',
    'file://instagram.com/reel/123',
  ])
    assert.equal(socialVideoPlatform(url), null);
});

test('platform labels do not imply transcript support', () => {
  assert.equal(
    contentPlatform('https://www.reddit.com/r/programming/comments/abc/title'),
    'Reddit',
  );
  assert.equal(
    socialVideoPlatform('https://www.reddit.com/r/programming/comments/abc/title'),
    null,
  );
  assert.equal(contentPlatform('https://instagram.com/creator'), 'Instagram');
  assert.equal(contentPlatform('https://reddit.com.evil.test/r/post'), null);
  assert.equal(contentPlatform('file://reddit.com/r/post'), null);
});
