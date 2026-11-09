import type { Alert, AlertList, AlertSettings, ListAlertsQuery, TelemetryInput, Terminal } from '@pippos/shared';
import { puedeCambiarUmbrales, puedeVerAlertas } from '../domain/access';
import { UMBRALES_POR_DEFECTO, type Umbrales, alertaDeAnulacion, planificarAlertas } from '../domain/alerta';
import { AppError } from './errors';
import type { Acceso, SessionDeps } from './get-session';
import type { AlertRepository, AlertaRegistro, AuditLog, IdGenerator, TerminalRepository } from './ports';
import { usuarioQue } from './terminal-deps';

export interface AlertDeps extends SessionDeps {
  alerts: AlertRepository;
  terminals: TerminalRepository;
  audit: AuditLog;
  ids: IdGenerator;
}

function aAlerta(registro: AlertaRegistro): Alert {
  return {
    id: registro.id,
    type: registro.type,
    createdAt: registro.createdAtMs,
    resolvedAt: registro.resolvedAtMs,
    read: registro.read,
    params: registro.params,
  };
}

function aAjustes(umbrales: Umbrales): AlertSettings {
  return { batteryBelowPct: umbrales.batteryBelowPct, voidAtLeastAmount: umbrales.voidAtLeastAmount.toString() };
}

async function umbralesDelComercio(alerts: AlertRepository, merchantId: string): Promise<Umbrales> {
  return (await alerts.umbrales(merchantId)) ?? UMBRALES_POR_DEFECTO;
}

// Evaluación perezosa (A4): al consultar, se compara cada terminal activo con sus umbrales y se aplica el cambio.
async function evaluarTerminales(deps: AlertDeps, merchantId: string): Promise<void> {
  const terminales = await deps.terminals.listByMerchant(merchantId);
  const abiertas = await deps.alerts.abiertas(merchantId);
  const plan = planificarAlertas(terminales, abiertas, await umbralesDelComercio(deps.alerts, merchantId));
  const ahora = deps.clock.nowMs();
  if (plan.resolver.length > 0) await deps.alerts.resolver(merchantId, plan.resolver, ahora);
  if (plan.crear.length > 0) {
    await deps.alerts.insertarAbiertas(
      merchantId,
      plan.crear.map((candidata) => ({
        id: deps.ids.id(),
        type: candidata.type,
        dedupeKey: candidata.dedupeKey,
        params: candidata.params,
        createdAtMs: ahora,
      })),
    );
  }
}

// Llamada desde la anulación (A3): la alerta nace en la misma operación, con el umbral vigente en ese momento.
export async function alertarAnulacion(
  deps: Pick<AlertDeps, 'alerts' | 'ids'>,
  merchantId: string,
  anulacion: { id: string; folio: number; amount: bigint },
  ahora: number,
): Promise<void> {
  const candidata = alertaDeAnulacion(anulacion, await umbralesDelComercio(deps.alerts, merchantId));
  if (candidata === null) return;
  await deps.alerts.insertarAbiertas(merchantId, [
    { id: deps.ids.id(), type: candidata.type, dedupeKey: candidata.dedupeKey, params: candidata.params, createdAtMs: ahora },
  ]);
}

export class ListAlerts {
  private readonly deps: AlertDeps;

  constructor(deps: AlertDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, consulta: ListAlertsQuery): Promise<AlertList> {
    const usuario = await usuarioQue(this.deps, acceso, puedeVerAlertas);
    await evaluarTerminales(this.deps, usuario.merchantId);
    const registros = await this.deps.alerts.listar(usuario.merchantId, usuario.id, {
      soloNoLeidas: consulta.unread,
      limite: consulta.limit,
    });
    return {
      items: registros.map(aAlerta),
      unreadCount: await this.deps.alerts.contarNoLeidas(usuario.merchantId, usuario.id),
    };
  }
}

// Leída es por usuario: que la lea el admin no la lee el supervisor. Idempotente.
export class MarkAlertRead {
  private readonly deps: AlertDeps;

  constructor(deps: AlertDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, id: string): Promise<{ id: string; read: true }> {
    const usuario = await usuarioQue(this.deps, acceso, puedeVerAlertas);
    const marcada = await this.deps.alerts.marcarLeida(usuario.merchantId, usuario.id, id, this.deps.clock.nowMs());
    if (!marcada) throw new AppError('NOT_FOUND');
    return { id, read: true };
  }
}

export class MarkAllAlertsRead {
  private readonly deps: AlertDeps;

  constructor(deps: AlertDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso): Promise<{ marked: number }> {
    const usuario = await usuarioQue(this.deps, acceso, puedeVerAlertas);
    return { marked: await this.deps.alerts.marcarTodas(usuario.merchantId, usuario.id, this.deps.clock.nowMs()) };
  }
}

export class GetAlertSettings {
  private readonly deps: AlertDeps;

  constructor(deps: AlertDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso): Promise<AlertSettings> {
    const usuario = await usuarioQue(this.deps, acceso, puedeVerAlertas);
    return aAjustes(await umbralesDelComercio(this.deps.alerts, usuario.merchantId));
  }
}

export class UpdateAlertSettings {
  private readonly deps: AlertDeps;

  constructor(deps: AlertDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, cambio: AlertSettings): Promise<AlertSettings> {
    const usuario = await usuarioQue(this.deps, acceso, puedeCambiarUmbrales);
    const umbrales: Umbrales = {
      batteryBelowPct: cambio.batteryBelowPct,
      voidAtLeastAmount: BigInt(cambio.voidAtLeastAmount),
    };
    await this.deps.alerts.guardarUmbrales(usuario.merchantId, umbrales);
    await this.deps.audit.record({
      merchantId: usuario.merchantId,
      atMs: this.deps.clock.nowMs(),
      actorId: usuario.id,
      actorName: usuario.name,
      action: 'alert_settings.updated',
      entityType: 'alert_settings',
      entityId: usuario.merchantId,
      detail: { batteryBelowPct: String(cambio.batteryBelowPct), voidAtLeastAmount: cambio.voidAtLeastAmount },
    });
    return aAjustes(umbrales);
  }
}

// Costura de prueba (A11): fija conexión o batería de un terminal. Sin ella no hay telemetría real.
export class InjectTelemetry {
  private readonly deps: Pick<AlertDeps, 'terminals'>;

  constructor(deps: Pick<AlertDeps, 'terminals'>) {
    this.deps = deps;
  }

  async execute(terminalId: string, cambios: TelemetryInput): Promise<Terminal> {
    const actualizado = await this.deps.terminals.setTelemetry(terminalId, cambios);
    if (actualizado === null) throw new AppError('NOT_FOUND');
    return actualizado;
  }
}
