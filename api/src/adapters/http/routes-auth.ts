import { ChangePasswordSchema, LoginRequestSchema, PreferencesSchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../application/errors';
import type { ChangePassword } from '../../application/change-password';
import type { GetSession } from '../../application/get-session';
import type { Login } from '../../application/login';
import type { Logout } from '../../application/logout';
import type { UpdatePreferences } from '../../application/update-preferences';
import { SESSION_TTL_MS } from '../../domain/session';
import { limiteDeLogin } from './security';

export const SESSION_COOKIE = 'pippos_session';

const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'strict', path: '/' } as const;

export interface AuthUseCases {
  login: Login;
  logout: Logout;
  getSession: GetSession;
  updatePreferences: UpdatePreferences;
  changePassword: ChangePassword;
}

// Las rutas solo validan el cuerpo y llaman al caso de uso; no hay reglas de negocio aquí.
export function registerAuthRoutes(app: FastifyInstance, casos: AuthUseCases, loginRateMax?: number): void {
  app.post('/api/v1/auth/login', { config: { rateLimit: limiteDeLogin(loginRateMax) } }, async (request, reply) => {
    const body = LoginRequestSchema.safeParse(request.body);
    if (!body.success) throw new AppError('VALIDATION_ERROR');
    const { token, user } = await casos.login.execute(body.data);
    reply.setCookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_TTL_MS / 1000 });
    return user;
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    await casos.logout.execute(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    return reply.type('application/json').code(204).send();
  });

  app.get('/api/v1/me', async (request) => casos.getSession.execute(request.cookies[SESSION_COOKIE]));

  app.put('/api/v1/me/preferences', async (request) => {
    const body = PreferencesSchema.safeParse(request.body);
    if (!body.success) throw new AppError('VALIDATION_ERROR');
    return casos.updatePreferences.execute(request.cookies[SESSION_COOKIE], body.data);
  });

  // Cambiar la clave borra todas las sesiones del usuario: la cookie de esta petición también caduca.
  app.post('/api/v1/me/password', async (request, reply) => {
    const body = ChangePasswordSchema.safeParse(request.body);
    if (!body.success) throw new AppError('VALIDATION_ERROR');
    await casos.changePassword.execute(request.cookies[SESSION_COOKIE], body.data);
    reply.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    return reply.code(204).send();
  });
}
