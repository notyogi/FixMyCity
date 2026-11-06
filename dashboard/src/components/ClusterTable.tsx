import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  SortingState,
  flexRender,
} from '@tanstack/react-table';

import { QueueItem, Severity, ReportStatus } from '../types/api';
import { useSelection } from '../context/SelectionContext';
import {
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  SEVERITY_BADGE_CLASSES,
  SEVERITY_RANKS,
} from '../lib/severity';
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_WORKFLOW_RANKS,
} from '../lib/status';

/**
 * NOTE ON CLIENT-SIDE DATA ARCHITECTURE:
 * The data hook already retrieves all matching clusters for the active query (up to 500 cap).
 * Therefore, sorting and pagination are currently executed client-side over the loaded collection.
 * If the municipal incident dataset outgrows this cap, sorting and pagination should be offloaded
 * to server-side SQL queries by passing sort and page parameters directly to GET /priority-queue.
 */

interface ClusterTableProps {
  clusters: QueueItem[];
  isLoading?: boolean;
}

const columnHelper = createColumnHelper<QueueItem>();

const TableThumbnail: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setHasError(true)}
      className="w-10 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0"
    />
  );
};

const CopyLocationButton: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center space-x-1.5 font-mono text-2xs text-gray-600">
      <span>
        {lat.toFixed(4)}, {lng.toFixed(4)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded focus:outline-none transition cursor-pointer"
        title="Copy coordinates to clipboard"
      >
        {copied ? (
          <span className="text-emerald-600 font-bold">✓</span>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    </div>
  );
};

export const ClusterTable: React.FC<ClusterTableProps> = ({ clusters, isLoading = false }) => {
  const { selectedClusterId, setSelectedClusterId } = useSelection();

  // Reference for the selected row element to scroll into view
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Default sorting: priority_score descending
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'priority_score', desc: true },
  ]);

  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Calculate highest score in dataset for proportional priority bar
  const maxScoreInDataset = useMemo(() => {
    if (clusters.length === 0) return 100;
    return Math.max(...clusters.map((c) => c.priority_score), 1);
  }, [clusters]);

  // Define Columns with TanStack Table helper
  const columns = useMemo(
    () => [
      // 1. Rank: 1-based position in the current sorted/filtered view
      columnHelper.display({
        id: 'rank',
        header: '#',
        cell: (info) => (
          <span className="font-mono text-2xs font-bold text-gray-500">
            {pagination.pageIndex * pagination.pageSize + info.row.index + 1}
          </span>
        ),
        enableSorting: false,
      }),

      // 2. Photo: Representative report thumbnail
      columnHelper.accessor((row) => row.representative_report?.image_url, {
        id: 'photo',
        header: 'Photo',
        cell: (info) => (
          <TableThumbnail
            src={info.getValue()}
            alt={info.row.original.issue_type}
          />
        ),
        enableSorting: false,
      }),

      // 3. Issue Type
      columnHelper.accessor('issue_type', {
        id: 'issue_type',
        header: 'Category',
        cell: (info) => (
          <div>
            <span className="font-semibold text-xs text-gray-900 block">
              {info.getValue()}
            </span>
            <span className="font-mono text-3xs text-gray-400 truncate max-w-[100px] block">
              {info.row.original.cluster_id.substring(0, 8)}...
            </span>
          </div>
        ),
      }),

      // 4. Severity: Custom sort by severity hierarchy (LOW < MEDIUM < HIGH < CRITICAL)
      columnHelper.accessor('max_severity', {
        id: 'max_severity',
        header: 'Severity',
        sortingFn: (rowA, rowB) => {
          const rankA = SEVERITY_RANKS[rowA.original.max_severity as Severity] ?? 0;
          const rankB = SEVERITY_RANKS[rowB.original.max_severity as Severity] ?? 0;
          if (rankA !== rankB) return rankA - rankB;
          // Tie-break: priority score desc, then days open
          if (rowA.original.priority_score !== rowB.original.priority_score) {
            return rowA.original.priority_score - rowB.original.priority_score;
          }
          return rowA.original.cluster_id.localeCompare(rowB.original.cluster_id);
        },
        cell: (info) => {
          const sev = info.getValue() as Severity;
          const color = SEVERITY_COLORS[sev];
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold border ${SEVERITY_BADGE_CLASSES[sev]}`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full mr-1.5"
                style={{ backgroundColor: color }}
              />
              {SEVERITY_LABELS[sev]}
            </span>
          );
        },
      }),

      // 5. Priority Score with proportional bar (Default Sort Descending)
      columnHelper.accessor('priority_score', {
        id: 'priority_score',
        header: 'Priority Score',
        sortingFn: (rowA, rowB) => {
          const diff = rowA.original.priority_score - rowB.original.priority_score;
          if (diff !== 0) return diff;
          if (rowA.original.days_open !== rowB.original.days_open) {
            return rowA.original.days_open - rowB.original.days_open;
          }
          return rowA.original.cluster_id.localeCompare(rowB.original.cluster_id);
        },
        cell: (info) => {
          const score = info.getValue();
          const percent = Math.min(100, Math.max(8, (score / maxScoreInDataset) * 100));

          return (
            <div className="w-28 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-teal-700">
                  {score.toFixed(1)}
                </span>
                <span className="text-3xs text-gray-400">pts</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-teal-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        },
      }),

      // 6. Confirmations
      columnHelper.accessor('confirmation_count', {
        id: 'confirmation_count',
        header: 'Confirmations',
        cell: (info) => (
          <div className="text-xs">
            <span className="font-semibold text-gray-800">
              {info.getValue()} confirmed
            </span>
            <span className="text-3xs text-gray-400 block">
              {info.row.original.report_count} {info.row.original.report_count === 1 ? 'report' : 'reports'}
            </span>
          </div>
        ),
      }),

      // 7. Days Open
      columnHelper.accessor('days_open', {
        id: 'days_open',
        header: 'Days Open',
        cell: (info) => (
          <span className="text-xs font-medium text-gray-700">
            {info.getValue()} {info.getValue() === 1 ? 'day' : 'days'}
          </span>
        ),
      }),

      // 8. Status: Custom sort by workflow hierarchy (SUBMITTED < UNDER_REVIEW < SCHEDULED < FIXED < REJECTED)
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        sortingFn: (rowA, rowB) => {
          const rankA = STATUS_WORKFLOW_RANKS[rowA.original.status as ReportStatus] ?? 0;
          const rankB = STATUS_WORKFLOW_RANKS[rowB.original.status as ReportStatus] ?? 0;
          if (rankA !== rankB) return rankA - rankB;
          return rowA.original.cluster_id.localeCompare(rowB.original.cluster_id);
        },
        cell: (info) => {
          const st = info.getValue() as ReportStatus;
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-semibold border ${STATUS_BADGE_CLASSES[st]}`}
            >
              {STATUS_LABELS[st]}
            </span>
          );
        },
      }),

      // 9. Flags
      columnHelper.accessor('near_sensitive_location', {
        id: 'flags',
        header: 'Flags',
        cell: (info) => {
          if (!info.getValue()) return <span className="text-gray-300 text-xs">—</span>;
          return (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-bold bg-purple-50 text-purple-700 border border-purple-200"
              title="Located near a school, hospital, or sensitive facility"
            >
              Sensitive Place
            </span>
          );
        },
      }),

      // 10. Location Coordinates & Copy Button
      columnHelper.display({
        id: 'location',
        header: 'Coordinates',
        cell: (info) => (
          <CopyLocationButton
            lat={info.row.original.centroid.lat}
            lng={info.row.original.centroid.lng}
          />
        ),
        enableSorting: false,
      }),
    ],
    [maxScoreInDataset, pagination.pageIndex, pagination.pageSize]
  );

  // Initialize TanStack Table instance
  const table = useReactTable({
    data: clusters,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Synchronize external Map selection: auto-switch page and smooth-scroll to matching row
  useEffect(() => {
    if (!selectedClusterId) return;

    // Find row index among currently sorted rows
    const sortedRowList = table.getSortedRowModel().rows;
    const targetIndex = sortedRowList.findIndex(
      (r) => r.original.cluster_id === selectedClusterId
    );

    if (targetIndex !== -1) {
      const targetPage = Math.floor(targetIndex / pagination.pageSize);
      if (targetPage !== pagination.pageIndex) {
        table.setPageIndex(targetPage);
      }

      // Small timeout to allow DOM page transition before scrolling into view
      setTimeout(() => {
        if (selectedRowRef.current) {
          selectedRowRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }, 100);
    }
  }, [selectedClusterId, pagination.pageSize, pagination.pageIndex, table]);

  // Loading skeleton state
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden p-6 space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
          <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex space-x-4 animate-pulse py-2">
              <div className="h-9 w-9 bg-gray-200 rounded-lg"></div>
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3.5 bg-gray-200 rounded w-3/4"></div>
                <div className="h-2.5 bg-gray-200 rounded w-1/2"></div>
              </div>
              <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (clusters.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-gray-800">No clusters match your filters</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          Try adjusting the search query, category, or minimum severity level to display incidents.
        </p>
      </div>
    );
  }

  const pageCount = table.getPageCount();
  const startRow = pagination.pageIndex * pagination.pageSize + 1;
  const endRow = Math.min((pagination.pageIndex + 1) * pagination.pageSize, clusters.length);

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden flex flex-col">
      {/* Table Scrollable Wrapper with Sticky Header */}
      <div className="overflow-x-auto max-h-[620px] relative">
        <table className="min-w-full divide-y divide-gray-200 text-left">
          <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200 shadow-2xs">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        isSorted === 'asc'
                          ? 'ascending'
                          : isSorted === 'desc'
                          ? 'descending'
                          : 'none'
                      }
                      onClick={header.column.getToggleSortingHandler()}
                      className={`py-3 px-3.5 text-2xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap select-none ${
                        canSort ? 'cursor-pointer hover:bg-gray-100 hover:text-gray-900 transition' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-1">
                        <span>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                        {canSort && (
                          <span className="text-xs text-gray-400">
                            {isSorted === 'asc' ? (
                              <span className="text-teal-600 font-bold">▲</span>
                            ) : isSorted === 'desc' ? (
                              <span className="text-teal-600 font-bold">▼</span>
                            ) : (
                              <span className="opacity-40">⇅</span>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-gray-100 bg-white text-xs">
            {table.getRowModel().rows.map((row) => {
              const isSelected = selectedClusterId === row.original.cluster_id;

              return (
                <tr
                  key={row.id}
                  ref={isSelected ? selectedRowRef : null}
                  tabIndex={0}
                  onClick={() => setSelectedClusterId(row.original.cluster_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedClusterId(row.original.cluster_id);
                    }
                  }}
                  className={`transition cursor-pointer focus:outline-none ${
                    isSelected
                      ? 'bg-teal-50/80 hover:bg-teal-50 ring-1 ring-inset ring-teal-500'
                      : 'hover:bg-gray-50 focus:bg-gray-50'
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="py-2.5 px-3.5 whitespace-nowrap align-middle"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination & Page Size Toolbar */}
      <div className="px-4 py-3 bg-gray-50/80 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-700">
        <div className="flex items-center space-x-2">
          <span>
            Showing <strong className="font-semibold">{startRow}</strong> to{' '}
            <strong className="font-semibold">{endRow}</strong> of{' '}
            <strong className="font-semibold">{clusters.length}</strong> clusters
          </span>

          <span className="text-gray-300">|</span>

          {/* Page Size Selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-500">Rows per page:</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Previous / Next Controls */}
        <div className="flex items-center space-x-1.5 self-end sm:self-auto">
          <span className="text-gray-500 mr-2">
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, pageCount)}
          </span>

          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-2.5 py-1.5 border border-gray-300 rounded-md bg-white hover:bg-gray-50 font-medium text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-2.5 py-1.5 border border-gray-300 rounded-md bg-white hover:bg-gray-50 font-medium text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

