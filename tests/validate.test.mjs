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
