import React, { useMemo } from 'react';
import { PriorityQueueFilters } from '../hooks/usePriorityQueue';
import { IssueType, QueueItem, ReportStatus, Severity } from '../types/api';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../lib/severity';

interface MapFiltersProps {
  filters: PriorityQueueFilters;
  onChange: (filters: PriorityQueueFilters) => void;
  onRefresh: () => void;
  isFetching: boolean;
  clusters: QueueItem[];
  total: number;
  isCapped?: boolean;
}

const ISSUE_TYPES: { value: IssueType | ''; label: string }[] = [
  { value: '', label: 'All Issue Types' },
  { value: 'POTHOLE', label: 'Pothole' },
  { value: 'STREETLIGHT', label: 'Streetlight' },
  { value: 'GARBAGE', label: 'Garbage' },
  { value: 'DRAINAGE', label: 'Drainage' },
  { value: 'TRAFFIC_SIGNAL', label: 'Traffic Signal' },
  { value: 'SIDEWALK', label: 'Sidewalk' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITIES: { value: Severity | ''; label: string }[] = [
  { value: '', label: 'Any Severity' },
  { value: 'LOW', label: 'Low+' },
  { value: 'MEDIUM', label: 'Medium+' },
  { value: 'HIGH', label: 'High+' },
  { value: 'CRITICAL', label: 'Critical Only' },
];

const STATUSES: { value: ReportStatus | ''; label: string }[] = [
  { value: '', label: 'Active Reports (All)' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'FIXED', label: 'Fixed (Resolved)' },
  { value: 'REJECTED', label: 'Rejected' },
];

export const MapFilters: React.FC<MapFiltersProps> = ({
  filters,
  onChange,
  onRefresh,
  isFetching,
  clusters,
  total,
  isCapped = false,
}) => {
  // Count current clusters per severity
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const c of clusters) {
      if (counts[c.max_severity] !== undefined) {
        counts[c.max_severity]++;
      }
    }
    return counts;
  }, [clusters]);

  const handleSelectChange = (
    key: keyof PriorityQueueFilters,
    value: string
  ) => {
    onChange({
      ...filters,
      [key]: value === '' ? undefined : value,
    });
  };

  const handleCheckboxChange = (
    key: keyof PriorityQueueFilters,
    checked: boolean
  ) => {
    onChange({
      ...filters,
      [key]: checked || undefined,
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-4 space-y-3.5">
      {/* Top Filter Controls Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Issue Type Select */}
        <div className="flex-1 min-w-[150px] max-w-[200px]">
          <label className="block text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Category
          </label>
          <select
            value={filters.issue_type || ''}
            onChange={(e) => handleSelectChange('issue_type', e.target.value)}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer"
          >
            {ISSUE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Min Severity Select */}
        <div className="flex-1 min-w-[140px] max-w-[180px]">
          <label className="block text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Min Severity
          </label>
          <select
            value={filters.min_severity || ''}
            onChange={(e) => handleSelectChange('min_severity', e.target.value)}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer"
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status Select */}
        <div className="flex-1 min-w-[160px] max-w-[200px]">
          <label className="block text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Status
          </label>
          <select
            value={filters.status || ''}
            onChange={(e) => handleSelectChange('status', e.target.value)}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer"
          >
            {STATUSES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>
        </div>

        {/* Checkbox: Sensitive Location */}
        <div className="flex items-center space-x-2 pt-4">
          <input
            id="filter-sensitive"
            type="checkbox"
            checked={!!filters.near_sensitive_location}
            onChange={(e) =>
              handleCheckboxChange('near_sensitive_location', e.target.checked)
            }
            className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded cursor-pointer"
          />
          <label
            htmlFor="filter-sensitive"
            className="text-xs font-medium text-gray-700 cursor-pointer select-none"
          >
            Near Sensitive Areas
          </label>
        </div>

        {/* Checkbox: Include Closed */}
        <div className="flex items-center space-x-2 pt-4">
          <input
            id="filter-closed"
            type="checkbox"
            checked={!!filters.include_closed}
            onChange={(e) =>
              handleCheckboxChange('include_closed', e.target.checked)
            }
            className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded cursor-pointer"
          />
          <label
            htmlFor="filter-closed"
            className="text-xs font-medium text-gray-700 cursor-pointer select-none"
          >
            Include Closed
          </label>
        </div>

        {/* Refresh Button */}
        <div className="ml-auto pt-4 flex items-center space-x-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isFetching}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition shadow-2xs disabled:opacity-50 cursor-pointer"
            title="Refresh clusters from API"
          >
            <svg
              className={`w-3.5 h-3.5 mr-1.5 text-gray-500 ${
                isFetching ? 'animate-spin' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Chips Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-gray-100 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-700">
            Showing {clusters.length} of {total} {total === 1 ? 'cluster' : 'clusters'}:
          </span>

          {/* Severity summary chips */}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <span
              className="w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: SEVERITY_COLORS.CRITICAL }}
            />
            {SEVERITY_LABELS.CRITICAL}: {severityCounts.CRITICAL}
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <span
              className="w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: SEVERITY_COLORS.HIGH }}
            />
            {SEVERITY_LABELS.HIGH}: {severityCounts.HIGH}
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <span
              className="w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: SEVERITY_COLORS.MEDIUM }}
            />
            {SEVERITY_LABELS.MEDIUM}: {severityCounts.MEDIUM}
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span
              className="w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: SEVERITY_COLORS.LOW }}
            />
            {SEVERITY_LABELS.LOW}: {severityCounts.LOW}
          </span>
        </div>

        {isCapped && (
          <span className="text-2xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
            Displaying first 500 clusters (safety cap)
          </span>
        )}
      </div>
    </div>
  );
};

