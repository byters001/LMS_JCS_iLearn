import type { User } from '../../db/types';

export type SafeUser = Omit<User, 'passwordHash'>;

export interface ListUsersResult {
  items: SafeUser[];
  total: number;
  page: number;
  pageSize: number;
}
