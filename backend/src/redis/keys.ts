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

// Scoped by userId (a key from one user must never collide with the same
// literal key value from another) AND by method+route (a client reusing
// the same key value across two unrelated endpoints by mistake shouldn't
// have one operation's cached outcome bleed into the other) — see
// plugins/idempotency.plugin.ts for the full design.
export function idempotencyKey(
  userId: string,
  method: string,
  route: string,
  clientKey: string,
): string {
  return `idempotency:${userId}:${method}:${route}:${clientKey}`;
}
