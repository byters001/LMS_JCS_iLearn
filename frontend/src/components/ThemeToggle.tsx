import { Moon, Sun } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'

// Mounted in every role Layout's header, next to NotificationBell/
// UserAvatarMenu. Toggles the `dark` class that AdminLayout/TrainerLayout/
// StudentLayout apply to their own `.app-shell` wrapper div (never on
// <html>/<body>) — see globals.css's `.app-shell.dark` comment for why: it
// keeps AttemptLayout (the exam screen, rendered outside any `.app-shell`
// wrapper) permanently on the untouched :root palette regardless of this
// toggle's state.
export function ThemeToggle() {
  const theme = useUIStore((state) => state.theme)
  const toggleTheme = useUIStore((state) => state.toggleTheme)
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
