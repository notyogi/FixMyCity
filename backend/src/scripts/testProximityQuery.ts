import 'dotenv/config';
import prisma from '../utils/prisma';
import { ProximityService } from '../services/proximity.service';

// ============================================================================
// TEST COORDINATES AND RADIUS
// Edit these default values to match real coordinates from reports in your database.
// You can also override them via CLI: npm run test:proximity -- <lat> <lng> [radiusMeters]
// ============================================================================
const DEFAULT_TEST_LAT = 37.33233141;
const DEFAULT_TEST_LNG = -122.0312186;
const DEFAULT_RADIUS_METERS = 50;

async function runProximityTest(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const testLat = args[0] ? parseFloat(args[0]) : DEFAULT_TEST_LAT;
  const testLng = args[1] ? parseFloat(args[1]) : DEFAULT_TEST_LNG;
  const testRadius = args[2] ? parseFloat(args[2]) : DEFAULT_RADIUS_METERS;

  console.log('================================================================================');
  console.log('                  FixMyCity - Geospatial Proximity Query Test                   ');
  console.log('================================================================================');
  console.log(`Target Coordinates: Latitude: ${testLat}, Longitude: ${testLng}`);
  console.log(`Search Radius:      ${testRadius} meters`);
  console.log('Filter:             status NOT IN (\'FIXED\', \'REJECTED\') (Open reports only)');
  console.log('--------------------------------------------------------------------------------\n');

  try {
    const startTime = Date.now();
    const results = await ProximityService.findNearbyOpenReports(testLat, testLng, testRadius);
    const elapsedMs = Date.now() - startTime;

    console.log(`Query completed in ${elapsedMs}ms. Found ${results.length} nearby open report(s):\n`);

    if (results.length === 0) {
      console.log('No open reports found within the specified radius.');
    } else {
      const tableData = results.map((r, index) => ({
        '#': index + 1,
        ID: r.id,
        'Issue Type': r.issue_type,
        Severity: r.severity,
        Status: r.status,
        'Distance (m)': `${r.distance_meters.toFixed(2)}m`,
        'Cluster ID': r.cluster_id || 'None',
        'Image Hash': r.image_hash || 'None',
      }));

      console.table(tableData);

      console.log('\nMatch Summary:');
      results.forEach((r, idx) => {
        console.log(
          `  ${idx + 1}. [${r.issue_type} - ${r.severity}] ${r.id} at ${r.distance_meters.toFixed(2)}m (Status: ${r.status})`
        );
      });
    }

    console.log('\n================================================================================');
  } catch (error) {
    console.error('Proximity query test failed with error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runProximityTest();
