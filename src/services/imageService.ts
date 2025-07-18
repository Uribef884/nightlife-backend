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
    // First, get the processed image dimensions
    const sharpImage = sharp(inputBuffer)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });

    // Get the metadata after resize
    const metadata = await sharpImage.metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    // Generate the JPEG buffer
    const jpegBuffer = await sharpImage
      .jpeg({ quality })
      .toBuffer();

    // Generate RGB data for BlurHash using a smaller size for better performance
    const blurWidth = Math.min(width, 32);
    const blurHeight = Math.min(height, 32);
    
    const rgbBuffer = await sharp(inputBuffer)
      .resize(blurWidth, blurHeight, {
        fit: 'fill' // Ensure exact dimensions
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    const blurhash = encode(
      new Uint8ClampedArray(rgbBuffer),
      blurWidth,
      blurHeight,
      4,
      4
    );

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