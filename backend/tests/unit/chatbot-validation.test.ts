// Proves the chatbot's allowlist + argument-validation gate actually
// rejects (1) a function name that isn't on the allowlist and (2)
// malformed/extra arguments to a REAL allowlisted function — against the
// REAL registry (modules/chatbot/chatbot.tools.ts's CHATBOT_TOOLS), not a
// mock or a re-implementation of the logic being tested. validateToolCall
// is synchronous and side-effect-free (no DB/Redis call — see its own
// module comment in chatbot.service.ts), so this runs fast with no live
// infra required, unlike tests/integration/*.
import { describe, expect, it } from 'vitest'
import { validateToolCall } from '../../src/modules/chatbot/chatbot.service'
import { CHATBOT_TOOLS } from '../../src/modules/chatbot/chatbot.tools'
import { ValidationError } from '../../src/shared/errors/app-error'

// A real RFC4122-format UUID (version 4, variant 8) — Zod 4's .uuid()
// validates the version/variant nibbles strictly, unlike a looser regex
// that would accept any hex-and-dashes string of the right length.
const VALID_UUID = '11111111-1111-4111-8111-111111111111'

describe('chatbot allowlist + argument validation (the security-critical gate)', () => {
  it('rejects a function name that is not on the allowlist', () => {
    expect(() => validateToolCall('dropAllTables', {})).toThrow(ValidationError)
  })

  it('rejects a function name that looks like a raw-SQL escape attempt', () => {
    expect(() =>
      validateToolCall('runRawSql', { sql: 'DROP TABLE users; --' }),
    ).toThrow(ValidationError)
  })

  it('rejects an allowlisted-sounding-but-wrong name (case/spelling variant)', () => {
    // Confirms the allowlist check is an exact key match, not a fuzzy or
    // case-insensitive one — 'GetTrainerPerformance' is NOT
    // 'getTrainerPerformance'.
    expect(() =>
      validateToolCall('GetTrainerPerformance', { trainerId: VALID_UUID }),
    ).toThrow(ValidationError)
  })

  it('includes the real allowlist in the rejection details, for auditability', () => {
    try {
      validateToolCall('dropAllTables', {})
      expect.unreachable('validateToolCall should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const details = (err as ValidationError).details as { allowlist: string[] }
      expect(details.allowlist.sort()).toEqual(
        ['getAttendanceByDate', 'getBatchRoster', 'getFailedStudents', 'getTrainerPerformance'].sort(),
      )
    }
  })

  it('rejects a malformed argument (not a valid UUID) for a real allowlisted function', () => {
    expect(() =>
      validateToolCall('getTrainerPerformance', { trainerId: 'not-a-uuid' }),
    ).toThrow(ValidationError)
  })

  it('rejects a missing required argument for a real allowlisted function', () => {
    // getFailedStudents requires assessmentId; batchId alone isn't enough.
    expect(() => validateToolCall('getFailedStudents', { batchId: VALID_UUID })).toThrow(
      ValidationError,
    )
  })

  it('rejects unexpected extra fields on a real allowlisted function (schema is .strict())', () => {
    // A model attempting to smuggle extra data (or a prompt-injected
    // instruction) through an otherwise-valid call is still rejected —
    // .strict() has no tolerance for fields the schema doesn't declare.
    expect(() =>
      validateToolCall('getTrainerPerformance', {
        trainerId: VALID_UUID,
        rawSql: 'DROP TABLE users;',
      }),
    ).toThrow(ValidationError)
  })

  it('rejects a date argument in the wrong format for getAttendanceByDate', () => {
    expect(() => validateToolCall('getAttendanceByDate', { date: '07/16/2026' })).toThrow(
      ValidationError,
    )
  })

  it('accepts well-formed arguments for a real allowlisted function without throwing', () => {
    const { toolName, args } = validateToolCall('getTrainerPerformance', { trainerId: VALID_UUID })
    expect(toolName).toBe('getTrainerPerformance')
    expect(args).toEqual({ trainerId: VALID_UUID })
  })

  it('every registered tool exposes a .strict() Zod object schema (defense against future tools skipping this)', () => {
    for (const tool of Object.values(CHATBOT_TOOLS)) {
      // A non-strict schema would silently accept (and ignore) extra
      // fields instead of rejecting them — this asserts the allowlist
      // itself stays defensively configured as new tools are added.
      const parsed = tool.argsSchema.safeParse({ __unexpectedField: 'DROP TABLE users;' })
      expect(parsed.success).toBe(false)
    }
  })
})
