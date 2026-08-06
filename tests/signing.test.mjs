import test from 'node:test';
import assert from 'node:assert/strict';
import { signVendorId, verifyVendorToken } from '../lib/signing.js';

test('signVendorId is stable and verifiable', () => {
  const secret = 'test-secret-do-not-use-in-prod';
  const token = signVendorId('VENDOR-1', secret);
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 10);
  assert.equal(verifyVendorToken('VENDOR-1', token, secret), true);
  assert.equal(verifyVendorToken('VENDOR-2', token, secret), false);
  assert.equal(verifyVendorToken('VENDOR-1', 'nope', secret), false);
});

test('verify passes when secret unset', () => {
  assert.equal(verifyVendorToken('X', '', ''), true);
  assert.equal(verifyVendorToken('X', null, undefined), true);
});
