// Tests the refresh-retry interceptor in api/index.ts against a MockAdapter
// attached to the REAL axios instance (`api` IS `rawApi` at runtime — see
// index.ts's `export const api = rawApi as unknown as ApiClient` cast, so
// this cast back is exactly the same object, not a stand-in). MockAdapter
// only replaces the network transport (axios's `adapter`); every real
// interceptor registered via `.interceptors.request/response.use()` still
// runs, so this exercises the actual retry/dedupe logic, not a
// reimplementation of it.
import type { AxiosInstance } from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { api, ApiError } from './index'

const rawApi = api as unknown as AxiosInstance
const mock = new MockAdapter(rawApi)

function errorBody(code: string, message = 'Unauthorized') {
  return { success: false, error: { code, message } }
}

function successBody<T>(data: T) {
  return { success: true, data }
}

beforeEach(() => {
  mock.reset()
  useAuthStore.setState({
    accessToken: 'stale-token',
    isAuthenticated: true,
    user: null,
  })
})

afterEach(() => {
  mock.reset()
})

describe('refresh-retry interceptor', () => {
  it('401 -> refresh -> retry -> succeeds, and the retry carries the new token', async () => {
    mock.onGet('/protected').replyOnce(401, errorBody('UNAUTHORIZED'))
    mock.onGet('/protected').replyOnce(200, successBody({ ok: true }))
    mock.onPost('/auth/refresh').replyOnce(200, successBody({ accessToken: 'fresh-token' }))

    const result = await rawApi.get('/protected')

    expect(result).toEqual({ ok: true })
    expect(useAuthStore.getState().accessToken).toBe('fresh-token')
    expect(mock.history.get).toHaveLength(2)
    // Not asserting mock.history.get[0]'s header value here: the interceptor
    // retries by calling `rawApi(config)` on the SAME config object (see
    // index.ts), and axios-mock-adapter's history array stores a reference
    // to that config, not a snapshot — so by the time both requests have
    // resolved, history[0] and history[1] alias the same (now-mutated)
    // AxiosHeaders instance and both read back 'Bearer fresh-token'.
    // Confirmed empirically (asserting 'Bearer stale-token' on history[0]
    // fails here even though the FIRST real network call genuinely carried
    // the stale token — the mock just can't distinguish the two after the
    // fact). What's reliably observable is the request count and the final
    // token used, both asserted above/below.
    expect(mock.history.get[1].headers?.Authorization).toBe('Bearer fresh-token')
  })

  it('dedupes concurrent 401s into a single /auth/refresh call', async () => {
    mock.onGet('/a').replyOnce(401, errorBody('UNAUTHORIZED'))
    mock.onGet('/a').replyOnce(200, successBody('a-ok'))
    mock.onGet('/b').replyOnce(401, errorBody('UNAUTHORIZED'))
    mock.onGet('/b').replyOnce(200, successBody('b-ok'))

    let refreshCalls = 0
    mock.onPost('/auth/refresh').reply(() => {
      refreshCalls += 1
      return [200, successBody({ accessToken: 'fresh-token' })]
    })

    const [a, b] = await Promise.all([rawApi.get('/a'), rawApi.get('/b')])

    expect(a).toBe('a-ok')
    expect(b).toBe('b-ok')
    expect(refreshCalls).toBe(1)
  })

  // Regression test for the fixed retry-rejection gap: the retry used to be
  // issued as `return rawApi(config)` — NOT awaited — from inside the `try`
  // block that wraps `refreshAccessToken()`. A `return <promise>` that isn't
  // awaited hands the promise straight to the caller; if it rejects LATER,
  // that rejection never re-entered this function's own `catch`, because the
  // try block had already finished executing when the `return` statement
  // ran. So `catch` only ever fired for a failure of `refreshAccessToken()`
  // itself (see the next test) — not for "the refresh succeeded but the
  // retried request failed anyway." Now that the retry is awaited, its
  // rejection IS caught here, same as a refresh failure: clearAuth() fires
  // and the user is redirected to /login. No looping either way
  // (config._retry already true stops a second refresh attempt).
  it('clears auth and redirects when refresh succeeds but the retried request 401s again', async () => {
    const originalLocation = window.location
    // Plain-object stub, not jsdom's real Location: assigning `.href` on the
    // real one logs a jsdom "Not implemented: navigation" error, since jsdom
    // refuses to actually navigate. Restored in `finally` below so no other
    // test in this file (or run after it) sees the stubbed value.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: originalLocation.href },
    })

    try {
      mock.onGet('/protected').reply(401, errorBody('UNAUTHORIZED'))
      mock.onPost('/auth/refresh').replyOnce(200, successBody({ accessToken: 'still-bad-token' }))

      await expect(rawApi.get('/protected')).rejects.toBeInstanceOf(ApiError)

      expect(mock.history.get).toHaveLength(2)
      expect(mock.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(1)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().accessToken).toBeNull()
      expect(window.location.href).toBe('/login')
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    }
  })

  it('clears auth and stops retrying when the refresh call itself fails', async () => {
    mock.onGet('/protected').reply(401, errorBody('UNAUTHORIZED'))
    mock.onPost('/auth/refresh').reply(401, errorBody('UNAUTHORIZED', 'Invalid or expired refresh token'))

    await expect(rawApi.get('/protected')).rejects.toBeInstanceOf(ApiError)

    // Exactly one GET (no retry attempted — refreshAccessToken() itself
    // rejected, so `config.headers.set(...)` / `rawApi(config)` never run)
    // and exactly one refresh call (refreshPromise's `.finally()` clears
    // the in-flight guard so this doesn't loop either).
    expect(mock.history.get).toHaveLength(1)
    expect(mock.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(1)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('does not attempt a refresh for a 401 on an auth endpoint itself', async () => {
    mock.onPost('/auth/login').reply(401, errorBody('UNAUTHORIZED', 'Invalid email or password'))

    await expect(rawApi.post('/auth/login', { email: 'x', password: 'y' })).rejects.toMatchObject({
      message: 'Invalid email or password',
    })

    expect(mock.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(0)
  })

  it('does not retry a non-401 error', async () => {
    mock.onGet('/broken').reply(500, errorBody('INTERNAL_ERROR', 'Something broke'))

    await expect(rawApi.get('/broken')).rejects.toMatchObject({ message: 'Something broke' })

    expect(mock.history.get).toHaveLength(1)
    expect(mock.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(0)
  })
})
