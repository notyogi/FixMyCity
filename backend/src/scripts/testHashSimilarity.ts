import 'dotenv/config';
import sharp from 'sharp';
import {
  ImageHashService,
  computePerceptualHashFromBuffer,
  computeHammingDistance,
} from '../services/imageHash.service';

/**
 * Script to verify and demonstrate perceptual hashing (pHash) behavior:
 * - Visually identical or recompressed images produce very small Hamming distances (0 to 5 bits).
 * - Completely different images produce large Hamming distances (~20 to 35+ bits).
 *
 * Usage:
 *   npm run test:hash-similarity
 *   npm run test:hash-similarity -- <imageUrl1> <imageUrl2>
 */
async function runSimilarityTest(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

  console.log('===========================================================');
  console.log('       FixMyCity - Perceptual Hash (pHash) Similarity Test  ');
  console.log('===========================================================');

  if (args.length >= 2) {
    const [urlA, urlB] = args;
    console.log(`Comparing two provided URLs:\n  Image 1: ${urlA}\n  Image 2: ${urlB}\n`);

    try {
      const hashA = await ImageHashService.computePerceptualHash(urlA);
      const hashB = await ImageHashService.computePerceptualHash(urlB);
      const distance = computeHammingDistance(hashA, hashB);
      const similarityPercent = (((64 - distance) / 64) * 100).toFixed(1);

      console.log(`Image 1 Hash:    ${hashA}`);
      console.log(`Image 2 Hash:    ${hashB}`);
      console.log(`Hamming Distance: ${distance} / 64 bits`);
      console.log(`Similarity:      ${similarityPercent}%`);
      console.log(
        `Evaluation:      ${
          distance <= 5
            ? 'MATCH (Likely duplicate/same scene)'
            : distance <= 10
            ? 'NEAR-MATCH (Similar composition/scene)'
            : 'DISTINCT (Different images)'
        }`
      );
    } catch (err) {
      console.error('Error comparing URLs:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
    return;
  }

  console.log('No custom URLs provided. Running automated synthetic & real image tests...\n');

  // Test 1: Generate an original synthetic civic scene pattern
  // Left half green (park/ground), right half blue (sky/water) with a gray rectangle (pavement)
  const baseImageBuffer = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 34, g: 139, b: 34 }, // Forest green
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 200,
            height: 300,
            channels: 3,
            background: { r: 70, g: 130, b: 180 }, // Steel blue
          },
        })
          .png()
          .toBuffer(),
        left: 200,
        top: 0,
      },
      {
        input: await sharp({
          create: {
            width: 150,
            height: 80,
            channels: 3,
            background: { r: 128, g: 128, b: 128 }, // Gray patch (pothole/sidewalk)
          },
        })
          .png()
          .toBuffer(),
        left: 50,
        top: 180,
      },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

  // Test 1b: Re-compressed and slightly resized version of the exact same scene
  // (Simulates citizen uploading through camera with compression or different resolution)
  const recompressedBuffer = await sharp(baseImageBuffer)
    .resize(320, 240)
    .modulate({ brightness: 1.05 }) // 5% brightness shift
    .jpeg({ quality: 35 }) // High compression
    .toBuffer();

  // Test 2: A completely different image pattern (warm red/orange diagonal gradient)
  const unrelatedImageBuffer = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 220, g: 20, b: 60 }, // Crimson red
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 400,
            height: 100,
            channels: 3,
            background: { r: 255, g: 140, b: 0 }, // Dark orange banner
          },
        })
          .png()
          .toBuffer(),
        left: 0,
        top: 100,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  console.log('--- TEST 1: Same Scene (Original vs Re-compressed & Brightness shifted) ---');
  const hashOriginal = await computePerceptualHashFromBuffer(baseImageBuffer);
  const hashCompressed = await computePerceptualHashFromBuffer(recompressedBuffer);
  const distanceSimilar = computeHammingDistance(hashOriginal, hashCompressed);
  console.log(`Original Image Hash:      ${hashOriginal}`);
  console.log(`Re-compressed Image Hash: ${hashCompressed}`);
  console.log(`Hamming Distance:         ${distanceSimilar} bits (Threshold <= 5)`);
  console.log(`Similarity:               ${(((64 - distanceSimilar) / 64) * 100).toFixed(1)}%`);
  console.log(`Result:                   ${distanceSimilar <= 5 ? 'PASSED (Identified as near-duplicate)' : 'FAILED'}\n`);

  console.log('--- TEST 2: Completely Unrelated Images ---');
  const hashUnrelated = await computePerceptualHashFromBuffer(unrelatedImageBuffer);
  const distanceUnrelated = computeHammingDistance(hashOriginal, hashUnrelated);
  console.log(`Original Image Hash:      ${hashOriginal}`);
  console.log(`Unrelated Image Hash:     ${hashUnrelated}`);
  console.log(`Hamming Distance:         ${distanceUnrelated} bits (Expected > 15 bits)`);
  console.log(`Similarity:               ${(((64 - distanceUnrelated) / 64) * 100).toFixed(1)}%`);
  console.log(`Result:                   ${distanceUnrelated > 15 ? 'PASSED (Identified as distinct images)' : 'FAILED'}\n`);

  // Test 3: Live Cloudinary sample images from database
  console.log('--- TEST 3: Live Cloudinary Images Comparison ---');
  const sampleUrl1 =
    'https://res.cloudinary.com/dkbkrr3bd/image/upload/v1792335070/ma2h5oto22ymtnzrezm5.jpg';
  const sampleUrl2 =
    'https://res.cloudinary.com/dkbkrr3bd/image/upload/v1792333713/nek64aq1qxi0z6jvveev.jpg';

  try {
    const hashCloud1 = await ImageHashService.computePerceptualHash(sampleUrl1);
    const hashCloud2 = await ImageHashService.computePerceptualHash(sampleUrl2);
    const distanceCloud = computeHammingDistance(hashCloud1, hashCloud2);

    console.log(`Cloudinary Image 1 (Garbage):  ${hashCloud1} (${sampleUrl1})`);
    console.log(`Cloudinary Image 2 (Sidewalk): ${hashCloud2} (${sampleUrl2})`);
    console.log(`Hamming Distance:             ${distanceCloud} bits`);
    console.log(`Similarity:                   ${(((64 - distanceCloud) / 64) * 100).toFixed(1)}%`);
    console.log(
      `Result:                       ${
        distanceCloud > 10 ? 'PASSED (Distinct civic issues differentiated)' : 'CLOSE MATCH'
      }\n`
    );
  } catch (err) {
    console.log(`Note: Live Cloudinary test skipped or encountered error: ${err instanceof Error ? err.message : err}`);
  }

  console.log('===========================================================');
  console.log('All perceptual hash similarity verifications completed!');
  console.log('===========================================================');
}

runSimilarityTest();
