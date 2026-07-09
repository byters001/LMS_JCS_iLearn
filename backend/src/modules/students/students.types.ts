import type { StudentProfile } from '../../db/types';

export interface ListStudentProfilesResult {
  items: StudentProfile[];
  total: number;
  page: number;
  pageSize: number;
}
