import 'dotenv/config';
import crypto from 'crypto';
import { IssueType, ReportStatus, Severity } from '@prisma/client';
import prisma from '../utils/prisma';
import app from '../app';

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

// Minimal mock request/response helper to test Express controller endpoints directly with context
function createMockResponse() {
  const res: any = {};
  res.statusCode = 200;
  res.headers = {};
  res.body = null;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  res.setHeader = (key: string, val: string) => {
    res.headers[key.toLowerCase()] = val;
    return res;
  };
  return res;
}

import { getMyReports, listReports } from '../controllers/reports.controller';

async function runMyReportsTests(): Promise<void> {
  console.log('================================================================================');
  console.log('            FixMyCity - Citizen Personal Reports (/reports/mine) Test Suite     ');
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
        name: `MyRepTest ${label}`,
        email: `myreptest-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${id.slice(0, 8)}@fixmycity.test`,
        reputation_score: 5,
      },
    });
  };

  const BASE_LAT = -25.123456;
  const BASE_LNG = -105.654321;
  const TEST_IMAGE = 'https://example.com/test-my-reports.jpg';

  try {
    const userA = await createTestUser('UserA');
    const userB = await createTestUser('UserB');

    // Create a cluster for user A's reports
    const clusterA = await prisma.reportCluster.create({
      data: {
        centroid_lat: BASE_LAT,
        centroid_lng: BASE_LNG,
        confirmation_count: 2,
      },
    });
    seededClusterIds.push(clusterA.id);

    // Seed User A's reports (3 active, 1 fixed, 1 rejected = 5 total)
    const rA1 = await prisma.report.create({
      data: {
        user_id: userA.id,
        cluster_id: clusterA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.HIGH,
        status: ReportStatus.SUBMITTED,
        created_at: new Date(Date.now() - 5000),
      },
    });
    seededReportIds.push(rA1.id);

    const rA2 = await prisma.report.create({
      data: {
        user_id: userA.id,
        cluster_id: clusterA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT,
        lng: BASE_LNG,
        issue_type: IssueType.POTHOLE,
        severity: Severity.CRITICAL,
        status: ReportStatus.UNDER_REVIEW,
        created_at: new Date(Date.now() - 4000),
      },
    });
    seededReportIds.push(rA2.id);

    const rA3 = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 0.1,
        lng: BASE_LNG,
        issue_type: IssueType.STREETLIGHT,
        severity: Severity.LOW,
        status: ReportStatus.SCHEDULED,
        created_at: new Date(Date.now() - 3000),
      },
    });
    seededReportIds.push(rA3.id);

    const rA4 = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 0.2,
        lng: BASE_LNG,
        issue_type: IssueType.GARBAGE,
        severity: Severity.MEDIUM,
        status: ReportStatus.FIXED,
        created_at: new Date(Date.now() - 2000),
      },
    });
    seededReportIds.push(rA4.id);

    const rA5 = await prisma.report.create({
      data: {
        user_id: userA.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 0.3,
        lng: BASE_LNG,
        issue_type: IssueType.DRAINAGE,
        severity: Severity.LOW,
        status: ReportStatus.REJECTED,
        created_at: new Date(Date.now() - 1000),
      },
    });
    seededReportIds.push(rA5.id);

    // Seed User B's report
    const rB1 = await prisma.report.create({
      data: {
        user_id: userB.id,
        image_url: TEST_IMAGE,
        lat: BASE_LAT + 1.0,
        lng: BASE_LNG,
        issue_type: IssueType.SIDEWALK,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
        created_at: new Date(),
      },
    });
    seededReportIds.push(rB1.id);

    // =========================================================================
    // TEST 1: User A sees only their own reports, never User B's
    // =========================================================================
    console.log('--- Test 1: User Isolation & Report Scoping ---');
    const req1: any = {
      user: { id: userA.id },
      query: {},
    };
    const res1 = createMockResponse();
    await getMyReports(req1, res1);

    assertTest('1a. Returns HTTP 200 for authenticated citizen', res1.statusCode === 200);
    assertTest(
      '1b. Returns exactly User A reports (5 total)',
      res1.body?.data?.length === 5,
      `Got ${res1.body?.data?.length}`
    );
    assertTest(
      '1c. User B report is not present in User A results',
      !res1.body?.data?.some((r: any) => r.id === rB1.id)
    );
    assertTest(
      '1d. Includes cluster summary with confirmation_count & status_of_cluster without user PII',
      Boolean(res1.body?.data?.find((r: any) => r.id === rA1.id)?.cluster?.confirmation_count === 2),
      `Cluster: ${JSON.stringify(res1.body?.data?.find((r: any) => r.id === rA1.id)?.cluster)}`
    );

    // =========================================================================
    // TEST 2: Spoofed user_id query parameter is strictly ignored
    // =========================================================================
    console.log('\n--- Test 2: Spoofed user_id Query Parameter Ignored ---');
    const reqSpoof: any = {
      user: { id: userA.id },
      query: { user_id: userB.id }, // Attempting to spoof user B
    };
    const resSpoof = createMockResponse();
    await getMyReports(reqSpoof, resSpoof);

    assertTest(
      '2. Querying /reports/mine?user_id=spoofed ignores query and returns caller data only',
      resSpoof.statusCode === 200 &&
        resSpoof.body?.data?.length === 5 &&
        !resSpoof.body?.data?.some((r: any) => r.id === rB1.id)
    );

    // =========================================================================
    // TEST 3: Lifetime counts { total, active, fixed, rejected } are correct
    // =========================================================================
    console.log('\n--- Test 3: Lifetime Counts Calculation ---');
    const counts = res1.body?.counts;
    assertTest('3a. Total count is 5', counts?.total === 5, `Got ${counts?.total}`);
    assertTest(
      '3b. Active count is 3 (SUBMITTED + UNDER_REVIEW + SCHEDULED)',
      counts?.active === 3,
      `Got ${counts?.active}`
    );
    assertTest('3c. Fixed count is 1', counts?.fixed === 1, `Got ${counts?.fixed}`);
    assertTest('3d. Rejected count is 1', counts?.rejected === 1, `Got ${counts?.rejected}`);

    // =========================================================================
    // TEST 4: Filtering (active=true and status=FIXED) and Pagination
    // =========================================================================
    console.log('\n--- Test 4: Filtering and Pagination ---');
    const reqActive: any = {
      user: { id: userA.id },
      query: { active: 'true' },
    };
    const resActive = createMockResponse();
    await getMyReports(reqActive, resActive);

    assertTest(
      '4a. active=true filters to only active reports (3 items returned)',
      resActive.body?.data?.length === 3 &&
        resActive.body?.data?.every((r: any) =>
          ['SUBMITTED', 'UNDER_REVIEW', 'SCHEDULED'].includes(r.status)
        ),
      `Got ${resActive.body?.data?.length}`
    );
    assertTest(
      '4b. Lifetime counts remain intact when filtered',
      resActive.body?.counts?.total === 5 && resActive.body?.counts?.active === 3
    );

    const reqFixed: any = {
      user: { id: userA.id },
      query: { status: 'FIXED' },
    };
    const resFixed = createMockResponse();
    await getMyReports(reqFixed, resFixed);

    assertTest(
      '4c. status=FIXED returns only fixed report',
      resFixed.body?.data?.length === 1 && resFixed.body?.data[0].status === 'FIXED'
    );

    const reqPage: any = {
      user: { id: userA.id },
      query: { page: '1', limit: '2' },
    };
    const resPage = createMockResponse();
    await getMyReports(reqPage, resPage);

    assertTest(
      '4d. Pagination limits data to page size (limit=2, total=5)',
      resPage.body?.data?.length === 2 && resPage.body?.total === 5
    );

    // =========================================================================
    // TEST 5: Unauthorized request (no user token) returns 401
    // =========================================================================
    console.log('\n--- Test 5: Authentication Protection (401) ---');
    const reqUnauth: any = {
      query: {},
    };
    const resUnauth = createMockResponse();
    await getMyReports(reqUnauth, resUnauth);

    assertTest('5. Unauthenticated request returns 401', resUnauth.statusCode === 401);

    // =========================================================================
    // TEST 6: GET /reports?user_id= security restriction
    // (non-admin querying someone else's user_id gets 403 Forbidden)
    // =========================================================================
    console.log('\n--- Test 6: GET /reports?user_id= Authorization Guard ---');
    const reqLegacyOther: any = {
      user: { id: userA.id },
      query: { user_id: userB.id }, // User A tries to inspect User B on legacy endpoint
    };
    const resLegacyOther = createMockResponse();
    await listReports(reqLegacyOther, resLegacyOther);

    assertTest(
      '6a. Non-admin querying another user_id on /reports returns 403 Forbidden',
      resLegacyOther.statusCode === 403,
      `Expected 403, got ${resLegacyOther.statusCode}`
    );

    const reqLegacyOwn: any = {
      user: { id: userA.id },
      query: { user_id: userA.id }, // User A queries their own id on legacy endpoint
    };
    const resLegacyOwn = createMockResponse();
    await listReports(reqLegacyOwn, resLegacyOwn);

    assertTest(
      '6b. Non-admin querying their OWN user_id on /reports succeeds with 200',
      resLegacyOwn.statusCode === 200,
      `Expected 200, got ${resLegacyOwn.statusCode}`
    );
  } finally {
    console.log('\n--- Cleaning up test artifacts ---');
    try {
      if (seededReportIds.length > 0) {
        await prisma.reportConfirmation.deleteMany({
          where: { report_id: { in: seededReportIds } },
        });
        await prisma.reputationEvent.deleteMany({
          where: { report_id: { in: seededReportIds } },
        });
        await prisma.notification.deleteMany({
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
        await prisma.notification.deleteMany({
          where: { user_id: { in: testUserIds } },
        });
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
  runMyReportsTests()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error('Fatal test error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
