import test from 'node:test';
import assert from 'node:assert/strict';
import { adminResponseStatus, computeFollowUpDate } from '../lib/follow-up.js';

test('computes follow-up from presets and custom date', () => {
  assert.equal(
    computeFollowUpDate({
      choice: 'spreadsheet',
      timeframe: 'this_week',
      timeframe_submitted_at: '2026-08-06T15:00:00.000Z',
    }),
    '2026-08-13'
  );
  assert.equal(
    computeFollowUpDate({
      choice: 'upload_docs',
      timeframe: 'next_two_weeks',
      timeframe_submitted_at: '2026-08-06T15:00:00.000Z',
    }),
    '2026-08-20'
  );
  assert.equal(
    computeFollowUpDate({
      choice: 'specright',
      timeframe: '2026-09-01',
      timeframe_submitted_at: '2026-08-06T15:00:00.000Z',
    }),
    '2026-09-01'
  );
});

test('assisted is urgent until assistance provided', () => {
  const urgent = adminResponseStatus({
    choice: 'assisted',
    timeframe: 'reply_to_email',
    admin_status: null,
  });
  assert.equal(urgent.key, 'urgent');
  assert.equal(urgent.label, 'Urgent');

  const done = adminResponseStatus({
    choice: 'assisted',
    timeframe: 'reply_to_email',
    admin_status: 'assistance_provided',
  });
  assert.equal(done.key, 'assistance_provided');
});
