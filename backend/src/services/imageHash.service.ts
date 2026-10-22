import sharp from 'sharp';

/**
 * Custom exception thrown when fetching, decoding, or computing
 * perceptual hash for an image fails.
 */
export class ImageHashException extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'ImageHashException';
    Object.setPrototypeOf(this, ImageHashException.prototype);
  }
}

/**
 * Dimensions and constants for standard 64-bit pHash algorithm.
 * 1. Resize to 32x32 grayscale
 * 2. Compute 2D Discrete Cosine Transform (DCT-II)
 * 3. Extract top-left 8x8 low-frequency block
 * 4. Compare each coefficient to median -> 64 bits = 16 hex characters
 */
const SAMPLE_SIZE = 32;
const LOW_FREQ_SIZE = 8;
const HASH_BITS = LOW_FREQ_SIZE * LOW_FREQ_SIZE; // 64 bits

// Precomputed cosine lookup table for DCT-II on 32-sample signal for frequencies 0..7
const COS_TABLE: Float64Array[] = [];
for (let u = 0; u < LOW_FREQ_SIZE; u++) {
  const row = new Float64Array(SAMPLE_SIZE);
  for (let n = 0; n < SAMPLE_SIZE; n++) {
    row[n] = Math.cos((Math.PI * (2 * n + 1) * u) / (2 * SAMPLE_SIZE));
  }
  COS_TABLE.push(row);
}

const HEX_CHARS = '0123456789abcdef';

/**
 * Converts a 64-element binary array (0 or 1) into a 16-character lowercase hex string.
 */
export function bitsToHex(bits: Uint8Array | number[]): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble =
      (bits[i] << 3) |
      (bits[i + 1] << 2) |
      (bits[i + 2] << 1) |
      bits[i + 3];
    hex += HEX_CHARS[nibble];
  }
  return hex;
}

const POPCOUNT_NIBBLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

function parseHexNibble(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48; // '0'-'9'
  if (code >= 97 && code <= 102) return code - 87; // 'a'-'f'
  if (code >= 65 && code <= 70) return code - 55; // 'A'-'F'
  throw new ImageHashException(`Invalid hexadecimal character: '${char}'`);
}

/**
 * Calculates the Hamming distance (number of differing bits) between two 16-character hex hashes.
 * Returns an integer between 0 (identical) and 64 (completely inverted).
 */
export function computeHammingDistance(hashA: string, hashB: string): number {
  if (typeof hashA !== 'string' || typeof hashB !== 'string') {
    throw new ImageHashException('Hash parameters must be non-null strings');
  }
  const cleanA = hashA.trim().toLowerCase();
  const cleanB = hashB.trim().toLowerCase();

  if (cleanA.length !== 16 || cleanB.length !== 16) {
    throw new ImageHashException(
      `Hashes must be 16-character hex strings (received lengths: ${cleanA.length} and ${cleanB.length})`
    );
  }

  let distance = 0;
  for (let i = 0; i < 16; i++) {
    const xor = parseHexNibble(cleanA[i]) ^ parseHexNibble(cleanB[i]);
    distance += POPCOUNT_NIBBLE[xor];
  }
  return distance;
}

/**
 * Computes a 64-bit perceptual hash (pHash) from raw image bytes.
 *
 * Algorithm steps:
 * 1. Resize image to 32x32 pixels
 * 2. Convert to single-channel 8-bit grayscale
 * 3. Compute 2D Discrete Cosine Transform (DCT-II)
 * 4. Extract top-left 8x8 low-frequency block
 * 5. Compute median of the 64 coefficients
 * 6. Set bit to 1 if coefficient > median, else 0
 * 7. Format 64 bits as a 16-character hex string
 */
export async function computePerceptualHashFromBuffer(imageBuffer: Buffer): Promise<string> {
  try {
    const { data } = await sharp(imageBuffer)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (data.length !== SAMPLE_SIZE * SAMPLE_SIZE) {
      throw new Error(`Unexpected pixel buffer size: expected ${SAMPLE_SIZE * SAMPLE_SIZE}, got ${data.length}`);
    }

    // Pass 1: 1D DCT on each of the 32 rows for the lowest 8 horizontal frequencies
    const rowDct = new Float64Array(SAMPLE_SIZE * LOW_FREQ_SIZE);
    for (let y = 0; y < SAMPLE_SIZE; y++) {
      const rowOffset = y * SAMPLE_SIZE;
      const targetOffset = y * LOW_FREQ_SIZE;
      for (let u = 0; u < LOW_FREQ_SIZE; u++) {
        const cosU = COS_TABLE[u];
        let sum = 0;
        for (let x = 0; x < SAMPLE_SIZE; x++) {
          sum += data[rowOffset + x] * cosU[x];
        }
        rowDct[targetOffset + u] = sum;
      }
    }

    // Pass 2: 1D DCT on the 8 columns for the lowest 8 vertical frequencies
    const dct8x8 = new Float64Array(HASH_BITS);
    for (let v = 0; v < LOW_FREQ_SIZE; v++) {
      const cosV = COS_TABLE[v];
      const targetRowOffset = v * LOW_FREQ_SIZE;
      for (let u = 0; u < LOW_FREQ_SIZE; u++) {
        let sum = 0;
        for (let y = 0; y < SAMPLE_SIZE; y++) {
          sum += rowDct[y * LOW_FREQ_SIZE + u] * cosV[y];
        }
        dct8x8[targetRowOffset + u] = sum;
      }
    }

    // Step 5: Compute median of the 64 coefficients
    const sorted = Array.from(dct8x8).sort((a, b) => a - b);
    const median = (sorted[31] + sorted[32]) / 2;

    // Step 6: 64-bit comparison against median
    const bits = new Uint8Array(HASH_BITS);
    for (let i = 0; i < HASH_BITS; i++) {
      bits[i] = dct8x8[i] > median ? 1 : 0;
    }

    // Step 7: Return 16-hex character hash
    return bitsToHex(bits);
  } catch (error) {
    if (error instanceof ImageHashException) throw error;
    throw new ImageHashException(
      `Failed to compute pHash from image buffer: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * ImageHashService: Server-side perceptual hashing for uploaded civic damage photos.
 * Fetches the image from its remote URL (e.g., Cloudinary), validates content,
 * and computes a 64-bit pHash.
 */
export class ImageHashService {
  /**
   * Computes a 16-char hex pHash from either a remote image URL or a local image Buffer.
   * - If a Buffer is provided, decodes and hashes directly without network requests.
   * - If a URL string is provided, fetches the image with a default 10-second timeout.
   * Throws [ImageHashException] on network errors, timeouts, invalid URLs/inputs, or corrupted image data.
   */
  static async computePerceptualHash(
    imageInput: string | Buffer,
    timeoutMs: number = 10000
  ): Promise<string> {
    if (Buffer.isBuffer(imageInput)) {
      if (imageInput.length === 0) {
        throw new ImageHashException('Empty image buffer provided');
      }
      return await computePerceptualHashFromBuffer(imageInput);
    }

    const imageUrl = imageInput;
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new ImageHashException('Invalid image input: input must be a non-empty URL string or Buffer');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      throw new ImageHashException(`Malformed image URL: "${imageUrl}"`);
    }

    if (!parsedUrl.protocol.startsWith('http')) {
      throw new ImageHashException(`Unsupported protocol for image fetch: "${parsedUrl.protocol}"`);
    }

    let response: Response;
    try {
      response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'image/*,*/*',
        },
      });
    } catch (fetchError) {
      const errName = fetchError instanceof Error ? fetchError.name : '';
      if (errName === 'TimeoutError' || errName === 'AbortError') {
        throw new ImageHashException(
          `Image fetch timed out after ${timeoutMs}ms from ${imageUrl}`,
          fetchError
        );
      }
      throw new ImageHashException(
        `Network error fetching image from ${imageUrl}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
        fetchError
      );
    }

    if (!response.ok) {
      throw new ImageHashException(
        `Failed to fetch image from ${imageUrl}: HTTP ${response.status} ${response.statusText}`
      );
    }

    let buffer: Buffer;
    try {
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } catch (readError) {
      throw new ImageHashException(
        `Failed to read image body from ${imageUrl}: ${readError instanceof Error ? readError.message : String(readError)}`,
        readError
      );
    }

    if (buffer.length === 0) {
      throw new ImageHashException(`Empty image payload received from ${imageUrl}`);
    }

    return await computePerceptualHashFromBuffer(buffer);
  }
}
