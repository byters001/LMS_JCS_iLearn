-- Custom SQL migration file, put your code below! --

-- Data-correction migration (not a schema change) — same --custom
-- drizzle-kit generate mechanism as 0003/0009/0016/0023/0025's permission
-- grants, applied and tracked by `drizzle-kit migrate` identically to a
-- generated migration, not a hand-run ad hoc script. This codebase's own
-- db/schema/question-bank.schema.ts already documents the intended
-- convention directly on the column: "Array of JUDGE0_LANGUAGE_ID keys
-- (e.g. 'PYTHON3', 'JAVA')" — confirmed against the real
-- integrations/judge0/judge0.constants.ts constant (C, CPP, JAVA,
-- JAVASCRIPT, PYTHON3) before writing this, not assumed.
--
-- Root cause (full diagnosis in the coding-submission-bug investigation):
-- 40 of 45 coding_question_details rows were seeded with a lowercase
-- ("python", "java", "cpp", "javascript") supported_languages convention
-- that has never matched codingLanguageSchema's actual enum
-- (question-bank.schema.ts) — a mismatch the current create/update Zod
-- schemas (already correctly using codingLanguageSchema on both
-- supportedLanguages fields, confirmed by reading them directly) would
-- reject today, meaning these 40 rows were written through some channel
-- outside the validated API (no seed script for this data exists anywhere
-- in this repo, confirmed by a repo-wide grep). The frontend's language
-- picker (CodingQuestion.tsx) takes this column's values verbatim with no
-- mapping, so any question stuck with the lowercase convention is
-- unsubmittable — every submit-code request 400s at attempts.routes.ts's
-- Zod validation, before Judge0 is ever contacted.
--
-- Confirmed via direct query before writing this: all 40 affected rows
-- share the EXACT SAME value, ["python","java","cpp","javascript"], in
-- that exact order — no other lowercase pattern, no partial/mixed rows,
-- no unmapped values. The WHERE clause below is an exact JSONB equality
-- match on that one known-bad value, so it only ever touches those 40
-- rows (the 5 already-correct rows, e.g. ["PYTHON3"] or
-- ["PYTHON3","JAVASCRIPT"], never match it) and is naturally idempotent —
-- once applied, no row matches the WHERE clause anymore, so a re-run
-- updates zero rows rather than double-mutating anything.
UPDATE coding_question_details
SET supported_languages = '["PYTHON3", "JAVA", "CPP", "JAVASCRIPT"]'::jsonb
WHERE supported_languages = '["python", "java", "cpp", "javascript"]'::jsonb;
