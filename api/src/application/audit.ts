import type { AuditPage, ExportAuditQuery, ListAuditQuery } from '@pippos/shared';
import { puedeVerAuditoria } from '../domain/access';
import { auditoriaACsv } from '../domain/auditoria';
import type { Acceso, SessionDeps } from './get-session';
import type { AuditQuery, FiltroAuditoria } from './ports';
import { usuarioQue } from './terminal-deps';

export interface AuditReadDeps extends SessionDeps {
  query: AuditQuery;
}

// La exportación trae como mucho estas filas, las más recientes (A10).
export const TOPE_EXPORTACION_AUDITORIA = 5000;

function filtroDe(consulta: ExportAuditQuery): FiltroAuditoria {
  return {
    action: consulta.action,
    actorId: consulta.actorId,
    entityType: consulta.entityType,
    entityId: consulta.entityId,
    desdeMs: consulta.from,
    hastaMs: consulta.to,
  };
}

export class ListAudit {
  private readonly deps: AuditReadDeps;

  constructor(deps: AuditReadDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, consulta: ListAuditQuery): Promise<AuditPage> {
    const usuario = await usuarioQue(this.deps, acceso, puedeVerAuditoria);
    const { items, total } = await this.deps.query.list(usuario.merchantId, filtroDe(consulta), {
      page: consulta.page,
      pageSize: consulta.pageSize,
    });
    return { items, total, page: consulta.page, pageSize: consulta.pageSize };
  }
}

export class ExportAuditCsv {
  private readonly deps: AuditReadDeps;

  constructor(deps: AuditReadDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, consulta: ExportAuditQuery): Promise<string> {
    const usuario = await usuarioQue(this.deps, acceso, puedeVerAuditoria);
    const { items } = await this.deps.query.list(usuario.merchantId, filtroDe(consulta), {
      page: 1,
      pageSize: TOPE_EXPORTACION_AUDITORIA,
    });
    return auditoriaACsv(items);
  }
}
