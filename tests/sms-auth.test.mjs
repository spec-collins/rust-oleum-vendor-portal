import test from 'node:test';
import assert from 'node:assert/strict';
import { getSmsPullToken, assertSmsPull } from '../lib/sms-auth.js';

test('getSmsPullToken reads header bearer and query', () => {
  assert.equal(
    getSmsPullToken({ headers: { 'x-sms-token': 'abc' }, url: '/' }),
    'abc'
  );
  assert.equal(
    getSmsPullToken({ headers: { authorization: 'Bearer xyz' }, url: '/' }),
    'xyz'
  );
  assert.equal(
    getSmsPullToken({ headers: {}, url: '/?token=qwerty' }),
    'qwerty'
  );
});

test('assertSmsPull accepts matching SMS_PULL_TOKEN', () => {
  const prevSms = process.env.SMS_PULL_TOKEN;
  const prevAdmin = process.env.ADMIN_TOKEN;
  process.env.SMS_PULL_TOKEN = 'sms-secret';
  delete process.env.ADMIN_TOKEN;
  try {
    const ok = assertSmsPull({ headers: { 'x-sms-token': 'sms-secret' }, url: '/' });
    assert.equal(ok.ok, true);
    const bad = assertSmsPull({ headers: { 'x-sms-token': 'nope' }, url: '/' });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 401);
  } finally {
    if (prevSms === undefined) delete process.env.SMS_PULL_TOKEN;
    else process.env.SMS_PULL_TOKEN = prevSms;
    if (prevAdmin === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = prevAdmin;
  }
});
