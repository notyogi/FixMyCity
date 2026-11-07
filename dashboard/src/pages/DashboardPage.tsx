import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError, getApiBaseUrl } from '../lib/apiClient';
import { HealthResponse } from '../types/api';
import { usePriorityQueue } from '../hooks/usePriorityQueue';
import { SelectionProvider } from '../context/SelectionContext';
import { FiltersProvider, useFilters } from '../context/FiltersContext';
import { MapFilters } from '../components/MapFilters';
import { ClusterMap } from '../components/ClusterMap';
import { ClusterTable } from '../components/ClusterTable';
import { ClusterDetailPanel } from '../components/ClusterDetailPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';

type ViewMode = 'split' | 'map' | 'table';

const DashboardContent: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const apiBaseUrl = getApiBaseUrl();

  const { filters, apiFilters, resetFilters, hasActiveFilters } = useFilters();

  // --------------------------------------------------------------------------
  // Backend Health Ping (Compact Header Badge)
  // --------------------------------------------------------------------------
  const {
    data: healthData,
    isLoading: healthLoading,
    isError: healthError,
  } = useQuery({
    queryKey: ['backend-health-ping'],
    queryFn: async () => {
      const start = performance.now();
      const res = await apiClient<HealthResponse>('/health');
      const latencyMs = Math.round(performance.now() - start);
      return { status: res.status, latencyMs };
    },
    staleTime: 30 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // --------------------------------------------------------------------------
  // Fetch All Priority Queue Clusters via React Query
  // --------------------------------------------------------------------------
  const {
    clusters: rawClusters,
    total,
    isCapped,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = usePriorityQueue(apiFilters);

  // --------------------------------------------------------------------------
  // Client-Side Search Filtering (matches issue type, notes, or cluster ID)
  // --------------------------------------------------------------------------
  const filteredClusters = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    if (!query) return rawClusters;

    return rawClusters.filter((c) => {
      const matchesType = c.issue_type.toLowerCase().includes(query);
      const matchesId = c.cluster_id.toLowerCase().includes(query);
      const matchesNotes = c.representative_report?.notes
        ? c.representative_report.notes.toLowerCase().includes(query)
        : false;

      return matchesType || matchesId || matchesNotes;
    });
  }, [rawClusters, filters.search]);

  return (
    <div className="space-y-5">
      {/* Page Header: Title, Health Badge, View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-3 border-b border-gray-200 gap-3">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Incident Prioritization & Geospatial Queue
            </h1>

            {/* Compact Backend Health Badge */}
            {healthLoading ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-ping mr-1" />
                Checking...
              </span>
            ) : healthError ? (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-red-50 text-red-700 border border-red-200"
                title={`API offline at ${apiBaseUrl}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1" />
                Offline
              </span>
            ) : (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                title={`Connected to ${apiBaseUrl}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                Connected ({healthData?.latencyMs}ms)
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Unified incident triage: spatial cluster mapping and sortable prioritization queue.
          </p>
        </div>

        {/* View Switcher Controls (Map / Table / Split) */}
        <div className="self-start md:self-auto flex items-center space-x-2">
          <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-0.5 text-xs font-semibold shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-white text-teal-700 font-bold shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Split View: Map and Table side-by-side"
            >
              ◫ Split
            </button>

            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-white text-teal-700 font-bold shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Map Only View"
            >
              🗺️ Map
            </button>

            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-teal-700 font-bold shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Table Only View"
            >
              📋 Table
            </button>
          </div>
        </div>
      </div>

      {/* Shared Filter Toolbar (Appears once for all views) */}
      <MapFilters
        onRefresh={() => refetch()}
        isFetching={isFetching}
        rawClustersCount={rawClusters.length}
        filteredClustersCount={filteredClusters.length}
        totalInSystem={total}
        isCapped={isCapped}
        clustersForExport={filteredClusters}
      />

      {/* Primary Content Presentation */}
      {isLoading ? (
        /* Loading Skeleton */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="w-full h-[520px] rounded-xl border border-gray-200 bg-gray-100 flex flex-col items-center justify-center animate-pulse">
            <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs font-semibold text-gray-600">Loading spatial map...</p>
          </div>
          <div className="w-full h-[520px] rounded-xl border border-gray-200 bg-white p-6 space-y-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-1/3"></div>
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      ) : isError ? (
        /* Error States (including 403 & 401 handling) */
        (() => {
          const apiErr = error instanceof ApiError ? error : null;
          const is403 = apiErr?.status === 403;
          const is401 = apiErr?.status === 401;

          return (
            <div
              className={`p-6 rounded-xl border ${
                is403
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : is401
                  ? 'bg-red-50 border-red-300 text-red-900'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-start space-x-3">
                <svg
                  className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
                    is403 ? 'text-amber-600' : 'text-red-600'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <h3 className="text-sm font-bold">
                    {is403
                      ? 'Admin Privileges Required (HTTP 403)'
                      : is401
                      ? 'Authentication Session Required (HTTP 401)'
                      : 'Unable to load priority queue'}
                  </h3>
                  <p className="text-xs mt-1 leading-relaxed">
                    {is403
                      ? 'Your account does not have admin access. Please ensure your Supabase user UUID is included in the backend ADMIN_USER_IDS configuration.'
                      : apiErr?.message || (error as Error)?.message || 'An error occurred while fetching data.'}
                  </p>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="inline-flex items-center px-3.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 shadow-2xs hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                    >
                      Retry Request
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      ) : filteredClusters.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-gray-800">
            {hasActiveFilters ? 'No clusters match your active filters' : 'No clusters recorded in system'}
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try relaxing your search terms, minimum severity level, or status filters.'
              : 'As citizen reports are received and confirmed, aggregated incident clusters will populate here.'}
          </p>
          {hasActiveFilters && (
            <div className="mt-4">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Active View Modes (Split / Map / Table) */
        <div className="space-y-5">
          {viewMode === 'split' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {/* Map Panel */}
              <div className="w-full">
                <ClusterMap clusters={filteredClusters} isLoading={isFetching} />
              </div>

              {/* Table Panel */}
              <div className="w-full">
                <ClusterTable clusters={filteredClusters} isLoading={isFetching} />
              </div>
            </div>
          ) : viewMode === 'map' ? (
            <div className="w-full">
              <ClusterMap clusters={filteredClusters} isLoading={isFetching} />
            </div>
          ) : (
            <div className="w-full">
              <ClusterTable clusters={filteredClusters} isLoading={isFetching} />
            </div>
          )}
        </div>
      )}

      {/* Interactive Cluster Detail Slide-over Drawer */}
      <ErrorBoundary>
        <ClusterDetailPanel />
      </ErrorBoundary>
    </div>
  );
};

const DashboardPageContainer: React.FC = () => {
  const { apiFilters } = useFilters();
  const { clusters } = usePriorityQueue(apiFilters);

  return (
    <SelectionProvider clusters={clusters}>
      <DashboardContent />
    </SelectionProvider>
  );
};

export const DashboardPage: React.FC = () => {
  return (
    <FiltersProvider>
      <DashboardPageContainer />
    </FiltersProvider>
  );
};
