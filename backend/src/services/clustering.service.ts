import { Report } from '@prisma/client';
import prisma from '../utils/prisma';
import { ProximityService, NearbyReport } from './proximity.service';
import { hammingDistance } from '../utils/hamming';
import { recomputeClusterPriority } from './priority.service';

/**
 * Result indicating the outcome of evaluating a report against nearby candidates.
 */
export type ClusterAssignmentResult =
  | {
      action: 'merged';
      clusterId: string;
      matchedReportId: string;
      hammingDistance: number;
      distanceMeters: number;
      confirmationCount: number;
    }
  | {
      action: 'created_new';
      clusterId: string;
      confirmationCount: number;
    };

/**
 * Custom domain exception thrown when cluster assignment encounters an unexpected error.
 */
export class ClusteringException extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ClusteringException';
    this.cause = cause;
    Object.setPrototypeOf(this, ClusteringException.prototype);
  }
}

const DEFAULT_HAMMING_THRESHOLD = 10;
const PROXIMITY_SEARCH_RADIUS_METERS = 25;

/**
 * Retrieves the configured pHash Hamming distance threshold from environment variables.
 * Default is 10 (bits).
 */
export function getHammingThreshold(): number {
  const envVal = process.env.DEDUP_HAMMING_THRESHOLD;
  if (envVal !== undefined && envVal.trim() !== '') {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_HAMMING_THRESHOLD;
}

/**
 * Service orchestrating duplicate detection and cluster assignment for incoming damage reports.
 */
export class ClusteringService {
  /**
   * Evaluates an incoming report against nearby open reports using PostGIS proximity (ST_DWithin)
   * and perceptual image hash Hamming distance. Decides whether to merge into an existing cluster
   * or create a new cluster.
   *
   * All state transitions and related table writes are encapsulated in an atomic Prisma transaction.
   *
   * @param report Newly created Report entity
   * @returns ClusterAssignmentResult with action ('merged' | 'created_new') and cluster details
   */
  static async evaluateAndAssignCluster(report: Report): Promise<ClusterAssignmentResult> {
    try {
      // Guard: If report is already clustered, return existing assignment idempotently
      if (report.cluster_id) {
        const existingCluster = await prisma.reportCluster.findUnique({
          where: { id: report.cluster_id },
        });
        return {
          action: 'merged',
          clusterId: report.cluster_id,
          matchedReportId: report.id,
          hammingDistance: 0,
          distanceMeters: 0,
          confirmationCount: existingCluster?.confirmation_count ?? 1,
        };
      }

      // 1. Proximity query: Find open candidates within 25 meters, excluding this report itself
      const candidates = await ProximityService.findNearbyOpenReports(
        report.lat,
        report.lng,
        PROXIMITY_SEARCH_RADIUS_METERS,
        report.id
      );

      // 2. Check if the incoming report has a valid pHash
      let result: ClusterAssignmentResult;
      if (!report.image_hash) {
        console.warn(
          `[ClusteringService] Report ${report.id} has no image_hash (pHash was skipped/failed). Falling back to creating a new cluster.`
        );
        result = await this.createNewCluster(report);
      } else {
        // 3. Evaluate visual similarity against candidates with valid pHashes
        const threshold = getHammingThreshold();
        let bestMatch: {
          candidate: NearbyReport;
          distance: number;
        } | null = null;

        for (const candidate of candidates) {
          if (!candidate.image_hash) {
            continue;
          }

          try {
            const dist = hammingDistance(report.image_hash, candidate.image_hash);

            // 4. Candidate must be at or below the threshold
            if (dist <= threshold) {
              // Pick candidate with smallest Hamming distance (tie-break by closer distance_meters)
              if (
                !bestMatch ||
                dist < bestMatch.distance ||
                (dist === bestMatch.distance && candidate.distance_meters < bestMatch.candidate.distance_meters)
              ) {
                bestMatch = { candidate, distance: dist };
              }
            }
          } catch (err) {
            console.warn(
              `[ClusteringService] Failed computing Hamming distance between report ${report.id} and candidate ${candidate.id}:`,
              err instanceof Error ? err.message : err
            );
          }
        }

        // 5. If a best match was found, merge into the cluster
        if (bestMatch) {
          result = await this.mergeIntoCluster(report, bestMatch.candidate, bestMatch.distance);
        } else {
          // 6. No match found within threshold -> create a brand new cluster
          console.log(
            `[ClusteringService] No visual match found within threshold <= ${threshold} bits for report ${report.id} (${candidates.length} nearby candidate(s) checked). Creating a new cluster.`
          );
          result = await this.createNewCluster(report);
        }
      }

      // Recompute priority score for the cluster after the merge/create transaction has committed.
      // Availability-over-completeness: Non-blocking error handling.
      try {
        await recomputeClusterPriority(result.clusterId);
      } catch (priorityError) {
        console.error(
          `[ClusteringService] Failed to recompute priority score for cluster ${result.clusterId}:`,
          priorityError instanceof Error ? priorityError.message : priorityError
        );
      }

      return result;
    } catch (error) {
      console.error(
        `[ClusteringService] Error evaluating cluster assignment for report ${report.id}:`,
        error instanceof Error ? error.message : error
      );
      throw new ClusteringException(
        `Failed to evaluate and assign cluster for report ${report.id}`,
        error
      );
    }
  }

  /**
   * Merges the incoming report with a matched nearby candidate.
   * Atomically updates report cluster_id, confirmation counts, centroid recalculations,
   * and creates confirmation audit records.
   */
  private static async mergeIntoCluster(
    report: Report,
    candidate: NearbyReport,
    matchedHammingDistance: number
  ): Promise<ClusterAssignmentResult> {
    return await prisma.$transaction(async (tx) => {
      let targetClusterId: string;
      let finalConfirmationCount: number;

      if (candidate.cluster_id) {
        // Case A: Candidate already belongs to an existing cluster
        targetClusterId = candidate.cluster_id;

        // Assign this report to the existing cluster
        await tx.report.update({
          where: { id: report.id },
          data: { cluster_id: targetClusterId },
        });

        // Increment confirmation count on existing cluster
        const updatedCluster = await tx.reportCluster.update({
          where: { id: targetClusterId },
          data: {
            confirmation_count: { increment: 1 },
          },
        });
        finalConfirmationCount = updatedCluster.confirmation_count;

        // Create ReportConfirmation for the new report
        await tx.reportConfirmation.upsert({
          where: {
            report_id_confirmed_by_user_id: {
              report_id: report.id,
              confirmed_by_user_id: report.user_id,
            },
          },
          update: { cluster_id: targetClusterId },
          create: {
            report_id: report.id,
            cluster_id: targetClusterId,
            confirmed_by_user_id: report.user_id,
          },
        });
      } else {
        // Case B: Candidate was a standalone unclustered report. Create a NEW cluster for both.
        const initialCentroidLat = (candidate.lat + report.lat) / 2;
        const initialCentroidLng = (candidate.lng + report.lng) / 2;

        const newCluster = await tx.reportCluster.create({
          data: {
            centroid_lat: initialCentroidLat,
            centroid_lng: initialCentroidLng,
            confirmation_count: 2, // Original candidate + incoming report
          },
        });
        targetClusterId = newCluster.id;
        finalConfirmationCount = 2;

        // Assign both the candidate and incoming report to this new cluster
        await tx.report.update({
          where: { id: candidate.id },
          data: { cluster_id: targetClusterId },
        });

        await tx.report.update({
          where: { id: report.id },
          data: { cluster_id: targetClusterId },
        });

        // Record confirmation for the candidate report (if candidate user_id is known)
        if (candidate.user_id) {
          await tx.reportConfirmation.upsert({
            where: {
              report_id_confirmed_by_user_id: {
                report_id: candidate.id,
                confirmed_by_user_id: candidate.user_id,
              },
            },
            update: { cluster_id: targetClusterId },
            create: {
              report_id: candidate.id,
              cluster_id: targetClusterId,
              confirmed_by_user_id: candidate.user_id,
            },
          });
        }

        // Record confirmation for the new incoming report
        await tx.reportConfirmation.upsert({
          where: {
            report_id_confirmed_by_user_id: {
              report_id: report.id,
              confirmed_by_user_id: report.user_id,
            },
          },
          update: { cluster_id: targetClusterId },
          create: {
            report_id: report.id,
            cluster_id: targetClusterId,
            confirmed_by_user_id: report.user_id,
          },
        });
      }

      // Recalculate cluster centroid as arithmetic mean of all reports currently assigned to it
      const allClusterReports = await tx.report.findMany({
        where: { cluster_id: targetClusterId },
        select: { lat: true, lng: true },
      });

      if (allClusterReports.length > 0) {
        const sumLat = allClusterReports.reduce((sum, r) => sum + r.lat, 0);
        const sumLng = allClusterReports.reduce((sum, r) => sum + r.lng, 0);
        const avgLat = sumLat / allClusterReports.length;
        const avgLng = sumLng / allClusterReports.length;

        await tx.reportCluster.update({
          where: { id: targetClusterId },
          data: {
            centroid_lat: avgLat,
            centroid_lng: avgLng,
          },
        });
      }

      console.log(
        `[ClusteringService] Merged report ${report.id} into cluster ${targetClusterId} (matched candidate ${candidate.id}, Hamming distance: ${matchedHammingDistance}, proximity: ${candidate.distance_meters.toFixed(2)}m, confirmations: ${finalConfirmationCount})`
      );

      return {
        action: 'merged',
        clusterId: targetClusterId,
        matchedReportId: candidate.id,
        hammingDistance: matchedHammingDistance,
        distanceMeters: candidate.distance_meters,
        confirmationCount: finalConfirmationCount,
      };
    });
  }

  /**
   * Creates a brand new ReportCluster when no suitable visual match exists.
   * Atomically initializes cluster, updates report cluster_id, and registers confirmation.
   */
  private static async createNewCluster(report: Report): Promise<ClusterAssignmentResult> {
    return await prisma.$transaction(async (tx) => {
      const newCluster = await tx.reportCluster.create({
        data: {
          centroid_lat: report.lat,
          centroid_lng: report.lng,
          confirmation_count: 1,
        },
      });

      await tx.report.update({
        where: { id: report.id },
        data: { cluster_id: newCluster.id },
      });

      await tx.reportConfirmation.upsert({
        where: {
          report_id_confirmed_by_user_id: {
            report_id: report.id,
            confirmed_by_user_id: report.user_id,
          },
        },
        update: { cluster_id: newCluster.id },
        create: {
          report_id: report.id,
          cluster_id: newCluster.id,
          confirmed_by_user_id: report.user_id,
        },
      });

      console.log(
        `[ClusteringService] Created new cluster ${newCluster.id} for report ${report.id} at (${report.lat}, ${report.lng})`
      );

      return {
        action: 'created_new',
        clusterId: newCluster.id,
        confirmationCount: 1,
      };
    });
  }
}

export const evaluateAndAssignCluster = ClusteringService.evaluateAndAssignCluster;
