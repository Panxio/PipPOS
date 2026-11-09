import type { ReportKpis, SalesItem, SalesQuery, SalesResponse, SummaryQuery, SummaryResponse } from '@pippos/shared';
import { puedeLeerReportes } from '../domain/access';
import { type ItemAgrupado, type Kpis, aCsv, agruparPor, kpis, periodoAnterior } from '../domain/reporte';
import type { Acceso, SessionDeps } from './get-session';
import type { ReportRepository } from './ports';
import { usuarioQue } from './terminal-deps';

export interface ReportDeps extends SessionDeps {
  reports: ReportRepository;
}

// Importes como texto decimal; conteos y puntos base como número (R4).
function aKpis(k: Kpis): ReportKpis {
  return {
    totalNet: k.totalNet.toString(),
    sales: k.sales,
    avgTicket: k.avgTicket.toString(),
    attempts: k.attempts,
    approvalBp: k.approvalBp,
    voidedCount: k.voidedCount,
    voidedAmount: k.voidedAmount.toString(),
  };
}

function aItem(item: ItemAgrupado): SalesItem {
  return { key: item.key, label: item.label, sales: item.sales, totalNet: item.totalNet.toString() };
}

// Los tres casos de uso comparten el mismo acceso: sesión, permiso de lectura y filas del comercio de la sesión.
class ReporteBase {
  protected readonly deps: ReportDeps;

  constructor(deps: ReportDeps) {
    this.deps = deps;
  }

  protected async kpisDelRango(merchantId: string, from: number, to: number): Promise<Kpis> {
    const { filas } = await this.deps.reports.salesRows(merchantId, from, to);
    return kpis(filas);
  }

  protected async agrupado(merchantId: string, consulta: SalesQuery): Promise<ItemAgrupado[]> {
    const { filas, nombres } = await this.deps.reports.salesRows(merchantId, consulta.from, consulta.to);
    return agruparPor(filas, consulta.groupBy, consulta.tzOffsetMin, { from: consulta.from, to: consulta.to }, nombres);
  }
}

export class SummaryReport extends ReporteBase {
  async execute(acceso: Acceso, consulta: SummaryQuery): Promise<SummaryResponse> {
    const usuario = await usuarioQue(this.deps, acceso, puedeLeerReportes);
    const { from, to } = consulta;
    const respuesta: SummaryResponse = {
      range: { from, to },
      kpis: aKpis(await this.kpisDelRango(usuario.merchantId, from, to)),
    };
    if (!consulta.compare) return respuesta;
    const anterior = periodoAnterior(from, to);
    return {
      ...respuesta,
      previous: { range: anterior, kpis: aKpis(await this.kpisDelRango(usuario.merchantId, anterior.from, anterior.to)) },
    };
  }
}

export class SalesReport extends ReporteBase {
  async execute(acceso: Acceso, consulta: SalesQuery): Promise<SalesResponse> {
    const usuario = await usuarioQue(this.deps, acceso, puedeLeerReportes);
    const items = await this.agrupado(usuario.merchantId, consulta);
    return { groupBy: consulta.groupBy, items: items.map(aItem) };
  }
}

// El CSV es del agrupado (L1 e): mismos datos que /sales, en texto.
export class SalesCsvReport extends ReporteBase {
  async execute(token: string | undefined, consulta: SalesQuery): Promise<string> {
    const usuario = await usuarioQue(this.deps, token, puedeLeerReportes);
    return aCsv(await this.agrupado(usuario.merchantId, consulta));
  }
}
