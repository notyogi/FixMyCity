import 'dotenv/config';
import crypto from 'crypto';
import { IssueType, ReportStatus, Severity } from '@prisma/client';
import prisma from '../utils/prisma';
import { NotificationService, NotificationNotFoundError } from '../services/notification.service';
import {
  performClusterStatusUpdate,
  performSingleReportStatusUpdate,
} from '../controllers/reports.controller';

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

async function runNotificationTests(): Promise<void> {
  console.log('================================================================================');
  console.log('            FixMyCity - In-App Status Notification Test Suite                  ');
  console.log('================================================================================\n');

  const testUserIds: string[] = [];
  const seededClusterIds: string[] = [];
  const seededReportIds: string[] = [];

  const createTestUser = async (label: string) => {
    const id = crypto.randomUUID();
    testUserIds.push(id);
    return prisma.user.create({
      data: {
        id,
        name: `NotifTest ${label}`,
        email: `notiftest-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${id.slice(0, 8)}@fixmycity.test`,
        reputation_score: 0,
      },
    });
  };

  const BASE_LAT = -35.123456;
  const BASE_LNG = -115.654321;
  const TEST_IMAGE = 'https://example.com/test-notif-pothole.jpg';

  try {
    const userA = await createTestUser('UserA');
    const userB = await createTestUser('UserB');
    const userAdmin = await createTestUser('AdminUser');
    const userOther = await createTestUser('OtherUser');

    // =========================================================================
    // TEST 1: Cluster status change creates ONE notification per distinct reporter
    // (even when a user has multiple reports in the cluster, linked to earliest)
    // =========================================================================
    console.log('--- Test 1: Deduplication per Reporter within a Cluster ---');
    const cluster1 = await prisma.reportCluster.create({
      data: {
        centroid_lat: BASE_LAT,
        centroid_lng: BASE_LNG,
        confirmation_count: 3,
      },
    });
    seededClusterIds.push(cluster1.id);

    const earliestDate = new Date(Date.now() - 3600000);
    const laterDate = new Date(Date.now() - 1800000);

    const rA1 = await prisma.report.create({
      data: {
        user_id: userA.id,
        cluster_id: cluster1.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.HIGH,
        status: ReportStatus.SUBMITTED,
        created_at: earliestDate,
      },
    });
    seededReportIds.push(rA1.id);

    const rA2 = await prisma.report.create({
      data: {
        user_id: userA.id,
        cluster_id: cluster1.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.HIGH,
        status: ReportStatus.SUBMITTED,
        created_at: laterDate,
      },
    });
    seededReportIds.push(rA2.id);

    const rB1 = await prisma.report.create({
      data: {
        user_id: userB.id,
        cluster_id: cluster1.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.DRAINAGE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
        created_at: laterDate,
      },
    });
    seededReportIds.push(rB1.id);

    const update1 = await performClusterStatusUpdate({
      clusterId: cluster1.id,
      targetStatus: ReportStatus.UNDER_REVIEW,
    });

    const notifsUserA = await prisma.notification.findMany({
      where: { user_id: userA.id, cluster_id: cluster1.id },
    });
    const notifsUserB = await prisma.notification.findMany({
      where: { user_id: userB.id, cluster_id: cluster1.id },
    });

    assertTest(
      '1a. Cluster status change creates exactly 1 notification for User A (who has 2 reports)',
      notifsUserA.length === 1,
      `Expected 1, got ${notifsUserA.length}`
    );
    assertTest(
      '1b. User A notification is linked to their earliest report',
      notifsUserA.length > 0 && notifsUserA[0].report_id === rA1.id,
      `Expected report_id ${rA1.id}, got ${notifsUserA[0]?.report_id}`
    );
    assertTest(
      '1c. Cluster status change creates exactly 1 notification for User B',
      notifsUserB.length === 1,
      `Expected 1, got ${notifsUserB.length}`
    );
    assertTest(
      '1d. User B notification body contains readable issue name "drainage"',
      notifsUserB.length > 0 && notifsUserB[0].body.includes('drainage'),
      `Got body: ${notifsUserB[0]?.body}`
    );

    // =========================================================================
    // TEST 2: Repeating the same status call creates no duplicates (idempotent)
    // =========================================================================
    console.log('\n--- Test 2: Idempotency Guards Against Duplicates ---');
    const updateRepeat = await performClusterStatusUpdate({
      clusterId: cluster1.id,
      targetStatus: ReportStatus.UNDER_REVIEW,
    });

    const notifsUserAAfterRepeat = await prisma.notification.findMany({
      where: { user_id: userA.id, cluster_id: cluster1.id },
    });
    const notifsUserBAfterRepeat = await prisma.notification.findMany({
      where: { user_id: userB.id, cluster_id: cluster1.id },
    });

    assertTest(
      '2a. Repeating status call returns 0 notificationsCreated',
      updateRepeat.notificationsCreated === 0,
      `Expected 0, got ${updateRepeat.notificationsCreated}`
    );
    assertTest(
      '2b. Total notifications for User A remain exactly 1',
      notifsUserAAfterRepeat.length === 1,
      `Expected 1, got ${notifsUserAAfterRepeat.length}`
    );
    assertTest(
      '2c. Total notifications for User B remain exactly 1',
      notifsUserBAfterRepeat.length === 1,
      `Expected 1, got ${notifsUserBAfterRepeat.length}`
    );

    // =========================================================================
    // TEST 3: Reports that were already closed are not notified
    // =========================================================================
    console.log('\n--- Test 3: Already-Closed Reports Are Not Notified ---');
    const clusterClosedTest = await prisma.reportCluster.create({
      data: {
        centroid_lat: BASE_LAT + 0.1,
        centroid_lng: BASE_LNG,
        confirmation_count: 2,
      },
    });
    seededClusterIds.push(clusterClosedTest.id);

    const rAlreadyFixed = await prisma.report.create({
      data: {
        user_id: userOther.id,
        cluster_id: clusterClosedTest.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.STREETLIGHT,
        severity: Severity.LOW,
        status: ReportStatus.FIXED, // Already closed
      },
    });
    seededReportIds.push(rAlreadyFixed.id);

    const rActive = await prisma.report.create({
      data: {
        user_id: userA.id,
        cluster_id: clusterClosedTest.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.STREETLIGHT,
        severity: Severity.LOW,
        status: ReportStatus.UNDER_REVIEW,
      },
    });
    seededReportIds.push(rActive.id);

    // Transition cluster to SCHEDULED
    await performClusterStatusUpdate({
      clusterId: clusterClosedTest.id,
      targetStatus: ReportStatus.SCHEDULED,
    });

    const notifsUserOther = await prisma.notification.findMany({
      where: { user_id: userOther.id, report_id: rAlreadyFixed.id },
    });
    const notifsUserAClusterClosed = await prisma.notification.findMany({
      where: { user_id: userA.id, report_id: rActive.id, new_status: ReportStatus.SCHEDULED },
    });

    assertTest(
      '3a. Already-fixed report is not notified on subsequent cluster transition',
      notifsUserOther.length === 0,
      `Expected 0, got ${notifsUserOther.length}`
    );
    assertTest(
      '3b. Active report in the same cluster receives notification',
      notifsUserAClusterClosed.length === 1,
      `Expected 1, got ${notifsUserAClusterClosed.length}`
    );

    // =========================================================================
    // TEST 4: REJECTED uses neutral wording and never contains the word "spam"
    // =========================================================================
    console.log('\n--- Test 4: Neutral REJECTED Copy (Never Says "spam") ---');
    const clusterReject = await prisma.reportCluster.create({
      data: {
        centroid_lat: BASE_LAT + 0.2,
        centroid_lng: BASE_LNG,
        confirmation_count: 1,
      },
    });
    seededClusterIds.push(clusterReject.id);

    const rReject = await prisma.report.create({
      data: {
        user_id: userB.id,
        cluster_id: clusterReject.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.GARBAGE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(rReject.id);

    // Admin rejects with spam=true
    await performClusterStatusUpdate({
      clusterId: clusterReject.id,
      targetStatus: ReportStatus.REJECTED,
      spam: true,
    });

    const rejectNotifs = await prisma.notification.findMany({
      where: { user_id: userB.id, report_id: rReject.id },
    });

    assertTest(
      '4a. REJECTED creates notification for reporter',
      rejectNotifs.length === 1,
      `Expected 1, got ${rejectNotifs.length}`
    );
    const rejectNotif = rejectNotifs[0];
    const fullText = `${rejectNotif?.title || ''} ${rejectNotif?.body || ''}`.toLowerCase();
    assertTest(
      '4b. REJECTED notification NEVER contains the word "spam"',
      !fullText.includes('spam'),
      `Found forbidden word "spam" in: "${fullText}"`
    );
    assertTest(
      '4c. REJECTED notification uses neutral "Report closed" title',
      rejectNotif?.title === 'Report closed',
      `Got title: "${rejectNotif?.title}"`
    );

    // =========================================================================
    // TEST 5: User can only list and mark their own notifications (404 otherwise)
    // =========================================================================
    console.log('\n--- Test 5: Scoped Access & User Isolation ---');
    const userAList = await NotificationService.listForUser(userA.id, { page: 1, limit: 20 });
    const userAHasOnlyOwn = userAList.data.every((n) => n.user_id === userA.id);

    assertTest(
      '5a. listForUser returns only notifications belonging to userA',
      userAHasOnlyOwn && userAList.data.length > 0,
      `Total returned: ${userAList.data.length}`
    );

    let markOtherCaught404 = false;
    try {
      // User B attempts to mark User A's notification as read
      await NotificationService.markRead(userB.id, notifsUserA[0].id);
    } catch (err: any) {
      if (err instanceof NotificationNotFoundError || err.statusCode === 404) {
        markOtherCaught404 = true;
      }
    }

    assertTest(
      '5b. Attempting to mark another user notification as read throws 404',
      markOtherCaught404
    );

    // =========================================================================
    // TEST 6: unread-count and read-all behave correctly
    // =========================================================================
    console.log('\n--- Test 6: Unread Count and Mark All Read ---');
    const unreadCountBefore = await NotificationService.unreadCount(userA.id);
    assertTest(
      '6a. unreadCount accurately reflects unread items',
      unreadCountBefore > 0,
      `Got unread count: ${unreadCountBefore}`
    );

    const markAllResult = await NotificationService.markAllRead(userA.id);
    assertTest(
      '6b. markAllRead returns count of marked notifications',
      markAllResult.updated_count === unreadCountBefore,
      `Expected ${unreadCountBefore}, got ${markAllResult.updated_count}`
    );

    const unreadCountAfter = await NotificationService.unreadCount(userA.id);
    assertTest(
      '6c. unreadCount is 0 after markAllRead',
      unreadCountAfter === 0,
      `Expected 0, got ${unreadCountAfter}`
    );

    // =========================================================================
    // TEST 7: Thrown error inside notification creation does not stop status update
    // =========================================================================
    console.log('\n--- Test 7: Non-Blocking Fault Tolerance (Availability over Completeness) ---');
    const clusterFaultTest = await prisma.reportCluster.create({
      data: {
        centroid_lat: BASE_LAT + 0.3,
        centroid_lng: BASE_LNG,
        confirmation_count: 1,
      },
    });
    seededClusterIds.push(clusterFaultTest.id);

    const rFault = await prisma.report.create({
      data: {
        user_id: userA.id,
        cluster_id: clusterFaultTest.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.HIGH,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(rFault.id);

    const throwingNotificationFn = async () => {
      throw new Error('Simulated database glitch in notification pipeline');
    };

    const faultRes = await performClusterStatusUpdate({
      clusterId: clusterFaultTest.id,
      targetStatus: ReportStatus.SCHEDULED,
      createNotificationsFn: throwingNotificationFn as any,
    });

    const refreshedReport = await prisma.report.findUnique({
      where: { id: rFault.id },
      select: { status: true },
    });

    assertTest(
      '7a. Status update commits successfully even when notification service throws',
      refreshedReport?.status === ReportStatus.SCHEDULED && faultRes.changedReports.length === 1,
      `Report status: ${refreshedReport?.status}`
    );

    // =========================================================================
    // TEST 8: Admin acting as reporter is not notified
    // =========================================================================
    console.log('\n--- Test 8: Admin Self-Action Exclusion ---');
    const clusterAdminTest = await prisma.reportCluster.create({
      data: {
        centroid_lat: BASE_LAT + 0.4,
        centroid_lng: BASE_LNG,
        confirmation_count: 2,
      },
    });
    seededClusterIds.push(clusterAdminTest.id);

    const rAdmin = await prisma.report.create({
      data: {
        user_id: userAdmin.id,
        cluster_id: clusterAdminTest.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.SIDEWALK,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(rAdmin.id);

    const rCitizen = await prisma.report.create({
      data: {
        user_id: userOther.id,
        cluster_id: clusterAdminTest.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.SIDEWALK,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
      },
    });
    seededReportIds.push(rCitizen.id);

    // Admin user performs the status update
    await performClusterStatusUpdate({
      clusterId: clusterAdminTest.id,
      targetStatus: ReportStatus.UNDER_REVIEW,
      adminUserId: userAdmin.id,
    });

    const notifsAdmin = await prisma.notification.findMany({
      where: { user_id: userAdmin.id, report_id: rAdmin.id },
    });
    const notifsCitizen = await prisma.notification.findMany({
      where: { user_id: userOther.id, report_id: rCitizen.id },
    });

    assertTest(
      '8a. Acting admin does NOT receive a notification for their own report',
      notifsAdmin.length === 0,
      `Expected 0, got ${notifsAdmin.length}`
    );
    assertTest(
      '8b. Citizen in the same cluster receives their notification normally',
      notifsCitizen.length === 1,
      `Expected 1, got ${notifsCitizen.length}`
    );
  } finally {
    // Teardown test data cleanly
    console.log('\n--- Cleaning up test artifacts ---');
    try {
      if (testUserIds.length > 0) {
        await prisma.notification.deleteMany({
          where: { user_id: { in: testUserIds } },
        });
      }
      if (seededReportIds.length > 0) {
        await prisma.reportConfirmation.deleteMany({
          where: { report_id: { in: seededReportIds } },
        });
        await prisma.reputationEvent.deleteMany({
          where: { report_id: { in: seededReportIds } },
        });
        await prisma.report.deleteMany({
          where: { id: { in: seededReportIds } },
        });
      }
      if (seededClusterIds.length > 0) {
        await prisma.reportCluster.deleteMany({
          where: { id: { in: seededClusterIds } },
        });
      }
      if (testUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: testUserIds } },
        });
      }
      console.log('Teardown complete.');
    } catch (cleanupErr) {
      console.error('Teardown error:', cleanupErr);
    }
  }

  console.log('\n================================================================================');
  console.log(`Results: ${passedTests} / ${totalTests} test assertions passed.`);
  console.log('================================================================================\n');

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

if (require.main === module) {
  runNotificationTests()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error('Fatal test error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
