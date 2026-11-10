import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { ClusterDetail, ReportStatus, UpdateClusterStatusInput } from '../types/api';

export interface UpdateClusterStatusVariables {
  clusterId: string;
  status: ReportStatus;
  spam?: boolean;
}

/**
 * useUpdateClusterStatus
 *
 * Mutation hook calling PATCH /api/v1/reports/clusters/:id/status.
 * On success:
 * - Updates and invalidates cluster-detail query cache
 * - Invalidates priority-queue-all query cache so map and table refresh
 */
export function useUpdateClusterStatus() {
  const queryClient = useQueryClient();

  return useMutation<ClusterDetail, Error, UpdateClusterStatusVariables>({
    mutationFn: async ({ clusterId, status, spam }) => {
      const payload: UpdateClusterStatusInput = {
        status,
        ...(spam !== undefined ? { spam } : {}),
      };
      return apiClient<ClusterDetail>(`/reports/clusters/${clusterId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (updatedCluster, variables) => {
      // Optimistically update cluster detail cache and invalidate for fresh background sync
      queryClient.setQueryData(['cluster-detail', variables.clusterId], updatedCluster);
      queryClient.invalidateQueries({ queryKey: ['cluster-detail', variables.clusterId] });

      // Invalidate all priority queue queries so map markers and table rows reflect the change
      queryClient.invalidateQueries({ queryKey: ['priority-queue-all'] });
    },
  });
}

