import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import {
  IssueType,
  PriorityQueueResponse,
  QueueItem,
  ReportStatus,
  Severity,
} from '../types/api';

export interface PriorityQueueFilters {
  status?: ReportStatus | '';
  issue_type?: IssueType | '';
  min_severity?: Severity | '';
  near_sensitive_location?: boolean;
  include_closed?: boolean;
}

export interface UsePriorityQueueResult {
  clusters: QueueItem[];
  total: number;
  isCapped: boolean;
  scoresRefreshedAt: string;
  unclusteredReports: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

const SAFETY_CAP = 500;
const PAGE_SIZE = 100;

/**
 * usePriorityQueue
 *
 * Fetches all matching clusters across paginated pages (up to safety cap of 500)
 * for complete spatial rendering on the Leaflet map.
 */
export function usePriorityQueue(filters: PriorityQueueFilters = {}): UsePriorityQueueResult {
  const query = useQuery({
    queryKey: ['priority-queue-all', filters],
    queryFn: async () => {
      let page = 1;
      let aggregatedClusters: QueueItem[] = [];
      let totalCount = 0;
      let scoresRefreshedAt = '';
      let unclusteredReports = 0;
      let hitCap = false;

      while (true) {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(page));
        queryParams.set('limit', String(PAGE_SIZE));

        if (filters.status) {
          queryParams.set('status', filters.status);
        }
        if (filters.issue_type) {
          queryParams.set('issue_type', filters.issue_type);
        }
        if (filters.min_severity) {
          queryParams.set('min_severity', filters.min_severity);
        }
        if (filters.near_sensitive_location === true) {
          queryParams.set('near_sensitive_location', 'true');
        }
        if (filters.include_closed === true) {
          queryParams.set('include_closed', 'true');
        }

        const response = await apiClient<PriorityQueueResponse>(
          `/reports/priority-queue?${queryParams.toString()}`
        );

        totalCount = response.total;
        scoresRefreshedAt = response.meta?.scores_refreshed_at || '';
        unclusteredReports = response.meta?.unclustered_active_reports || 0;

        aggregatedClusters = aggregatedClusters.concat(response.data);

        // Check if we hit or exceeded safety cap
        if (aggregatedClusters.length >= SAFETY_CAP) {
          aggregatedClusters = aggregatedClusters.slice(0, SAFETY_CAP);
          hitCap = totalCount > SAFETY_CAP;
          break;
        }

        // Break if we retrieved all matching clusters or received an empty page
        if (aggregatedClusters.length >= totalCount || response.data.length === 0) {
          break;
        }

        page++;
      }

      return {
        clusters: aggregatedClusters,
        total: totalCount,
        isCapped: hitCap,
        scoresRefreshedAt,
        unclusteredReports,
      };
    },
    staleTime: 60 * 1000, // 60 seconds
    refetchOnWindowFocus: false,
  });

  return {
    clusters: query.data?.clusters ?? [],
    total: query.data?.total ?? 0,
    isCapped: query.data?.isCapped ?? false,
    scoresRefreshedAt: query.data?.scoresRefreshedAt ?? '',
    unclusteredReports: query.data?.unclusteredReports ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

