import { buildApp } from './adapters/http/app';
import { OffsetClock } from './adapters/offset-clock';
import { isDatabaseEmpty, openDb } from './adapters/persistence/sqlite';
import { ScryptHasher } from './adapters/scrypt-hasher';
import { UuidIds } from './adapters/uuid-ids';
import { seedDemo } from './seed/demo';
import { sembrarTransacciones } from './seed/transacciones';

// Raíz de composición real: solo aquí se eligen los adaptadores concretos.
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3100);
const DB_PATH = process.env.DB_PATH ?? './data/pippos.db';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173')
  .split(',')
  .map((origen) => origen.trim())
  .filter((origen) => origen !== '');

// Sin variable, queda el valor por defecto de la app; con variable debe ser un entero mayor que 0.
function leerLimite(nombre: string, valor: string | undefined): number | undefined {
  if (valor === undefined) return undefined;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${nombre} debe ser un entero mayor que 0`);
  return n;
}

async function main(): Promise<void> {
  const db = openDb(DB_PATH);
  const hasher = new ScryptHasher();
  // Un solo reloj: la app lo lee, las rutas de prueba lo adelantan y la semilla de demo lo usa para fechar.
  const reloj = new OffsetClock();
  const ids = new UuidIds();
  if (isDatabaseEmpty(db)) {
    await seedDemo(db, hasher);
    sembrarTransacciones(db, ids, reloj.nowMs());
  }
  const app = buildApp({
    db,
    clock: reloj,
    testClock: reloj,
    ids,
    hasher,
    config: {
      allowedOrigins: ALLOWED_ORIGINS,
      enableTestRoutes: process.env.ENABLE_TEST_ROUTES === '1',
      loginRateMax: leerLimite('LOGIN_RATE_MAX', process.env.LOGIN_RATE_MAX),
      publicRateMax: leerLimite('PUBLIC_RATE_MAX', process.env.PUBLIC_RATE_MAX),
    },
    logger: true,
  });
  await app.listen({ host: HOST, port: PORT });
}

main().catch((error: unknown) => {
  console.error('arranque fallido:', error instanceof Error ? error.message : 'error desconocido');
  process.exitCode = 1;
});
