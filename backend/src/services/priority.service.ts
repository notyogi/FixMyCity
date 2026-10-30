import { Severity, ReportStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import {
  getPriorityConfig,
  SEVERITY_VALUES,
} from '../config/priority.config';

export interface PriorityScoreInput {
  maxSeverity: Severity;
  confirmationCount: number;
  nearSensitiveLocation: boolean;
  oldestReportCreatedAt: Date;
  now?: Date;
}

/**
 * Pure, side-effect-free priority scoring function (no database access).
 *
 * FORMULA:
 * priority_score = (severity_weight × severity_value)
 *                + (confirmation_weight × confirmation_value)
 *                + (location_risk_weight × risk_factor)
 *                + (age_weight × days_open)
 *
 * WHY CAPS EXIST:
 * Without CONFIRMATION_CAP (10) and AGE_CAP_DAYS (30), an old or heavily-confirmed
 * low-severity issue (e.g. a faded painted line open for 180 days with 60 confirmations)
 * could accumulate an artificially high priority score that outranks a fresh CRITICAL
 * hazard (e.g. a burst main line or deep sinkhole reported this morning).
 * The caps ensure that aging and crowd popularity cannot eclipse physical hazard urgency.
 *
 * @param input Scoring factors including severity, confirmation count, location flag, and timestamps
 * @returns Priority score rounded to 2 decimal places
 */
export function computePriorityScore(input: {
  maxSeverity: Severity;
  confirmationCount: number;
  nearSensitiveLocation: boolean;
  oldestReportCreatedAt: Date;
  now?: Date;
}): number {
  const config = getPriorityConfig();

  // 1. Severity value (LOW=1, MEDIUM=2, HIGH=3, CRITICAL=4)
  const severityValue = SEVERITY_VALUES[input.maxSeverity] ?? 1;

  // 2. Confirmation value capped at CONFIRMATION_CAP (default: 10)
  const rawConfirmations = Math.max(0, input.confirmationCount);
  const confirmationValue = Math.min(rawConfirmations, config.confirmationCap);

  // 3. Location risk factor: 1 if near school/hospital/sensitive place, else 0
  const riskFactor = input.nearSensitiveLocation ? 1 : 0;

  // 4. Days open: whole days between oldest report creation and now, capped at AGE_CAP_DAYS, never negative
  const referenceTime = input.now ? input.now.getTime() : Date.now();
  const createdTime = input.oldestReportCreatedAt.getTime();
  const diffMs = referenceTime - createdTime;
  const wholeDays = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
  const daysOpen = Math.min(wholeDays, config.ageCapDays);

  // 5. Compute weighted sum
  const rawScore =
    config.severityWeight * severityValue +
    config.confirmationWeight * confirmationValue +
    config.locationRiskWeight * riskFactor +
    config.ageWeight * daysOpen;

  // Round result to 2 decimal places
  return Math.round((rawScore + Number.EPSILON) * 100) / 100;
}

/**
 * Recomputes and updates the priority score for a single ReportCluster.
 * Only non-FIXED, non-REJECTED reports are considered active.
 * If no active reports remain, sets priority_score to 0.
 *
 * @param clusterId UUID of the cluster to recompute
 * @returns Updated priority score
 */
export async function recomputeClusterPriority(clusterId: string): Promise<number> {
  const cluster = await prisma.reportCluster.findUnique({
    where: { id: clusterId },
    include: { reports: true },
  });

  if (!cluster) {
    console.warn(`[recomputeClusterPriority] Cluster ${clusterId} not found`);
    return 0;
  }

  // Only consider reports whose status is NOT FIXED or REJECTED
  const activeReports = cluster.reports.filter(
    (r) => r.status !== ReportStatus.FIXED && r.status !== ReportStatus.REJECTED
  );

  // If no active reports remain, set priority_score to 0 and return 0
  if (activeReports.length === 0) {
    await prisma.reportCluster.update({
      where: { id: clusterId },
      data: { priority_score: 0 },
    });
    return 0;
  }

  // Derive maxSeverity = highest severity among active reports
  let maxSeverity: Severity = Severity.LOW;
  let maxSeverityVal = 0;
  for (const report of activeReports) {
    const val = SEVERITY_VALUES[report.severity] ?? 0;
    if (val > maxSeverityVal) {
      maxSeverityVal = val;
      maxSeverity = report.severity;
    }
  }

  // Derive confirmationCount = cluster.confirmation_count
  const confirmationCount = cluster.confirmation_count;

  // Derive nearSensitiveLocation = true if ANY active report has the flag
  const nearSensitiveLocation = activeReports.some((r) => r.near_sensitive_location);

  // Derive oldestReportCreatedAt = earliest created_at among active reports
  const oldestReportCreatedAt = activeReports.reduce(
    (earliest, r) => (r.created_at < earliest ? r.created_at : earliest),
    activeReports[0].created_at
  );

  const score = computePriorityScore({
    maxSeverity,
    confirmationCount,
    nearSensitiveLocation,
    oldestReportCreatedAt,
  });

  await prisma.reportCluster.update({
    where: { id: clusterId },
    data: { priority_score: score },
  });

  return score;
}

/**
 * Recomputes priority scores for every cluster in the system.
 * Needed on a scheduled basis because days_open increases daily,
 * causing stored scores to change over time.
 *
 * @returns Count of clusters updated
 */
export async function recomputeAllPriorityScores(): Promise<number> {
  const clusters = await prisma.reportCluster.findMany({
    select: { id: true },
  });

  let updatedCount = 0;
  for (const cluster of clusters) {
    try {
      await recomputeClusterPriority(cluster.id);
      updatedCount++;
    } catch (err) {
      console.error(
        `[recomputeAllPriorityScores] Failed to recompute cluster ${cluster.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return updatedCount;
}

/**
 * Stub preserved for backward compatibility
 */
export interface PriorityEvaluationInput {
  category: string;
  reportCount?: number;
  isHazardous?: boolean;
}

export const calculateReportPriority = async (
  _input: PriorityEvaluationInput
): Promise<string> => {
  return 'MEDIUM';
};
