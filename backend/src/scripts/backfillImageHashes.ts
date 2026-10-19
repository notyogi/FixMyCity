import 'dotenv/config';
import prisma from '../utils/prisma';
import { ImageHashService } from '../services/imageHash.service';

/**
 * One-off maintenance script to backfill perceptual hashes (pHash)
 * for any existing Report rows in the database that have image_hash = null.
 */
async function backfillImageHashes(): Promise<void> {
  console.log('--- Starting Image Hash Backfill Script ---');

  try {
    const unhashedReports = await prisma.report.findMany({
      where: {
        image_hash: null,
      },
      select: {
        id: true,
        image_url: true,
        issue_type: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    const total = unhashedReports.length;
    console.log(`Found ${total} report(s) with null image_hash.`);

    if (total === 0) {
      console.log('No reports require backfilling. All rows have image_hash populated.');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < total; i++) {
      const report = unhashedReports[i];
      const progress = `[${i + 1}/${total}]`;

      try {
        console.log(`${progress} Processing report ${report.id} (${report.issue_type})...`);
        const hash = await ImageHashService.computePerceptualHash(report.image_url);

        await prisma.report.update({
          where: { id: report.id },
          data: { image_hash: hash },
        });

        successCount++;
        console.log(`  ✓ ${progress} Successfully saved hash ${hash} for report ${report.id}`);
      } catch (error) {
        failCount++;
        console.error(
          `  ✗ ${progress} Failed to hash report ${report.id} (URL: ${report.image_url}):`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log('--- Backfill Summary ---');
    console.log(`Total Scanned:   ${total}`);
    console.log(`Successfully Updated: ${successCount}`);
    console.log(`Failed / Skipped:     ${failCount}`);
  } catch (err) {
    console.error('Fatal error during backfill script:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    console.log('Disconnected from database.');
  }
}

backfillImageHashes();
