import { IssueType, ReportStatus, Severity } from '@prisma/client';
import {
  ALLOWED_CLUSTER_STATUS_TRANSITIONS,
  buildClusterDetail,
} from '../controllers/reports.controller';
import reportsRouter from '../routes/reports.routes';

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

async function runTests() {
  console.log('================================================================================');
  console.log('         CLUSTER DETAIL & STATUS WORKFLOW TEST SUITE (UNIT & LOGIC)            ');
  console.log('================================================================================\n');

  // ============================================================================
  // SUITE 1: ROUTE REGISTRATION PRECEDENCE
  // ============================================================================
  console.log('--- Suite 1: Route Precedence & Express Registration ---');

  const routeLayers = (reportsRouter.stack as any[])
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods || {}),
    }));

  const clustersGetIdx = routeLayers.findIndex((r) => r.path === '/clusters/:id' && r.methods.includes('get'));
  const clustersPatchIdx = routeLayers.findIndex((r) => r.path === '/clusters/:id/status' && r.methods.includes('patch'));
  const singleGetIdx = routeLayers.findIndex((r) => r.path === '/:id' && r.methods.includes('get'));
  const singlePatchIdx = routeLayers.findIndex((r) => r.path === '/:id/status' && r.methods.includes('patch'));

  assertTest(
    'GET /clusters/:id is registered BEFORE GET /:id',
    clustersGetIdx !== -1 && singleGetIdx !== -1 && clustersGetIdx < singleGetIdx,
    `clusters index: ${clustersGetIdx}, single index: ${singleGetIdx}`
  );

  assertTest(
    'PATCH /clusters/:id/status is registered BEFORE PATCH /:id/status',
    clustersPatchIdx !== -1 && singlePatchIdx !== -1 && clustersPatchIdx < singlePatchIdx,
    `clusters patch index: ${clustersPatchIdx}, single patch index: ${singlePatchIdx}`
  );

  // ============================================================================
  // SUITE 2: STATUS TRANSITION RULES (PHASE 1)
  // ============================================================================
  console.log('\n--- Suite 2: Status Transition Validation Rules ---');

  // Allowed forward transitions from SUBMITTED
  const fromSubmitted = ALLOWED_CLUSTER_STATUS_TRANSITIONS[ReportStatus.SUBMITTED];
  assertTest(
    'SUBMITTED allows UNDER_REVIEW, SCHEDULED, FIXED, REJECTED',
    fromSubmitted.includes(ReportStatus.UNDER_REVIEW) &&
      fromSubmitted.includes(ReportStatus.SCHEDULED) &&
      fromSubmitted.includes(ReportStatus.FIXED) &&
      fromSubmitted.includes(ReportStatus.REJECTED) &&
      !fromSubmitted.includes(ReportStatus.SUBMITTED)
  );

  // Allowed transitions from UNDER_REVIEW
  const fromUnderReview = ALLOWED_CLUSTER_STATUS_TRANSITIONS[ReportStatus.UNDER_REVIEW];
  assertTest(
    'UNDER_REVIEW allows SCHEDULED, FIXED, REJECTED, but blocks SUBMITTED',
    fromUnderReview.includes(ReportStatus.SCHEDULED) &&
      fromUnderReview.includes(ReportStatus.FIXED) &&
      fromUnderReview.includes(ReportStatus.REJECTED) &&
      !fromUnderReview.includes(ReportStatus.SUBMITTED)
  );

  // Allowed transitions from SCHEDULED
  const fromScheduled = ALLOWED_CLUSTER_STATUS_TRANSITIONS[ReportStatus.SCHEDULED];
  assertTest(
    'SCHEDULED allows FIXED, REJECTED, but blocks backward transitions',
    fromScheduled.includes(ReportStatus.FIXED) &&
      fromScheduled.includes(ReportStatus.REJECTED) &&
      !fromScheduled.includes(ReportStatus.UNDER_REVIEW) &&
      !fromScheduled.includes(ReportStatus.SUBMITTED)
  );

  // Closed statuses cannot be modified (re-opening not allowed)
  assertTest(
    'FIXED cluster allows NO transitions (empty array)',
    ALLOWED_CLUSTER_STATUS_TRANSITIONS[ReportStatus.FIXED].length === 0
  );

  assertTest(
    'REJECTED cluster allows NO transitions (empty array)',
    ALLOWED_CLUSTER_STATUS_TRANSITIONS[ReportStatus.REJECTED].length === 0
  );

  // ============================================================================
  // SUITE 3: IN-MEMORY CLUSTER DETAIL BUILDING
  // ============================================================================
  console.log('\n--- Suite 3: Cluster Detail Transformation & Privacy ---');

  const sampleClusterPayload = {
    id: 'c1000000-0000-0000-0000-000000000001',
    centroid_lat: 37.7749,
    centroid_lng: -122.4194,
    confirmation_count: 3,
    priority_score: 55.4,
    created_at: new Date('2026-10-20T10:00:00Z'),
    updated_at: new Date('2026-10-25T12:00:00Z'),
    reports: [
      {
        id: 'r1',
        image_url: 'https://example.com/pothole1.jpg',
        notes: 'Pothole near crosswalk',
        lat: 37.7749,
        lng: -122.4194,
        issue_type: IssueType.POTHOLE,
        severity: Severity.MEDIUM,
        status: ReportStatus.SUBMITTED,
        near_sensitive_location: false,
        created_at: new Date('2026-10-20T10:00:00Z'),
        user: { id: 'u1', name: 'Citizen Alice' },
      },
      {
        id: 'r2',
        image_url: 'https://example.com/pothole2.jpg',
        notes: 'Deep hole damaging rims',
        lat: 37.7750,
        lng: -122.4195,
        issue_type: IssueType.POTHOLE,
        severity: Severity.HIGH,
        status: ReportStatus.UNDER_REVIEW,
        near_sensitive_location: true,
        created_at: new Date('2026-10-22T14:30:00Z'),
        user: { id: 'u2', name: 'Citizen Bob' },
      },
      {
        id: 'r3',
        image_url: 'https://example.com/pothole3.jpg',
        notes: null,
        lat: 37.7748,
        lng: -122.4193,
        issue_type: IssueType.DRAINAGE,
        severity: Severity.LOW,
        status: ReportStatus.SUBMITTED,
        near_sensitive_location: false,
        created_at: new Date('2026-10-23T09:00:00Z'),
        user: { id: 'u3', name: null },
      },
    ],
    confirmations: [
      {
        id: 'conf1',
        created_at: new Date('2026-10-21T08:00:00Z'),
        user: { id: 'u4', name: 'Citizen Charlie' },
      },
    ],
  };

  const detail = buildClusterDetail(sampleClusterPayload as any);

  assertTest('Maps cluster ID correctly', detail.id === sampleClusterPayload.id);
  assertTest('Derives max_severity as HIGH', detail.max_severity === Severity.HIGH);
  assertTest('Derives current_status as UNDER_REVIEW (most advanced active)', detail.current_status === ReportStatus.UNDER_REVIEW);
  assertTest('Derives issue_type as POTHOLE (majority vote: 2 POTHOLE vs 1 DRAINAGE)', detail.issue_type === IssueType.POTHOLE);
  assertTest('Derives near_sensitive_location as true (since r2 is true)', detail.near_sensitive_location === true);
  assertTest('Includes all 3 reports in reports array', detail.reports.length === 3);
  assertTest('Includes confirmation records', detail.confirmations.length === 1 && detail.confirmations[0].user.name === 'Citizen Charlie');
  assertTest('Days open is positive integer', detail.days_open >= 0);

  // Check privacy: report and confirmation user objects MUST NOT include emails
  const hasReportEmails = detail.reports.some((r: any) => 'email' in r.reporter);
  const hasConfEmails = detail.confirmations.some((c: any) => 'email' in c.user);
  assertTest('Privacy: No emails exposed in report or confirmation objects', !hasReportEmails && !hasConfEmails);

  // ============================================================================
  // SUITE 4: CLOSED CLUSTER STATUS DERIVATION & SCORE REDUCTION
  // ============================================================================
  console.log('\n--- Suite 4: Closed Cluster Behavior ---');

  const closedClusterPayload = {
    ...sampleClusterPayload,
    reports: sampleClusterPayload.reports.map((r) => ({
      ...r,
      status: ReportStatus.FIXED,
    })),
  };

  const closedDetail = buildClusterDetail(closedClusterPayload as any);
  assertTest('When all reports are FIXED, current_status is FIXED', closedDetail.current_status === ReportStatus.FIXED);

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} tests passed`);
  console.log('================================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
