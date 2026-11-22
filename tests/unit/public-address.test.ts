import assert from 'node:assert/strict';
import test from 'node:test';
import { publicAddress } from '../../src/server/security/safe-fetch';

test('the address classifier accepts public unicast and rejects local and reserved ranges', () => {
  for (const [address, expected] of [
    ['8.8.8.8', true],
    ['2606:4700:4700::1111', true],
    ['::ffff:8.8.8.8', true],
    ['0.0.0.0', false],
    ['10.5.0.1', false],
    ['100.64.0.1', false],
    ['127.0.0.1', false],
    ['169.254.1.1', false],
    ['172.16.0.1', false],
    ['192.168.1.1', false],
    ['224.0.0.1', false],
    ['255.255.255.255', false],
    ['::', false],
    ['::1', false],
    ['fc00::1', false],
    ['fe80::1', false],
    ['ff02::1', false],
    ['::ffff:10.5.0.1', false],
    ['invalid', false],
  ] as const) {
    assert.equal(publicAddress(address), expected, address);
  }
});
