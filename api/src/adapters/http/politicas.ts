import type { Role } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../application/errors';
import { resolveSessionUser, type SessionDeps } from '../../application/get-session';
import {
  puedeAnularODevolver, puedeCambiarUmbrales, puedeEscribirSucursales, puedeEscribirTerminales,
  puedeGestionarLlaves, puedeAdministrarUsuarios, puedeLeerReportes,
} from '../../domain/access';
import { SESSION_COOKIE } from './routes-auth';

type Permiso = (rol: Role) => boolean;
const cualquierRol: Permiso = () => true;

// Las rutas que validan cuerpo o consulta comprueban sesión y rol ANTES: 401/403 antes que 400.
// Los casos de uso repiten la comprobación (defensa en profundidad); las reglas salen de domain/access.ts.
const POLITICAS: Readonly<Record<string, Permiso>> = {
  'PUT /api/v1/me/preferences': cualquierRol,
  'POST /api/v1/me/password': cualquierRol,
  'POST /api/v1/terminals': puedeEscribirTerminales,
  'POST /api/v1/terminals/import': puedeEscribirTerminales,
  'PATCH /api/v1/terminals/:id': puedeEscribirTerminales,
  'POST /api/v1/transactions': cualquierRol,
  'POST /api/v1/transactions/:id/refund': puedeAnularODevolver,
  'GET /api/v1/reports/summary': puedeLeerReportes,
  'GET /api/v1/reports/sales': puedeLeerReportes,
  'GET /api/v1/reports/sales.csv': puedeLeerReportes,
  'PUT /api/v1/alert-settings': puedeCambiarUmbrales,
  'POST /api/v1/branches': puedeEscribirSucursales,
  'POST /api/v1/branches/:id/tills': puedeEscribirSucursales,
  'POST /api/v1/users': puedeAdministrarUsuarios,
  'PATCH /api/v1/users/:id': puedeAdministrarUsuarios,
  'POST /api/v1/api-keys': puedeGestionarLlaves,
};

export function registrarPoliticas(app: FastifyInstance, deps: SessionDeps): void {
  app.addHook('onRequest', async (request) => {
    const permiso = POLITICAS[`${request.method} ${request.routeOptions.url ?? ''}`];
    if (permiso === undefined) return;
    const usuario = await resolveSessionUser(deps, request.cookies[SESSION_COOKIE]);
    if (!permiso(usuario.role)) throw new AppError('FORBIDDEN');
  });
}
