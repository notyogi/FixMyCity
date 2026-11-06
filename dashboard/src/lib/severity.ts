import { Severity } from '../types/api';

/**
 * Single source of truth for severity visual attributes across Map, Legend, and Tables.
 */

export const SEVERITY_ORDER: readonly Severity[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

export const SEVERITY_RANKS: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  LOW: '#22c55e',      // Green
  MEDIUM: '#eab308',   // Yellow / Amber
  HIGH: '#f97316',     // Orange
  CRITICAL: '#dc2626', // Red
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  LOW: 'Minor issue, non-urgent',
  MEDIUM: 'Moderate hazard, requires attention',
  HIGH: 'Significant hazard affecting residents',
  CRITICAL: 'Immediate safety or infrastructure risk',
};

export const SEVERITY_BADGE_CLASSES: Record<Severity, string> = {
  LOW: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  MEDIUM: 'bg-amber-50 text-amber-800 border-amber-300',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-300',
  CRITICAL: 'bg-red-50 text-red-800 border-red-300',
};

/**
 * Calculates marker radius in pixels scaling with citizen confirmation count.
 * Base 10px, +1.5px per confirmation, capped at 24px.
 */
export function getMarkerRadius(confirmationCount: number): number {
  const confirmations = Math.max(1, confirmationCount || 1);
  const radius = 10 + (confirmations - 1) * 1.5;
  return Math.min(24, Math.max(10, radius));
}

