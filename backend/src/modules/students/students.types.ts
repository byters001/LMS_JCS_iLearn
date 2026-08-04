import type { MyDashboardProfileRow, StudentProfileWithNames } from './students.repository';

export interface ListStudentProfilesResult {
  items: StudentProfileWithNames[];
  total: number;
  page: number;
  pageSize: number;
}

// GET /students/me — see students.repository.ts's findMyDashboardProfile
// module comment for why this is a genuinely new (small) endpoint.
export type MyDashboardProfile = MyDashboardProfileRow;
