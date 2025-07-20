import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

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
} 