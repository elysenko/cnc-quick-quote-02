import { Injectable, Logger } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigResolverService } from '../common/config.service';
import { ServiceUnconfiguredError } from '../common/errors';

const BUCKET = process.env.MINIO_BUCKET ?? 'cnc-drawings';

/**
 * MinIO / S3 object storage for uploaded CAD drawings.
 *
 * Endpoint and credentials come from the pod environment (`infra-secrets`), with the
 * admin-managed `MINIO_S3_BOTO3_API_KEY` SystemSetting as the fallback tier — never
 * a hardcoded host, so the same image runs in any site namespace.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucketReady = false;

  constructor(private readonly config: ConfigResolverService) {}

  private async credentials(): Promise<{ endpoint: string; accessKeyId: string; secretAccessKey: string }> {
    const endpoint = await this.config.resolveFirst('MINIO_ENDPOINT', 'S3_ENDPOINT');
    const accessKeyId = await this.config.resolveFirst('MINIO_ROOT_USER', 'MINIO_ACCESS_KEY', 'AWS_ACCESS_KEY_ID');
    const secretAccessKey = await this.config.resolveFirst(
      'MINIO_ROOT_PASSWORD',
      'MINIO_SECRET_KEY',
      'AWS_SECRET_ACCESS_KEY',
      'MINIO_S3_BOTO3_API_KEY',
    );
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnconfiguredError(
        'MINIO_S3_BOTO3_API_KEY',
        'Drawing storage is not configured. An administrator must add the MinIO endpoint and credentials in Settings before drawings can be uploaded.',
      );
    }
    return { endpoint, accessKeyId, secretAccessKey };
  }

  private async s3(): Promise<S3Client> {
    if (this.client) return this.client;
    const { endpoint, accessKeyId, secretAccessKey } = await this.credentials();
    this.client = new S3Client({
      endpoint,
      region: process.env.MINIO_REGION ?? 'us-east-1',
      // MinIO serves buckets as path segments, not DNS subdomains.
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  /** Creates the bucket on first use. Safe to call on every request — it self-caches. */
  async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    const s3 = await this.s3();
    try {
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    } catch {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      } catch (error) {
        // A concurrent request may have won the race; a second HEAD settles it.
        await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
        this.logger.debug(`Bucket create raced or already existed: ${(error as Error).message}`);
      }
    }
    this.bucketReady = true;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    const s3 = await this.s3();
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  }

  /** Time-limited download URL so the browser fetches the DXF straight from MinIO. */
  async presignedGet(key: string, expiresIn = 300): Promise<string> {
    const s3 = await this.s3();
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
  }

  /** Health probe: reports reachability without throwing. */
  async check(): Promise<{ status: 'up' | 'down'; message?: string }> {
    try {
      const s3 = await this.s3();
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET })).catch(() => this.ensureBucket());
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', message: (error as Error).message };
    }
  }
}
