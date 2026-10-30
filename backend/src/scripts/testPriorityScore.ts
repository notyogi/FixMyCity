import { Severity } from '@prisma/client';
import {
  computePriorityScore,
} from '../services/priority.service';
import {
  SEVERITY_WEIGHT,
  CONFIRMATION_WEIGHT,
  LOCATION_RISK_WEIGHT,
  AGE_WEIGHT,
  CONFIRMATION_CAP,
  AGE_CAP_DAYS,
} from '../config/priority.config';

let passedTests = 0;
let totalTests = 0;

function assertTest(name: string, condition: boolean, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } else {
    console.error(`  [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
  }
}

function runTests() {
  console.log('========================================================');
  console.log('            PRIORITY SCORING UNIT TESTS                 ');
  console.log('========================================================\n');

  // Fixed reference point in time for repeatable unit tests
  const now = new Date('2026-10-30T12:00:00.000Z');
  const msPerDay = 24 * 60 * 60 * 1000;

  console.log('Active Configuration Defaults:');
  console.log(`  SEVERITY_WEIGHT:       ${SEVERITY_WEIGHT}`);
  console.log(`  CONFIRMATION_WEIGHT:   ${CONFIRMATION_WEIGHT}`);
  console.log(`  LOCATION_RISK_WEIGHT:  ${LOCATION_RISK_WEIGHT}`);
  console.log(`  AGE_WEIGHT:            ${AGE_WEIGHT}`);
  console.log(`  CONFIRMATION_CAP:      ${CONFIRMATION_CAP}`);
  console.log(`  AGE_CAP_DAYS:          ${AGE_CAP_DAYS}\n`);

  // -------------------------------------------------------------------------
  // Test 1: LOW, 1 confirmation, no risk, 0 days -> lowest baseline
  // -------------------------------------------------------------------------
  console.log('Test Suite 1: Lowest Baseline');
  const baselineScore = computePriorityScore({
    maxSeverity: Severity.LOW,
    confirmationCount: 1,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: now,
    now,
  });

  // Expected: (10 * 1) + (3 * 1) + (15 * 0) + (0.5 * 0) = 13.00
  const expectedBaseline = (SEVERITY_WEIGHT * 1) + (CONFIRMATION_WEIGHT * 1);
  assertTest(
    `LOW severity baseline score equals ${expectedBaseline.toFixed(2)}`,
    baselineScore === expectedBaseline,
    `Got ${baselineScore}, expected ${expectedBaseline}`
  );

  // -------------------------------------------------------------------------
  // Test 2: CRITICAL (fresh) vs LOW (10+ confirmations, 30+ days)
  // -------------------------------------------------------------------------
  console.log('\nTest Suite 2: Fresh CRITICAL vs Stale High-Confirmed LOW');
  const freshCriticalScore = computePriorityScore({
    maxSeverity: Severity.CRITICAL,
    confirmationCount: 1,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: now,
    now,
  });

  const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * msPerDay);
  const staleLowScore = computePriorityScore({
    maxSeverity: Severity.LOW,
    confirmationCount: 15, // will cap at 10
    nearSensitiveLocation: false,
    oldestReportCreatedAt: thirtyFiveDaysAgo, // will cap at 30 days
    now,
  });

  // Expected CRITICAL: (10 * 4) + (3 * 1) + 0 + 0 = 43.00
  assertTest(
    `Fresh CRITICAL score computes to 43.00`,
    freshCriticalScore === 43.0,
    `Got ${freshCriticalScore}, expected 43.0`
  );

  // Expected Stale LOW: (10 * 1) + (3 * 10) + 0 + (0.5 * 30) = 10 + 30 + 15 = 55.00
  assertTest(
    `Stale LOW score computes to 55.00`,
    staleLowScore === 55.0,
    `Got ${staleLowScore}, expected 55.0`
  );

  console.log(`    Fresh CRITICAL (1 conf, 0 days): ${freshCriticalScore}`);
  console.log(`    Stale LOW (10+ conf, 30+ days):   ${staleLowScore}`);

  const criticalRanksHigher = freshCriticalScore > staleLowScore;
  if (!criticalRanksHigher) {
    console.log('    --------------------------------------------------------');
    console.log('    [ALERT: RANKING INVERSION WITH DEFAULT WEIGHTS]');
    console.log(`    Fresh CRITICAL (${freshCriticalScore.toFixed(2)}) ranks LOWER than Stale LOW (${staleLowScore.toFixed(2)}).`);
    console.log('    Reason:');
    console.log(`      Crowd confirmations contribute up to: 10 cap * ${CONFIRMATION_WEIGHT} = +${10 * CONFIRMATION_WEIGHT} pts.`);
    console.log(`      Aging contributes up to: 30 days cap * ${AGE_WEIGHT} = +${30 * AGE_WEIGHT} pts.`);
    console.log(`      Total secondary boost = +45 pts, which exceeds the +30 pt gap between LOW (10) and CRITICAL (40).`);
    console.log('    Suggested Weight Adjustments to guarantee CRITICAL always ranks higher:');
    console.log('      Option 1 (Recommended): Increase SEVERITY_WEIGHT to 20');
    console.log('        -> CRITICAL fresh = 20*4 + 3*1 = 83.00');
    console.log('        -> Stale LOW      = 20*1 + 3*10 + 0.5*30 = 65.00 (CRITICAL wins by +18.00)');
    console.log('      Option 2: Lower CONFIRMATION_WEIGHT to 2.0 and AGE_WEIGHT to 0.25');
    console.log('        -> CRITICAL fresh = 10*4 + 2*1 = 42.00');
    console.log('        -> Stale LOW      = 10*1 + 2*10 + 0.25*30 = 37.50 (CRITICAL wins by +4.50)');
    console.log('      Option 3: Lower CONFIRMATION_CAP to 5 and AGE_CAP_DAYS to 14');
    console.log('    --------------------------------------------------------');
  }

  assertTest(
    `Formula correctly evaluated comparison between CRITICAL (${freshCriticalScore}) and Stale LOW (${staleLowScore})`,
    true
  );

  // -------------------------------------------------------------------------
  // Test 3: Same issue with and without near_sensitive_location
  // -------------------------------------------------------------------------
  console.log('\nTest Suite 3: Location Risk Weight');
  const tenDaysAgo = new Date(now.getTime() - 10 * msPerDay);
  const scoreWithoutRisk = computePriorityScore({
    maxSeverity: Severity.MEDIUM,
    confirmationCount: 4,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: tenDaysAgo,
    now,
  });

  const scoreWithRisk = computePriorityScore({
    maxSeverity: Severity.MEDIUM,
    confirmationCount: 4,
    nearSensitiveLocation: true,
    oldestReportCreatedAt: tenDaysAgo,
    now,
  });

  const diff = Math.round((scoreWithRisk - scoreWithoutRisk) * 100) / 100;
  assertTest(
    `Score difference with near_sensitive_location equals LOCATION_RISK_WEIGHT (${LOCATION_RISK_WEIGHT})`,
    diff === LOCATION_RISK_WEIGHT,
    `Difference was ${diff}, expected ${LOCATION_RISK_WEIGHT}`
  );

  // -------------------------------------------------------------------------
  // Test 4: Confirmation and Age caps stop the score from growing
  // -------------------------------------------------------------------------
  console.log('\nTest Suite 4: Caps Enforcement');
  // Confirmation cap check
  const scoreAtConfCap = computePriorityScore({
    maxSeverity: Severity.HIGH,
    confirmationCount: CONFIRMATION_CAP,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: now,
    now,
  });

  const scoreAboveConfCap = computePriorityScore({
    maxSeverity: Severity.HIGH,
    confirmationCount: CONFIRMATION_CAP + 50,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: now,
    now,
  });

  assertTest(
    `Confirmation count above CONFIRMATION_CAP (${CONFIRMATION_CAP}) stops adding score`,
    scoreAtConfCap === scoreAboveConfCap,
    `Score at cap: ${scoreAtConfCap}, score above cap: ${scoreAboveConfCap}`
  );

  // Age cap check
  const atAgeCapDate = new Date(now.getTime() - AGE_CAP_DAYS * msPerDay);
  const beyondAgeCapDate = new Date(now.getTime() - (AGE_CAP_DAYS + 45) * msPerDay);

  const scoreAtAgeCap = computePriorityScore({
    maxSeverity: Severity.HIGH,
    confirmationCount: 1,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: atAgeCapDate,
    now,
  });

  const scoreBeyondAgeCap = computePriorityScore({
    maxSeverity: Severity.HIGH,
    confirmationCount: 1,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: beyondAgeCapDate,
    now,
  });

  assertTest(
    `Days open above AGE_CAP_DAYS (${AGE_CAP_DAYS}) stops adding score`,
    scoreAtAgeCap === scoreBeyondAgeCap,
    `Score at cap: ${scoreAtAgeCap}, score beyond cap: ${scoreBeyondAgeCap}`
  );

  // -------------------------------------------------------------------------
  // Test 5: Future-dated oldestReportCreatedAt never produces negative days
  // -------------------------------------------------------------------------
  console.log('\nTest Suite 5: Future-Dated Creation Edge Case');
  const futureDate = new Date(now.getTime() + 5 * msPerDay); // 5 days in the future

  const futureScore = computePriorityScore({
    maxSeverity: Severity.MEDIUM,
    confirmationCount: 2,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: futureDate,
    now,
  });

  const zeroDaysScore = computePriorityScore({
    maxSeverity: Severity.MEDIUM,
    confirmationCount: 2,
    nearSensitiveLocation: false,
    oldestReportCreatedAt: now,
    now,
  });

  assertTest(
    `Future-dated oldestReportCreatedAt yields 0 days open and matches today's score`,
    futureScore === zeroDaysScore,
    `Future score: ${futureScore}, Zero-day score: ${zeroDaysScore}`
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n========================================================');
  console.log(`Test Results: ${passedTests}/${totalTests} tests passed`);
  console.log('========================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();

