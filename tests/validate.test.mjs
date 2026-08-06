import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubmission, CHOICES } from '../lib/validate.js';

test('accepts placeholder choices', () => {
  for (const choice of CHOICES) {
    const result = validateSubmission({
      stage: 'choice',
      vendor_id: 'V1',
      choice,
      choice_label: 'Label',
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.choice, choice);
  }
});

test('rejects unknown choice and missing vendor', () => {
  assert.equal(validateSubmission({ stage: 'choice', vendor_id: 'V1', choice: 'nope' }).ok, false);
  assert.equal(validateSubmission({ stage: 'choice', choice: 'spreadsheet' }).ok, false);
});

test('accepts reset and reply_to_email timeframe', () => {
  const reset = validateSubmission({ stage: 'reset', vendor_id: 'V1', token: 'x' });
  assert.equal(reset.ok, true);
  assert.equal(reset.value.stage, 'reset');

  const assisted = validateSubmission({
    stage: 'timeframe',
    vendor_id: 'V1',
    timeframe: 'reply_to_email',
    timeframe_label: 'Will reply to email for 15-minute call',
  });
  assert.equal(assisted.ok, true);
});
