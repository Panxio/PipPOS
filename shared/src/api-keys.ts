import { z } from 'zod';

// Llaves de la API pública (B4). La llave en claro solo aparece en la respuesta de crear y rotar.
export const API_KEY_SCOPES = ['read', 'write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const CreateApiKeySchema = z
  .object({
    name: z.string().min(1).max(60),
    scope: z.enum(API_KEY_SCOPES),
  })
  .strict();
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

export const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(API_KEY_SCOPES),
  prefix: z.string(),
  createdAt: z.number().int(),
  revokedAt: z.number().int().nullable(),
  lastUsedAt: z.number().int().nullable(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const ApiKeyListSchema = z.object({ items: z.array(ApiKeySchema) });
export type ApiKeyList = z.infer<typeof ApiKeyListSchema>;

export const CreatedApiKeySchema = ApiKeySchema.omit({ revokedAt: true, lastUsedAt: true }).extend({
  key: z.string(),
});
export type CreatedApiKey = z.infer<typeof CreatedApiKeySchema>;
