import React, { useEffect, useState, useMemo } from 'react';
import { useFilters } from '../context/FiltersContext';
import { IssueType, QueueItem, ReportStatus, Severity } from '../types/api';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../lib/severity';
import { STATUS_LABELS } from '../lib/status';
import { exportClustersToCSV } from '../lib/csvExport';

interface MapFiltersProps {
  onRefresh: () => void;
  isFetching: boolean;
  rawClustersCount: number;
  filteredClustersCount: number;
  totalInSystem: number;
  isCapped?: boolean;
  clustersForExport?: QueueItem[];
}

const ISSUE_TYPES: { value: IssueType | ''; label: string }[] = [
  { value: '', label: 'All Categories' },
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
  { value: '', label: 'All Statuses' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'FIXED', label: 'Fixed (Resolved)' },
  { value: 'REJECTED', label: 'Rejected' },
];

export const MapFilters: React.FC<MapFiltersProps> = ({
  onRefresh,
  isFetching,
  rawClustersCount,
  filteredClustersCount,
  totalInSystem,
  isCapped = false,
  clustersForExport = [],
}) => {
  const {
    filters,
    setFilter,
    setSearch,
    resetFilters,
    removeFilter,
    hasActiveFilters,
  } = useFilters();

  // Local state for debounced search input (~250ms)
  const [localSearch, setLocalSearch] = useState(filters.search);

  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        setSearch(localSearch);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [localSearch, filters.search, setSearch]);

  // Count severities among the currently displayed clusters
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const c of clustersForExport) {
      if (counts[c.max_severity] !== undefined) {
        counts[c.max_severity]++;
      }
    }
    return counts;
  }, [clustersForExport]);

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-4 space-y-3.5">
      {/* Primary Filter Controls Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Free-text Search Box */}
        <div className="flex-1 min-w-[200px] max-w-[280px]">
          <label className="block text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Search
          </label>
          <div className="relative">
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search by type, notes, ID..."
              className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-8 pr-7 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <svg
              className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {localSearch && (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('');
                  setSearch('');
                }}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 text-xs focus:outline-none"
                title="Clear search"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Issue Type Select */}
        <div className="flex-1 min-w-[140px] max-w-[180px]">
          <label className="block text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Category
          </label>
          <select
            value={filters.issue_type || ''}
            onChange={(e) =>
              setFilter('issue_type', (e.target.value || undefined) as IssueType)
            }
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
        <div className="flex-1 min-w-[130px] max-w-[170px]">
          <label className="block text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Min Severity
          </label>
          <select
            value={filters.min_severity || ''}
            onChange={(e) =>
              setFilter('min_severity', (e.target.value || undefined) as Severity)
            }
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
        <div className="flex-1 min-w-[140px] max-w-[180px]">
          <label className="block text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Status
          </label>
          <select
            value={filters.status || ''}
            onChange={(e) =>
              setFilter('status', (e.target.value || undefined) as ReportStatus)
            }
            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer"
          >
            {STATUSES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>
        </div>

        {/* Checkbox: Sensitive Areas */}
        <div className="flex items-center space-x-2 pt-4">
          <input
            id="filter-sensitive"
            type="checkbox"
            checked={!!filters.near_sensitive_location}
            onChange={(e) =>
              setFilter('near_sensitive_location', e.target.checked || undefined)
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
              setFilter('include_closed', e.target.checked || undefined)
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

        {/* Action Buttons: Clear & Refresh & Export CSV */}
        <div className="ml-auto pt-4 flex items-center space-x-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center px-2.5 py-1.5 border border-red-200 text-xs font-semibold rounded-lg text-red-700 bg-red-50 hover:bg-red-100 transition focus:outline-none cursor-pointer"
              title="Reset all active filters"
            >
              Clear filters
            </button>
          )}

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

          <button
            type="button"
            onClick={() => exportClustersToCSV(clustersForExport)}
            disabled={clustersForExport.length === 0}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition shadow-2xs disabled:opacity-40 cursor-pointer"
            title="Export filtered clusters to CSV"
          >
            <svg
              className="w-3.5 h-3.5 mr-1.5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Removable Active Filter Chips & Summary Counts */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-gray-100 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-gray-700 mr-1">
            {filteredClustersCount} of {rawClustersCount} loaded ({totalInSystem} total in system):
          </span>

          {/* Active Chips */}
          {filters.search && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
              Search: "{filters.search}"
              <button
                type="button"
                onClick={() => removeFilter('search')}
                className="ml-1 text-gray-400 hover:text-gray-600 font-bold"
              >
                &times;
              </button>
            </span>
          )}

          {filters.issue_type && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-teal-50 text-teal-800 border border-teal-200">
              Type: {filters.issue_type}
              <button
                type="button"
                onClick={() => removeFilter('issue_type')}
                className="ml-1 text-teal-500 hover:text-teal-700 font-bold"
              >
                &times;
              </button>
            </span>
          )}

          {filters.min_severity && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-orange-50 text-orange-800 border border-orange-200">
              Min Severity: {filters.min_severity}
              <button
                type="button"
                onClick={() => removeFilter('min_severity')}
                className="ml-1 text-orange-500 hover:text-orange-700 font-bold"
              >
                &times;
              </button>
            </span>
          )}

          {filters.status && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
              Status: {STATUS_LABELS[filters.status]}
              <button
                type="button"
                onClick={() => removeFilter('status')}
                className="ml-1 text-blue-500 hover:text-blue-700 font-bold"
              >
                &times;
              </button>
            </span>
          )}

          {filters.near_sensitive_location && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-purple-50 text-purple-800 border border-purple-200">
              Sensitive Location
              <button
                type="button"
                onClick={() => removeFilter('near_sensitive_location')}
                className="ml-1 text-purple-500 hover:text-purple-700 font-bold"
              >
                &times;
              </button>
            </span>
          )}

          {filters.include_closed && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
              Closed Included
              <button
                type="button"
                onClick={() => removeFilter('include_closed')}
                className="ml-1 text-gray-500 hover:text-gray-700 font-bold"
              >
                &times;
              </button>
            </span>
          )}

          {/* Severity summary chips */}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-red-50 text-red-700 border border-red-200 ml-1">
            <span
              className="w-1.5 h-1.5 rounded-full mr-1"
              style={{ backgroundColor: SEVERITY_COLORS.CRITICAL }}
            />
            {SEVERITY_LABELS.CRITICAL}: {severityCounts.CRITICAL}
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <span
              className="w-1.5 h-1.5 rounded-full mr-1"
              style={{ backgroundColor: SEVERITY_COLORS.HIGH }}
            />
            {SEVERITY_LABELS.HIGH}: {severityCounts.HIGH}
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <span
              className="w-1.5 h-1.5 rounded-full mr-1"
              style={{ backgroundColor: SEVERITY_COLORS.MEDIUM }}
            />
            {SEVERITY_LABELS.MEDIUM}: {severityCounts.MEDIUM}
          </span>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span
              className="w-1.5 h-1.5 rounded-full mr-1"
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
