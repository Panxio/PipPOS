import type { AlertType, TerminalConnection, TerminalStatus } from '@pippos/shared';

// Reglas puras de alertas. Sin E/S: el reloj y los identificadores llegan desde fuera.

export interface Umbrales {
  batteryBelowPct: number;
  voidAtLeastAmount: bigint;
}

export const UMBRALES_POR_DEFECTO: Umbrales = { batteryBelowPct: 20, voidAtLeastAmount: 100000n };

export interface TerminalEvaluable {
  id: string;
  alias: string;
  status: TerminalStatus;
  connection: TerminalConnection;
  batteryPct: number;
}

export type ParamsAlerta = Record<string, string | number>;

export interface AlertaCandidata {
  type: AlertType;
  dedupeKey: string;
  params: ParamsAlerta;
}

export interface PlanAlertas {
  crear: AlertaCandidata[];
  resolver: string[];
}

const CLAVES_DE_TERMINAL = ['offline:', 'battery:'] as const;

// Un terminal inactivo no alerta. Fuera de línea y batería bajo el umbral (estricto) son condiciones independientes.
export function condicionesDeTerminal(terminal: TerminalEvaluable, umbrales: Umbrales): AlertaCandidata[] {
  if (terminal.status !== 'active') return [];
  const condiciones: AlertaCandidata[] = [];
  if (terminal.connection === 'offline') {
    condiciones.push({
      type: 'terminal_offline',
      dedupeKey: `offline:${terminal.id}`,
      params: { terminalId: terminal.id, alias: terminal.alias },
    });
  }
  if (terminal.batteryPct < umbrales.batteryBelowPct) {
    condiciones.push({
      type: 'battery_low',
      dedupeKey: `battery:${terminal.id}`,
      params: { terminalId: terminal.id, alias: terminal.alias, batteryPct: terminal.batteryPct },
    });
  }
  return condiciones;
}

// «Mayor o igual» (A3): un importe igual al umbral ya alerta.
export function anulacionSobreUmbral(amount: bigint, umbral: bigint): boolean {
  return amount >= umbral;
}

// Una anulación que cumple el umbral genera su alerta; las de anulación nunca se resuelven.
export function alertaDeAnulacion(
  anulacion: { id: string; folio: number; amount: bigint },
  umbrales: Umbrales,
): AlertaCandidata | null {
  if (!anulacionSobreUmbral(anulacion.amount, umbrales.voidAtLeastAmount)) return null;
  return {
    type: 'void_over_threshold',
    dedupeKey: `void:${anulacion.id}`,
    params: { transactionId: anulacion.id, folio: anulacion.folio, amount: anulacion.amount.toString() },
  };
}

function esClaveDeTerminal(clave: string): boolean {
  return CLAVES_DE_TERMINAL.some((prefijo) => clave.startsWith(prefijo));
}

// Crea lo que se cumple y no está abierto; resuelve las abiertas de terminal que ya no se cumplen
// (o cuyo terminal ya no existe). Las de anulación no entran nunca en `resolver`.
export function planificarAlertas(
  terminales: readonly TerminalEvaluable[],
  abiertas: readonly { dedupeKey: string }[],
  umbrales: Umbrales,
): PlanAlertas {
  const yaAbiertas = new Set(abiertas.map((alerta) => alerta.dedupeKey));
  const candidatas = terminales.flatMap((terminal) => condicionesDeTerminal(terminal, umbrales));
  const vigentes = new Set(candidatas.map((candidata) => candidata.dedupeKey));
  return {
    crear: candidatas.filter((candidata) => !yaAbiertas.has(candidata.dedupeKey)),
    resolver: abiertas.map((alerta) => alerta.dedupeKey).filter((clave) => esClaveDeTerminal(clave) && !vigentes.has(clave)),
  };
}
