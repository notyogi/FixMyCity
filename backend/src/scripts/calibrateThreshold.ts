import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { ImageHashService } from '../services/imageHash.service';
import { hammingDistance } from '../utils/hamming';
import { getHammingThreshold } from '../services/clustering.service';

interface ImagePairFiles {
  pairId: string;
  fileA: string;
  fileB: string;
}

interface ProcessedPair {
  pairId: string;
  fileA: string;
  fileB: string;
  hashA: string;
  hashB: string;
  distance: number;
}

interface GroupStats {
  count: number;
  min: number;
  max: number;
  average: number;
  median: number;
}

const VALID_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp']);

const TEST_DATA_DIR = path.resolve(__dirname, '../../test-data');
const SIMILAR_DIR = path.join(TEST_DATA_DIR, 'similar-pairs');
const DISSIMILAR_DIR = path.join(TEST_DATA_DIR, 'dissimilar-pairs');
const RESULTS_FILE = path.join(TEST_DATA_DIR, 'calibration-results.txt');

/**
 * Scans a directory for image pairs named with the convention:
 *   <pairId>_a.<ext> and <pairId>_b.<ext>
 * e.g., pair1_a.jpg, pair1_b.jpg, pair2_a.png, pair2_b.png
 */
async function findImagePairs(dirPath: string): Promise<{ pairs: ImagePairFiles[]; warnings: string[] }> {
  const warnings: string[] = [];

  if (!fs.existsSync(dirPath)) {
    return { pairs: [], warnings: [`Directory does not exist: ${dirPath}`] };
  }

  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const pairMap = new Map<string, { fileA?: string; fileB?: string }>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filename = entry.name;

    // Ignore tracker files
    if (filename === '.gitkeep' || filename === '.DS_Store') continue;

    const ext = path.extname(filename).toLowerCase();
    if (!VALID_IMAGE_EXTENSIONS.has(ext)) {
      warnings.push(`Ignored non-image file: ${filename}`);
      continue;
    }

    const match = filename.match(/^(.+?)_(a|b)\.[^.]+$/i);
    if (!match) {
      warnings.push(
        `File "${filename}" does not follow pair naming convention (e.g. pair1_a.jpg, pair1_b.jpg). Skipped.`
      );
      continue;
    }

    const pairId = match[1];
    const slot = match[2].toLowerCase();

    const existing = pairMap.get(pairId) || {};
    if (slot === 'a') {
      if (existing.fileA) {
        warnings.push(`Duplicate slot A encountered for pair "${pairId}": using ${filename}`);
      }
      existing.fileA = filename;
    } else {
      if (existing.fileB) {
        warnings.push(`Duplicate slot B encountered for pair "${pairId}": using ${filename}`);
      }
      existing.fileB = filename;
    }
    pairMap.set(pairId, existing);
  }

  const completePairs: ImagePairFiles[] = [];
  const sortedPairIds = Array.from(pairMap.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );

  for (const pairId of sortedPairIds) {
    const entry = pairMap.get(pairId)!;
    if (entry.fileA && entry.fileB) {
      completePairs.push({
        pairId,
        fileA: entry.fileA,
        fileB: entry.fileB,
      });
    } else {
      const missing = !entry.fileA ? 'slot A (_a)' : 'slot B (_b)';
      warnings.push(`Incomplete pair "${pairId}": missing ${missing}. Skipped.`);
    }
  }

  return { pairs: completePairs, warnings };
}

/**
 * Computes hashes and Hamming distance for a list of image pairs.
 */
async function processPairs(dirPath: string, pairs: ImagePairFiles[]): Promise<{ results: ProcessedPair[]; errors: string[] }> {
  const results: ProcessedPair[] = [];
  const errors: string[] = [];

  for (const pair of pairs) {
    try {
      const pathA = path.join(dirPath, pair.fileA);
      const pathB = path.join(dirPath, pair.fileB);

      const [bufferA, bufferB] = await Promise.all([
        fs.promises.readFile(pathA),
        fs.promises.readFile(pathB),
      ]);

      const [hashA, hashB] = await Promise.all([
        ImageHashService.computePerceptualHash(bufferA),
        ImageHashService.computePerceptualHash(bufferB),
      ]);

      const distance = hammingDistance(hashA, hashB);

      results.push({
        pairId: pair.pairId,
        fileA: pair.fileA,
        fileB: pair.fileB,
        hashA,
        hashB,
        distance,
      });
    } catch (err) {
      errors.push(`Error processing pair "${pair.pairId}" (${pair.fileA}, ${pair.fileB}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { results, errors };
}

/**
 * Computes descriptive statistics for a distribution of Hamming distances.
 */
function calculateStats(distances: number[]): GroupStats | null {
  if (distances.length === 0) return null;

  const sorted = [...distances].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const average = Number((sum / sorted.length).toFixed(2));

  let median: number;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    median = sorted[mid];
  } else {
    median = Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }

  return {
    count: sorted.length,
    min,
    max,
    average,
    median,
  };
}

/**
 * Formats a table of pair results.
 */
function formatResultsTable(title: string, subtitle: string, results: ProcessedPair[]): string {
  const lines: string[] = [];
  lines.push('========================================================================================================================');
  lines.push(`  ${title.toUpperCase()} (${subtitle})`);
  lines.push('========================================================================================================================');

  if (results.length === 0) {
    lines.push('  No valid pairs found in this category.');
    lines.push('------------------------------------------------------------------------------------------------------------------------\n');
    return lines.join('\n');
  }

  const header = `  ${'Pair ID'.padEnd(12)}  ${'File A'.padEnd(20)}  ${'File B'.padEnd(20)}  ${'Hash A'.padEnd(18)}  ${'Hash B'.padEnd(18)}  ${'Distance'}`;
  lines.push(header);
  lines.push('  ' + '-'.repeat(100));

  for (const r of results) {
    const row = `  ${r.pairId.padEnd(12)}  ${r.fileA.padEnd(20)}  ${r.fileB.padEnd(20)}  ${r.hashA.padEnd(18)}  ${r.hashB.padEnd(18)}  ${r.distance.toString().padStart(4)} bits`;
    lines.push(row);
  }

  lines.push('------------------------------------------------------------------------------------------------------------------------\n');
  return lines.join('\n');
}

/**
 * Main calibration runner.
 */
async function runCalibration(): Promise<void> {
  const outputLines: string[] = [];

  const log = (line: string = '') => {
    outputLines.push(line);
    console.log(line);
  };

  log('========================================================================================================================');
  log('                             FixMyCity - Perceptual Hash Threshold Calibration Harness                                  ');
  log('========================================================================================================================');
  log(`Dataset Location:              ${TEST_DATA_DIR}`);
  log(`Current Environment Threshold: ${getHammingThreshold()} bits (DEDUP_HAMMING_THRESHOLD)`);
  log(`Timestamp:                     ${new Date().toISOString()}`);
  log('------------------------------------------------------------------------------------------------------------------------\n');

  // 1. Scan and process similar pairs
  const { pairs: similarPairs, warnings: similarWarnings } = await findImagePairs(SIMILAR_DIR);
  const { results: similarResults, errors: similarErrors } = await processPairs(SIMILAR_DIR, similarPairs);

  // 2. Scan and process dissimilar pairs
  const { pairs: dissimilarPairs, warnings: dissimilarWarnings } = await findImagePairs(DISSIMILAR_DIR);
  const { results: dissimilarResults, errors: dissimilarErrors } = await processPairs(DISSIMILAR_DIR, dissimilarPairs);

  // Print any warnings or errors
  const allWarnings = [...similarWarnings, ...dissimilarWarnings];
  if (allWarnings.length > 0) {
    log('[DIRECTORY SCAN WARNINGS]');
    for (const w of allWarnings) {
      log(`  - ${w}`);
    }
    log();
  }

  const allErrors = [...similarErrors, ...dissimilarErrors];
  if (allErrors.length > 0) {
    log('[PROCESSING ERRORS]');
    for (const e of allErrors) {
      log(`  - ${e}`);
    }
    log();
  }

  // Print results tables
  log(formatResultsTable('Similar Pairs', 'expect LOW Hamming distance', similarResults));
  log(formatResultsTable('Dissimilar Pairs', 'expect HIGH Hamming distance', dissimilarResults));

  // 3. Compute statistics
  const similarDistances = similarResults.map((r) => r.distance);
  const dissimilarDistances = dissimilarResults.map((r) => r.distance);

  const statsSimilar = calculateStats(similarDistances);
  const statsDissimilar = calculateStats(dissimilarDistances);

  log('========================================================================================================================');
  log('                                                    SUMMARY STATISTICS                                                  ');
  log('========================================================================================================================');

  if (statsSimilar) {
    log(
      `  Similar Pairs     (N = ${statsSimilar.count.toString().padStart(2)}):   Min = ${statsSimilar.min.toString().padStart(2)},  Max = ${statsSimilar.max.toString().padStart(2)},  Avg = ${statsSimilar.average.toFixed(2).padStart(5)},  Median = ${statsSimilar.median.toFixed(2).padStart(5)}`
    );
  } else {
    log('  Similar Pairs     (N =  0):   No pairs processed.');
  }

  if (statsDissimilar) {
    log(
      `  Dissimilar Pairs  (N = ${statsDissimilar.count.toString().padStart(2)}):   Min = ${statsDissimilar.min.toString().padStart(2)},  Max = ${statsDissimilar.max.toString().padStart(2)},  Avg = ${statsDissimilar.average.toFixed(2).padStart(5)},  Median = ${statsDissimilar.median.toFixed(2).padStart(5)}`
    );
  } else {
    log('  Dissimilar Pairs  (N =  0):   No pairs processed.');
  }

  log('------------------------------------------------------------------------------------------------------------------------\n');

  // 4. Threshold recommendation or overlap evaluation
  log('========================================================================================================================');
  log('                                            THRESHOLD RECOMMENDATION & ANALYSIS                                         ');
  log('========================================================================================================================');

  if (!statsSimilar || !statsDissimilar) {
    log('  [INSUFFICIENT DATA]');
    log('  Both similar and dissimilar pairs are required to compute an empirical threshold recommendation.');
    log('  Please place matching test images into:');
    log(`    - ${SIMILAR_DIR}     (e.g., pair1_a.jpg and pair1_b.jpg)`);
    log(`    - ${DISSIMILAR_DIR}  (e.g., pair1_a.jpg and pair1_b.jpg)`);
    log('  Then re-run: npm run calibrate:threshold\n');
  } else {
    const maxSimilar = statsSimilar.max;
    const minDissimilar = statsDissimilar.min;

    if (maxSimilar < minDissimilar) {
      // Clean separation
      const suggestedThreshold = Math.floor((maxSimilar + minDissimilar) / 2);
      const margin = minDissimilar - maxSimilar - 1;

      log('  [STATUS: CLEAN SEPARATION]');
      log(`  Clear separation confirmed between similar pairs (max: ${maxSimilar}) and dissimilar pairs (min: ${minDissimilar}).`);
      log(`  Separation gap: ${margin} bit(s) margin between clusters.`);
      log();
      log(`  SUGGESTED DEDUP_HAMMING_THRESHOLD: ${suggestedThreshold} bits`);
      log('  Decision boundary:');
      log(`    - Hamming Distance <= ${suggestedThreshold} bits  -> MERGE (classified as duplicate report)`);
      log(`    - Hamming Distance >  ${suggestedThreshold} bits  -> CREATE NEW CLUSTER (classified as distinct issue)`);
      log();
      log(`  [ACTION REQUIRED] To apply this threshold, manually update your /backend/.env file:`);
      log(`    DEDUP_HAMMING_THRESHOLD=${suggestedThreshold}`);
    } else {
      // Overlap detected
      const overlapStart = minDissimilar;
      const overlapEnd = maxSimilar;

      log('  [WARNING: DISTANCE RANGE OVERLAP]');
      log(`  Similar pairs max distance (${maxSimilar} bits) >= Dissimilar pairs min distance (${minDissimilar} bits).`);
      log(`  Overlap interval: [${overlapStart} .. ${overlapEnd}] bits.`);
      log();
      log('  Observations & Practical Guidance:');
      log('  1. There is no single Hamming threshold that cleanly partitions all current test images.');
      log('  2. Possible Causes:');
      log('     - Test images in the overlap zone may have extreme perspective shifts, heavy occlusions, or low contrast.');
      log('     - Visually uniform backgrounds (e.g. wide plain asphalt) produce similar low-frequency DCT coefficients.');
      log('  3. Next Steps:');
      log('     - Review test pairs whose distance falls within the overlap interval.');
      log('     - Add more diverse test pairs across typical urban lighting and zoom levels.');
      log('     - If ambiguity persists, keep DEDUP_HAMMING_THRESHOLD conservative (e.g. <= 10) to prevent false-positive merges,');
      log('       as PostGIS proximity (25m) provides the primary spatial constraint.');
    }
  }

  log('========================================================================================================================\n');

  // 5. Output to calibration-results.txt file
  try {
    if (!fs.existsSync(TEST_DATA_DIR)) {
      await fs.promises.mkdir(TEST_DATA_DIR, { recursive: true });
    }
    await fs.promises.writeFile(RESULTS_FILE, outputLines.join('\n'), 'utf8');
    console.log(`[Calibration Harness] Full results successfully saved to:\n  ${RESULTS_FILE}\n`);
  } catch (fileErr) {
    console.error('[Calibration Harness] Failed to write calibration-results.txt:', fileErr);
  }
}

// Execute
runCalibration().catch((err) => {
  console.error('[Calibration Harness] Unhandled error during calibration:', err);
  process.exit(1);
});
