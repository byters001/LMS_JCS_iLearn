import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { permissionCache } from '../../src/rbac/permission-cache';
import { requirePermission } from '../../src/rbac/require-permission';
import { usersService } from '../../src/modules/users/users.service';
import { ForbiddenError } from '../../src/shared/errors/app-error';
import { createRegistry, cleanupRegistry, makeUser, type FixtureRegistry } from './helpers';

// Regression coverage for the live bug: a super_admin (or any user) idle
// long enough for their Redis permission-cache entry to hit its TTL got
// denied with a 403 on routes they should always pass, because
// requirePermission() treated a cache MISS the same as "zero permissions"
// instead of re-resolving from the database. permissionCache.invalidate()
// below stands in for TTL expiry — same resulting state (permissionCache.get
// returns null), reached without waiting out the real 300s TTL.
function fakeRequest(userId: string, activeCollegeId: string | null): FastifyRequest {
  return { user: { id: userId, email: 'unused@test.local', activeCollegeId } } as FastifyRequest;
}
const noopReply = {} as FastifyReply;

describe('permission cache self-heals on a miss', () => {
  const registry: FixtureRegistry = createRegistry();
  let superAdminUserId: string;
  let superAdminRoleId: string;

  beforeAll(async () => {
    const user = await makeUser(registry, 'permcache-super-admin');
    superAdminUserId = user.id;

    const role = await usersService.findRoleBySlug('super_admin');
    superAdminRoleId = role.id;

    // assignRole (users.service.ts) already calls resolvePermissionsForUser
    // at the end, so the cache starts populated — invalidate() in each test
    // below is what puts it back into a "miss" state to exercise.
    await usersService.assignRole(superAdminUserId, { roleId: superAdminRoleId }, superAdminUserId);
  }, 60_000);

  afterAll(async () => {
    await cleanupRegistry(registry);
  });

  it('repopulates the cache and allows the request on a cold/expired cache, instead of denying outright', async () => {
    await permissionCache.invalidate(superAdminUserId, null);
    expect(await permissionCache.get(superAdminUserId, null)).toBeNull();

    const preHandler = requirePermission('analytics.view');
    await expect(
      preHandler(fakeRequest(superAdminUserId, null), noopReply),
    ).resolves.toBeUndefined();

    const repopulated = await permissionCache.get(superAdminUserId, null);
    expect(repopulated).not.toBeNull();
    expect(repopulated).toContain('analytics.view');
  });

  it('still denies correctly on a cold cache once the role has actually been revoked', async () => {
    await usersService.revokeRole(superAdminUserId, superAdminRoleId, null);
    // revokeRole() already invalidates the cache, but assert the precondition
    // explicitly so this test doesn't depend on that as an implicit detail.
    await permissionCache.invalidate(superAdminUserId, null);
    expect(await permissionCache.get(superAdminUserId, null)).toBeNull();

    const preHandler = requirePermission('analytics.view');
    await expect(
      preHandler(fakeRequest(superAdminUserId, null), noopReply),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Re-assign so afterAll's cleanupRegistry (which only deletes the user
    // row) isn't left depending on role-assignment state either way — the
    // user_roles row cascades on user delete regardless, this just keeps
    // the fixture's end state unsurprising if this test file grows more
    // cases later.
    await usersService.assignRole(superAdminUserId, { roleId: superAdminRoleId }, superAdminUserId);
  });
});
