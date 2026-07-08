import type { StorageBucket } from './storage.constants';

export interface UploadInput {
  bucket: StorageBucket;
  path: string;
  file: Buffer | NodeJS.ReadableStream;
  contentType: string;
  upsert?: boolean;
}

export interface SignedUrlOptions {
  expirySeconds: number;
}

export interface UploadResult {
  bucket: StorageBucket;
  path: string;
}

export interface PublicUrlResult {
  url: string;
}

export interface SignedUrlResult {
  url: string;
  expiresAt: Date;
}
