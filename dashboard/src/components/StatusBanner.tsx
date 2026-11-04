import React, { useEffect, useState } from 'react';
import { subscribeToSlowRequests } from '../lib/apiClient';

interface StatusBannerProps {
  message?: string | null;
  type?: 'info' | 'warning' | 'error' | 'success';
  onDismiss?: () => void;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  message,
  type = 'warning',
  onDismiss,
}) => {
  const [isSlowRequest, setIsSlowRequest] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeToSlowRequests((slow) => {
      setIsSlowRequest(slow);
    });
    return unsubscribe;
  }, []);

  // Display cold-start hint automatically when API takes > 5s
  if (isSlowRequest) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-800 flex items-center justify-between animate-pulse">
        <div className="flex items-center space-x-2">
          <svg
            className="w-4 h-4 text-amber-600 flex-shrink-0 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            ></path>
          </svg>
          <span>
            <strong>Server is waking up:</strong> Free-tier cloud instances spin down after inactivity. This initial request can take up to 45–60 seconds.
          </span>
        </div>
      </div>
    );
  }

  // Display custom prop message if supplied
  if (!message) {
    return null;
  }

  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }[type];

  return (
    <div className={`border-b px-4 py-2.5 text-sm flex items-center justify-between ${styles}`}>
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-3 text-sm font-semibold hover:opacity-75 transition"
        >
          &times;
        </button>
      )}
    </div>
  );
};

