import { AlertSettingsSchema, ListAlertsQuerySchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import type { GetAlertSettings, ListAlerts, MarkAlertRead, MarkAllAlertsRead, UpdateAlertSettings } from '../../application/alerts';
import { AppError } from '../../application/errors';
import { SESSION_COOKIE } from './routes-auth';

const BASE = '/api/v1/alerts';
const AJUSTES = '/api/v1/alert-settings';

export interface AlertUseCases {
  list: ListAlerts;
  markRead: MarkAlertRead;
  markAllRead: MarkAllAlertsRead;
  getSettings: GetAlertSettings;
  updateSettings: UpdateAlertSettings;
}

// Las rutas validan la forma de la petición y llaman al caso de uso; el permiso y el comercio se deciden allí.
export function registerAlertRoutes(app: FastifyInstance, casos: AlertUseCases): void {
  app.get(AJUSTES, async (request) => casos.getSettings.execute(request.cookies[SESSION_COOKIE]));

  app.put(AJUSTES, async (request) => {
    const cuerpo = AlertSettingsSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    return casos.updateSettings.execute(request.cookies[SESSION_COOKIE], cuerpo.data);
  });

  app.get(BASE, async (request) => {
    const consulta = ListAlertsQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.list.execute(request.cookies[SESSION_COOKIE], consulta.data);
  });

  app.post(`${BASE}/read-all`, async (request) => casos.markAllRead.execute(request.cookies[SESSION_COOKIE]));

  app.post<{ Params: { id: string } }>(`${BASE}/:id/read`, async (request) =>
    casos.markRead.execute(request.cookies[SESSION_COOKIE], request.params.id),
  );
}
