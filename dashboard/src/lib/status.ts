import { ReportStatus } from '../types/api';

/**
 * Status workflow progression, rank mapping for custom sorting, and UI badge styles.
 */

export const STATUS_WORKFLOW_ORDER: readonly ReportStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'SCHEDULED',
  'FIXED',
  'REJECTED',
] as const;

export const STATUS_WORKFLOW_RANKS: Record<ReportStatus, number> = {
  SUBMITTED: 1,
  UNDER_REVIEW: 2,
  SCHEDULED: 3,
  FIXED: 4,
  REJECTED: 5,
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  SCHEDULED: 'Scheduled',
  FIXED: 'Fixed',
  REJECTED: 'Rejected',
};

export const STATUS_BADGE_CLASSES: Record<ReportStatus, string> = {
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-purple-50 text-purple-700 border-purple-200',
  SCHEDULED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  FIXED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-gray-100 text-gray-600 border-gray-200',
};

