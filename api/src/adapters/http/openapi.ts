import {
  CreateTransactionPublicSchema,
  ErrorBodySchema,
  ListPublicTransactionsQuerySchema,
  ListTerminalsQuerySchema,
  SalesQuerySchema,
  SalesResponseSchema,
  SummaryQuerySchema,
  SummaryResponseSchema,
  TerminalPageSchema,
  TerminalSchema,
  TransactionCursorPageSchema,
  TransactionDetailSchema,
  TransactionSchema,
} from '@pippos/shared';
import { z } from 'zod';

// Documento OpenAPI 3.1 de la API pública. Cada esquema sale de z.toJSONSchema sobre los esquemas de shared: nada a mano.
type Objeto = Record<string, unknown>;

const JSON_TYPE = 'application/json';
const RUTA_BASE = '/public/v1';

function esquemaJson(esquema: z.ZodType, io: 'input' | 'output' = 'output'): Objeto {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(esquema, { io }) as Objeto;
  return resto;
}

// Los parámetros de consulta son las propiedades del esquema de entrada.
function parametrosDeConsulta(esquema: z.ZodType): Objeto[] {
  const json = esquemaJson(esquema, 'input') as { properties?: Record<string, Objeto>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([nombre, schema]) => ({
    name: nombre,
    in: 'query',
    required: json.required?.includes(nombre) ?? false,
    schema,
  }));
}

const parametroDeRuta = (nombre: string): Objeto => ({ name: nombre, in: 'path', required: true, schema: { type: 'string' } });

function respuesta(descripcion: string, esquema: z.ZodType): Objeto {
  return { description: descripcion, content: { [JSON_TYPE]: { schema: esquemaJson(esquema) } } };
}

const DESCRIPCION_ERROR: Record<number, string> = {
  400: 'VALIDATION_ERROR: parámetros o cuerpo inválidos',
  401: 'UNAUTHENTICATED: llave ausente, mal formada, desconocida, revocada o de un creador desactivado',
  403: 'FORBIDDEN: el alcance de la llave no permite esta operación',
  404: 'NOT_FOUND: no existe en el comercio',
  409: 'CONFLICT: la misma Idempotency-Key con otro cuerpo',
  429: 'RATE_LIMITED: límite de peticiones por minuto de la llave (Retry-After)',
};

function errores(codigos: number[]): Objeto {
  return Object.fromEntries(
    codigos.map((codigo) => [String(codigo), respuesta(DESCRIPCION_ERROR[codigo] ?? String(codigo), ErrorBodySchema)]),
  );
}

interface Operacion {
  resumen: string;
  parametros?: Objeto[];
  cuerpo?: Objeto;
  respuestas: Objeto;
  errores: number[];
}

function operacion(def: Operacion): Objeto {
  return {
    summary: def.resumen,
    security: [{ bearer: [] }],
    ...(def.parametros && def.parametros.length > 0 ? { parameters: def.parametros } : {}),
    ...(def.cuerpo ? { requestBody: { required: true, content: { [JSON_TYPE]: { schema: def.cuerpo } } } } : {}),
    responses: { ...def.respuestas, ...errores(def.errores) },
  };
}

const CABECERA_IDEMPOTENCIA: Objeto = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description: 'UUID que identifica el cobro: repetirlo con el mismo cuerpo devuelve la misma transacción.',
  schema: { type: 'string', format: 'uuid' },
};

function rutas(): Objeto {
  return {
    [`${RUTA_BASE}/terminals`]: {
      get: operacion({
        resumen: 'Terminales del comercio',
        parametros: parametrosDeConsulta(ListTerminalsQuerySchema),
        respuestas: { '200': respuesta('Página de terminales', TerminalPageSchema) },
        errores: [400, 401, 429],
      }),
    },
    [`${RUTA_BASE}/terminals/{id}`]: {
      get: operacion({
        resumen: 'Detalle de un terminal',
        parametros: [parametroDeRuta('id')],
        respuestas: { '200': respuesta('Terminal', TerminalSchema) },
        errores: [401, 404, 429],
      }),
    },
    [`${RUTA_BASE}/reports/summary`]: {
      get: operacion({
        resumen: 'KPIs del periodo, con comparación opcional',
        parametros: parametrosDeConsulta(SummaryQuerySchema),
        respuestas: { '200': respuesta('Resumen', SummaryResponseSchema) },
        errores: [400, 401, 429],
      }),
    },
    [`${RUTA_BASE}/reports/sales`]: {
      get: operacion({
        resumen: 'Ventas agrupadas por día, hora, terminal, cajero, método o marca',
        parametros: parametrosDeConsulta(SalesQuerySchema),
        respuestas: { '200': respuesta('Ventas agrupadas', SalesResponseSchema) },
        errores: [400, 401, 429],
      }),
    },
    [`${RUTA_BASE}/transactions`]: {
      get: operacion({
        resumen: 'Transacciones más recientes primero, por cursor',
        parametros: parametrosDeConsulta(ListPublicTransactionsQuerySchema),
        respuestas: { '200': respuesta('Página de transacciones', TransactionCursorPageSchema) },
        errores: [400, 401, 429],
      }),
      post: operacion({
        resumen: 'Cobrar (requiere alcance write)',
        parametros: [CABECERA_IDEMPOTENCIA],
        cuerpo: esquemaJson(CreateTransactionPublicSchema),
        respuestas: {
          '201': respuesta('Cobro registrado (aprobado, rechazado o timeout)', TransactionSchema),
          '200': respuesta('Repetición de la misma Idempotency-Key y mismo cuerpo: la transacción original', TransactionSchema),
        },
        errores: [400, 401, 403, 409, 429],
      }),
    },
    [`${RUTA_BASE}/transactions/{id}`]: {
      get: operacion({
        resumen: 'Detalle de una transacción con sus eventos',
        parametros: [parametroDeRuta('id')],
        respuestas: { '200': respuesta('Transacción', TransactionDetailSchema) },
        errores: [401, 404, 429],
      }),
    },
  };
}

export function construirOpenApi(): Objeto {
  return {
    openapi: '3.1.0',
    info: {
      title: 'PipPOS · API pública',
      version: '1.0.0',
      description: 'Terminales, reportes, transacciones y cobros del comercio. Autenticación con llave Bearer.',
    },
    paths: rutas(),
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'Llave «pip_…» creada en /api/v1/api-keys' },
      },
    },
  };
}
