import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { ClusterDetail } from '../types/api';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * useClusterDetail
 *
 * React Query hook retrieving full cluster details, reports, and confirmations.
 * Disabled automatically when no valid UUID cluster ID is selected.
 */
export function useClusterDetail(clusterId: string | null) {
  const isValidId = Boolean(clusterId && UUID_REGEX.test(clusterId));

  return useQuery<ClusterDetail, Error>({
    queryKey: ['cluster-detail', clusterId],
    queryFn: async () => {
      if (!clusterId) {
        throw new Error('No cluster ID provided');
      }
      return apiClient<ClusterDetail>(`/reports/clusters/${clusterId}`);
    },
    enabled: isValidId,
    staleTime: 30 * 1000,
    retry: (failureCount, error) => {
      // Don't retry on 404 or 403
      if ((error as any)?.status === 404 || (error as any)?.status === 403) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

