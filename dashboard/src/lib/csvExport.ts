import { QueueItem } from '../types/api';

/**
 * Exports currently filtered and sorted clusters to a CSV file.
 */
export function exportClustersToCSV(clusters: QueueItem[]): void {
  const headers = [
    'cluster_id',
    'issue_type',
    'max_severity',
    'priority_score',
    'confirmation_count',
    'days_open',
    'status',
    'near_sensitive_location',
    'lat',
    'lng',
  ];

  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined) return '""';
    const stringValue = String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const rows = clusters.map((c) => [
    escapeCSV(c.cluster_id),
    escapeCSV(c.issue_type),
    escapeCSV(c.max_severity),
    escapeCSV(c.priority_score.toFixed(2)),
    escapeCSV(c.confirmation_count),
    escapeCSV(c.days_open),
    escapeCSV(c.status),
    escapeCSV(c.near_sensitive_location ? 'TRUE' : 'FALSE'),
    escapeCSV(c.centroid.lat.toFixed(5)),
    escapeCSV(c.centroid.lng.toFixed(5)),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const today = new Date().toISOString().split('T')[0];
  const filename = `fixmycity-priority-queue-${today}.csv`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

