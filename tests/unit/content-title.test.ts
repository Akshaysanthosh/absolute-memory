import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanSourceTitle } from '../../src/shared/content-title';

test('source titles drop browser noise', () => {
  assert.equal(
    cleanSourceTitle(
      '(5) Abhijit on X: "I\'m selling my app https://t.co/DPMiWwYKv9 - launched on 7 November" / X',
      'x.com',
    ),
    "Abhijit: I'm selling my app - launched on 7 November",
  );
  assert.equal(
    cleanSourceTitle(
      '(5) Backdoor on X: "bookmark to get a job https://t.co/5RKWcbof2x https://t.co/CEhdPRn8sv" / X',
      'x.com',
    ),
    'Backdoor: bookmark to get a job',
  );
  assert.equal(
    cleanSourceTitle(
      'Zack D. Films on Instagram: "How Rejection Shapes Future Relationships 😢"',
      'instagram.com',
    ),
    'Zack D. Films: How Rejection Shapes Future Relationships 😢',
  );
  assert.equal(cleanSourceTitle('www.instagram.com', 'www.instagram.com'), 'Instagram link');
  assert.equal(cleanSourceTitle('open.spotify.com', 'open.spotify.com'), 'Spotify link');
  assert.equal(
    cleanSourceTitle(
      'From the front row to the hot seat - what the midterms mean for Big Tech',
      'techcrunch.com',
    ),
    'From the front row to the hot seat - what the midterms mean for Big Tech',
  );
});
