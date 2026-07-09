import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.string().email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

// Refresh tokens travel via an httpOnly cookie (see auth.controller.ts),
// never in the request body — these schemas just pin down an empty body.
export const refreshSchema = z.object({}).strict();

export const logoutSchema = z.object({}).strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
