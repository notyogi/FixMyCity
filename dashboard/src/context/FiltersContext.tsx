import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IssueType, ReportStatus, Severity } from '../types/api';
import { PriorityQueueFilters } from '../hooks/usePriorityQueue';

export interface DashboardFilters extends PriorityQueueFilters {
  search: string;
}

interface FiltersContextType {
  filters: DashboardFilters;
  apiFilters: PriorityQueueFilters;
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
  removeFilter: (key: keyof DashboardFilters) => void;
  hasActiveFilters: boolean;
}

const VALID_STATUSES: readonly ReportStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'SCHEDULED',
  'FIXED',
  'REJECTED',
] as const;

const VALID_ISSUE_TYPES: readonly IssueType[] = [
  'POTHOLE',
  'STREETLIGHT',
  'GARBAGE',
  'DRAINAGE',
  'TRAFFIC_SIGNAL',
  'SIDEWALK',
  'OTHER',
] as const;

const VALID_SEVERITIES: readonly Severity[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

const FiltersContext = createContext<FiltersContextType | undefined>(undefined);

export const FiltersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse filters from URL with fallback validation
  const filters: DashboardFilters = useMemo(() => {
    const rawStatus = searchParams.get('status');
    const rawIssueType = searchParams.get('issue_type');
    const rawMinSeverity = searchParams.get('min_severity');
    const rawNearSensitive = searchParams.get('near_sensitive_location');
    const rawIncludeClosed = searchParams.get('include_closed');
    const rawSearch = searchParams.get('search') || '';

    const status =
      rawStatus && VALID_STATUSES.includes(rawStatus as ReportStatus)
        ? (rawStatus as ReportStatus)
        : undefined;

    const issue_type =
      rawIssueType && VALID_ISSUE_TYPES.includes(rawIssueType as IssueType)
        ? (rawIssueType as IssueType)
        : undefined;

    const min_severity =
      rawMinSeverity && VALID_SEVERITIES.includes(rawMinSeverity as Severity)
        ? (rawMinSeverity as Severity)
        : undefined;

    const near_sensitive_location = rawNearSensitive === 'true' ? true : undefined;
    const include_closed = rawIncludeClosed === 'true' ? true : undefined;

    return {
      status,
      issue_type,
      min_severity,
      near_sensitive_location,
      include_closed,
      search: rawSearch,
    };
  }, [searchParams]);

  // Derived API-only filters (omits client-side search)
  const apiFilters: PriorityQueueFilters = useMemo(() => {
    return {
      status: filters.status,
      issue_type: filters.issue_type,
      min_severity: filters.min_severity,
      near_sensitive_location: filters.near_sensitive_location,
      include_closed: filters.include_closed,
    };
  }, [filters]);

  // Helper to update URL search params
  const setFilter = useCallback(
    <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === undefined || value === '' || value === false) {
            next.delete(key);
          } else {
            next.set(key, String(value));
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setSearch = useCallback(
    (search: string) => {
      setFilter('search', search);
    },
    [setFilter]
  );

  const removeFilter = useCallback(
    (key: keyof DashboardFilters) => {
      setFilter(key, key === 'search' ? '' : undefined);
    },
    [setFilter]
  );

  const resetFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.status ||
      filters.issue_type ||
      filters.min_severity ||
      filters.near_sensitive_location ||
      filters.include_closed ||
      filters.search.trim().length > 0
    );
  }, [filters]);

  return (
    <FiltersContext.Provider
      value={{
        filters,
        apiFilters,
        setFilter,
        setSearch,
        resetFilters,
        removeFilter,
        hasActiveFilters,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
};

export function useFilters(): FiltersContextType {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error('useFilters must be used within a FiltersProvider');
  }
  return context;
}

