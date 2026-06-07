import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type TencentCosClient = {
  uploadObject(input: {
    objectKey: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<{ bucket: string; region: string; objectKey: string }>;
  copyObject(input: {
    sourceObjectKey: string;
    targetObjectKey: string;
    contentType: string;
  }): Promise<{ bucket: string; region: string; objectKey: string }>;
  deleteObject(objectKey: string): Promise<void>;
  createSignedReadUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
};

function readRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Tencent COS media storage.`);
  }

  return value;
}

export function buildTencentCosEndpoint(region: string, endpointOverride?: string | null) {
  return endpointOverride ?? `https://cos.${region}.myqcloud.com`;
}

export function createTencentCosClient(): TencentCosClient {
  const region = readRequiredEnv('TENCENT_COS_REGION');
  const bucket = readRequiredEnv('TENCENT_COS_BUCKET');
  const secretId = readRequiredEnv('TENCENT_COS_SECRET_ID');
  const secretKey = readRequiredEnv('TENCENT_COS_SECRET_KEY');
  const endpoint = buildTencentCosEndpoint(region, process.env.TENCENT_COS_ENDPOINT);

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: secretId,
      secretAccessKey: secretKey,
    },
  });

  return {
    async uploadObject(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.objectKey,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );

      return { bucket, region, objectKey: input.objectKey };
    },
    async copyObject(input) {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: input.targetObjectKey,
          CopySource: `${bucket}/${input.sourceObjectKey}`,
          ContentType: input.contentType,
          MetadataDirective: 'REPLACE',
        }),
      );

      return { bucket, region, objectKey: input.targetObjectKey };
    },
    async deleteObject(objectKey) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }),
      );
    },
    async createSignedReadUrl(objectKey, expiresInSeconds = 600) {
      // SDK package versions expose incompatible types here, but runtime behavior is correct.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (getSignedUrl as any)(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }),
        { expiresIn: expiresInSeconds },
      );
    },
  };
}
