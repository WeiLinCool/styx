import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { StoryboardTemplateAsset } from '@/server/agent/types';
import type { TencentCosClient } from './cos-client';

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type ImageInspection = {
  width: number;
  height: number;
  mimeType: string;
};

function readUInt32BE(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function readUInt16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function inspectPng(bytes: Uint8Array): ImageInspection | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    return null;
  }

  return {
    width: readUInt32BE(bytes, 16),
    height: readUInt32BE(bytes, 20),
    mimeType: 'image/png',
  };
}

function inspectJpeg(bytes: Uint8Array): ImageInspection | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      break;
    }

    const segmentLength = readUInt16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      return {
        height: readUInt16BE(bytes, offset + 3),
        width: readUInt16BE(bytes, offset + 5),
        mimeType: 'image/jpeg',
      };
    }

    offset += segmentLength;
  }

  return null;
}

function inspectWebp(bytes: Uint8Array): ImageInspection | null {
  if (
    bytes.length < 30 ||
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') !== 'RIFF' ||
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') !== 'WEBP'
  ) {
    return null;
  }

  const chunkType = Buffer.from(bytes.subarray(12, 16)).toString('ascii');
  if (chunkType === 'VP8X' && bytes.length >= 30) {
    return {
      width: readUInt24LE(bytes, 24) + 1,
      height: readUInt24LE(bytes, 27) + 1,
      mimeType: 'image/webp',
    };
  }

  if (chunkType === 'VP8 ' && bytes.length >= 30) {
    return {
      width: readUInt16BE(Uint8Array.from([bytes[27], bytes[26]]), 0) & 0x3fff,
      height: readUInt16BE(Uint8Array.from([bytes[29], bytes[28]]), 0) & 0x3fff,
      mimeType: 'image/webp',
    };
  }

  if (chunkType === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8));
    const height =
      1 + (((bytes[22] & 0xc0) >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10));
    return {
      width,
      height,
      mimeType: 'image/webp',
    };
  }

  return null;
}

function inspectImageBytes(bytes: Uint8Array): ImageInspection {
  const inspected = inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
  if (!inspected || inspected.width <= 0 || inspected.height <= 0) {
    throw new Error('无法读取模板图尺寸，请上传有效的 PNG、JPEG 或 WebP 图片。');
  }

  return inspected;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return '.jpg';
  }
  if (mimeType === 'image/webp') {
    return '.webp';
  }
  return '.png';
}

export function createUploadAdminStoryboardTemplateService(dependencies: {
  cosClient: Pick<TencentCosClient, 'uploadObject' | 'deleteObject'>;
  inspectImage?: (bytes: Uint8Array) => Promise<ImageInspection> | ImageInspection;
  now?: () => Date;
  createId?: () => string;
  environmentName?: string;
}) {
  return {
    async uploadTemplate(input: {
      capabilityId: string;
      filename: string;
      mimeType: string;
      bytes: Uint8Array;
    }): Promise<StoryboardTemplateAsset> {
      if (!SUPPORTED_IMAGE_TYPES.has(input.mimeType)) {
        throw new Error('仅支持上传 PNG、JPEG 或 WebP 模板图。');
      }

      if (input.bytes.byteLength === 0) {
        throw new Error('模板图文件不能为空。');
      }

      const inspected = await (dependencies.inspectImage?.(input.bytes) ?? inspectImageBytes(input.bytes));
      if (!SUPPORTED_IMAGE_TYPES.has(inspected.mimeType)) {
        throw new Error('仅支持上传 PNG、JPEG 或 WebP 模板图。');
      }

      const environmentName = dependencies.environmentName ?? process.env.NODE_ENV ?? 'development';
      const uploadId = dependencies.createId?.() ?? randomUUID();
      const objectKey = path.posix.join(
        'admin-config',
        environmentName,
        'agent-capabilities',
        input.capabilityId,
        'storyboard-template',
        `${uploadId}${extensionForMimeType(inspected.mimeType)}`,
      );

      const uploaded = await dependencies.cosClient.uploadObject({
        objectKey,
        body: input.bytes,
        contentType: inspected.mimeType,
      });

      return {
        storageProvider: 'tencent_cos',
        bucket: uploaded.bucket,
        region: uploaded.region,
        objectKey: uploaded.objectKey,
        mimeType: inspected.mimeType,
        byteSize: input.bytes.byteLength,
        width: inspected.width,
        height: inspected.height,
        originalFilename: input.filename,
        uploadedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      };
    },
  };
}
