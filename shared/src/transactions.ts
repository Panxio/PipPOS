import { z } from 'zod';

export const TRANSACTION_STATUSES = ['approved', 'declined', 'timeout', 'voided', 'partially_refunded', 'refunded'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = ['card', 'wallet'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CARD_BRANDS = ['visa', 'mastercard', 'amex'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export const TRANSACTION_EVENT_KINDS = ['created', 'voided', 'refunded'] as const;
export type TransactionEventKind = (typeof TRANSACTION_EVENT_KINDS)[number];

// Importes en unidad mínima como texto decimal: sin ceros a la izquierda, de 1 a 99 999 999.
export const IMPORTE = /^[1-9][0-9]{0,7}$/;
const IMPORTE_O_CERO = /^(0|[1-9][0-9]{0,7})$/;
const ULTIMOS_4 = /^[0-9]{4}$/;
export const MILISEGUNDOS = /^[0-9]{1,15}$/;

export const CreateTransactionSchema = z
  .object({
    requestId: z.uuid(),
    terminalId: z.string().min(1),
    amount: z.string().regex(IMPORTE),
    method: z.enum(PAYMENT_METHODS),
    brand: z.enum(CARD_BRANDS),
    last4: z.string().regex(ULTIMOS_4),
  })
  .strict();
export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

// API pública (B4): el mismo cobro sin requestId; la cabecera Idempotency-Key lo aporta.
export const CreateTransactionPublicSchema = CreateTransactionSchema.omit({ requestId: true });
export type CreateTransactionPublicInput = z.infer<typeof CreateTransactionPublicSchema>;

export const RefundTransactionSchema = z.object({ amount: z.string().regex(IMPORTE) }).strict();
export type RefundTransactionInput = z.infer<typeof RefundTransactionSchema>;

// Anular no admite campos: el cuerpo, si lo hay, debe ser un objeto vacío.
export const VoidTransactionSchema = z.object({}).strict();

export const ListTransactionsQuerySchema = z
  .object({
    status: z.enum(TRANSACTION_STATUSES).optional(),
    method: z.enum(PAYMENT_METHODS).optional(),
    brand: z.enum(CARD_BRANDS).optional(),
    terminalId: z.string().min(1).optional(),
    from: z.string().regex(MILISEGUNDOS).transform((valor) => Number(valor)).optional(),
    to: z.string().regex(MILISEGUNDOS).transform((valor) => Number(valor)).optional(),
    min: z.string().regex(IMPORTE).optional(),
    max: z.string().regex(IMPORTE).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;

// API pública (B4): los mismos filtros, paginación por cursor. Sin page ni pageSize.
const LIMITE_TEXTO = /^[0-9]{1,3}$/;
export const ListPublicTransactionsQuerySchema = z
  .object({
    status: z.enum(TRANSACTION_STATUSES).optional(),
    method: z.enum(PAYMENT_METHODS).optional(),
    brand: z.enum(CARD_BRANDS).optional(),
    terminalId: z.string().min(1).optional(),
    from: z.string().regex(MILISEGUNDOS).transform((valor) => Number(valor)).optional(),
    to: z.string().regex(MILISEGUNDOS).transform((valor) => Number(valor)).optional(),
    min: z.string().regex(IMPORTE).optional(),
    max: z.string().regex(IMPORTE).optional(),
    limit: z
      .string()
      .regex(LIMITE_TEXTO)
      .transform((valor) => Number(valor))
      .pipe(z.number().int().min(1).max(100))
      .default(20),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListPublicTransactionsQuery = z.infer<typeof ListPublicTransactionsQuerySchema>;

export const TransactionSchema = z.object({
  id: z.string(),
  folio: z.number().int(),
  terminalId: z.string(),
  cashierId: z.string(),
  amount: z.string(),
  refundedAmount: z.string(),
  method: z.enum(PAYMENT_METHODS),
  brand: z.enum(CARD_BRANDS),
  last4: z.string(),
  status: z.enum(TRANSACTION_STATUSES),
  responseCode: z.string().nullable(),
  authCode: z.string().nullable(),
  createdAt: z.number().int(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

// Sin total: nextCursor es null en la última página.
export const TransactionCursorPageSchema = z.object({
  items: z.array(TransactionSchema),
  nextCursor: z.string().nullable(),
});
export type TransactionCursorPage = z.infer<typeof TransactionCursorPageSchema>;

export const TransactionEventSchema = z.object({
  kind: z.enum(TRANSACTION_EVENT_KINDS),
  amount: z.string(),
  at: z.number().int(),
  byUserId: z.string(),
});
export type TransactionEvent = z.infer<typeof TransactionEventSchema>;

export const TransactionDetailSchema = TransactionSchema.extend({
  events: z.array(TransactionEventSchema),
});
export type TransactionDetail = z.infer<typeof TransactionDetailSchema>;

export const TransactionPageSchema = z.object({
  items: z.array(TransactionSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type TransactionPage = z.infer<typeof TransactionPageSchema>;

export const ReceiptSchema = z.object({
  folio: z.number().int(),
  merchantName: z.string(),
  terminalAlias: z.string(),
  amount: z.string(),
  refundedAmount: z.string(),
  method: z.enum(PAYMENT_METHODS),
  brand: z.enum(CARD_BRANDS),
  last4: z.string(),
  status: z.enum(TRANSACTION_STATUSES),
  authCode: z.string().nullable(),
  createdAt: z.number().int(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

// Solo para las rutas de prueba: una transacción ya resuelta, sin pasar por el switch.
export const InjectTransactionSchema = z
  .object({
    terminalId: z.string().min(1),
    cashierId: z.string().min(1),
    amount: z.string().regex(IMPORTE),
    method: z.enum(PAYMENT_METHODS),
    brand: z.enum(CARD_BRANDS),
    last4: z.string().regex(ULTIMOS_4),
    status: z.enum(TRANSACTION_STATUSES),
    createdAt: z.number().int().nonnegative(),
    refundedAmount: z.string().regex(IMPORTE_O_CERO).optional(),
  })
  .strict();
export type InjectTransactionInput = z.infer<typeof InjectTransactionSchema>;
