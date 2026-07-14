import type { StudentProfileWithNames } from './students.repository';

export interface ListStudentProfilesResult {
  items: StudentProfileWithNames[];
  total: number;
  page: number;
  pageSize: number;
}
