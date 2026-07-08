-- ============================================================================
-- JCS iLearn Assessment Portal — Production Database Schema
-- Target: PostgreSQL (Neon), Drizzle ORM compatible
-- Convention: UUID PKs, soft-delete on structural entities, immutable attempt
--             history, dynamic RBAC, versioned question bank, pool-based
--             randomized assessments with frozen selections per attempt.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- SECTION 0: SHARED TRIGGER FUNCTION (auto-updates updated_at on row change)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 1: ENUM TYPES
-- ============================================================================

CREATE TYPE college_status_enum AS ENUM ('active', 'expired', 'archived');
CREATE TYPE training_program_status_enum AS ENUM ('planned', 'ongoing', 'completed', 'archived');
CREATE TYPE batch_status_enum AS ENUM ('active', 'completed', 'archived');
CREATE TYPE trainer_role_enum AS ENUM ('lead', 'co_trainer');
CREATE TYPE session_type_enum AS ENUM ('aptitude', 'reasoning', 'coding', 'soft_skills', 'interview', 'other');
CREATE TYPE session_status_enum AS ENUM ('scheduled', 'completed', 'cancelled');
CREATE TYPE student_status_enum AS ENUM ('active', 'archived');
CREATE TYPE tps_status_enum AS ENUM ('active', 'transferred', 'repeated', 'completed', 'dropped');
CREATE TYPE question_type_enum AS ENUM ('mcq', 'coding', 'psychometric');
CREATE TYPE difficulty_enum AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE question_status_enum AS ENUM ('draft', 'pending_review', 'approved', 'rejected', 'archived');
CREATE TYPE test_category_enum AS ENUM ('mcq', 'coding', 'psychometric', 'mixed');
CREATE TYPE assessment_status_enum AS ENUM ('draft', 'review', 'approved', 'scheduled', 'live', 'completed', 'archived');
CREATE TYPE selection_mode_enum AS ENUM ('manual', 'pool');
CREATE TYPE attempt_status_enum AS ENUM ('not_started', 'in_progress', 'submitted', 'pending_evaluation', 'invalidated');
CREATE TYPE proctoring_event_type_enum AS ENUM ('tab_switch', 'fullscreen_exit', 'camera_flag', 'copy_paste', 'network_disconnect', 'window_blur');
CREATE TYPE retake_status_enum AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE question_approval_action_enum AS ENUM ('submitted', 'approved', 'rejected');
CREATE TYPE assessment_approval_action_enum AS ENUM ('submitted', 'approved', 'rejected', 'scheduled', 'published');
CREATE TYPE feature_flag_scope_enum AS ENUM ('global', 'college');
CREATE TYPE module_name_enum AS ENUM ('question_bank', 'coding', 'leaderboard', 'practice_tests', 'ai_assistant', 'reports');
CREATE TYPE setting_value_type_enum AS ENUM ('string', 'number', 'boolean', 'json');
CREATE TYPE setting_category_enum AS ENUM ('general', 'security', 'integration', 'email', 'ai');

-- ============================================================================
-- SECTION 2: IDENTITY & DYNAMIC RBAC
-- ============================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at      TIMESTAMPTZ
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  is_system_role  BOOLEAN NOT NULL DEFAULT false,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,     -- e.g. 'assessments.publish'
  module          TEXT NOT NULL,            -- e.g. 'assessments'
  description     TEXT
);

CREATE TABLE role_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- ============================================================================
-- SECTION 3: ORGANIZATION HIERARCHY
-- ============================================================================

CREATE TABLE colleges (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  code                  TEXT NOT NULL UNIQUE,
  logo_url              TEXT,
  address               TEXT,
  contact_email         TEXT,
  contact_phone         TEXT,
  contract_start_date   DATE,
  contract_end_date     DATE,
  status                college_status_enum NOT NULL DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at            TIMESTAMPTZ
);
CREATE TRIGGER trg_colleges_updated_at BEFORE UPDATE ON colleges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_colleges_status ON colleges(status) WHERE deleted_at IS NULL;

CREATE TABLE departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id      UUID NOT NULL REFERENCES colleges(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  code            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at      TIMESTAMPTZ
);
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_departments_college ON departments(college_id) WHERE deleted_at IS NULL;

CREATE TABLE academic_years (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id      UUID NOT NULL REFERENCES colleges(id) ON DELETE RESTRICT,
  year_label      TEXT NOT NULL,          -- e.g. '2025-2026'
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_academic_years_updated_at BEFORE UPDATE ON academic_years
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_academic_years_college ON academic_years(college_id);

CREATE TABLE training_programs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id          UUID NOT NULL REFERENCES colleges(id) ON DELETE RESTRICT,
  department_id       UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  academic_year_id    UUID REFERENCES academic_years(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  start_date          DATE,
  end_date            DATE,
  status              training_program_status_enum NOT NULL DEFAULT 'planned',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at          TIMESTAMPTZ
);
CREATE TRIGGER trg_training_programs_updated_at BEFORE UPDATE ON training_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_training_programs_college_status ON training_programs(college_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_training_programs_department ON training_programs(department_id);

CREATE TABLE training_program_trainers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_program_id  UUID NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  trainer_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_program       trainer_role_enum NOT NULL DEFAULT 'co_trainer',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_program_id, trainer_id)
);
CREATE INDEX idx_tpt_program ON training_program_trainers(training_program_id);
CREATE INDEX idx_tpt_trainer ON training_program_trainers(trainer_id);

CREATE TABLE batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_program_id  UUID NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
  name                  TEXT NOT NULL,
  max_students          INTEGER,
  status                batch_status_enum NOT NULL DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at            TIMESTAMPTZ
);
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_batches_program_status ON batches(training_program_id, status) WHERE deleted_at IS NULL;

CREATE TABLE user_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  college_id      UUID REFERENCES colleges(id) ON DELETE CASCADE,  -- NULL = global (e.g. Super Admin)
  assigned_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, college_id)
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_college ON user_roles(college_id);

CREATE TABLE trainer_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialization  TEXT,
  bio             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_trainer_profiles_updated_at BEFORE UPDATE ON trainer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE student_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  college_id          UUID NOT NULL REFERENCES colleges(id) ON DELETE RESTRICT,
  department_id       UUID REFERENCES departments(id) ON DELETE SET NULL,
  roll_number         TEXT,
  photo_url           TEXT,
  contact_email_alt   TEXT,
  contact_phone       TEXT,
  status              student_status_enum NOT NULL DEFAULT 'active',
  archived_at         TIMESTAMPTZ,
  access_revoked_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_student_profiles_updated_at BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_student_profiles_college_status ON student_profiles(college_id, status);
CREATE INDEX idx_student_profiles_department ON student_profiles(department_id);

CREATE TABLE training_program_students (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_program_id  UUID NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
  student_id            UUID NOT NULL REFERENCES student_profiles(id) ON DELETE RESTRICT,
  batch_id              UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  status                tps_status_enum NOT NULL DEFAULT 'active',
  joined_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by            UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_tps_updated_at BEFORE UPDATE ON training_program_students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_tps_program ON training_program_students(training_program_id);
CREATE INDEX idx_tps_student ON training_program_students(student_id);
CREATE INDEX idx_tps_batch ON training_program_students(batch_id);
CREATE INDEX idx_tps_program_status ON training_program_students(training_program_id, status);

-- ============================================================================
-- SECTION 4: TRAINING SESSIONS
-- ============================================================================

CREATE TABLE training_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_program_id  UUID NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
  title                 TEXT NOT NULL,
  description           TEXT,
  session_number        INTEGER NOT NULL,
  session_date          DATE NOT NULL,
  start_time            TIME,
  end_time              TIME,
  session_type          session_type_enum NOT NULL DEFAULT 'other',
  status                session_status_enum NOT NULL DEFAULT 'scheduled',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by            UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_training_sessions_updated_at BEFORE UPDATE ON training_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_training_sessions_program ON training_sessions(training_program_id);
CREATE INDEX idx_training_sessions_date ON training_sessions(session_date);

CREATE TABLE training_session_trainers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_session_id  UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  trainer_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_session       trainer_role_enum NOT NULL DEFAULT 'co_trainer',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_session_id, trainer_id)
);
CREATE INDEX idx_tst_session ON training_session_trainers(training_session_id);
CREATE INDEX idx_tst_trainer ON training_session_trainers(trainer_id);

-- ============================================================================
-- SECTION 5: QUESTION BANK (categories, topics, tags, versioned questions)
-- ============================================================================

CREATE TABLE question_categories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  parent_category_id    UUID REFERENCES question_categories(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_categories_parent ON question_categories(parent_category_id);

CREATE TABLE question_topics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category_id     UUID REFERENCES question_categories(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_topics_category ON question_topics(category_id);

CREATE TABLE question_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE
);

CREATE TABLE questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id         UUID REFERENCES question_categories(id) ON DELETE SET NULL,
  type                question_type_enum NOT NULL,
  difficulty          difficulty_enum NOT NULL,
  college_id          UUID REFERENCES colleges(id) ON DELETE SET NULL,  -- NULL = global bank
  status              question_status_enum NOT NULL DEFAULT 'draft',
  current_version_id  UUID,  -- FK added after question_versions is created (circular dependency)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at          TIMESTAMPTZ
);
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_questions_category ON questions(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_college ON questions(college_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_type_difficulty ON questions(type, difficulty) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_status ON questions(status) WHERE deleted_at IS NULL;

CREATE TABLE question_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  question_text   TEXT NOT NULL,
  marks           NUMERIC(6,2) NOT NULL DEFAULT 1,
  is_active_version BOOLEAN NOT NULL DEFAULT false,
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (question_id, version_number)
);
CREATE INDEX idx_question_versions_question ON question_versions(question_id);
-- Only one active version per question:
CREATE UNIQUE INDEX idx_question_versions_one_active
  ON question_versions(question_id) WHERE is_active_version = true;

ALTER TABLE questions
  ADD CONSTRAINT fk_questions_current_version
  FOREIGN KEY (current_version_id) REFERENCES question_versions(id) ON DELETE SET NULL;

CREATE TABLE question_options (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  option_text         TEXT,
  option_image_url    TEXT,
  is_correct          BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_question_options_version ON question_options(question_version_id);

CREATE TABLE question_images (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  image_url           TEXT NOT NULL,
  caption              TEXT,
  sort_order           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_question_images_version ON question_images(question_version_id);

CREATE TABLE coding_question_details (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id   UUID NOT NULL UNIQUE REFERENCES question_versions(id) ON DELETE CASCADE,
  problem_statement     TEXT NOT NULL,
  input_format          TEXT,
  output_format         TEXT,
  constraints           TEXT,
  time_limit_ms         INTEGER NOT NULL DEFAULT 2000,
  memory_limit_kb       INTEGER NOT NULL DEFAULT 65536,
  supported_languages   JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE coding_test_cases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  input               TEXT,
  expected_output     TEXT,
  is_hidden           BOOLEAN NOT NULL DEFAULT true,
  points              NUMERIC(6,2) NOT NULL DEFAULT 1,
  sort_order          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_coding_test_cases_version ON coding_test_cases(question_version_id);

CREATE TABLE psychometric_details (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id   UUID NOT NULL UNIQUE REFERENCES question_versions(id) ON DELETE CASCADE,
  trait_category         TEXT,
  scale_type             TEXT NOT NULL DEFAULT 'likert'  -- 'likert' | 'scenario'
);

CREATE TABLE psychometric_options (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  option_text         TEXT NOT NULL,
  trait_weight        NUMERIC(6,2) DEFAULT 0,
  sort_order          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_psychometric_options_version ON psychometric_options(question_version_id);

CREATE TABLE question_topic_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  topic_id        UUID NOT NULL REFERENCES question_topics(id) ON DELETE CASCADE,
  UNIQUE (question_id, topic_id)
);
CREATE INDEX idx_question_topic_map_question ON question_topic_map(question_id);
CREATE INDEX idx_question_topic_map_topic ON question_topic_map(topic_id);

CREATE TABLE question_tag_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  tag_id          UUID NOT NULL REFERENCES question_tags(id) ON DELETE CASCADE,
  UNIQUE (question_id, tag_id)
);
CREATE INDEX idx_question_tag_map_question ON question_tag_map(question_id);
CREATE INDEX idx_question_tag_map_tag ON question_tag_map(tag_id);

CREATE TABLE question_approval_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id           UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_version_id   UUID REFERENCES question_versions(id) ON DELETE SET NULL,
  action                question_approval_action_enum NOT NULL,
  performed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_approval_history_question ON question_approval_history(question_id);

-- ============================================================================
-- SECTION 6: QUESTION POOLS (random question generation)
-- ============================================================================

CREATE TABLE question_pools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  college_id      UUID REFERENCES colleges(id) ON DELETE SET NULL,  -- NULL = global reusable pool
  category_id     UUID REFERENCES question_categories(id) ON DELETE SET NULL,
  type            question_type_enum NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at      TIMESTAMPTZ
);
CREATE TRIGGER trg_question_pools_updated_at BEFORE UPDATE ON question_pools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_question_pools_college ON question_pools(college_id) WHERE deleted_at IS NULL;

CREATE TABLE question_pool_criteria (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_pool_id UUID NOT NULL REFERENCES question_pools(id) ON DELETE CASCADE,
  difficulty        difficulty_enum NOT NULL,
  topic_id          UUID REFERENCES question_topics(id) ON DELETE SET NULL,
  tag_filter        JSONB,
  count_required    INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_pool_criteria_pool ON question_pool_criteria(question_pool_id);

-- ============================================================================
-- SECTION 7: ASSESSMENTS, SECTIONS, POOLS-PER-SECTION
-- ============================================================================

CREATE TABLE assessments (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_session_id             UUID NOT NULL REFERENCES training_sessions(id) ON DELETE RESTRICT,
  title                           TEXT NOT NULL,
  description                     TEXT,
  test_category                   test_category_enum NOT NULL,
  timer_minutes                   INTEGER,
  start_at                        TIMESTAMPTZ,
  end_at                          TIMESTAMPTZ,
  max_attempts                    INTEGER NOT NULL DEFAULT 1,
  shuffle_questions                BOOLEAN NOT NULL DEFAULT false,
  random_question_count            INTEGER,
  negative_marking                 BOOLEAN NOT NULL DEFAULT false,
  negative_marking_value           NUMERIC(6,2) DEFAULT 0,
  proctoring_camera_required       BOOLEAN NOT NULL DEFAULT false,
  proctoring_fullscreen_required   BOOLEAN NOT NULL DEFAULT false,
  is_practice                      BOOLEAN NOT NULL DEFAULT false,
  status                           assessment_status_enum NOT NULL DEFAULT 'draft',
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by                       UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at                       TIMESTAMPTZ
);
CREATE TRIGGER trg_assessments_updated_at BEFORE UPDATE ON assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_assessments_session ON assessments(training_session_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assessments_status ON assessments(status) WHERE deleted_at IS NULL;

CREATE TABLE assessment_sections (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id             UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  instructions              TEXT,
  section_order             INTEGER NOT NULL DEFAULT 0,
  timer_minutes             INTEGER,
  passing_marks              NUMERIC(6,2),
  negative_marking           BOOLEAN NOT NULL DEFAULT false,
  negative_marking_value     NUMERIC(6,2) DEFAULT 0,
  shuffle_questions           BOOLEAN NOT NULL DEFAULT false,
  selection_mode              selection_mode_enum NOT NULL DEFAULT 'manual',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_assessment_sections_updated_at BEFORE UPDATE ON assessment_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_assessment_sections_assessment ON assessment_sections(assessment_id);

CREATE TABLE assessment_questions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_section_id   UUID NOT NULL REFERENCES assessment_sections(id) ON DELETE CASCADE,
  question_version_id     UUID NOT NULL REFERENCES question_versions(id) ON DELETE RESTRICT,
  marks_override           NUMERIC(6,2),
  sort_order                INTEGER NOT NULL DEFAULT 0,
  UNIQUE (assessment_section_id, question_version_id)
);
CREATE INDEX idx_assessment_questions_section ON assessment_questions(assessment_section_id);
CREATE INDEX idx_assessment_questions_version ON assessment_questions(question_version_id);

CREATE TABLE assessment_section_pools (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_section_id   UUID NOT NULL REFERENCES assessment_sections(id) ON DELETE CASCADE,
  question_pool_id        UUID NOT NULL REFERENCES question_pools(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_section_id, question_pool_id)
);
CREATE INDEX idx_assessment_section_pools_section ON assessment_section_pools(assessment_section_id);

CREATE TABLE assessment_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, batch_id)
);
CREATE INDEX idx_assessment_batches_assessment ON assessment_batches(assessment_id);
CREATE INDEX idx_assessment_batches_batch ON assessment_batches(batch_id);

CREATE TABLE assessment_approval_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  action          assessment_approval_action_enum NOT NULL,
  performed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assessment_approval_history_assessment ON assessment_approval_history(assessment_id);

-- ============================================================================
-- SECTION 8: ATTEMPTS, FROZEN SELECTIONS, RESPONSES, PROCTORING
-- ============================================================================

CREATE TABLE assessment_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     UUID NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  student_id         UUID NOT NULL REFERENCES student_profiles(id) ON DELETE RESTRICT,
  attempt_number     INTEGER NOT NULL DEFAULT 1,
  status             attempt_status_enum NOT NULL DEFAULT 'not_started',
  start_time         TIMESTAMPTZ,
  end_time           TIMESTAMPTZ,
  submission_time    TIMESTAMPTZ,
  ip_address         TEXT,
  browser_info       TEXT,
  total_score        NUMERIC(8,2),
  rank_in_batch      INTEGER,
  is_retake          BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_id, attempt_number)
);
CREATE TRIGGER trg_assessment_attempts_updated_at BEFORE UPDATE ON assessment_attempts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_attempts_assessment ON assessment_attempts(assessment_id);
CREATE INDEX idx_attempts_student ON assessment_attempts(student_id);
CREATE INDEX idx_attempts_status ON assessment_attempts(status);

CREATE TABLE attempt_question_selections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id               UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE RESTRICT,
  assessment_section_id    UUID NOT NULL REFERENCES assessment_sections(id) ON DELETE RESTRICT,
  question_version_id      UUID NOT NULL REFERENCES question_versions(id) ON DELETE RESTRICT,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_version_id)
);
CREATE INDEX idx_aqs_attempt ON attempt_question_selections(attempt_id);
CREATE INDEX idx_aqs_section ON attempt_question_selections(assessment_section_id);

CREATE TABLE attempt_responses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id             UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE RESTRICT,
  question_version_id    UUID NOT NULL REFERENCES question_versions(id) ON DELETE RESTRICT,
  selected_option_id      UUID REFERENCES question_options(id) ON DELETE SET NULL,
  likert_value             SMALLINT,
  is_marked_for_review     BOOLEAN NOT NULL DEFAULT false,
  is_correct                BOOLEAN,
  marks_obtained            NUMERIC(6,2),
  time_spent_seconds        INTEGER,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_version_id)
);
CREATE TRIGGER trg_attempt_responses_updated_at BEFORE UPDATE ON attempt_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_attempt_responses_attempt ON attempt_responses(attempt_id);
CREATE INDEX idx_attempt_responses_question_version ON attempt_responses(question_version_id);

CREATE TABLE coding_submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_response_id   UUID NOT NULL REFERENCES attempt_responses(id) ON DELETE RESTRICT,
  language               TEXT NOT NULL,
  source_code             TEXT NOT NULL,
  test_cases_passed       INTEGER NOT NULL DEFAULT 0,
  test_cases_total        INTEGER NOT NULL DEFAULT 0,
  compile_error            TEXT,
  runtime_error             TEXT,
  execution_output          JSONB,
  submitted_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coding_submissions_response ON coding_submissions(attempt_response_id);

CREATE TABLE proctoring_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE RESTRICT,
  event_type      proctoring_event_type_enum NOT NULL,
  event_meta      JSONB,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proctoring_events_attempt ON proctoring_events(attempt_id);
CREATE INDEX idx_proctoring_events_type ON proctoring_events(event_type);

CREATE TABLE assessment_retake_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE RESTRICT,
  requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  reason          TEXT,
  status          retake_status_enum NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_retake_requests_attempt ON assessment_retake_requests(attempt_id);
CREATE INDEX idx_retake_requests_status ON assessment_retake_requests(status);

-- ============================================================================
-- SECTION 9: FEATURE FLAGS / UI MANAGEMENT
-- ============================================================================

CREATE TABLE feature_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  description     TEXT,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  scope           feature_flag_scope_enum NOT NULL DEFAULT 'global',
  college_id      UUID REFERENCES colleges(id) ON DELETE CASCADE,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_feature_flags_updated_at BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- One global row per key, or one row per (key, college) when scoped:
CREATE UNIQUE INDEX idx_feature_flags_global_key
  ON feature_flags(key) WHERE scope = 'global';
CREATE UNIQUE INDEX idx_feature_flags_college_key
  ON feature_flags(key, college_id) WHERE scope = 'college';

CREATE TABLE module_toggles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module          module_name_enum NOT NULL,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  college_id      UUID REFERENCES colleges(id) ON DELETE CASCADE,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_module_toggles_updated_at BEFORE UPDATE ON module_toggles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE UNIQUE INDEX idx_module_toggles_global
  ON module_toggles(module) WHERE college_id IS NULL;
CREATE UNIQUE INDEX idx_module_toggles_college
  ON module_toggles(module, college_id) WHERE college_id IS NOT NULL;

-- ============================================================================
-- SECTION 10: SETTINGS MODULE
-- ============================================================================

CREATE TABLE system_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  value           JSONB NOT NULL,
  value_type      setting_value_type_enum NOT NULL DEFAULT 'string',
  category        setting_category_enum NOT NULL DEFAULT 'general',
  is_secret       BOOLEAN NOT NULL DEFAULT false,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_system_settings_category ON system_settings(category);

-- ============================================================================
-- SECTION 11: AUDIT LOG (cross-cutting)
-- ============================================================================

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- SECTION 12: SEED DATA — system roles & core permissions
-- ============================================================================

INSERT INTO roles (name, slug, is_system_role, description) VALUES
  ('Super Admin', 'super_admin', true, 'Full platform access, not tied to any single college'),
  ('Faculty', 'faculty', true, 'Trainer/faculty role scoped to a college'),
  ('Student', 'student', true, 'Student role scoped to a college');

INSERT INTO permissions (key, module, description) VALUES
  ('users.view', 'users', 'View users'),
  ('users.create', 'users', 'Create users'),
  ('users.edit', 'users', 'Edit users'),
  ('users.delete', 'users', 'Delete/archive users'),
  ('colleges.manage', 'colleges', 'Manage college records'),
  ('batches.manage', 'batches', 'Manage batches'),
  ('training_programs.manage', 'training_programs', 'Manage training programs'),
  ('training_sessions.manage', 'training_sessions', 'Manage training sessions'),
  ('questions.manage', 'questions', 'Manage own/college question bank'),
  ('questions.manage_global', 'questions', 'Manage global question bank'),
  ('questions.approve', 'questions', 'Approve/reject submitted questions'),
  ('assessments.create', 'assessments', 'Create assessments'),
  ('assessments.publish', 'assessments', 'Publish/schedule assessments'),
  ('assessments.approve', 'assessments', 'Approve assessments before publishing'),
  ('attempts.reassign', 'attempts', 'Reassign/retake an attempt'),
  ('analytics.view', 'analytics', 'View analytics and reports'),
  ('ui_control.manage', 'settings', 'Manage feature flags and module toggles'),
  ('settings.manage', 'settings', 'Manage system settings');

-- Grant Super Admin all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.slug = 'super_admin';

-- Grant Faculty a practical subset
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'faculty'
  AND p.key IN (
    'users.view', 'batches.manage', 'training_sessions.manage',
    'questions.manage', 'assessments.create', 'assessments.publish',
    'attempts.reassign', 'analytics.view'
  );

-- Seed default module toggles (all enabled globally by default)
INSERT INTO module_toggles (module, is_enabled, college_id)
SELECT m, true, NULL
FROM unnest(enum_range(NULL::module_name_enum)) AS m;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
