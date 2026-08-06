/** Choices that use a timeframe → follow-up date (not "urgent"). */
export const FOLLOW_UP_CHOICES = new Set(['spreadsheet', 'upload_docs', 'specright']);

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(isoOrDate, days) {
  const base = toDateOnly(isoOrDate);
  if (!base) return null;
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Follow-up date the admin should act on, derived from vendor timeframe.
 * - this_week → 7 days after timeframe submission
 * - next_two_weeks → 14 days after timeframe submission
 * - YYYY-MM-DD → that date ("I need more time")
 * - assisted / reply_to_email → null (handled as Urgent)
 */
export function computeFollowUpDate(row) {
  if (!row?.choice || !FOLLOW_UP_CHOICES.has(row.choice)) return null;
  if (!row.timeframe) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(row.timeframe)) {
    return row.timeframe;
  }

  const anchor =
    row.timeframe_submitted_at || row.choice_submitted_at || row.last_updated_at;
  if (row.timeframe === 'this_week') return addDays(anchor, 7);
  if (row.timeframe === 'next_two_weeks') return addDays(anchor, 14);
  return null;
}

/**
 * Admin-facing status for the tracker.
 * @returns {{ key: string, label: string, follow_up_date: string|null, overdue: boolean }}
 */
export function adminResponseStatus(row) {
  const followUpDate = computeFollowUpDate(row);
  const today = toDateOnly(new Date());

  if (!row?.choice) {
    return {
      key: 'no_response',
      label: 'No response',
      follow_up_date: null,
      overdue: false,
    };
  }

  if (row.choice === 'assisted') {
    if (row.admin_status === 'assistance_provided') {
      return {
        key: 'assistance_provided',
        label: 'Assistance provided',
        follow_up_date: null,
        overdue: false,
      };
    }
    return {
      key: 'urgent',
      label: 'Urgent',
      follow_up_date: null,
      overdue: false,
    };
  }

  if (!row.timeframe) {
    return {
      key: 'choice_only',
      label: 'In progress',
      follow_up_date: null,
      overdue: false,
    };
  }

  if (followUpDate) {
    const overdue = followUpDate < today;
    return {
      key: overdue ? 'overdue' : 'follow_up',
      label: overdue ? `Overdue · ${followUpDate}` : `Follow up · ${followUpDate}`,
      follow_up_date: followUpDate,
      overdue,
    };
  }

  return {
    key: 'follow_up',
    label: 'Follow up',
    follow_up_date: null,
    overdue: false,
  };
}

export const ADMIN_STATUSES = ['urgent', 'assistance_provided'];
