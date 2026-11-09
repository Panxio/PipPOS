import { z } from 'zod';
import { ROLES } from './roles';

// Estado derivado en la API: `inactive` si está desactivado; si no, `invited` sin contraseña y `active` con ella.
export const USER_STATUSES = ['invited', 'active', 'inactive'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// Límites de nombre: el alta y las sucursales los validan con el mismo esquema.
const NOMBRE_USUARIO = z.string().trim().min(1).max(80);
const NOMBRE_SUCURSAL = z.string().trim().min(1).max(60);

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  branchId: z.string().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const TillSchema = z.object({ id: z.string(), name: z.string() });
export type Till = z.infer<typeof TillSchema>;

export const BranchSchema = z.object({
  id: z.string(),
  name: z.string(),
  tills: z.array(TillSchema),
});
export type Branch = z.infer<typeof BranchSchema>;

export const MailboxMessageSchema = z.object({
  id: z.string(),
  to: z.string(),
  kind: z.literal('invitation'),
  link: z.string(),
  createdAt: z.number().int(),
});
export type MailboxMessage = z.infer<typeof MailboxMessageSchema>;

export const CreateUserSchema = z
  .object({
    name: NOMBRE_USUARIO,
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(ROLES),
    branchId: z.string().nullable().optional(),
  })
  .strict();
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    status: z.enum(['active', 'inactive']).optional(),
    role: z.enum(ROLES).optional(),
    branchId: z.string().nullable().optional(),
  })
  .strict()
  .refine((cambios) => Object.keys(cambios).length > 0, { message: 'al menos un campo' });
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const CreateBranchSchema = z.object({ name: NOMBRE_SUCURSAL }).strict();
export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;

export const CreateTillSchema = z.object({ name: NOMBRE_SUCURSAL }).strict();
export type CreateTillInput = z.infer<typeof CreateTillSchema>;

// La política de la contraseña se valida en el dominio: aquí solo la forma.
export const AcceptInvitationSchema = z.object({ token: z.string().min(1), password: z.string() }).strict();
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>;

export const ChangePasswordSchema = z.object({ current: z.string(), next: z.string() }).strict();
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
