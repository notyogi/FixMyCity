import 'dotenv/config';
import prisma from '../utils/prisma';
import { ClusteringService, getHammingThreshold } from '../services/clustering.service';
import { hammingDistance } from '../utils/hamming';

// ============================================================================
// TEST REPORT IDS FOR DUPLICATE CLUSTERING
// Edit these two Report IDs to match existing reports in your database.
// - REPORT_A_ID: A pre-existing open report
// - REPORT_B_ID: A second report near Report A to evaluate as if newly submitted
//
// You can also override them via CLI:
//   npm run test:clustering -- <reportA_id> <reportB_id>
// ============================================================================
const DEFAULT_REPORT_A_ID = '01b9bff6-b905-4da0-bb5b-0feed7073c8f';
const DEFAULT_REPORT_B_ID = '3eb62722-4cc4-43a6-9d3c-f197dba0b0b6';

async function runClusteringTest(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const reportAId = args[0] || DEFAULT_REPORT_A_ID;
  const reportBId = args[1] || DEFAULT_REPORT_B_ID;

  console.log('================================================================================');
  console.log('            FixMyCity - Duplicate Detection & Clustering Engine Test             ');
  console.log('================================================================================');
  console.log(`Configured Hamming Threshold: ${getHammingThreshold()} bits (DEDUP_HAMMING_THRESHOLD)`);
  console.log(`Report A (Base Candidate):   ${reportAId}`);
  console.log(`Report B (Incoming Report):   ${reportBId}`);
  console.log('--------------------------------------------------------------------------------\n');

  try {
    // 1. Fetch both reports from the database
    let [reportA, reportB] = await Promise.all([
      prisma.report.findUnique({ where: { id: reportAId } }),
      prisma.report.findUnique({ where: { id: reportBId } }),
    ]);

    if (!reportA || !reportB) {
      console.warn('One or both specified report IDs were not found in the database.');
      console.log('Fetching two most recent open reports with non-null image hashes as fallback...\n');

      const recentReports = await prisma.report.findMany({
        where: {
          status: { notIn: ['FIXED', 'REJECTED'] },
          image_hash: { not: null },
        },
        orderBy: { created_at: 'desc' },
        take: 2,
      });

      if (recentReports.length < 2) {
        console.error('Not enough open reports with image_hash found in database to run comparison.');
        console.log('Please submit at least 2 reports first or run npm run backfill:hashes.');
        process.exitCode = 1;
        return;
      }

      reportA = recentReports[1];
      reportB = recentReports[0];
      console.log(`Using fallback reports:\n  Report A: ${reportA.id}\n  Report B: ${reportB.id}\n`);
    }

    console.log('--- REPORT A (Base Report) ---');
    console.log(`ID:         ${reportA.id}`);
    console.log(`Location:   (${reportA.lat}, ${reportA.lng})`);
    console.log(`Issue Type: ${reportA.issue_type} | Status: ${reportA.status}`);
    console.log(`Image Hash: ${reportA.image_hash || 'None'}`);
    console.log(`Cluster ID: ${reportA.cluster_id || 'None (Unassigned)'}\n`);

    console.log('--- REPORT B (Incoming Report to Evaluate) ---');
    console.log(`ID:         ${reportB.id}`);
    console.log(`Location:   (${reportB.lat}, ${reportB.lng})`);
    console.log(`Issue Type: ${reportB.issue_type} | Status: ${reportB.status}`);
    console.log(`Image Hash: ${reportB.image_hash || 'None'}`);
    console.log(`Cluster ID: ${reportB.cluster_id || 'None (Unassigned)'}\n`);

    if (reportA.image_hash && reportB.image_hash) {
      const bitDiff = hammingDistance(reportA.image_hash, reportB.image_hash);
      console.log(`Direct pHash Hamming Distance: ${bitDiff} bits (Threshold <= ${getHammingThreshold()})`);
      console.log(`Visual Similarity:             ${(((64 - bitDiff) / 64) * 100).toFixed(1)}%\n`);
    }

    // Ensure Report A has a cluster assigned first if it does not yet have one
    if (!reportA.cluster_id) {
      console.log('[Setup] Report A is unclustered. Initializing cluster for Report A...');
      const clusterResultA = await ClusteringService.evaluateAndAssignCluster(reportA);
      console.log(`[Setup] Report A assigned to cluster: ${clusterResultA.clusterId} (${clusterResultA.action})\n`);
      // Refresh reportA
      const refreshedA = await prisma.report.findUnique({ where: { id: reportA.id } });
      if (refreshedA) reportA = refreshedA;
    }

    // 2. Invoke ClusteringService on Report B
    console.log(`Evaluating and assigning cluster for Report B (${reportB.id})...\n`);
    const startTime = Date.now();
    const result = await ClusteringService.evaluateAndAssignCluster(reportB);
    const elapsedMs = Date.now() - startTime;

    console.log('================================================================================');
    console.log(`                        CLUSTERING EVALUATION RESULT (${elapsedMs}ms)           `);
    console.log('================================================================================');
    console.log(`Action:              ${result.action.toUpperCase()}`);
    console.log(`Assigned Cluster ID: ${result.clusterId}`);
    console.log(`Confirmation Count:  ${result.confirmationCount}`);

    if (result.action === 'merged') {
      console.log(`Matched Report ID:   ${result.matchedReportId}`);
      console.log(`Hamming Distance:    ${result.hammingDistance} bits`);
      console.log(`Proximity Distance:  ${result.distanceMeters.toFixed(2)} meters`);
    }

    // 3. Inspect updated database state
    console.log('\n--- VERIFYING DATABASE STATE ---');
    const cluster = await prisma.reportCluster.findUnique({
      where: { id: result.clusterId },
      include: {
        reports: {
          select: { id: true, lat: true, lng: true, status: true, created_at: true },
        },
        confirmations: {
          select: { id: true, report_id: true, confirmed_by_user_id: true, created_at: true },
        },
      },
    });

    if (cluster) {
      console.log(`Cluster ID:           ${cluster.id}`);
      console.log(`Centroid:             (${cluster.centroid_lat.toFixed(6)}, ${cluster.centroid_lng.toFixed(6)})`);
      console.log(`Confirmation Count:   ${cluster.confirmation_count}`);
      console.log(`Total Linked Reports: ${cluster.reports.length}`);
      console.log(`Total Confirmations:  ${cluster.confirmations.length}\n`);

      console.log('Linked Reports:');
      console.table(
        cluster.reports.map((r, i) => ({
          '#': i + 1,
          'Report ID': r.id,
          Location: `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`,
          Status: r.status,
          'Created At': r.created_at.toISOString(),
        }))
      );

      console.log('\nConfirmations:');
      console.table(
        cluster.confirmations.map((c, i) => ({
          '#': i + 1,
          'Confirmation ID': c.id,
          'Report ID': c.report_id,
          'Confirmed By User': c.confirmed_by_user_id,
        }))
      );
    } else {
      console.warn(`Cluster ${result.clusterId} not found in database.`);
    }

    console.log('\n================================================================================');
    console.log('Clustering test completed successfully!');
    console.log('================================================================================');
  } catch (err) {
    console.error('Clustering test failed with error:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runClusteringTest();
