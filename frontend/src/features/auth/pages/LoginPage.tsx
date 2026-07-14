import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { getRoleHomePath } from '@/routes/roles'
import { useLogin } from '../api'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-gradient-from to-brand-gradient-to px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 shadow-xl">
        <div className="mb-1 h-1 w-10 rounded-full bg-brand-accent" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-brand-primary">
          JCS iLearn
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-brand-primary">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
              {...register('email')}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-brand-primary">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          {login.isError && (
            <p className="text-sm text-destructive">
              {login.error instanceof ApiError
                ? login.error.message
                : 'Login failed. Please try again.'}
            </p>
          )}

          <Button
            type="submit"
            disabled={login.isPending}
            className="w-full bg-brand-accent text-white hover:bg-brand-accent/90"
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
