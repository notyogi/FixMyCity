import 'dotenv/config';
import crypto from 'crypto';
import { IssueType, ReportStatus, ReputationReason, Severity } from '@prisma/client';
import prisma from '../utils/prisma';
import { ReputationService } from '../services/reputation.service';
import { getReputationLevel } from '../config/reputation.config';
import { ClusteringService } from '../services/clustering.service';
import {
  performClusterStatusUpdate,
  performSingleReportStatusUpdate,
} from '../controllers/reports.controller';
import usersRouter from '../routes/users.routes';

let totalTests = 0;
let passedTests = 0;

function assertTest(name: string, condition: boolean, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } else {
    console.error(`  [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
  }
}

async function runReputationTests(): Promise<void> {
  console.log('================================================================================');
  console.log('              FixMyCity - Reputation Logic & Idempotency Test Suite             ');
  console.log('================================================================================\n');

  const testUserIds: string[] = [];
  const seededClusterIds: string[] = [];
  const seededReportIds: string[] = [];

  const createTestUser = async (label: string, initialScore = 0) => {
    const id = crypto.randomUUID();
    testUserIds.push(id);
    return prisma.user.create({
      data: {
        id,
        name: `RepTest ${label}`,
        email: `reptest-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${id.slice(0, 8)}@fixmycity.test`,
        reputation_score: initialScore,
      },
    });
  };

  const getScore = async (userId: string): Promise<number> => {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { reputation_score: true },
    });
    return u?.reputation_score ?? 0;
  };

  // Coordinates in remote South Pacific far from any real/test data so ProximityService is isolated
  const BASE_LAT = -45.123456;
  const BASE_LNG = -120.654321;
  const TEST_PHASH = 'a5a5a5a5a5a5a5a5';
  const TEST_IMAGE = 'https://example.com/test-pothole.jpg';

  try {
    // Seed reusable test users
    const userA = await createTestUser('UserA');
    const userB = await createTestUser('UserB');
    const userC = await createTestUser('UserC');
    const userClosed = await createTestUser('UserClosed');

    // =========================================================================
    // TEST 1: Marking a cluster FIXED rewards reporters once; repeating gives 0
    // =========================================================================
    console.log('--- Test 1: Cluster FIXED Awards Once & Is Idempotent ---');
    const cluster1 = await prisma.reportCluster.create({
      data: {
        centroid_lat: BASE_LAT + 1,
        centroid_lng: BASE_LNG,
        confirmation_count: 2,
      },
    });
    seededClusterIds.push(cluster1.id);

    const c1RepA = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 1,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
        cluster_id: cluster1.id,
      },
    });
    const c1RepB = await prisma.report.create({
      data: {
        user_id: userB.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 1,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.HIGH,
        status: ReportStatus.UNDER_REVIEW,
        cluster_id: cluster1.id,
      },
    });
    seededReportIds.push(c1RepA.id, c1RepB.id);

    const fixRes1 = await performClusterStatusUpdate({
      clusterId: cluster1.id,
      targetStatus: ReportStatus.FIXED,
    });

    assertTest(
      '1a. First FIXED update awards +1 to UserA and +1 to UserB (reputationChanges=2)',
      (await getScore(userA.id)) === 1 &&
        (await getScore(userB.id)) === 1 &&
        fixRes1.reputationChanges === 2,
      `scores A=${await getScore(userA.id)}, B=${await getScore(userB.id)}, changes=${fixRes1.reputationChanges}`
    );

    const fixRes2 = await performClusterStatusUpdate({
      clusterId: cluster1.id,
      targetStatus: ReportStatus.FIXED,
    });
    const directRetry = await prisma.$transaction((tx) =>
      ReputationService.applyReputationEvents(tx, [
        { userId: userA.id, reportId: c1RepA.id, reason: ReputationReason.REPORT_FIXED },
        { userId: userB.id, reportId: c1RepB.id, reason: ReputationReason.REPORT_FIXED },
      ])
    );

    assertTest(
      '1b. Repeating cluster FIXED or retrying applyReputationEvents awards 0 extra points',
      (await getScore(userA.id)) === 1 &&
        (await getScore(userB.id)) === 1 &&
        fixRes2.reputationChanges === 0 &&
        directRetry.length === 0,
      `scores A=${await getScore(userA.id)}, B=${await getScore(userB.id)}, retryInserted=${directRetry.length}`
    );

    // =========================================================================
    // TEST 2: Already-closed reports in a cluster are not awarded again
    // =========================================================================
    console.log('\n--- Test 2: Already-Closed Reports Not Awarded Again ---');
    const cluster2 = await prisma.reportCluster.create({
      data: {
        centroid_lat: BASE_LAT + 2,
        centroid_lng: BASE_LNG,
        confirmation_count: 2,
      },
    });
    seededClusterIds.push(cluster2.id);

    const c2RepAlreadyClosed = await prisma.report.create({
      data: {
        user_id: userClosed.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 2,
        lng: BASE_LNG,
        issue_type: IssueType.GARBAGE,
        severity: Severity.LOW,
        status: ReportStatus.FIXED,
        cluster_id: cluster2.id,
      },
    });
    const c2RepOpen = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 2,
        lng: BASE_LNG,
        issue_type: IssueType.GARBAGE,
        severity: Severity.HIGH,
        status: ReportStatus.SCHEDULED,
        cluster_id: cluster2.id,
      },
    });
    seededReportIds.push(c2RepAlreadyClosed.id, c2RepOpen.id);

    const mixedRes = await performClusterStatusUpdate({
      clusterId: cluster2.id,
      targetStatus: ReportStatus.FIXED,
    });

    assertTest(
      '2. Closed report reporter gets 0; only open report transitions and awards +1',
      (await getScore(userClosed.id)) === 0 &&
        (await getScore(userA.id)) === 2 &&
        mixedRes.changedReports.length === 1 &&
        mixedRes.changedReports[0].id === c2RepOpen.id &&
        mixedRes.reputationChanges === 1,
      `userClosed=${await getScore(userClosed.id)}, userA=${await getScore(userA.id)}, changed=${mixedRes.changedReports.length}`
    );

    // =========================================================================
    // TEST 3: REJECTED with spam=true (-1), spam=false (0), omitted (defaults true -> -1)
    // =========================================================================
    console.log('\n--- Test 3: REJECTED Spam Flag Behavior ---');
    const cluster3a = await prisma.reportCluster.create({
      data: { centroid_lat: BASE_LAT + 3, centroid_lng: BASE_LNG, confirmation_count: 1 },
    });
    const cluster3b = await prisma.reportCluster.create({
      data: { centroid_lat: BASE_LAT + 3.1, centroid_lng: BASE_LNG, confirmation_count: 1 },
    });
    seededClusterIds.push(cluster3a.id, cluster3b.id);

    const rSpamTrue = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 3,
        lng: BASE_LNG,
        issue_type: IssueType.OTHER,
        severity: Severity.LOW,
        status: ReportStatus.SUBMITTED,
        cluster_id: cluster3a.id,
      },
    });
    const rSpamFalse = await prisma.report.create({
      data: {
        user_id: userB.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 3.1,
        lng: BASE_LNG,
        issue_type: IssueType.OTHER,
        severity: Severity.LOW,
        status: ReportStatus.SUBMITTED,
        cluster_id: cluster3b.id,
      },
    });
    const rSingleOmitted = await prisma.report.create({
      data: {
        user_id: userC.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 3.2,
        lng: BASE_LNG,
        issue_type: IssueType.OTHER,
        severity: Severity.LOW,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(rSpamTrue.id, rSpamFalse.id, rSingleOmitted.id);

    const scoreABeforeSpam = await getScore(userA.id);
    const rejSpamTrue = await performClusterStatusUpdate({
      clusterId: cluster3a.id,
      targetStatus: ReportStatus.REJECTED,
      spam: true,
    });
    assertTest(
      '3a. REJECTED with spam=true deducts -1',
      (await getScore(userA.id)) === scoreABeforeSpam - 1 && rejSpamTrue.reputationChanges === 1,
      `before=${scoreABeforeSpam}, after=${await getScore(userA.id)}`
    );

    const scoreBBeforeNonSpam = await getScore(userB.id);
    const rejSpamFalse = await performClusterStatusUpdate({
      clusterId: cluster3b.id,
      targetStatus: ReportStatus.REJECTED,
      spam: false,
    });
    assertTest(
      '3b. REJECTED with spam=false deducts 0 (no penalty)',
      (await getScore(userB.id)) === scoreBBeforeNonSpam && rejSpamFalse.reputationChanges === 0,
      `before=${scoreBBeforeNonSpam}, after=${await getScore(userB.id)}`
    );

    const scoreCBeforeDefault = await getScore(userC.id);
    const rejSingleDefault = await performSingleReportStatusUpdate({
      reportId: rSingleOmitted.id,
      targetStatus: ReportStatus.REJECTED,
    });
    assertTest(
      '3c. Single report REJECTED with omitted spam defaults to true (-1)',
      (await getScore(userC.id)) === scoreCBeforeDefault - 1 &&
        rejSingleDefault.reputationChanges === 1,
      `before=${scoreCBeforeDefault}, after=${await getScore(userC.id)}`
    );

    // =========================================================================
    // TEST 4 & 5: Merge confirmations (different user +1, self 0, 3rd user +1, same pair 0)
    // =========================================================================
    console.log('\n--- Test 4 & 5: Cluster Merge Confirmations & Self-Confirmation Prevention ---');
    const scoreAStartMerge = await getScore(userA.id);
    const scoreBStartMerge = await getScore(userB.id);

    // M1 by UserA (creates cluster)
    const m1 = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        image_hash: TEST_PHASH,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(m1.id);
    const assign1 = await ClusteringService.evaluateAndAssignCluster(m1);
    seededClusterIds.push(assign1.clusterId);

    // M2 by UserA (self-confirmation attempt ~2m away)
    const m2Self = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        image_hash: TEST_PHASH,
        lat: BASE_LAT + 0.000018,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(m2Self.id);
    const assign2Self = await ClusteringService.evaluateAndAssignCluster(m2Self);

    assertTest(
      '4a. Self-confirmation merge by same user awards 0 points',
      assign2Self.action === 'merged' &&
        assign2Self.clusterId === assign1.clusterId &&
        (await getScore(userA.id)) === scoreAStartMerge,
      `action=${assign2Self.action}, scoreA=${await getScore(userA.id)} (expected ${scoreAStartMerge})`
    );

    // M3 by UserB (different user ~3m away) -> +1 to UserA
    const m3OtherB = await prisma.report.create({
      data: {
        user_id: userB.id,
        image_url: TEST_IMAGE,
        image_hash: TEST_PHASH,
        lat: BASE_LAT + 0.000027,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(m3OtherB.id);
    const assign3B = await ClusteringService.evaluateAndAssignCluster(m3OtherB);

    assertTest(
      '4b. Merge by different user (UserB) gives +1 CONFIRMED_BY_OTHER to original reporter (UserA)',
      assign3B.action === 'merged' &&
        assign3B.clusterId === assign1.clusterId &&
        (await getScore(userA.id)) === scoreAStartMerge + 1 &&
        (await getScore(userB.id)) === scoreBStartMerge,
      `action=${assign3B.action}, scoreA=${await getScore(userA.id)} (expected ${scoreAStartMerge + 1})`
    );

    // M4 by UserA again (must still award 0 even if matched candidate belonged to UserB)
    const m4SelfAgain = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        image_hash: TEST_PHASH,
        lat: BASE_LAT + 0.000028,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(m4SelfAgain.id);
    const assign4Self = await ClusteringService.evaluateAndAssignCluster(m4SelfAgain);

    assertTest(
      '4c. Original reporter submitting another duplicate awards 0 points',
      assign4Self.action === 'merged' &&
        (await getScore(userA.id)) === scoreAStartMerge + 1,
      `scoreA=${await getScore(userA.id)}`
    );

    // M5 by UserC (3rd distinct user ~1m away) -> +1 again to UserA
    const m5OtherC = await prisma.report.create({
      data: {
        user_id: userC.id,
        image_url: TEST_IMAGE,
        image_hash: TEST_PHASH,
        lat: BASE_LAT + 0.00001,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(m5OtherC.id);
    const assign5C = await ClusteringService.evaluateAndAssignCluster(m5OtherC);

    assertTest(
      '5a. Confirmation from 3rd distinct user (UserC) gives another +1 to UserA',
      assign5C.action === 'merged' &&
        assign5C.clusterId === assign1.clusterId &&
        (await getScore(userA.id)) === scoreAStartMerge + 2,
      `scoreA=${await getScore(userA.id)} (expected ${scoreAStartMerge + 2})`
    );

    // M6 by UserB AGAIN (same pair UserB -> m1 twice) -> 0 extra points
    const m6RepeatB = await prisma.report.create({
      data: {
        user_id: userB.id,
        image_url: TEST_IMAGE,
        image_hash: TEST_PHASH,
        lat: BASE_LAT + 0.000005,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(m6RepeatB.id);
    const assign6RepeatB = await ClusteringService.evaluateAndAssignCluster(m6RepeatB);

    assertTest(
      '5b. Same confirming user (UserB) merging a second duplicate awards 0 extra points',
      assign6RepeatB.action === 'merged' &&
        (await getScore(userA.id)) === scoreAStartMerge + 2,
      `scoreA=${await getScore(userA.id)}`
    );

    // =========================================================================
    // TEST 6: Reputation failure does NOT prevent status update from committing
    // =========================================================================
    console.log('\n--- Test 6: Reputation Failure Is Non-Blocking ---');
    const clusterFail = await prisma.reportCluster.create({
      data: { centroid_lat: BASE_LAT + 6, centroid_lng: BASE_LNG, confirmation_count: 1 },
    });
    seededClusterIds.push(clusterFail.id);

    const rFail = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 6,
        lng: BASE_LNG,
        issue_type: IssueType.DRAINAGE,
        severity: Severity.HIGH,
        status: ReportStatus.UNDER_REVIEW,
        cluster_id: clusterFail.id,
      },
    });
    seededReportIds.push(rFail.id);

    const scoreABeforeFail = await getScore(userA.id);
    const failRes = await performClusterStatusUpdate({
      clusterId: clusterFail.id,
      targetStatus: ReportStatus.FIXED,
      applyReputationFn: async () => {
        throw new Error('Simulated transient reputation failure');
      },
    });

    const reloadedRFail = await prisma.report.findUnique({ where: { id: rFail.id } });
    const failEvents = await prisma.reputationEvent.findMany({ where: { report_id: rFail.id } });

    assertTest(
      '6. When reputation throws, report status FIXED still commits and score stays unchanged',
      reloadedRFail?.status === ReportStatus.FIXED &&
        failRes.reputationChanges === 0 &&
        (await getScore(userA.id)) === scoreABeforeFail &&
        failEvents.length === 0,
      `status=${reloadedRFail?.status}, repChanges=${failRes.reputationChanges}, events=${failEvents.length}`
    );

    // =========================================================================
    // TEST 7: Two parallel status/reputation calls do not double-award
    // =========================================================================
    console.log('\n--- Test 7: Concurrency / Parallel Race Idempotency ---');
    const clusterPar = await prisma.reportCluster.create({
      data: { centroid_lat: BASE_LAT + 7, centroid_lng: BASE_LNG, confirmation_count: 1 },
    });
    seededClusterIds.push(clusterPar.id);

    const rParStatus = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 7,
        lng: BASE_LNG,
        issue_type: IssueType.SIDEWALK,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
        cluster_id: clusterPar.id,
      },
    });
    const rParDirect = await prisma.report.create({
      data: {
        user_id: userB.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 7.1,
        lng: BASE_LNG,
        issue_type: IssueType.SIDEWALK,
        severity: Severity.MEDIUM,
        status: ReportStatus.FIXED,
      },
    });
    seededReportIds.push(rParStatus.id, rParDirect.id);

    const scoreABeforePar = await getScore(userA.id);
    const [parRes1, parRes2] = await Promise.all([
      performClusterStatusUpdate({ clusterId: clusterPar.id, targetStatus: ReportStatus.FIXED }),
      performClusterStatusUpdate({ clusterId: clusterPar.id, targetStatus: ReportStatus.FIXED }),
    ]);

    const parTotalChanges = parRes1.reputationChanges + parRes2.reputationChanges;
    assertTest(
      '7a. Two parallel performClusterStatusUpdate calls award +1 total (no double increment)',
      (await getScore(userA.id)) === scoreABeforePar + 1 && parTotalChanges === 1,
      `scoreA=${await getScore(userA.id)} (expected ${scoreABeforePar + 1}), changes=${parRes1.reputationChanges}+${parRes2.reputationChanges}`
    );

    const scoreBBeforeParDirect = await getScore(userB.id);
    const [txRes1, txRes2] = await Promise.all([
      prisma.$transaction((tx) =>
        ReputationService.applyReputationEvents(tx, [
          { userId: userB.id, reportId: rParDirect.id, reason: ReputationReason.REPORT_FIXED },
        ])
      ),
      prisma.$transaction((tx) =>
        ReputationService.applyReputationEvents(tx, [
          { userId: userB.id, reportId: rParDirect.id, reason: ReputationReason.REPORT_FIXED },
        ])
      ),
    ]);

    assertTest(
      '7b. Two concurrent transactions calling applyReputationEvents insert only 1 event (+1 total)',
      txRes1.length + txRes2.length === 1 &&
        (await getScore(userB.id)) === scoreBBeforeParDirect + 1,
      `inserted=${txRes1.length}+${txRes2.length}, scoreB=${await getScore(userB.id)} (expected ${scoreBBeforeParDirect + 1})`
    );

    // =========================================================================
    // TEST 8: Tier Levels, Summary Query, & Route Registration Order
    // =========================================================================
    console.log('\n--- Test 8: Reputation Summary, Tier Thresholds & Users Routes ---');
    const summaryA = await ReputationService.getReputationForUser(userA.id);
    const expectedScoreA = await getScore(userA.id);

    assertTest(
      '8a. getReputationForUser returns matching score, valid level, and recent_events <= 20',
      summaryA.score === expectedScoreA &&
        summaryA.level === getReputationLevel(expectedScoreA) &&
        summaryA.recent_events.length > 0 &&
        summaryA.recent_events.length <= 20
    );

    assertTest(
      '8b. Reputation tier thresholds map cleanly (-1 Flagged, 0..4 New, 5..14 Trusted, 15+ Top contributor)',
      getReputationLevel(-1) === 'Flagged' &&
        getReputationLevel(0) === 'New' &&
        getReputationLevel(4) === 'New' &&
        getReputationLevel(5) === 'Trusted' &&
        getReputationLevel(14) === 'Trusted' &&
        getReputationLevel(15) === 'Top contributor'
    );

    const userRoutePaths = (usersRouter.stack as any[])
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);
    const meIdx = userRoutePaths.indexOf('/me/reputation');
    const idIdx = userRoutePaths.indexOf('/:id/reputation');
    assertTest(
      '8c. GET /users/me/reputation is registered BEFORE GET /users/:id/reputation',
      meIdx !== -1 && idIdx !== -1 && meIdx < idIdx,
      `routes=${JSON.stringify(userRoutePaths)}`
    );
  } catch (err) {
    console.error('\nUnhandled error during reputation tests:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n--- Cleaning up temporary test rows from database ---');
    try {
      // Discover any additional report IDs or auto-created cluster IDs linked to test users
      const userReports =
        testUserIds.length > 0
          ? await prisma.report.findMany({
              where: { user_id: { in: testUserIds } },
              select: { id: true, cluster_id: true },
            })
          : [];

      const allReportIds = Array.from(
        new Set([...seededReportIds, ...userReports.map((r) => r.id)])
      );
      const allClusterIds = Array.from(
        new Set([
          ...seededClusterIds,
          ...(userReports.map((r) => r.cluster_id).filter(Boolean) as string[]),
        ])
      );

      if (testUserIds.length > 0 || allReportIds.length > 0) {
        await prisma.reputationEvent.deleteMany({
          where: {
            OR: [
              ...(testUserIds.length > 0 ? [{ user_id: { in: testUserIds } }] : []),
              ...(allReportIds.length > 0 ? [{ report_id: { in: allReportIds } }] : []),
            ],
          },
        });
      }

      if (testUserIds.length > 0 || allReportIds.length > 0 || allClusterIds.length > 0) {
        await prisma.reportConfirmation.deleteMany({
          where: {
            OR: [
              ...(testUserIds.length > 0 ? [{ confirmed_by_user_id: { in: testUserIds } }] : []),
              ...(allReportIds.length > 0 ? [{ report_id: { in: allReportIds } }] : []),
              ...(allClusterIds.length > 0 ? [{ cluster_id: { in: allClusterIds } }] : []),
            ],
          },
        });
      }

      if (allReportIds.length > 0) {
        await prisma.report.deleteMany({
          where: { id: { in: allReportIds } },
        });
      }

      if (allClusterIds.length > 0) {
        await prisma.reportCluster.deleteMany({
          where: { id: { in: allClusterIds } },
        });
      }

      if (testUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: testUserIds } },
        });
      }

      console.log('Temporary test records deleted cleanly.');
    } catch (cleanupErr) {
      console.error('Warning: Failed cleaning up test data:', cleanupErr);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} tests passed`);
  console.log('================================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runReputationTests();

