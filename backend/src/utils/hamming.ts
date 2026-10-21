/**
 * Utility for calculating the Hamming distance between two perceptual hash (pHash) strings.
 *
 * Hamming distance measures the number of bit positions in which two binary vectors differ.
 * When applied to perceptual image hashes, a lower distance signifies higher visual similarity.
 *
 * Inline Examples:
 * - Identical hashes:
 *     hammingDistance('d6d4b13b2426cada', 'd6d4b13b2426cada') -> 0 (0 bit differences)
 * - Single bit difference:
 *     hammingDistance('0000000000000000', '0000000000000001') -> 1 (0000 vs 0001 in last nibble)
 * - Completely inverted 64-bit hashes:
 *     hammingDistance('0000000000000000', 'ffffffffffffffff') -> 64 (all bits flipped)
 * - Real civic issue comparison:
 *     hashA: '90cd66d35c4c74b3'
 *     hashB: '90cd66d35c4c74b2' -> 1 (Duplicate / same pothole scene)
 *     hashC: 'd6d4b13b2426cada' -> 34 (Completely distinct scene / different report)
 *
 * @param hashA First hexadecimal hash string
 * @param hashB Second hexadecimal hash string
 * @returns Total count of differing bits between the two hashes
 * @throws Error if inputs are missing, have different lengths, or contain non-hex characters
 */
export function hammingDistance(hashA: string, hashB: string): number {
  if (typeof hashA !== 'string' || typeof hashB !== 'string') {
    throw new Error('Both hash arguments must be non-null strings');
  }

  const cleanA = hashA.trim().toLowerCase();
  const cleanB = hashB.trim().toLowerCase();

  if (cleanA.length !== cleanB.length) {
    throw new Error(
      `Hashes must be of equal length to compute Hamming distance (received ${cleanA.length} and ${cleanB.length})`
    );
  }

  if (cleanA.length === 0) {
    return 0;
  }

  // Convert each hexadecimal character to its 4-bit binary representation,
  // XOR bit by bit, and count differing bits (1s in XOR output)
  let distance = 0;

  for (let i = 0; i < cleanA.length; i++) {
    const valA = parseInt(cleanA[i], 16);
    const valB = parseInt(cleanB[i], 16);

    if (isNaN(valA) || isNaN(valB)) {
      throw new Error(
        `Invalid hexadecimal character encountered at index ${i}: '${cleanA[i]}' vs '${cleanB[i]}'`
      );
    }

    const binA = valA.toString(2).padStart(4, '0');
    const binB = valB.toString(2).padStart(4, '0');

    // XOR bit by bit across the 4 bits of this nibble
    for (let b = 0; b < 4; b++) {
      if (binA[b] !== binB[b]) {
        distance++;
      }
    }
  }

  return distance;
}

export default hammingDistance;
