// Validated environment config — the only place import.meta.env is read.
// Feature code imports `env` from here instead of touching
// import.meta.env directly (CLAUDE1.md non-negotiable #6).

interface EnvConfig {
  apiBaseUrl: string
}

function readEnv(): EnvConfig {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

  if (!apiBaseUrl) {
    throw new Error(
      'Missing required environment variable VITE_API_BASE_URL. ' +
        'Set it in frontend/.env, e.g. VITE_API_BASE_URL=http://localhost:3000/api/v1',
    )
  }

  return { apiBaseUrl }
}

export const env = readEnv()
