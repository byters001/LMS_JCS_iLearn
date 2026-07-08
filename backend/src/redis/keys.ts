const GLOBAL_COLLEGE_SENTINEL = 'global';

// Must stay byte-for-byte identical to the format the in-memory stub used in
// rbac/permission-cache.ts before this phase — swapping the storage backend
// must not invalidate/orphan any logic keyed on this format.
export function permissionsKey(userId: string, collegeId: string | null): string {
  return `rbac:permissions:${userId}:${collegeId ?? GLOBAL_COLLEGE_SENTINEL}`;
}

export function revokedRefreshTokenKey(jti: string): string {
  return `auth:revoked-refresh-token:${jti}`;
}
