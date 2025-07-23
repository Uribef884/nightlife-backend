import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

import { Ad } from "../entities/Ad";

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const bucket = process.env.AWS_S3_BUCKET!;

export interface UploadResult {
  url: string;
  key: string;
  size: number;
}

export class S3Service {
  static async uploadFile(
    buffer: Buffer,
    contentType: string,
    key: string
  ): Promise<UploadResult> {
    
    const params = {
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // ACL removed - bucket policy handles public access
    };
    
    const result = await s3.upload(params).promise();
    
    return {
      url: result.Location,
      key: result.Key,
      size: buffer.length,
    };
  }

  static async deleteFile(key: string): Promise<void> {
    
    const params = {
      Bucket: bucket,
      Key: key,
    };
    
    const result = await s3.deleteObject(params).promise();
  }

  static generateKey(clubId: string, type: string, fileName?: string): string {
    const uuid = uuidv4();
    const timestamp = Date.now();
    
    switch (type) {
      case 'menu-pdf':
        return `clubs/${clubId}/menu/menu-${timestamp}.pdf`;
      case 'profile-image':
        return `clubs/${clubId}/profile/${uuid}.jpg`;
      case 'menu-item-image':
        return `clubs/${clubId}/menu-items/${fileName || uuid}.jpg`;
      case 'event-banner':
        return `clubs/${clubId}/events/${fileName || uuid}.jpg`;
      case 'ad-banner':
        return `clubs/${clubId}/ads/${uuid}.jpg`;
      default:
        return `misc/${uuid}`;
    }
  }

  /**
   * Generate the S3 key for an ad image (admin or club ad)
   */
  static generateAdKey(ad: { id: string; clubId?: string | null }): string {
    if (!ad.clubId) {
      // Admin ad
      return `admin/ads/${ad.id}.jpg`;
    } else {
      // Club ad
      return `clubs/${ad.clubId}/ads/${ad.id}.jpg`;
    }
  }

  /**
   * Delete a file from S3 by its URL (safe for ad image updates)
   * Only deletes if the URL is not null/empty and not the same as the new URL
   */
  static async deleteFileByUrl(url?: string | null, newUrl?: string | null): Promise<void> {
    if (!url || !url.startsWith("http")) return;
    if (newUrl && url === newUrl) return; // Don't delete if it's the same file (overwritten)
    try {
      const parsed = new URL(url);
      const key = parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname;
      await this.deleteFile(key);
    } catch (err) {
      console.error("Failed to delete S3 file by URL:", url, err);
    }
  }
} 