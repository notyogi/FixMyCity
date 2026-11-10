/**
 * ONE-TIME HISTORICAL BACKFILL SCRIPT — CONFIRM WITH USER BEFORE RUNNING AGAINST LIVE DB!
 *
 * Please ask the user for confirmation before executing this script against production
 * Supabase data. It retroactively awards/deducts points for historical records created
 * before reputation tracking was enabled:
 *   1. Existing FIXED reports -> +1 (REPORT_FIXED) to the reporter
 *   2. Existing REJECTED reports -> -1 (REPORT_REJECTED_SPAM) to the reporter (assumes
 *      historical rejections prior to Week 7 were invalid/spam)
 *   3. Existing multi-user clusters -> +1 (CONFIRMED_BY_OTHER) to the cluster's earliest
 *      (original) reporter for each distinct confirming user
 *
 * Idempotency:
 *   Uses ReputationService.applyReputationEvents with deterministic `dedupe_key`
 *   (`${reason}:${report_id}:${related_user_id ?? ""}`), so previously recorded events are
 *   safely skipped without double-awarding.
 *
 * Usage:
 *   npm run backfill:reputation
 */
import 'dotenv/config';
import { ReportStatus, ReputationReason } from '@prisma/client';
import prisma from '../utils/prisma';
import {
  ReputationService,
  ReputationEventInput,
  buildReputationDedupeKey,
} from '../services/reputation.service';

const BATCH_SIZE = 100;

async function backfillReputation(): Promise<void> {
  console.log('================================================================================');
  console.log('                 FixMyCity - Historical Reputation Backfill                     ');
  console.log('================================================================================\n');

  try {
    // 1. Collect candidates using an in-memory map keyed by deterministic dedupe_key
    const candidateMap = new Map<string, ReputationEventInput>();

    const addCandidate = (ev: ReputationEventInput) => {
      const key = buildReputationDedupeKey(ev.reason, ev.reportId, ev.relatedUserId);
      if (!candidateMap.has(key)) {
        candidateMap.set(key, ev);
      }
    };

    // 2. Scan historical FIXED and REJECTED reports
    const closedReports = await prisma.report.findMany({
      where: {
        status: {
          in: [ReportStatus.FIXED, ReportStatus.REJECTED],
        },
      },
      select: {
        id: true,
        user_id: true,
        status: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    for (const report of closedReports) {
      if (report.status === ReportStatus.FIXED) {
        addCandidate({
          userId: report.user_id,
          reportId: report.id,
          reason: ReputationReason.REPORT_FIXED,
        });
      } else if (report.status === ReportStatus.REJECTED) {
        addCandidate({
          userId: report.user_id,
          reportId: report.id,
          reason: ReputationReason.REPORT_REJECTED_SPAM,
        });
      }
    }

    // 3. Scan historical clusters for independent citizen confirmations
    const clusters = await prisma.reportCluster.findMany({
      include: {
        reports: {
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            user_id: true,
            created_at: true,
          },
        },
        confirmations: {
          select: {
            id: true,
            confirmed_by_user_id: true,
          },
        },
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    for (const cluster of clusters) {
      if (cluster.reports.length === 0) {
        continue;
      }

      const originalReport = cluster.reports[0];

      // Subsequent merged reports from other citizens
      for (const r of cluster.reports.slice(1)) {
        if (r.user_id !== originalReport.user_id) {
          addCandidate({
            userId: originalReport.user_id,
            reportId: originalReport.id,
            reason: ReputationReason.CONFIRMED_BY_OTHER,
            relatedUserId: r.user_id,
          });
        }
      }

      // Standalone or audit ReportConfirmation records from other citizens
      for (const conf of cluster.confirmations) {
        if (conf.confirmed_by_user_id !== originalReport.user_id) {
          addCandidate({
            userId: originalReport.user_id,
            reportId: originalReport.id,
            reason: ReputationReason.CONFIRMED_BY_OTHER,
            relatedUserId: conf.confirmed_by_user_id,
          });
        }
      }
    }

    const candidates = Array.from(candidateMap.values());
    console.log(`Scanned ${closedReports.length} closed report(s) and ${clusters.length} cluster(s).`);
    console.log(`Unique candidate reputation events to evaluate: ${candidates.length}\n`);

    if (candidates.length === 0) {
      console.log('Nothing to backfill. Exiting cleanly.');
      return;
    }

    // 4. Apply in bounded transaction batches
    let totalApplied = 0;
    let totalSkipped = 0;
    const appliedByReason: Record<ReputationReason, number> = {
      [ReputationReason.REPORT_FIXED]: 0,
      [ReputationReason.REPORT_REJECTED_SPAM]: 0,
      [ReputationReason.CONFIRMED_BY_OTHER]: 0,
    };

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);

      const applied = await prisma.$transaction((tx) =>
        ReputationService.applyReputationEvents(tx, batch)
      );

      totalApplied += applied.length;
      totalSkipped += batch.length - applied.length;

      for (const ev of applied) {
        appliedByReason[ev.reason] = (appliedByReason[ev.reason] || 0) + 1;
      }

      console.log(
        `  Batch [${batchNum}/${totalBatches}]: evaluated=${batch.length}, applied=${applied.length}, skipped=${batch.length - applied.length}`
      );
    }

    console.log('\n--- Backfill Summary ---');
    console.log(`Total Evaluated:           ${candidates.length}`);
    console.log(`Applied (new):             ${totalApplied}`);
    console.log(`Skipped (already applied): ${totalSkipped}`);
    console.log(`  - REPORT_FIXED:          ${appliedByReason[ReputationReason.REPORT_FIXED]}`);
    console.log(`  - REPORT_REJECTED_SPAM:  ${appliedByReason[ReputationReason.REPORT_REJECTED_SPAM]}`);
    console.log(`  - CONFIRMED_BY_OTHER:    ${appliedByReason[ReputationReason.CONFIRMED_BY_OTHER]}`);
    console.log('================================================================================');
  } catch (err) {
    console.error('Fatal error during reputation backfill:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    console.log('Disconnected from database.');
  }
}

backfillReputation();

