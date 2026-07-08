import { redisClient } from '../redis/client';
import { permissionsKey } from '../redis/keys';
import type { PermissionKey } from './types';

const PERMISSION_CACHE_TTL_SECONDS = 300;

async function get(userId: string, collegeId: string | null): Promise<PermissionKey[] | null> {
  const raw = await redisClient.get(permissionsKey(userId, collegeId));
  if (raw === null) {
    return null;
  }
  return JSON.parse(raw) as PermissionKey[];
}

async function set(
  userId: string,
  collegeId: string | null,
  permissionKeys: PermissionKey[],
): Promise<void> {
  await redisClient.set(
    permissionsKey(userId, collegeId),
    JSON.stringify(permissionKeys),
    'EX',
    PERMISSION_CACHE_TTL_SECONDS,
  );
}

async function invalidate(userId: string, collegeId: string | null): Promise<void> {
  await redisClient.del(permissionsKey(userId, collegeId));
}

export const permissionCache = { get, set, invalidate };
