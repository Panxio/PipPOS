import { z } from 'zod';
import type { Role, Section } from './roles';

export const LoginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(256),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PreferencesSchema = z
  .object({
    language: z.enum(['es', 'en']),
    theme: z.enum(['light', 'dark']),
  })
  .strict();
export type Preferences = z.infer<typeof PreferencesSchema>;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  merchantName: string;
  sections: Section[];
  preferences: Preferences;
};
