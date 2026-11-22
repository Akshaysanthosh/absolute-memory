import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublishedTranscript } from '../../src/server/services/media/podcast';

test('VTT and SRT parsing preserve millisecond cue ranges and readable text', () => {
  const vtt =
    'WEBVTT\n\n00:01.250 --> 00:03.500 align:start\n<i>Heading</i>\nSecond line\n' +
    '\n00:05.000 --> 00:05.050\nLast cue';
  const srt =
    '1\r\n00:00:01,250 --> 00:00:03,500\r\nHeading\r\nSecond line\r\n' +
    '\r\n2\r\n00:00:05,000 --> 00:00:05,050\r\nLast cue';
  const expected = {
    content: [
      { text: 'Heading Second line', offset: 1250, duration: 2250 },
      { text: 'Last cue', offset: 5000, duration: 50 },
    ],
  };
  assert.deepEqual(parsePublishedTranscript(vtt, 'text/vtt'), expected);
  assert.deepEqual(parsePublishedTranscript(srt, 'application/x-subrip'), expected);
});

test('timed transcripts reject backwards timing, out-of-order starts and empty cues', () => {
  for (const vtt of [
    'WEBVTT\n\n00:04.500 --> 00:02.000\nInvalid duration',
    'WEBVTT\n\n00:05.000 --> 00:06.000\nFirst\n\n00:03.000 --> 00:04.500\nEarlier',
    'WEBVTT\n\n00:01.000 --> 00:04.000\n<i></i>',
  ])
    assert.throws(() => parsePublishedTranscript(vtt, 'text/vtt'), /invalid/i);
});
