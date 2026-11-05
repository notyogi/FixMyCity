import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { QueueItem } from '../types/api';
import {
  getMarkerRadius,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  SEVERITY_BADGE_CLASSES,
} from '../lib/severity';
import { useSelection } from '../context/SelectionContext';
import { MapLegend } from './MapLegend';

interface ClusterMapProps {
  clusters: QueueItem[];
  isLoading?: boolean;
}

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209]; // Delhi, India
const DEFAULT_ZOOM = 11;

/**
 * ThumbnailImage
 * Lazy-loaded photo with graceful fallback placeholder for broken/missing URLs.
 */
const ThumbnailImage: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="w-full h-28 bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-400 border border-gray-200">
        <svg className="w-7 h-7 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="text-2xs font-medium">No Image Available</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setHasError(true)}
      className="w-full h-28 object-cover rounded-lg border border-gray-200"
    />
  );
};

/**
 * MapController
 * Handles camera movements, spatial fitting, external selection panning,
 * and container resize invalidation.
 */
const MapController: React.FC<{
  clusters: QueueItem[];
  selectedCluster: QueueItem | null;
  onSetRecentre: (fn: () => void) => void;
}> = ({ clusters, selectedCluster, onSetRecentre }) => {
  const map = useMap();
  const isFirstFitRef = useRef(true);

  // Recentre / Fit Bounds to current markers
  const fitToMarkers = useCallback(() => {
    if (clusters.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const bounds = L.latLngBounds(
      clusters.map((c) => [c.centroid.lat, c.centroid.lng])
    );

    map.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 16,
    });
  }, [clusters, map]);

  useEffect(() => {
    onSetRecentre(() => fitToMarkers);
  }, [onSetRecentre, fitToMarkers]);

  // Fit bounds when cluster collection loads
  useEffect(() => {
    if (clusters.length > 0 && isFirstFitRef.current) {
      fitToMarkers();
      isFirstFitRef.current = false;
    }
  }, [clusters, fitToMarkers]);

  // Gently pan and zoom when cluster is selected
  useEffect(() => {
    if (selectedCluster) {
      map.flyTo(
        [selectedCluster.centroid.lat, selectedCluster.centroid.lng],
        Math.max(map.getZoom(), 15),
        { duration: 0.8 }
      );
    }
  }, [selectedCluster, map]);

  // Container resize observer
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [map]);

  return null;
};

/**
 * NOTE ON OVERLAPPING MARKERS:
 * For Phase 1, clusters are rendered cleanly using scalable CircleMarkers.
 * If cluster density grows significantly in a single neighbourhood in future phases,
 * integrating `leaflet.markercluster` (or `react-leaflet-cluster`) is the recommended upgrade path.
 */
export const ClusterMap: React.FC<ClusterMapProps> = ({ clusters, isLoading = false }) => {
  const { selectedClusterId, setSelectedClusterId, selectedCluster } = useSelection();
  const [recentreFn, setRecentreFn] = useState<(() => void) | null>(null);

  /**
   * Sort clusters by priority_score ASCENDING before rendering.
   * In Leaflet's SVG rendering layer, markers rendered later sit on top of earlier ones.
   * This ensures high-priority & critical markers are drawn last (on top) and never hidden.
   */
  const sortedClusters = useMemo(() => {
    return [...clusters].sort((a, b) => a.priority_score - b.priority_score);
  }, [clusters]);

  return (
    <div className="relative w-full h-[60vh] md:h-[calc(100vh-280px)] min-h-[480px] rounded-xl overflow-hidden border border-gray-200 shadow-xs bg-gray-100">
      {/* Map Recentre Button */}
      <div className="absolute top-4 right-4 z-[1000]">
        <button
          type="button"
          onClick={() => recentreFn && recentreFn()}
          className="inline-flex items-center px-3 py-1.5 bg-white/95 backdrop-blur-xs border border-gray-300 shadow-md rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition cursor-pointer"
          title="Re-centre map view to fit all clusters"
        >
          <svg className="w-3.5 h-3.5 mr-1 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Re-centre View
        </button>
      </div>

      {/* Empty State Overlay */}
      {!isLoading && clusters.length === 0 && (
        <div className="absolute inset-0 z-[1000] pointer-events-none flex items-center justify-center">
          <div className="bg-white/95 backdrop-blur-xs px-6 py-5 rounded-xl border border-gray-300 shadow-lg text-center max-w-sm pointer-events-auto">
            <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-900">No clusters found</h3>
            <p className="text-xs text-gray-500 mt-1">
              No civic issues match your current filters. Try relaxing the severity or category criteria.
            </p>
          </div>
        </div>
      )}

      {/* Leaflet Map Container */}
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full z-0"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController
          clusters={clusters}
          selectedCluster={selectedCluster}
          onSetRecentre={setRecentreFn}
        />

        {/* Cluster Circle Markers */}
        {sortedClusters.map((cluster) => {
          const isSelected = selectedClusterId === cluster.cluster_id;
          const radius = getMarkerRadius(cluster.confirmation_count);
          const color = SEVERITY_COLORS[cluster.max_severity];

          return (
            <React.Fragment key={cluster.cluster_id}>
              {/* Highlight Halo for Selected Cluster */}
              {isSelected && (
                <CircleMarker
                  center={[cluster.centroid.lat, cluster.centroid.lng]}
                  radius={radius + 8}
                  pathOptions={{
                    color: '#0d9488', // teal-600
                    fill: false,
                    weight: 3,
                    opacity: 0.9,
                    dashArray: '3, 4',
                  }}
                  interactive={false}
                />
              )}

              {/* Extra Dashed Outer Ring for Sensitive Location Hazard */}
              {cluster.near_sensitive_location && (
                <CircleMarker
                  center={[cluster.centroid.lat, cluster.centroid.lng]}
                  radius={radius + 4}
                  pathOptions={{
                    color: '#7e22ce', // purple-700
                    fill: false,
                    weight: 2,
                    dashArray: '4, 4',
                    opacity: 0.85,
                  }}
                  interactive={false}
                />
              )}

              {/* Primary Circle Marker */}
              <CircleMarker
                center={[cluster.centroid.lat, cluster.centroid.lng]}
                radius={isSelected ? radius + 2 : radius}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.88,
                  color: isSelected ? '#111827' : '#ffffff',
                  weight: isSelected ? 3 : 2,
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedClusterId(cluster.cluster_id);
                  },
                }}
              >
                {/* Popup on Marker Click */}
                <Popup className="fixmycity-cluster-popup" minWidth={240} maxWidth={280}>
                  <div className="p-1 space-y-2 text-xs text-gray-800">
                    {/* Photo Thumbnail */}
                    <ThumbnailImage
                      src={cluster.representative_report?.image_url}
                      alt={cluster.issue_type}
                    />

                    {/* Header: Issue Type & Priority Score */}
                    <div className="flex items-start justify-between pt-1">
                      <div>
                        <span className="font-bold text-sm text-gray-900 block">
                          {cluster.issue_type}
                        </span>
                        <span className="text-2xs text-gray-400 font-mono">
                          ID: {cluster.cluster_id.substring(0, 8)}...
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xs uppercase tracking-wider text-gray-400 block font-semibold">
                          Priority
                        </span>
                        <span className="font-extrabold text-sm text-teal-700">
                          {Number(cluster.priority_score).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Badges: Severity & Location Risk */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold border ${SEVERITY_BADGE_CLASSES[cluster.max_severity]}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full mr-1"
                          style={{ backgroundColor: color }}
                        />
                        {SEVERITY_LABELS[cluster.max_severity]}
                      </span>

                      {cluster.near_sensitive_location && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          Sensitive Location
                        </span>
                      )}
                    </div>

                    {/* Operational Metrics: Confirmations & Days Open */}
                    <div className="grid grid-cols-2 gap-2 py-1.5 border-t border-b border-gray-100 text-2xs text-gray-600">
                      <div>
                        <span className="block text-gray-400 font-medium">Confirmations</span>
                        <span className="font-bold text-gray-900">
                          {cluster.confirmation_count} citizen{cluster.confirmation_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-gray-400 font-medium">Time Open</span>
                        <span className="font-bold text-gray-900">
                          {cluster.days_open} {cluster.days_open === 1 ? 'day' : 'days'}
                        </span>
                      </div>
                    </div>

                    {/* View Details Action Button */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedClusterId(cluster.cluster_id)}
                        className="w-full text-center py-1.5 px-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-md shadow-2xs transition cursor-pointer"
                      >
                        Select & View Details
                      </button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* Map Legend Overlay */}
      <MapLegend />
    </div>
  );
};

