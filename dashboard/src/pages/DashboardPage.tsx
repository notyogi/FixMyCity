import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError, getApiBaseUrl } from '../lib/apiClient';
import { HealthResponse } from '../types/api';
import { PriorityQueueFilters, usePriorityQueue } from '../hooks/usePriorityQueue';
import { SelectionProvider } from '../context/SelectionContext';
import { MapFilters } from '../components/MapFilters';
import { ClusterMap } from '../components/ClusterMap';
import { SelectedClusterCard } from '../components/SelectedClusterCard';

interface DashboardContentProps {
  filters: PriorityQueueFilters;
  setFilters: React.Dispatch<React.SetStateAction<PriorityQueueFilters>>;
  queueData: ReturnType<typeof usePriorityQueue>;
}

/**
 * DashboardContent
 * Renders the Map Filters, Interactive Leaflet Cluster Map, and Selected Cluster Card.
 */
const DashboardContent: React.FC<DashboardContentProps> = ({
  filters,
  setFilters,
  queueData,
}) => {
  const apiBaseUrl = getApiBaseUrl();

  // --------------------------------------------------------------------------
  // Backend Health Ping (Shrunk to compact header badge)
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

  const {
    clusters,
    total,
    isCapped,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = queueData;

  return (
    <div className="space-y-5">
      {/* Page Header with Compact Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-gray-200 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            Municipal Incident Map & Prioritization
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Geospatial hazard clusters ranked by hazard severity, crowd confirmations & location risk.
          </p>
        </div>

        {/* Compact Backend Health Badge */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {healthLoading ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-ping mr-1.5" />
              Checking API...
            </span>
          ) : healthError ? (
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-semibold bg-red-50 text-red-700 border border-red-200 cursor-help"
              title={`API unreachable at ${apiBaseUrl}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />
              Backend Offline
            </span>
          ) : (
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
              title={`Connected to ${apiBaseUrl}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
              API Connected ({healthData?.latencyMs}ms)
            </span>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <MapFilters
        filters={filters}
        onChange={setFilters}
        onRefresh={() => refetch()}
        isFetching={isFetching}
        clusters={clusters}
        total={total}
        isCapped={isCapped}
      />

      {/* Main Map Presentation Layer */}
      {isLoading ? (
        /* Loading Skeleton for Map Container */
        <div className="w-full h-[60vh] md:h-[calc(100vh-280px)] min-h-[480px] rounded-xl border border-gray-200 bg-gray-100 flex flex-col items-center justify-center animate-pulse">
          <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs font-semibold text-gray-600">
            Loading civic hazard clusters...
          </p>
          <p className="text-2xs text-gray-400 mt-1">
            Retrieving spatial coordinates and priority scores
          </p>
        </div>
      ) : isError ? (
        /* Error States (including explicit 403 & 401 handling) */
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
                      className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 shadow-2xs hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                    >
                      Retry Request
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        /* Render Leaflet Map */
        <ClusterMap clusters={clusters} isLoading={isFetching} />
      )}

      {/* Selected Cluster Detail Placeholder Card */}
      <SelectedClusterCard />
    </div>
  );
};

export const DashboardPage: React.FC = () => {
  const [filters, setFilters] = useState<PriorityQueueFilters>({});
  const queueData = usePriorityQueue(filters);

  return (
    <SelectionProvider clusters={queueData.clusters}>
      <DashboardContent
        filters={filters}
        setFilters={setFilters}
        queueData={queueData}
      />
    </SelectionProvider>
  );
};
