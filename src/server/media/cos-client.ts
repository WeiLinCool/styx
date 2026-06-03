import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type TencentCosClient = {
  uploadObject(input: {
    objectKey: string;
    body: Uint8Array;
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

export function createTencentCosClient(): TencentCosClient {
  const region = readRequiredEnv('TENCENT_COS_REGION');
  const bucket = readRequiredEnv('TENCENT_COS_BUCKET');
  const secretId = readRequiredEnv('TENCENT_COS_SECRET_ID');
  const secretKey = readRequiredEnv('TENCENT_COS_SECRET_KEY');
  const endpoint =
    process.env.TENCENT_COS_ENDPOINT ?? `https://${bucket}.cos.${region}.myqcloud.com`;

  const client = new S3Client({
    region,
    endpoint,
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
    async deleteObject(objectKey) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }),
      );
    },
    async createSignedReadUrl(objectKey, expiresInSeconds = 600) {
      return getSignedUrl(
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
