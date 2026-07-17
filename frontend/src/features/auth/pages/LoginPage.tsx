import { zodResolver } from '@hookform/resolvers/zod'
import {
  Code2,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getRoleHomePath } from '@/routes/roles'
import { useLogin } from '../api'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const capabilities = [
  { icon: Code2, label: 'Judge0-powered coding' },
  { icon: LayoutDashboard, label: 'Role-based dashboards' },
  { icon: ShieldCheck, label: 'Real-time proctoring' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: (data) => navigate(getRoleHomePath(data.user.roles), { replace: true }),
    })
  })

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-brand-gradient-from to-brand-gradient-to">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 animate-blob-drift rounded-full bg-brand-accent/50 blur-3xl" />
        <div
          className="absolute -right-24 top-1/4 h-80 w-80 animate-blob-drift rounded-full bg-brand-primary/60 blur-3xl"
          style={{ animationDelay: '3s' }}
        />
        <div
          className="absolute bottom-0 left-1/4 h-72 w-72 animate-blob-drift rounded-full bg-brand-accent/40 blur-3xl"
          style={{ animationDelay: '6s' }}
        />
        <div
          className="absolute -bottom-24 -right-16 h-64 w-64 animate-blob-drift rounded-full bg-brand-gradient-to/60 blur-3xl"
          style={{ animationDelay: '1.5s' }}
        />
      </div>

      <div className="relative flex min-h-screen w-full items-center justify-center px-4 py-12">
        <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-white/10 shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="h-[3px] w-full bg-gradient-to-r from-brand-accent to-brand-primary" />

          <div className="p-8 sm:p-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <span className="text-base font-semibold text-white">JCS iLearn</span>
            </div>

            <h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
              Sign in to JCS iLearn
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              The placement-training platform where students take MCQ, coding, and
              psychometric assessments under live proctoring, and faculty get instant
              grading with placement-readiness analytics the moment a test wraps up.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {capabilities.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur-md"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="text-xs font-semibold tracking-widest text-white/80 uppercase">
                Welcome back
              </p>

              <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-white/90">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/50" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      className="h-11 rounded-xl border-white/20 bg-white/10 pl-10 text-white placeholder:text-white/40 focus-visible:ring-brand-accent/50"
                      placeholder="you@example.com"
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-red-300">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-white/90">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/50" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="h-11 rounded-xl border-white/20 bg-white/10 pr-10 pl-10 text-white placeholder:text-white/40 focus-visible:ring-brand-accent/50"
                      placeholder="••••••••"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-white/50 hover:text-white/80"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-red-300">{errors.password.message}</p>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-white/70">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/30 bg-white/10 accent-brand-accent"
                    />
                    Remember me
                  </label>
                  <a href="#" className="text-white/70 hover:text-white">
                    Forgot password?
                  </a>
                </div>

                {login.isError && (
                  <p className="text-sm text-red-300">
                    {login.error instanceof ApiError
                      ? login.error.message
                      : 'Login failed. Please try again.'}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={login.isPending}
                  className="h-11 w-full rounded-xl bg-brand-accent text-white hover:bg-brand-accent/90"
                >
                  {login.isPending ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-white/50">
              © 2026 JCS iLearn · Secure assessment platform
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
