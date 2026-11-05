import React, { createContext, useContext, useState } from 'react';
import { QueueItem } from '../types/api';

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
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  // Derive the active cluster object from the current cluster collection
  const selectedCluster =
    clusters.find((c) => c.cluster_id === selectedClusterId) ?? null;

  const setSelectedCluster = (cluster: QueueItem | null) => {
    setSelectedClusterId(cluster ? cluster.cluster_id : null);
  };

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

