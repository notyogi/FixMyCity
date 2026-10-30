import { Severity } from '@prisma/client';

function parseEnvFloat(primaryKey: string, fallbackKey: string, defaultValue: number): number {
  const val = process.env[primaryKey] ?? process.env[fallbackKey];
  if (val !== undefined && val.trim() !== '') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

/**
 * Priority Scoring Weights & Tuning Constants
 * Each value can be overridden via environment variables.
 * Defaults are tuned for civic hazard response.
 */
export const SEVERITY_WEIGHT = parseEnvFloat('PRIORITY_SEVERITY_WEIGHT', 'SEVERITY_WEIGHT', 10);
export const CONFIRMATION_WEIGHT = parseEnvFloat('PRIORITY_CONFIRMATION_WEIGHT', 'CONFIRMATION_WEIGHT', 3);
export const LOCATION_RISK_WEIGHT = parseEnvFloat('PRIORITY_LOCATION_RISK_WEIGHT', 'LOCATION_RISK_WEIGHT', 15);
export const AGE_WEIGHT = parseEnvFloat('PRIORITY_AGE_WEIGHT', 'AGE_WEIGHT', 0.5);

/**
 * Caps to prevent low-severity issues from dominating purely due to age or confirmation accumulation.
 */
export const CONFIRMATION_CAP = parseEnvFloat('PRIORITY_CONFIRMATION_CAP', 'CONFIRMATION_CAP', 10);
export const AGE_CAP_DAYS = parseEnvFloat('PRIORITY_AGE_CAP_DAYS', 'AGE_CAP_DAYS', 30);

/**
 * Severity value mapping:
 * LOW = 1, MEDIUM = 2, HIGH = 3, CRITICAL = 4
 */
export const SEVERITY_VALUES: Record<Severity, number> = {
  [Severity.LOW]: 1,
  [Severity.MEDIUM]: 2,
  [Severity.HIGH]: 3,
  [Severity.CRITICAL]: 4,
};

export interface PriorityConfig {
  severityWeight: number;
  confirmationWeight: number;
  locationRiskWeight: number;
  ageWeight: number;
  confirmationCap: number;
  ageCapDays: number;
}

/**
 * Helper to dynamically load current priority configuration values.
 */
export function getPriorityConfig(): PriorityConfig {
  return {
    severityWeight: parseEnvFloat('PRIORITY_SEVERITY_WEIGHT', 'SEVERITY_WEIGHT', 10),
    confirmationWeight: parseEnvFloat('PRIORITY_CONFIRMATION_WEIGHT', 'CONFIRMATION_WEIGHT', 3),
    locationRiskWeight: parseEnvFloat('PRIORITY_LOCATION_RISK_WEIGHT', 'LOCATION_RISK_WEIGHT', 15),
    ageWeight: parseEnvFloat('PRIORITY_AGE_WEIGHT', 'AGE_WEIGHT', 0.5),
    confirmationCap: parseEnvFloat('PRIORITY_CONFIRMATION_CAP', 'CONFIRMATION_CAP', 10),
    ageCapDays: parseEnvFloat('PRIORITY_AGE_CAP_DAYS', 'AGE_CAP_DAYS', 30),
  };
}

