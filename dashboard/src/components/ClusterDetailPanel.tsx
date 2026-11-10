import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useSelection } from '../context/SelectionContext';
import { useFilters } from '../context/FiltersContext';
import { useClusterDetail } from '../hooks/useClusterDetail';
import { useUpdateClusterStatus } from '../hooks/useUpdateClusterStatus';
import { ReportStatus, Severity, ClusterReport, ClusterDetail } from '../types/api';
import {
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  SEVERITY_BADGE_CLASSES,
} from '../lib/severity';
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from '../lib/status';
import { ApiError } from '../lib/apiClient';

// Allowed Phase 1 status transitions matching backend rules
const VALID_NEXT_STATUSES: Record<ReportStatus, ReportStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'SCHEDULED', 'FIXED', 'REJECTED'],
  UNDER_REVIEW: ['SCHEDULED', 'FIXED', 'REJECTED'],
  SCHEDULED: ['FIXED', 'REJECTED'],
  FIXED: [],
  REJECTED: [],
};

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(dateStr);
  }
}

/**
 * Isolated MiniMap Component
 * Uses native Leaflet with explicit map.remove() on cleanup to avoid
 * React-Leaflet MapContainer remount crashes / StrictMode double-initialization.
 */
const MiniMap: React.FC<{
  lat: number;
  lng: number;
  severity: Severity;
}> = ({ lat, lng, severity }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Destroy any existing instance before mounting
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(el, {
        center: [lat, lng],
        zoom: 15,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      L.circleMarker([lat, lng], {
        radius: 9,
        fillColor: SEVERITY_COLORS[severity] || '#eab308',
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 2,
      }).addTo(map);

      mapInstanceRef.current = map;
    } catch (err) {
      console.warn('[MiniMap] Failed to initialize Leaflet mini-map:', err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lng, severity]);

  return <div ref={containerRef} className="w-full h-full" />;
};

export const ClusterDetailPanel: React.FC = () => {
  const { selectedClusterId, setSelectedClusterId, selectedCluster } = useSelection();
  const { filters, setFilter } = useFilters();
  const panelRef = useRef<HTMLDivElement>(null);

  // Detail query and update mutation
  const {
    data: fetchedCluster,
    isLoading,
    isError,
    error,
    refetch,
  } = useClusterDetail(selectedClusterId);

  const updateMutation = useUpdateClusterStatus();

  // Local state for active photo view, photo lightbox, status select, confirm dialog & copy feedback
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ReportStatus | ''>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [markAsSpam, setMarkAsSpam] = useState(true);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [showAllReports, setShowAllReports] = useState(false);
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  // Fallback cluster representation derived from priority queue item if detail query is in-flight or 404
  const cluster = useMemo<ClusterDetail | null>(() => {
    if (fetchedCluster) return fetchedCluster;
    if (!selectedCluster) return null;

    return {
      id: selectedCluster.cluster_id,
      centroid_lat: selectedCluster.centroid.lat,
      centroid_lng: selectedCluster.centroid.lng,
      confirmation_count: selectedCluster.confirmation_count,
      priority_score: selectedCluster.priority_score,
      created_at: selectedCluster.oldest_report_created_at,
      updated_at: selectedCluster.oldest_report_created_at,
      issue_type: selectedCluster.issue_type,
      max_severity: selectedCluster.max_severity,
      current_status: selectedCluster.status,
      days_open: selectedCluster.days_open,
      near_sensitive_location: selectedCluster.near_sensitive_location,
      report_count: selectedCluster.report_count,
      reports: selectedCluster.representative_report
        ? [
            {
              id: selectedCluster.representative_report.id,
              image_url: selectedCluster.representative_report.image_url,
              notes: selectedCluster.representative_report.notes,
              lat: selectedCluster.centroid.lat,
              lng: selectedCluster.centroid.lng,
              issue_type: selectedCluster.issue_type,
              severity: selectedCluster.max_severity,
              status: selectedCluster.status,
              near_sensitive_location: selectedCluster.near_sensitive_location,
              created_at: selectedCluster.representative_report.created_at,
              reporter: {
                id: '',
                name: 'Citizen Reporter',
              },
            },
          ]
        : [],
      confirmations: [],
    };
  }, [fetchedCluster, selectedCluster]);

  // Clear toast when switching selected clusters
  useEffect(() => {
    setSuccessToast(null);
  }, [selectedClusterId]);

  // Reset local state when cluster changes
  useEffect(() => {
    if (cluster) {
      setSelectedStatus(cluster.current_status);
      setShowConfirmModal(false);
      setMarkAsSpam(true);

      // Default active photo to representative report (highest severity, earliest)
      const sorted = [...(cluster.reports || [])].sort((a, b) => {
        const diff = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
        if (diff !== 0) return diff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      setActiveReportId(sorted[0]?.id || null);
    }
  }, [cluster?.id, cluster?.current_status]);

  // Keyboard accessibility: Escape to close drawer / modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLightboxOpen) {
          setIsLightboxOpen(false);
        } else if (showConfirmModal) {
          setShowConfirmModal(false);
        } else {
          setSelectedClusterId(null);
        }
      }
    };
    if (selectedClusterId) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedClusterId, isLightboxOpen, showConfirmModal, setSelectedClusterId]);

  // Focus panel on open
  useEffect(() => {
    if (selectedClusterId && panelRef.current) {
      panelRef.current.focus();
    }
  }, [selectedClusterId]);

  // Find active report photo (called unconditionally before early return)
  const activeReport = useMemo(() => {
    if (!cluster?.reports || cluster.reports.length === 0) return null;
    return (
      cluster.reports.find((r) => r.id === activeReportId) ||
      cluster.reports[0]
    );
  }, [cluster?.reports, activeReportId]);

  // Allowed transitions from current status
  const allowedNextStatuses = cluster
    ? VALID_NEXT_STATUSES[cluster.current_status] || []
    : [];

  const isClosed =
    cluster?.current_status === 'FIXED' || cluster?.current_status === 'REJECTED';

  const activeReportsCount = useMemo(() => {
    if (!cluster?.reports) return 0;
    return cluster.reports.filter((r) => r.status !== 'FIXED' && r.status !== 'REJECTED')
      .length;
  }, [cluster?.reports]);

  // Early return after all hooks are evaluated
  if (!selectedClusterId) {
    return null;
  }

  // Copy coordinates handler
  const handleCopyCoords = () => {
    if (!cluster) return;
    const text = `${cluster.centroid_lat.toFixed(5)}, ${cluster.centroid_lng.toFixed(5)}`;
    navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  // Submit status update
  const handleExecuteStatusUpdate = async (statusToSet: ReportStatus, spamFlag?: boolean) => {
    if (!cluster) return;
    setShowConfirmModal(false);

    try {
      const updated = await updateMutation.mutateAsync({
        clusterId: cluster.id,
        status: statusToSet,
        ...(statusToSet === 'REJECTED' ? { spam: spamFlag ?? true } : {}),
      });

      const repChanges = updated?.reputation_changes;
      const repNote =
        typeof repChanges === 'number'
          ? ` (${repChanges} ${repChanges === 1 ? "reporter's reputation" : "reporters' reputations"} changed)`
          : '';

      setSuccessToast(
        `Cluster status successfully updated to ${STATUS_LABELS[statusToSet] || statusToSet}.${repNote}`
      );
      setTimeout(() => setSuccessToast(null), 5000);
    } catch {
      // Revert dropdown to previous status
      setSelectedStatus(cluster.current_status);
    }
  };

  const handleUpdateClick = () => {
    if (!selectedStatus || selectedStatus === cluster?.current_status) return;

    // Show confirmation dialog for terminal statuses (FIXED / REJECTED)
    if (selectedStatus === 'FIXED' || selectedStatus === 'REJECTED') {
      setMarkAsSpam(true);
      setShowConfirmModal(true);
    } else {
      handleExecuteStatusUpdate(selectedStatus);
    }
  };

  // Reports to display (capped at 5 with toggle)
  const displayedReports = showAllReports
    ? cluster?.reports || []
    : (cluster?.reports || []).slice(0, 5);

  const apiError = isError && error instanceof ApiError ? error : null;
  const is404 = apiError?.status === 404;
  const is403 = apiError?.status === 403;

  return (
    <>
      {/* Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
        onClick={() => setSelectedClusterId(null)}
        aria-hidden="true"
      />

      {/* Slide-over Drawer (Right on Desktop, Full-width / Bottom sheet on Mobile) */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Incident Cluster Detail"
        className="fixed inset-y-0 right-0 w-full sm:w-[500px] md:w-[560px] z-50 bg-white shadow-2xl flex flex-col border-l border-gray-200 focus:outline-none animate-in slide-in-from-right duration-200"
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <h2 className="text-base font-bold text-gray-900 tracking-tight">
              Cluster Details
            </h2>
            <span className="font-mono text-2xs text-gray-500 bg-gray-200/70 px-1.5 py-0.5 rounded">
              #{selectedClusterId.slice(0, 8)}
            </span>
            {isLoading && (
              <span className="text-2xs text-teal-600 font-semibold animate-pulse">
                • Syncing...
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSelectedClusterId(null)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition cursor-pointer"
            aria-label="Close cluster details panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {!cluster && isLoading ? (
            /* Loading Skeleton when neither fetched cluster nor cached queue item exists */
            <div className="space-y-4 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/2" />
              <div className="h-48 bg-gray-200 rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 bg-gray-100 rounded-lg" />
                <div className="h-16 bg-gray-100 rounded-lg" />
                <div className="h-16 bg-gray-100 rounded-lg" />
                <div className="h-16 bg-gray-100 rounded-lg" />
              </div>
              <div className="h-28 bg-gray-100 rounded-lg" />
            </div>
          ) : !cluster && isError ? (
            /* Absolute Not Found State (when not in priority queue and API returned error) */
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-gray-900">
                {is404
                  ? 'Cluster Not Found'
                  : is403
                  ? 'Access Denied (HTTP 403)'
                  : 'Failed to Load Cluster'}
              </h3>
              <p className="text-xs text-gray-500 max-w-xs mx-auto">
                {is404
                  ? 'This cluster may have been removed or merged into another incident.'
                  : is403
                  ? 'Your account lacks administrative permissions to inspect this cluster.'
                  : (error as Error)?.message || 'An error occurred while loading cluster data.'}
              </p>
              <div className="pt-2 flex justify-center space-x-2">
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 cursor-pointer"
                >
                  Retry Loading
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedClusterId(null)}
                  className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-gray-700 cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          ) : cluster ? (
            <>
              {/* Notice if cluster detail endpoint returned 404 (Render waiting for git deployment) */}
              {!fetchedCluster && isError && (
                <div className="bg-sky-50 border border-sky-200 text-sky-800 px-3.5 py-2.5 rounded-xl text-xs space-y-1">
                  <div className="flex items-center space-x-2 font-semibold">
                    <span>ℹ️</span>
                    <span>Displaying summary from priority queue</span>
                  </div>
                  <p className="text-2xs text-sky-700 leading-relaxed">
                    Live endpoint <code className="bg-sky-100 px-1 py-0.5 rounded">GET /api/v1/reports/clusters/:id</code> returned 404 on current backend. Commit and push backend code to activate full report duplicate history and status actions.
                  </p>
                </div>
              )}

              {/* Closed Status Notice if currently hidden from default queue */}
              {isClosed && !filters.include_closed && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-amber-600 font-bold">ℹ️</span>
                    <span>Closed cluster hidden from the active priority queue.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilter('include_closed', true)}
                    className="underline font-semibold hover:text-amber-900 ml-2 text-2xs cursor-pointer"
                  >
                    Include Closed
                  </button>
                </div>
              )}

              {/* Success Toast */}
              {successToast && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
                  <div className="flex items-center space-x-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span className="font-medium">{successToast}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSuccessToast(null)}
                    className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
                  >
                    &times;
                  </button>
                </div>
              )}

              {/* Section 1: Header (Issue Type, Severity, Current Status, Sensitive Badge) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-extrabold text-gray-900">
                    {cluster.issue_type}
                  </h3>
                  <span className="font-mono text-2xs text-gray-400 select-all">
                    {cluster.id}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Severity Chip */}
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${SEVERITY_BADGE_CLASSES[cluster.max_severity]}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full mr-1.5"
                      style={{ backgroundColor: SEVERITY_COLORS[cluster.max_severity] }}
                    />
                    {SEVERITY_LABELS[cluster.max_severity]} Severity
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_BADGE_CLASSES[cluster.current_status]}`}
                  >
                    {STATUS_LABELS[cluster.current_status]}
                  </span>

                  {/* Sensitive Location Badge */}
                  {cluster.near_sensitive_location && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                      Sensitive Area
                    </span>
                  )}
                </div>
              </div>

              {/* Section 2: Photo Preview & Multi-Report Strip */}
              <div className="space-y-2.5">
                <div className="relative group bg-gray-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-gray-200">
                  {activeReport?.image_url && !imgError[activeReport.id] ? (
                    <img
                      src={activeReport.image_url}
                      alt={activeReport.issue_type}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102 cursor-pointer"
                      onClick={() => setIsLightboxOpen(true)}
                      onError={() =>
                        setImgError((prev) => ({ ...prev, [activeReport.id]: true }))
                      }
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-center p-6 text-gray-400 flex flex-col items-center">
                      <svg className="w-10 h-10 mb-2 stroke-gray-500" fill="none" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs">Photo unavailable</span>
                    </div>
                  )}

                  {/* Click to Expand Button */}
                  {activeReport?.image_url && !imgError[activeReport.id] && (
                    <button
                      type="button"
                      onClick={() => setIsLightboxOpen(true)}
                      className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-black/60 hover:bg-black/80 text-white rounded-md text-2xs font-medium flex items-center space-x-1.5 backdrop-blur-xs transition cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      <span>Expand Photo</span>
                    </button>
                  )}
                </div>

                {/* Multi-report thumbnail carousel / strip */}
                {cluster.reports && cluster.reports.length > 1 && (
                  <div className="flex items-center space-x-2 overflow-x-auto pb-1 pt-0.5">
                    {cluster.reports.map((rep) => {
                      const isActive = rep.id === activeReport?.id;
                      return (
                        <button
                          key={rep.id}
                          type="button"
                          onClick={() => setActiveReportId(rep.id)}
                          className={`flex-shrink-0 relative rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                            isActive
                              ? 'border-teal-600 ring-2 ring-teal-200'
                              : 'border-gray-200 hover:border-gray-400 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={rep.image_url}
                            alt="Report"
                            className="w-14 h-14 object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="%23eee"/></svg>';
                            }}
                          />
                          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] text-center font-medium leading-tight py-0.5">
                            {new Date(rep.created_at).toLocaleDateString(undefined, {
                              month: 'numeric',
                              day: 'numeric',
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 3: Key Facts Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <span className="block text-2xs uppercase tracking-wider font-semibold text-gray-500">
                    Priority Score
                  </span>
                  <span className="text-xl font-black text-teal-700">
                    {Number(cluster.priority_score).toFixed(1)}
                  </span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <span className="block text-2xs uppercase tracking-wider font-semibold text-gray-500">
                    Confirmations
                  </span>
                  <span className="text-xl font-bold text-gray-900">
                    {cluster.confirmation_count}
                  </span>
                  <span className="text-2xs text-gray-400 block">citizens confirmed</span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <span className="block text-2xs uppercase tracking-wider font-semibold text-gray-500">
                    Total Reports
                  </span>
                  <span className="text-xl font-bold text-gray-900">
                    {cluster.report_count}
                  </span>
                  <span className="text-2xs text-gray-400 block">merged incidents</span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <span className="block text-2xs uppercase tracking-wider font-semibold text-gray-500">
                    Days Open
                  </span>
                  <span className="text-xl font-bold text-gray-900">
                    {cluster.days_open}
                  </span>
                  <span className="text-2xs text-gray-400 block">days unresolved</span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 col-span-2 sm:col-span-2">
                  <span className="block text-2xs uppercase tracking-wider font-semibold text-gray-500">
                    Initial Report Date
                  </span>
                  <span className="text-xs font-semibold text-gray-800 block mt-0.5">
                    {formatDate(cluster.created_at)}
                  </span>
                  <span className="text-2xs text-gray-400 block">
                    Updated: {formatDate(cluster.updated_at)}
                  </span>
                </div>
              </div>

              {/* Section 4: Location & Isolated Mini-Map */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Incident Location
                  </h4>
                  <a
                    href={`https://www.google.com/maps?q=${cluster.centroid_lat},${cluster.centroid_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-teal-600 hover:text-teal-800 flex items-center space-x-1"
                  >
                    <span>Open in Google Maps</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>

                {/* Leaflet Mini-Map (Safe standalone instance) */}
                <div className="w-full h-36 rounded-xl overflow-hidden border border-gray-200 relative z-0">
                  <MiniMap
                    lat={cluster.centroid_lat}
                    lng={cluster.centroid_lng}
                    severity={cluster.max_severity}
                  />
                </div>

                {/* Coordinate badge & copy button */}
                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
                  <span className="font-mono text-gray-700">
                    {cluster.centroid_lat.toFixed(5)}, {cluster.centroid_lng.toFixed(5)}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCoords}
                    className="text-2xs font-semibold text-teal-700 hover:text-teal-900 transition flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedCoords ? <span>✓ Copied!</span> : <span>Copy Coordinates</span>}
                  </button>
                </div>
              </div>

              {/* Section 5: Reports in this Cluster */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Associated Reports ({cluster.reports?.length || 0})
                  </h4>
                  {cluster.reports && cluster.reports.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllReports(!showAllReports)}
                      className="text-2xs font-semibold text-teal-600 hover:text-teal-800 cursor-pointer"
                    >
                      {showAllReports ? 'Show fewer' : `Show all (${cluster.reports.length})`}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {displayedReports.map((rep: ClusterReport) => (
                    <div
                      key={rep.id}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5 text-xs"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-bold text-gray-900 block">
                            {rep.reporter?.name || 'Citizen Reporter'}
                          </span>
                          <span className="text-2xs text-gray-400">
                            {formatDate(rep.created_at)}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold border ${SEVERITY_BADGE_CLASSES[rep.severity]}`}
                          >
                            {SEVERITY_LABELS[rep.severity]}
                          </span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold border ${STATUS_BADGE_CLASSES[rep.status]}`}
                          >
                            {STATUS_LABELS[rep.status]}
                          </span>
                        </div>
                      </div>

                      {/* Untrusted Report Notes rendered safely as plain text */}
                      {rep.notes && (
                        <p className="text-xs text-gray-600 bg-white border border-gray-200/60 rounded-md p-2 mt-1 italic">
                          "{rep.notes}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 6: Status Update Control */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Municipal Workflow Status
                </h4>

                {isClosed ? (
                  /* Closed state: Control disabled */
                  <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-xs text-gray-600 space-y-1">
                    <p className="font-semibold text-gray-800">
                      Cluster is Closed ({STATUS_LABELS[cluster.current_status] || cluster.current_status})
                    </p>
                    <p className="text-2xs text-gray-500">
                      Closed incidents cannot be re-opened in Phase 1 operations. All active reports in this cluster have been marked resolved or rejected.
                    </p>
                  </div>
                ) : (
                  /* Active state: Status dropdown and update button */
                  <div className="space-y-3">
                    <div>
                      <label className="block text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Select Next Status
                      </label>
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value as ReportStatus)}
                        disabled={updateMutation.isPending || !fetchedCluster}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer disabled:opacity-50"
                      >
                        <option value={cluster.current_status}>
                          {STATUS_LABELS[cluster.current_status]} (Current Status)
                        </option>
                        {allowedNextStatuses.map((st) => (
                          <option key={st} value={st}>
                            Move to {STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Notice if status update endpoint is waiting for backend deployment */}
                    {!fetchedCluster && (
                      <p className="text-2xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                        Status updates are disabled until the backend changes are deployed to the remote server.
                      </p>
                    )}

                    {/* Mutation error display */}
                    {updateMutation.isError && (
                      <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                        <span className="font-bold">Update Failed: </span>
                        <span>
                          {(updateMutation.error as ApiError)?.message ||
                            updateMutation.error?.message ||
                            'Could not update status'}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleUpdateClick}
                      disabled={
                        updateMutation.isPending ||
                        !fetchedCluster ||
                        !selectedStatus ||
                        selectedStatus === cluster.current_status
                      }
                      className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-lg shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      {updateMutation.isPending ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Updating all {activeReportsCount} reports...</span>
                        </>
                      ) : (
                        <span>Update Cluster Status</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Confirmation Dialog for Terminal Transitions (FIXED / REJECTED) */}
      {showConfirmModal && cluster && selectedStatus && (
        <div
          className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-gray-200">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 id="confirm-modal-title" className="text-base font-bold text-gray-900">
                Confirm Status Transition
              </h3>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              This will mark all <strong>{activeReportsCount} active report(s)</strong> in this cluster as{' '}
              <strong className="text-gray-900">{STATUS_LABELS[selectedStatus]}</strong>.
              Closed clusters cannot be re-opened and will have their priority score set to 0.
            </p>

            {selectedStatus === 'REJECTED' && (
              <label className="flex items-start space-x-2.5 bg-red-50/70 border border-red-200 rounded-lg p-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markAsSpam}
                  onChange={(e) => setMarkAsSpam(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-red-600 border-gray-300 rounded focus:ring-red-500 cursor-pointer"
                />
                <span className="text-xs text-red-900 font-medium leading-snug">
                  Mark as spam / invalid (reduces the reporter&apos;s reputation)
                </span>
              </label>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setSelectedStatus(cluster.current_status);
                }}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  handleExecuteStatusUpdate(
                    selectedStatus,
                    selectedStatus === 'REJECTED' ? markAsSpam : undefined
                  )
                }
                className={`px-3.5 py-1.5 text-white rounded-lg text-xs font-semibold cursor-pointer ${
                  selectedStatus === 'REJECTED'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                Confirm {STATUS_LABELS[selectedStatus]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Lightbox Modal for Photo Inspection */}
      {isLightboxOpen && activeReport?.image_url && (
        <div
          className="fixed inset-0 z-70 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute top-4 right-4 flex items-center space-x-3">
            <a
              href={activeReport.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold backdrop-blur-xs flex items-center space-x-1"
            >
              <span>Open in New Tab</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition cursor-pointer"
              aria-label="Close photo preview"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="max-w-4xl max-h-[85vh] p-2 flex items-center justify-center">
            <img
              src={activeReport.image_url}
              alt="Cluster Incident Full Size"
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          <div className="text-white/80 text-xs text-center mt-2 font-medium">
            Reported by {activeReport.reporter?.name || 'Citizen Reporter'} on{' '}
            {formatDate(activeReport.created_at)}
          </div>
        </div>
      )}
    </>
  );
};
