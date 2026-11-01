import 'dotenv/config';
import prisma from '../utils/prisma';
import { IssueType, ReportStatus, Severity } from '@prisma/client';
import {
  priorityQueueQuerySchema,
} from '../validation/report.validation';
import {
  PriorityQueueService,
  buildQueueItem,
  getSeveritiesAtOrAbove,
  ReportClusterWithReports,
} from './../services/priorityQueue.service';

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

async function runTestSuite() {
  console.log('================================================================================');
  console.log('              PRIORITY QUEUE TEST SUITE (UNIT & INTEGRATION)                    ');
  console.log('================================================================================\n');

  // ============================================================================
  // SUITE 1: ZOD QUERY VALIDATION
  // ============================================================================
  console.log('--- Suite 1: Query Validation Schema ---');

  const defaultParse = priorityQueueQuerySchema.safeParse({});
  assertTest('Default page is 1', defaultParse.success && defaultParse.data.page === 1);
  assertTest('Default limit is 20', defaultParse.success && defaultParse.data.limit === 20);
  assertTest('Default include_closed is false', defaultParse.success && defaultParse.data.include_closed === false);

  const booleanParseTrue = priorityQueueQuerySchema.safeParse({
    near_sensitive_location: 'true',
    include_closed: '1',
  });
  assertTest(
    'String boolean coercion ("true" / "1")',
    booleanParseTrue.success &&
      booleanParseTrue.data.near_sensitive_location === true &&
      booleanParseTrue.data.include_closed === true
  );

  const booleanParseFalse = priorityQueueQuerySchema.safeParse({
    near_sensitive_location: 'false',
    include_closed: '0',
  });
  assertTest(
    'String boolean coercion ("false" / "0")',
    booleanParseFalse.success &&
      booleanParseFalse.data.near_sensitive_location === false &&
      booleanParseFalse.data.include_closed === false
  );

  const invalidLimit = priorityQueueQuerySchema.safeParse({ limit: 101 });
  assertTest('Rejects limit > 100', !invalidLimit.success);

  const invalidPage = priorityQueueQuerySchema.safeParse({ page: 0 });
  assertTest('Rejects page < 1', !invalidPage.success);

  const invalidEnum = priorityQueueQuerySchema.safeParse({ min_severity: 'SUPER_HIGH' });
  assertTest('Rejects invalid severity enum', !invalidEnum.success);

  // ============================================================================
  // SUITE 2: IN-MEMORY QUEUE ITEM BUILDING & LOGIC
  // ============================================================================
  console.log('\n--- Suite 2: In-Memory QueueItem Aggregation Logic ---');

  const severitiesAtOrAboveHigh = getSeveritiesAtOrAbove(Severity.HIGH);
  assertTest(
    'getSeveritiesAtOrAbove(HIGH) includes HIGH and CRITICAL',
    severitiesAtOrAboveHigh.length === 2 &&
      severitiesAtOrAboveHigh.includes(Severity.HIGH) &&
      severitiesAtOrAboveHigh.includes(Severity.CRITICAL)
  );

  const fakeNow = new Date('2026-11-01T12:00:00.000Z');
  const mockCluster: ReportClusterWithReports = {
    id: 'c1000000-0000-0000-0000-000000000001',
    centroid_lat: 37.7749,
    centroid_lng: -122.4194,
    confirmation_count: 5,
    priority_score: 72.5,
    created_at: new Date('2026-10-25T10:00:00.000Z'),
    updated_at: new Date('2026-10-25T10:00:00.000Z'),
    reports: [
      {
        id: 'r1000000-0000-0000-0000-000000000001',
        user_id: 'u1000000-0000-0000-0000-000000000001',
        cluster_id: 'c1000000-0000-0000-0000-000000000001',
        image_url: 'https://example.com/pothole1.jpg',
        image_hash: '1111',
        lat: 37.7749,
        lng: -122.4194,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        notes: 'First pothole report',
        near_sensitive_location: false,
        status: ReportStatus.SUBMITTED,
        created_at: new Date('2026-10-25T10:00:00.000Z'),
      },
      {
        id: 'r1000000-0000-0000-0000-000000000002',
        user_id: 'u1000000-0000-0000-0000-000000000002',
        cluster_id: 'c1000000-0000-0000-0000-000000000001',
        image_url: 'https://example.com/pothole2.jpg',
        image_hash: '2222',
        lat: 37.7750,
        lng: -122.4195,
        issue_type: IssueType.POTHOLE,
        severity: Severity.CRITICAL,
        notes: 'Massive crater near school',
        near_sensitive_location: true,
        status: ReportStatus.UNDER_REVIEW,
        created_at: new Date('2026-10-26T14:00:00.000Z'),
      },
      {
        id: 'r1000000-0000-0000-0000-000000000003',
        user_id: 'u1000000-0000-0000-0000-000000000003',
        cluster_id: 'c1000000-0000-0000-0000-000000000001',
        image_url: 'https://example.com/pothole3.jpg',
        image_hash: '3333',
        lat: 37.7751,
        lng: -122.4196,
        issue_type: IssueType.DRAINAGE,
        severity: Severity.HIGH,
        notes: 'Water pooling nearby',
        near_sensitive_location: false,
        status: ReportStatus.SCHEDULED,
        created_at: new Date('2026-10-27T08:00:00.000Z'),
      },
    ],
  };

  const queueItem = buildQueueItem(mockCluster);
  assertTest('Max severity is CRITICAL', queueItem.max_severity === Severity.CRITICAL);
  assertTest('Issue type is majority POTHOLE (2 vs 1)', queueItem.issue_type === IssueType.POTHOLE);
  assertTest('Status is most advanced SCHEDULED', queueItem.status === ReportStatus.SCHEDULED);
  assertTest('Near sensitive location is true', queueItem.near_sensitive_location === true);
  assertTest(
    'Representative report is the CRITICAL one (r2)',
    queueItem.representative_report.id === 'r1000000-0000-0000-0000-000000000002'
  );
  assertTest('Report count is 3', queueItem.report_count === 3);

  // ============================================================================
  // SUITE 3: DATABASE INTEGRATION TESTS (SEEDED DATA)
  // ============================================================================
  console.log('\n--- Suite 3: Database Queries, Filtering & Pagination ---');

  const testUserId = '00000000-0000-0000-0000-000000000099';
  const clusterIds = {
    cHigh: '10000000-0000-0000-0000-000000000001',
    cMed: '20000000-0000-0000-0000-000000000002',
    cTieA: '30000000-0000-0000-0000-000000000003',
    cTieB: '40000000-0000-0000-0000-000000000004',
    cClosed: '50000000-0000-0000-0000-000000000005',
  };

  try {
    // 1. Ensure test user exists
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'test-priority-queue@fixmycity.local',
        name: 'Priority Queue Tester',
      },
    });

    // Clean up any lingering test clusters first
    await prisma.report.deleteMany({
      where: { cluster_id: { in: Object.values(clusterIds) } },
    });
    await prisma.reportCluster.deleteMany({
      where: { id: { in: Object.values(clusterIds) } },
    });

    // 2. Seed 5 test clusters:
    // Cluster 1: High score (90), CRITICAL, SCHEDULED, near_sensitive_location: true
    await prisma.reportCluster.create({
      data: {
        id: clusterIds.cHigh,
        centroid_lat: 12.9716,
        centroid_lng: 77.5946,
        confirmation_count: 5,
        priority_score: 90.0,
        created_at: new Date('2026-10-20T10:00:00.000Z'),
        reports: {
          create: [
            {
              user_id: testUserId,
              image_url: 'https://example.com/img1.jpg',
              lat: 12.9716,
              lng: 77.5946,
              issue_type: IssueType.POTHOLE,
              severity: Severity.CRITICAL,
              status: ReportStatus.SCHEDULED,
              near_sensitive_location: true,
              notes: 'Critical pothole outside city hospital',
              created_at: new Date('2026-10-20T10:00:00.000Z'),
            },
          ],
        },
      },
    });

    // Cluster 2: Med score (60), HIGH, UNDER_REVIEW, near_sensitive_location: false
    await prisma.reportCluster.create({
      data: {
        id: clusterIds.cMed,
        centroid_lat: 12.9720,
        centroid_lng: 77.5950,
        confirmation_count: 3,
        priority_score: 60.0,
        created_at: new Date('2026-10-22T10:00:00.000Z'),
        reports: {
          create: [
            {
              user_id: testUserId,
              image_url: 'https://example.com/img2.jpg',
              lat: 12.9720,
              lng: 77.5950,
              issue_type: IssueType.DRAINAGE,
              severity: Severity.HIGH,
              status: ReportStatus.UNDER_REVIEW,
              near_sensitive_location: false,
              notes: 'Blocked drainage overflow',
              created_at: new Date('2026-10-22T10:00:00.000Z'),
            },
          ],
        },
      },
    });

    // Cluster 3: Tied score, MEDIUM, SUBMITTED, STREETLIGHT, created earlier (Oct 23 10:00)
    await prisma.reportCluster.create({
      data: {
        id: clusterIds.cTieA,
        centroid_lat: 12.9730,
        centroid_lng: 77.5960,
        confirmation_count: 2,
        priority_score: 40.0,
        created_at: new Date('2026-10-23T10:00:00.000Z'),
        reports: {
          create: [
            {
              user_id: testUserId,
              image_url: 'https://example.com/img3.jpg',
              lat: 12.9730,
              lng: 77.5960,
              issue_type: IssueType.STREETLIGHT,
              severity: Severity.MEDIUM,
              status: ReportStatus.SUBMITTED,
              near_sensitive_location: false,
              notes: 'Streetlight pole broken',
              created_at: new Date('2026-10-23T10:00:00.000Z'),
            },
          ],
        },
      },
    });

    // Cluster 4: Tied score (same report date/inputs as Cluster 3), created 5 min later (Oct 23 10:05)
    await prisma.reportCluster.create({
      data: {
        id: clusterIds.cTieB,
        centroid_lat: 12.9740,
        centroid_lng: 77.5970,
        confirmation_count: 2,
        priority_score: 40.0,
        created_at: new Date('2026-10-23T10:05:00.000Z'),
        reports: {
          create: [
            {
              user_id: testUserId,
              image_url: 'https://example.com/img4.jpg',
              lat: 12.9740,
              lng: 77.5970,
              issue_type: IssueType.STREETLIGHT,
              severity: Severity.MEDIUM,
              status: ReportStatus.SUBMITTED,
              near_sensitive_location: false,
              notes: 'Second dark streetlight',
              created_at: new Date('2026-10-23T10:00:00.000Z'),
            },
          ],
        },
      },
    });

    // Cluster 5: Closed cluster (all reports FIXED)
    await prisma.reportCluster.create({
      data: {
        id: clusterIds.cClosed,
        centroid_lat: 12.9750,
        centroid_lng: 77.5980,
        confirmation_count: 1,
        priority_score: 0.0,
        created_at: new Date('2026-10-15T10:00:00.000Z'),
        reports: {
          create: [
            {
              user_id: testUserId,
              image_url: 'https://example.com/img5.jpg',
              lat: 12.9750,
              lng: 77.5980,
              issue_type: IssueType.GARBAGE,
              severity: Severity.LOW,
              status: ReportStatus.FIXED,
              near_sensitive_location: false,
              notes: 'Resolved garbage cleanup',
              created_at: new Date('2026-10-15T10:00:00.000Z'),
            },
          ],
        },
      },
    });

    // TEST A: Default Query (Descending score ordering & closed exclusion)
    const resAll = await PriorityQueueService.getPriorityQueue({
      limit: 100,
    });
    const testClusterResults = resAll.data.filter((item) =>
      Object.values(clusterIds).includes(item.cluster_id)
    );

    assertTest(
      'Ordering by priority_score DESC (cHigh > cMed > cTie)',
      testClusterResults.length >= 4 &&
        testClusterResults[0].cluster_id === clusterIds.cHigh &&
        testClusterResults[1].cluster_id === clusterIds.cMed &&
        testClusterResults[0].priority_score > testClusterResults[1].priority_score &&
        testClusterResults[1].priority_score > testClusterResults[2].priority_score &&
        testClusterResults[2].priority_score === testClusterResults[3].priority_score
    );

    assertTest(
      'Tie-breaker stability: earlier created_at appears first among equal scores',
      testClusterResults[2].cluster_id === clusterIds.cTieA &&
        testClusterResults[3].cluster_id === clusterIds.cTieB
    );

    assertTest(
      'Closed cluster (all FIXED) hidden by default when include_closed is false',
      !testClusterResults.some((item) => item.cluster_id === clusterIds.cClosed)
    );

    // TEST B: include_closed = true
    const resClosed = await PriorityQueueService.getPriorityQueue({
      include_closed: true,
      limit: 100,
    });
    const foundClosed = resClosed.data.some((item) => item.cluster_id === clusterIds.cClosed);
    assertTest('include_closed=true includes closed cluster', foundClosed);

    // TEST C: Status filter (UNDER_REVIEW)
    const resStatus = await PriorityQueueService.getPriorityQueue({
      status: ReportStatus.UNDER_REVIEW,
      limit: 100,
    });
    const testUnderReview = resStatus.data.filter((item) =>
      Object.values(clusterIds).includes(item.cluster_id)
    );
    assertTest(
      'Filter by status=UNDER_REVIEW matches only cMed',
      testUnderReview.length === 1 && testUnderReview[0].cluster_id === clusterIds.cMed
    );

    // TEST D: Issue Type filter (DRAINAGE)
    const resIssue = await PriorityQueueService.getPriorityQueue({
      issue_type: IssueType.DRAINAGE,
      limit: 100,
    });
    const testDrainage = resIssue.data.filter((item) =>
      Object.values(clusterIds).includes(item.cluster_id)
    );
    assertTest(
      'Filter by issue_type=DRAINAGE matches only cMed',
      testDrainage.length === 1 && testDrainage[0].cluster_id === clusterIds.cMed
    );

    // TEST E: Min Severity filter (HIGH -> includes HIGH and CRITICAL, excludes MEDIUM)
    const resMinSev = await PriorityQueueService.getPriorityQueue({
      min_severity: Severity.HIGH,
      limit: 100,
    });
    const testMinSev = resMinSev.data.filter((item) =>
      Object.values(clusterIds).includes(item.cluster_id)
    );
    assertTest(
      'Filter min_severity=HIGH includes cHigh (CRITICAL) and cMed (HIGH), excludes cTie (MEDIUM)',
      testMinSev.length === 2 &&
        testMinSev.some((item) => item.cluster_id === clusterIds.cHigh) &&
        testMinSev.some((item) => item.cluster_id === clusterIds.cMed)
    );

    // TEST F: Near Sensitive Location filter
    const resNear = await PriorityQueueService.getPriorityQueue({
      near_sensitive_location: true,
      limit: 100,
    });
    const testNear = resNear.data.filter((item) =>
      Object.values(clusterIds).includes(item.cluster_id)
    );
    assertTest(
      'Filter near_sensitive_location=true matches only cHigh',
      testNear.length === 1 && testNear[0].cluster_id === clusterIds.cHigh
    );

    // TEST G: Pagination (page 2 does not repeat page 1 items)
    const page1 = await PriorityQueueService.getPriorityQueue({
      page: 1,
      limit: 2,
    });
    const page2 = await PriorityQueueService.getPriorityQueue({
      page: 2,
      limit: 2,
    });

    const page1Ids = page1.data.map((c) => c.cluster_id);
    const page2Ids = page2.data.map((c) => c.cluster_id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    assertTest(
      'Pagination: Page 1 and Page 2 have disjoint cluster sets without duplicate items',
      overlap.length === 0 && page1.data.length > 0 && page2.data.length > 0
    );

    // TEST H: Freshness metadata & unclustered reports count
    assertTest(
      'Metadata: scores_refreshed_at is populated',
      typeof resAll.meta.scores_refreshed_at === 'string' &&
        resAll.meta.scores_refreshed_at.length > 0
    );
    assertTest(
      'Metadata: unclustered_active_reports is non-negative number',
      typeof resAll.meta.unclustered_active_reports === 'number' &&
        resAll.meta.unclustered_active_reports >= 0
    );

  } finally {
    // Clean up test data
    console.log('\nCleaning up seeded test clusters and reports...');
    try {
      await prisma.report.deleteMany({
        where: { cluster_id: { in: Object.values(clusterIds) } },
      });
      await prisma.reportCluster.deleteMany({
        where: { id: { in: Object.values(clusterIds) } },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
      console.log('Cleanup complete.');
    } catch (cleanupErr) {
      console.error('Cleanup encountered an error:', cleanupErr);
    }
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('================================================================================');

  if (passedTests === totalTests) {
    console.log('>>> ALL PRIORITY QUEUE TESTS PASSED SUCCESSFULLY! <<<\n');
    process.exit(0);
  } else {
    console.error('>>> SOME PRIORITY QUEUE TESTS FAILED! <<<\n');
    process.exit(1);
  }
}

runTestSuite()
  .catch((err) => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
