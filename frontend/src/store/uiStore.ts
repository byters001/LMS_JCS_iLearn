// Zustand store for UI preference (theme), distinct from authStore's
// session/auth state (CLAUDE1.md: "store/ holds only session/UI state that
// isn't server data"). Unlike the access token, a light/dark preference is
// exactly the kind of per-device UI state localStorage is for — it isn't a
// credential, so persist middleware (not in-memory-only) is the right tool
// here, the same way a browser remembers OS-level color-scheme prefs.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

interface UIState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
    }),
    { name: 'jcs-ui-preferences' },
  ),
)
