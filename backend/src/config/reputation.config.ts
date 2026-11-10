function parseEnvInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val !== undefined && val.trim() !== '') {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

/**
 * Reputation delta defaults (overridable via environment variables).
 */
export const REP_FIXED_DELTA = parseEnvInt('REP_FIXED_DELTA', 1);
export const REP_REJECTED_DELTA = parseEnvInt('REP_REJECTED_DELTA', -1);
export const REP_CONFIRMED_DELTA = parseEnvInt('REP_CONFIRMED_DELTA', 1);

export interface ReputationConfig {
  fixedDelta: number;
  rejectedDelta: number;
  confirmedDelta: number;
}

/**
 * Dynamically reads reputation delta values from environment variables with safe defaults.
 */
export function getReputationConfig(): ReputationConfig {
  return {
    fixedDelta: parseEnvInt('REP_FIXED_DELTA', 1),
    rejectedDelta: parseEnvInt('REP_REJECTED_DELTA', -1),
    confirmedDelta: parseEnvInt('REP_CONFIRMED_DELTA', 1),
  };
}

/**
 * Reputation Tier Thresholds & Labels
 *
 * NOTE: These reputation tiers are intended for the later fast-track / reduced-validation
 * workflow (e.g., auto-approving or boosting reports from "Trusted" and "Top contributor"
 * citizens while routing "Flagged" reporters through stricter review or rate limits).
 */
export type ReputationLevel = 'Flagged' | 'New' | 'Trusted' | 'Top contributor';

export const REPUTATION_TIER_THRESHOLDS = {
  FLAGGED_BELOW: 0,      // score < 0  -> "Flagged"
  NEW_MAX: 4,            // 0..4       -> "New"
  TRUSTED_MAX: 14,       // 5..14      -> "Trusted"
  TOP_CONTRIBUTOR_MIN: 15, // 15+      -> "Top contributor"
} as const;

export function getReputationLevel(score: number): ReputationLevel {
  if (score < REPUTATION_TIER_THRESHOLDS.FLAGGED_BELOW) {
    return 'Flagged';
  }
  if (score <= REPUTATION_TIER_THRESHOLDS.NEW_MAX) {
    return 'New';
  }
  if (score <= REPUTATION_TIER_THRESHOLDS.TRUSTED_MAX) {
    return 'Trusted';
  }
  return 'Top contributor';
}

