import React from 'react';
import { useSelection } from '../context/SelectionContext';
import {
  SEVERITY_BADGE_CLASSES,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from '../lib/severity';

/**
 * SelectedClusterCard (Placeholder for Phase 1)
 *
 * TODO: In upcoming tasks, this placeholder card will be replaced by the complete
 * interactive cluster detail drawer, multi-report photo carousel, citizen audit log,
 * and status update workflow controls (SUBMITTED -> UNDER_REVIEW -> SCHEDULED -> FIXED).
 */
export const SelectedClusterCard: React.FC = () => {
  const { selectedCluster, setSelectedClusterId } = useSelection();

  if (!selectedCluster) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 flex flex-col items-center justify-center text-center h-full min-h-[160px]">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
        </div>
        <h4 className="text-xs font-bold text-gray-700">No Cluster Selected</h4>
        <p className="text-2xs text-gray-400 mt-1 max-w-xs">
          Click on any severity marker on the map above to inspect issue breakdown and representative reports.
        </p>
      </div>
    );
  }

  const color = SEVERITY_COLORS[selectedCluster.max_severity];

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 space-y-4">
      {/* Header & Deselect Action */}
      <div className="flex items-start justify-between pb-3 border-b border-gray-100">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              Selected Cluster
            </span>
            <span className="font-mono text-2xs text-gray-400 truncate max-w-[140px]" title={selectedCluster.cluster_id}>
              {selectedCluster.cluster_id}
            </span>
          </div>
          <h3 className="text-base font-bold text-gray-900 mt-1">
            {selectedCluster.issue_type}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setSelectedClusterId(null)}
          className="text-gray-400 hover:text-gray-700 text-sm p-1 rounded-md hover:bg-gray-100 transition focus:outline-none"
          title="Deselect cluster"
        >
          &times;
        </button>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
          <span className="text-2xs text-gray-500 font-medium block">Priority Score</span>
          <span className="text-base font-extrabold text-teal-700 block mt-0.5">
            {Number(selectedCluster.priority_score).toFixed(1)}
          </span>
        </div>

        <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
          <span className="text-2xs text-gray-500 font-medium block">Max Severity</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-2xs font-bold border ${
              SEVERITY_BADGE_CLASSES[selectedCluster.max_severity]
            }`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full mr-1"
              style={{ backgroundColor: color }}
            />
            {SEVERITY_LABELS[selectedCluster.max_severity]}
          </span>
        </div>

        <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
          <span className="text-2xs text-gray-500 font-medium block">Confirmations</span>
          <span className="text-sm font-bold text-gray-800 block mt-0.5">
            {selectedCluster.confirmation_count} citizen{selectedCluster.confirmation_count === 1 ? '' : 's'}
          </span>
          <span className="text-2xs text-gray-400">
            ({selectedCluster.report_count} {selectedCluster.report_count === 1 ? 'report' : 'reports'})
          </span>
        </div>

        <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
          <span className="text-2xs text-gray-500 font-medium block">Days Open</span>
          <span className="text-sm font-bold text-gray-800 block mt-0.5">
            {selectedCluster.days_open} {selectedCluster.days_open === 1 ? 'day' : 'days'}
          </span>
        </div>
      </div>

      {/* Additional Tags & Context */}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
        <span className="text-2xs font-semibold text-gray-500">Status:</span>
        <span className="px-2 py-0.5 text-2xs font-semibold bg-gray-100 text-gray-800 rounded border border-gray-200">
          {selectedCluster.status}
        </span>

        {selectedCluster.near_sensitive_location && (
          <span className="px-2 py-0.5 text-2xs font-semibold bg-purple-50 text-purple-700 rounded border border-purple-200">
            Near Sensitive Area (School / Hospital)
          </span>
        )}

        <span className="text-2xs text-gray-400 ml-auto font-mono">
          Centroid: {selectedCluster.centroid.lat.toFixed(5)}, {selectedCluster.centroid.lng.toFixed(5)}
        </span>
      </div>

      {/* Representative Note if available */}
      {selectedCluster.representative_report?.notes && (
        <div className="pt-2 border-t border-gray-100 text-xs">
          <span className="text-2xs font-semibold text-gray-500 block mb-1">
            Latest Citizen Notes:
          </span>
          <p className="text-gray-700 italic bg-gray-50 p-2 rounded border border-gray-200 text-xs">
            "{selectedCluster.representative_report.notes}"
          </p>
        </div>
      )}

      {/* Placeholder guidance banner */}
      <div className="p-3 bg-teal-50/60 rounded-lg border border-teal-200 text-2xs text-teal-800">
        <strong>Phase 2 Placeholder:</strong> Full cluster investigation drawer, resolution status controls, and citizen audit log will plug into this selection context in the next task.
      </div>
    </div>
  );
};

