import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QueueItem } from '../types/api';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SelectionContextType {
  selectedClusterId: string | null;
  setSelectedClusterId: (id: string | null) => void;
  selectedCluster: QueueItem | null;
  setSelectedCluster: (cluster: QueueItem | null) => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export const SelectionProvider: React.FC<{
  children: React.ReactNode;
  clusters?: QueueItem[];
}> = ({ children, clusters = [] }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read selected cluster from URL query param (?cluster=<uuid>), ignoring invalid non-UUID strings
  const paramCluster = searchParams.get('cluster');
  const selectedClusterId = useMemo(() => {
    return paramCluster && UUID_REGEX.test(paramCluster) ? paramCluster : null;
  }, [paramCluster]);

  const setSelectedClusterId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id && UUID_REGEX.test(id)) {
            next.set('cluster', id);
          } else {
            next.delete('cluster');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Derive active cluster object from current queue if present
  const selectedCluster = useMemo(() => {
    return clusters.find((c) => c.cluster_id === selectedClusterId) ?? null;
  }, [clusters, selectedClusterId]);

  const setSelectedCluster = useCallback(
    (cluster: QueueItem | null) => {
      setSelectedClusterId(cluster ? cluster.cluster_id : null);
    },
    [setSelectedClusterId]
  );

  return (
    <SelectionContext.Provider
      value={{
        selectedClusterId,
        setSelectedClusterId,
        selectedCluster,
        setSelectedCluster,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
};

export function useSelection(): SelectionContextType {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
}

