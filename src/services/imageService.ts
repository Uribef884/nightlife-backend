import sharp from 'sharp';
import { encode } from 'blurhash';

export interface ProcessedImage {
  buffer: Buffer;
  blurhash: string;
  width: number;
  height: number;
  size: number;
}

export class ImageService {
  static async processImage(
    inputBuffer: Buffer,
    maxWidth: number = parseInt(process.env.IMAGE_MAX_WIDTH || '1920'),
    maxHeight: number = parseInt(process.env.IMAGE_MAX_HEIGHT || '1080'),
    quality: number = parseInt(process.env.IMAGE_QUALITY_COMPRESSED || '80')
  ): Promise<ProcessedImage> {
    // Resize main image
    const sharpImage = sharp(inputBuffer).resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });

    const metadata = await sharpImage.metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    // Final optimized JPEG
    const jpegBuffer = await sharpImage.jpeg({ quality }).toBuffer();

    // Set default fallback blurhash
    let blurhash: string = 'LKN]Rv%2Tw=w]~RBVZRi};RPxuwH';

    try {
      const { data: rawBuffer, info } = await sharp(jpegBuffer)
        .resize(32, 32, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0 },
        })
        .ensureAlpha() // ✅ Force RGBA output (required by blurhash)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = new Uint8ClampedArray(Uint8Array.from(rawBuffer));
      const expectedLength = info.width * info.height * 4;

      if (pixels.length !== expectedLength) {
        throw new Error(`❌ BlurHash mismatch: expected ${expectedLength}, got ${pixels.length}`);
      }

      blurhash = encode(pixels, info.width, info.height, 4, 4);
    } catch (error) {
      console.error(`❌ BlurHash failed:`, error);
      // fallback blurhash already assigned
    }

    return {
      buffer: jpegBuffer,
      blurhash,
      width,
      height,
      size: jpegBuffer.length,
    };
  }

  static async generateThumbnail(
    inputBuffer: Buffer,
    width: number = 300,
    height: number = 300
  ): Promise<Buffer> {
    return await sharp(inputBuffer)
      .resize(width, height, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 70 })
      .toBuffer();
  }
}
