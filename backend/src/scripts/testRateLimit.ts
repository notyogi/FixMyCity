import 'dotenv/config';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { IssueType, ReportStatus, Severity } from '@prisma/client';
import prisma from '../utils/prisma';
import {
  reportRateLimit,
  calculateUserRateLimitStatus,
  getReportLimitConfig,
} from '../middleware/reportRateLimit.middleware';
import { globalIpLimiter, isHealthRoute } from '../app';

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

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  status: (code: number) => MockResponse;
  json: (data: any) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
  getHeader: (name: string) => string | undefined;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = String(value);
      return res;
    },
    getHeader(name: string) {
      return res.headers[name.toLowerCase()];
    },
  };
  return res;
}

async function runRateLimitTests(): Promise<void> {
  console.log('================================================================================');
  console.log('             FixMyCity - Rate Limiting & Abuse Prevention Test Suite             ');
  console.log('================================================================================\n');

  const testUserIds: string[] = [];
  const testReportIds: string[] = [];

  const createTestUser = async (label: string, reputationScore = 0) => {
    const id = crypto.randomUUID();
    testUserIds.push(id);
    return prisma.user.create({
      data: {
        id,
        name: `RateLimit ${label}`,
        email: `ratelimit-${label.toLowerCase()}-${id.slice(0, 8)}@fixmycity.test`,
        reputation_score: reputationScore,
      },
    });
  };

  const createTestReport = async (userId: string, createdAt: Date) => {
    const report = await prisma.report.create({
      data: {
        user_id: userId,
        image_url: 'https://example.com/ratelimit-test.jpg',
        lat: 28.6139,
        lng: 77.2090,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
        created_at: createdAt,
      },
    });
    testReportIds.push(report.id);
    return report;
  };

  try {
    // =========================================================================
    // TEST 1: A user under the limit passes and gets remaining-quota headers
    // =========================================================================
    console.log('--- Test 1: User Under Limit Passes & Receives Headers ---');
    const userUnderLimit = await createTestUser('UnderLimit', 0);

    const req1 = {
      user: { id: userUnderLimit.id, email: userUnderLimit.email },
    } as unknown as Request;
    const res1 = createMockResponse() as unknown as Response;
    let next1Called = false;

    await reportRateLimit(req1, res1, () => {
      next1Called = true;
    });

    const limitHeader = (res1 as any).getHeader('ratelimit-limit');
    const remainingHeader = (res1 as any).getHeader('ratelimit-remaining');
    const resetHeader = (res1 as any).getHeader('ratelimit-reset');

    assertTest(
      '1. User under limit passes (next called, remaining-quota headers present)',
      next1Called &&
        (res1 as any).statusCode === 200 &&
        limitHeader === '10' &&
        remainingHeader === '9' &&
        Boolean(resetHeader),
      `nextCalled=${next1Called}, limit=${limitHeader}, remaining=${remainingHeader}, reset=${resetHeader}`
    );

    // =========================================================================
    // TEST 2: The (N+1)th report within the hour gets 429 with Retry-After and JSON body
    // =========================================================================
    console.log('\n--- Test 2: (N+1)th Report Gets 429 with Retry-After & Body ---');
    const userAtLimit = await createTestUser('AtLimit', 0);

    // Insert 10 reports within the last 15 minutes
    const now = new Date();
    for (let i = 0; i < 10; i++) {
      const createdAt = new Date(now.getTime() - (15 - i) * 60 * 1000);
      await createTestReport(userAtLimit.id, createdAt);
    }

    const req2 = {
      user: { id: userAtLimit.id, email: userAtLimit.email },
    } as unknown as Request;
    const res2 = createMockResponse() as unknown as Response;
    let next2Called = false;

    await reportRateLimit(req2, res2, () => {
      next2Called = true;
    });

    const retryAfter2 = (res2 as any).getHeader('retry-after');
    const body2 = (res2 as any).body;

    assertTest(
      '2. (N+1)th report returns 429 with Retry-After header and RATE_LIMITED JSON body',
      !next2Called &&
        (res2 as any).statusCode === 429 &&
        Boolean(retryAfter2) &&
        parseInt(retryAfter2, 10) > 0 &&
        body2?.error === 'Report limit reached' &&
        body2?.code === 'RATE_LIMITED' &&
        body2?.limit === 10 &&
        body2?.window === '1 hour' &&
        typeof body2?.retry_after_seconds === 'number',
      `status=${(res2 as any).statusCode}, retryAfter=${retryAfter2}, body=${JSON.stringify(body2)}`
    );

    // =========================================================================
    // TEST 3: Reports older than one hour do not count
    // =========================================================================
    console.log('\n--- Test 3: Reports Older Than One Hour Do Not Count ---');
    const userOldReports = await createTestUser('OldReports', 0);

    // Insert 10 reports that are 65 to 90 minutes old (outside the rolling 1-hour window)
    for (let i = 0; i < 10; i++) {
      const oldDate = new Date(now.getTime() - (65 + i * 2) * 60 * 1000);
      await createTestReport(userOldReports.id, oldDate);
    }

    const req3 = {
      user: { id: userOldReports.id, email: userOldReports.email },
    } as unknown as Request;
    const res3 = createMockResponse() as unknown as Response;
    let next3Called = false;

    await reportRateLimit(req3, res3, () => {
      next3Called = true;
    });

    assertTest(
      '3. Reports older than 1 hour do not count; user can still submit report',
      next3Called &&
        (res3 as any).statusCode === 200 &&
        (res3 as any).getHeader('ratelimit-remaining') === '9',
      `nextCalled=${next3Called}, remaining=${(res3 as any).getHeader('ratelimit-remaining')}`
    );

    // =========================================================================
    // TEST 4: A flagged user (reputation_score < 0) gets the lower limit
    // =========================================================================
    console.log('\n--- Test 4: Flagged User Gets Stricter Limit ---');
    const flaggedUser = await createTestUser('FlaggedUser', -2);

    // Insert 3 reports within the last 10 minutes
    for (let i = 0; i < 3; i++) {
      await createTestReport(flaggedUser.id, new Date(now.getTime() - 5 * 60 * 1000));
    }

    const req4 = {
      user: { id: flaggedUser.id, email: flaggedUser.email },
    } as unknown as Request;
    const res4 = createMockResponse() as unknown as Response;
    let next4Called = false;

    await reportRateLimit(req4, res4, () => {
      next4Called = true;
    });

    const body4 = (res4 as any).body;
    assertTest(
      '4. Flagged user (score < 0) is capped at 3 reports (REPORT_LIMIT_FLAGGED_PER_HOUR)',
      !next4Called &&
        (res4 as any).statusCode === 429 &&
        body4?.limit === 3 &&
        body4?.code === 'RATE_LIMITED',
      `status=${(res4 as any).statusCode}, limit=${body4?.limit}, code=${body4?.code}`
    );

    // =========================================================================
    // TEST 5: An admin is exempt
    // =========================================================================
    console.log('\n--- Test 5: Admin Exemption ---');
    const adminUser = await createTestUser('AdminUser', 0);

    // Insert 15 reports (far exceeding limit)
    for (let i = 0; i < 15; i++) {
      await createTestReport(adminUser.id, new Date(now.getTime() - 2 * 60 * 1000));
    }

    // Set ADMIN_USER_IDS environment variable
    const originalAdminIds = process.env.ADMIN_USER_IDS;
    process.env.ADMIN_USER_IDS = `${adminUser.id},some-other-admin-id`;

    try {
      const req5 = {
        user: { id: adminUser.id, email: adminUser.email },
      } as unknown as Request;
      const res5 = createMockResponse() as unknown as Response;
      let next5Called = false;

      await reportRateLimit(req5, res5, () => {
        next5Called = true;
      });

      assertTest(
        '5. Admin is exempt from rate limits even with 15 reports in the hour',
        next5Called && (res5 as any).statusCode === 200,
        `nextCalled=${next5Called}, status=${(res5 as any).statusCode}`
      );
    } finally {
      process.env.ADMIN_USER_IDS = originalAdminIds;
    }

    // =========================================================================
    // TEST 6: One user hitting the limit does not affect another user
    // =========================================================================
    console.log('\n--- Test 6: User Isolation ---');
    // userAtLimit is currently at 10/10 and blocked
    const req6AtLimit = {
      user: { id: userAtLimit.id, email: userAtLimit.email },
    } as unknown as Request;
    const res6AtLimit = createMockResponse() as unknown as Response;
    let next6AtLimit = false;

    await reportRateLimit(req6AtLimit, res6AtLimit, () => {
      next6AtLimit = true;
    });

    // Fresh User B has 0 reports
    const freshUserB = await createTestUser('FreshUserB', 0);
    const req6Fresh = {
      user: { id: freshUserB.id, email: freshUserB.email },
    } as unknown as Request;
    const res6Fresh = createMockResponse() as unknown as Response;
    let next6Fresh = false;

    await reportRateLimit(req6Fresh, res6Fresh, () => {
      next6Fresh = true;
    });

    assertTest(
      '6. User A hitting limit (429) does not affect User B (passes with 200)',
      !next6AtLimit &&
        (res6AtLimit as any).statusCode === 429 &&
        next6Fresh &&
        (res6Fresh as any).statusCode === 200,
      `userA status=${(res6AtLimit as any).statusCode}, userB status=${(res6Fresh as any).statusCode}`
    );

    // =========================================================================
    // TEST 7: Query failure fails open
    // =========================================================================
    console.log('\n--- Test 7: Fail OPEN on Database Error ---');
    const userFailOpen = await createTestUser('FailOpen', 0);

    const originalCount = prisma.report.count;
    // Mock prisma.report.count to simulate database query timeout or error
    (prisma.report as any).count = async () => {
      throw new Error('Simulated database network timeout in rate limit query');
    };

    try {
      const req7 = {
        user: { id: userFailOpen.id, email: userFailOpen.email },
      } as unknown as Request;
      const res7 = createMockResponse() as unknown as Response;
      let next7Called = false;

      await reportRateLimit(req7, res7, () => {
        next7Called = true;
      });

      assertTest(
        '7. Database error fails open: next() is called and citizen report is not blocked',
        next7Called && (res7 as any).statusCode === 200,
        `nextCalled=${next7Called}, status=${(res7 as any).statusCode}`
      );
    } finally {
      // Restore original count function
      (prisma.report as any).count = originalCount;
    }

    // =========================================================================
    // TEST 8: GET /health is never limited by the IP limiter
    // =========================================================================
    console.log('\n--- Test 8: Health Checks Excluded from IP Rate Limiter ---');

    const healthReq1 = { method: 'GET', path: '/health' };
    const healthReq2 = { method: 'GET', path: '/api/v1/health' };
    const healthReq3 = { method: 'GET', path: '/api/health' };
    const postHealth = { method: 'POST', path: '/api/v1/health' };
    const reportsReq = { method: 'POST', path: '/api/v1/reports' };

    const skipsGetHealth1 = isHealthRoute(healthReq1);
    const skipsGetHealth2 = isHealthRoute(healthReq2);
    const skipsGetHealth3 = isHealthRoute(healthReq3);
    const skipsPostHealth = isHealthRoute(postHealth);
    const skipsReports = isHealthRoute(reportsReq);

    // Also verify middleware directly invokes next() for /health
    let limiterNextCalled: boolean = false;
    const mockHealthRes = createMockResponse();
    await (globalIpLimiter as any)(
      healthReq2 as Request,
      mockHealthRes as unknown as Response,
      () => {
        limiterNextCalled = true;
      }
    );

    assertTest(
      '8. GET /health routes are skipped by global IP limiter; normal endpoints are protected',
      skipsGetHealth1 === true &&
        skipsGetHealth2 === true &&
        skipsGetHealth3 === true &&
        skipsPostHealth === false &&
        skipsReports === false &&
        Boolean(limiterNextCalled),
      `skips: /health=${skipsGetHealth1}, /api/v1/health=${skipsGetHealth2}, /api/health=${skipsGetHealth3}, POST=${skipsPostHealth}, reports=${skipsReports}, middlewareNext=${limiterNextCalled}`
    );
  } catch (err) {
    console.error('\nUnhandled error during rate limit test suite:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n--- Cleaning up temporary test rows from database ---');
    try {
      if (testReportIds.length > 0) {
        await prisma.report.deleteMany({
          where: { id: { in: testReportIds } },
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

runRateLimitTests();
