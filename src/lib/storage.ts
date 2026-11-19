import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

/**
 * Where processed images live: a folder on a persistent disk (default) or any S3-compatible bucket.
 * Keys look like "2026/<random>/w800.webp"; they never contain user-supplied text.
 */
export interface StoredObject {
  body: Buffer;
  contentType: string;
}

const KEY_RE = /^\d{4}\/[a-f0-9]{16,64}\/w\d{2,5}\.webp$/;
export const isValidKey = (k: string) => KEY_RE.test(k);

let s3: S3Client | null = null;
function s3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint || undefined,
      forcePathStyle: !!env.s3.endpoint,
      credentials: env.s3.accessKeyId ? { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey } : undefined,
    });
  }
  return s3;
}

function localPath(key: string): string {
  if (!isValidKey(key)) throw new Error("Invalid storage key");
  const root = path.resolve(env.uploadDir);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function putObject(key: string, body: Buffer, contentType = "image/webp"): Promise<void> {
  if (env.storageDriver === "s3") {
    await s3Client().send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    return;
  }
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
}

export async function getObject(key: string): Promise<StoredObject | null> {
  if (!isValidKey(key)) return null;
  try {
    if (env.storageDriver === "s3") {
      const out = await s3Client().send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
      const bytes = await out.Body?.transformToByteArray();
      return bytes ? { body: Buffer.from(bytes), contentType: out.ContentType ?? "image/webp" } : null;
    }
    return { body: await fs.readFile(localPath(key)), contentType: "image/webp" };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    if (env.storageDriver === "s3") await s3Client().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    else await fs.rm(localPath(key), { force: true });
  } catch (e) {
    console.error("[storage] could not delete", key, (e as Error).message);
  }
}
