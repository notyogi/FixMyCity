import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError, getApiBaseUrl } from '../lib/apiClient';
import { HealthResponse, PriorityQueueResponse, QueueItem, Severity } from '../types/api';

/**
 * TODO: In upcoming tasks, this initial connection check page will be replaced
 * by the interactive Leaflet GIS map, full TanStack priority table, filtering
 * toolbar, and report inspection drawer.
 */

export const DashboardPage: React.FC = () => {
  const apiBaseUrl = getApiBaseUrl();

  // --------------------------------------------------------------------------
  // Query 1: Backend Health Check & Response Latency
  // --------------------------------------------------------------------------
  const {
    data: healthResult,
    isLoading: healthLoading,
    isError: healthIsError,
    error: healthError,
    refetch: refetchHealth,
    isFetching: healthFetching,
  } = useQuery({
    queryKey: ['health-check'],
    queryFn: async () => {
      const start = performance.now();
      const res = await apiClient<HealthResponse>('/health');
      const latencyMs = Math.round(performance.now() - start);
      return { status: res.status, latencyMs };
    },
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // --------------------------------------------------------------------------
  // Query 2: Priority Queue Top 5 Clusters
  // --------------------------------------------------------------------------
  const {
    data: queueResult,
    isLoading: queueLoading,
    isError: queueIsError,
    error: queueError,
    refetch: refetchQueue,
    isFetching: queueFetching,
  } = useQuery({
    queryKey: ['priority-queue-top5'],
    queryFn: () => apiClient<PriorityQueueResponse>('/reports/priority-queue?limit=5'),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const getSeverityBadgeClass = (severity: Severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIUM':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'LOW':
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Environment Context */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            System Connectivity & Priority Queue
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Phase 1 Scaffold Verification &bull; Connected to{' '}
            <code className="bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">
              {apiBaseUrl}
            </code>
          </p>
        </div>

        <div className="mt-4 sm:mt-0 flex items-center space-x-2">
          <button
            onClick={() => {
              refetchHealth();
              refetchQueue();
            }}
            disabled={healthFetching || queueFetching}
            className="inline-flex items-center px-3.5 py-2 border border-gray-300 shadow-2xs text-xs font-semibold rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition disabled:opacity-50 cursor-pointer"
          >
            <svg
              className={`w-3.5 h-3.5 mr-1.5 text-gray-500 ${
                healthFetching || queueFetching ? 'animate-spin' : ''
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
            Refresh Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ================================================================== */}
        {/* CARD 1: BACKEND STATUS                                             */}
        {/* ================================================================== */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Backend Status</h2>
              <span className="text-xs font-mono text-gray-400">GET /health</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Public health monitor and Express API reachability check.
            </p>

            <div className="mt-6 flex items-center space-x-3">
              {healthLoading ? (
                <div className="flex items-center space-x-2 text-gray-500 text-sm">
                  <div className="w-3 h-3 rounded-full bg-gray-400 animate-ping"></div>
                  <span>Probing API server...</span>
                </div>
              ) : healthIsError ? (
                <div className="flex items-center space-x-2">
                  <span className="h-3.5 w-3.5 rounded-full bg-red-500 flex-shrink-0"></span>
                  <span className="text-base font-bold text-red-600">Unreachable</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="h-3.5 w-3.5 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse"></span>
                  <span className="text-base font-bold text-emerald-700">Connected</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    200 OK
                  </span>
                </div>
              )}
            </div>

            {/* Metrics & Latency Details */}
            <div className="mt-6 pt-4 border-t border-gray-100 text-xs space-y-2 text-gray-600">
              <div className="flex justify-between">
                <span>Response Time:</span>
                <span className="font-mono font-medium text-gray-900">
                  {healthResult ? `${healthResult.latencyMs} ms` : healthLoading ? 'Measuring...' : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>API Endpoint:</span>
                <span className="font-mono text-gray-800 truncate max-w-[180px]" title={`${apiBaseUrl}/health`}>
                  {apiBaseUrl}/health
                </span>
              </div>
              {healthIsError && (
                <div className="mt-3 p-2.5 bg-red-50 rounded-lg text-red-700 text-xs">
                  {healthError instanceof ApiError
                    ? healthError.message
                    : healthError instanceof Error
                    ? healthError.message
                    : 'Failed to connect to backend service.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* CARD 2: PRIORITY QUEUE CONNECTION (TOP 5 CLUSTERS)                 */}
        {/* ================================================================== */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Ranked Priority Queue
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Top clusters ranked by severity, confirmations, location risk & days open.
                </p>
              </div>

              {queueResult && (
                <div className="text-right">
                  <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                    {queueResult.total} Total {queueResult.total === 1 ? 'Cluster' : 'Clusters'}
                  </span>
                </div>
              )}
            </div>

            {/* Status handling: Loading, 401, 403, Error, Empty, List */}
            <div className="mt-5">
              {queueLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-gray-500 font-medium">
                    Loading priority queue from Express backend...
                  </p>
                </div>
              ) : queueIsError ? (
                (() => {
                  const apiErr = queueError instanceof ApiError ? queueError : null;
                  const is403 = apiErr?.status === 403;
                  const is401 = apiErr?.status === 401;

                  return (
                    <div
                      className={`p-4 rounded-lg border ${
                        is403
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : is401
                          ? 'bg-red-50 border-red-300 text-red-900'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      <div className="flex items-start">
                        <svg
                          className={`w-5 h-5 mr-2.5 flex-shrink-0 mt-0.5 ${
                            is403 ? 'text-amber-600' : 'text-red-500'
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
                          <p className="text-sm font-bold">
                            {is403
                              ? 'Admin Privileges Required (HTTP 403)'
                              : is401
                              ? 'Authentication Error (HTTP 401)'
                              : 'Priority Queue Request Failed'}
                          </p>
                          <p className="text-xs mt-1 leading-relaxed">
                            {is403
                              ? 'Your account authenticated with Supabase, but your User UUID is not listed in the backend ADMIN_USER_IDS configuration.'
                              : apiErr?.message || (queueError as Error)?.message || 'Unknown network error'}
                          </p>
                          <div className="mt-3">
                            <button
                              onClick={() => refetchQueue()}
                              className="text-xs font-semibold px-2.5 py-1 bg-white border border-gray-300 rounded shadow-2xs hover:bg-gray-50 text-gray-800 cursor-pointer"
                            >
                              Retry Request
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : queueResult?.data.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <p className="text-sm font-medium text-gray-600">No active clusters in queue</p>
                  <p className="text-xs text-gray-400 mt-1">
                    When citizens submit and confirm reports, aggregated clusters will appear ranked here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-left">
                    <thead>
                      <tr className="text-2xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-50">
                        <th className="py-2.5 px-3">Rank & Cluster ID</th>
                        <th className="py-2.5 px-3">Issue Type</th>
                        <th className="py-2.5 px-3">Max Severity</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs">
                      {queueResult?.data.map((item: QueueItem, index: number) => (
                        <tr key={item.cluster_id} className="hover:bg-gray-50 transition">
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-700 text-2xs flex items-center justify-center font-bold">
                                #{index + 1}
                              </span>
                              <span
                                className="font-mono text-gray-700 text-2xs truncate max-w-[120px]"
                                title={item.cluster_id}
                              >
                                {item.cluster_id.substring(0, 8)}...
                              </span>
                              {item.near_sensitive_location && (
                                <span
                                  className="text-2xs font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200"
                                  title="Flagged near school, hospital, or sensitive area"
                                >
                                  Risk
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap font-medium text-gray-800">
                            {item.issue_type}
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 text-2xs font-bold rounded-full border ${getSeverityBadgeClass(
                                item.max_severity
                              )}`}
                            >
                              {item.max_severity}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap text-gray-600">
                            {item.status}
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap text-right">
                            <span className="font-extrabold text-teal-700 text-sm">
                              {Number(item.priority_score).toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Metadata Footer */}
          {queueResult?.meta && (
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between text-2xs text-gray-500">
              <span>
                Scores Refreshed: {new Date(queueResult.meta.scores_refreshed_at).toLocaleTimeString()}
              </span>
              <span>
                Unclustered Active Reports: {queueResult.meta.unclustered_active_reports}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

