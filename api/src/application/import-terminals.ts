import type { ImportResult } from '@pippos/shared';
import { puedeEscribirTerminales } from '../domain/access';
import { crearTerminal } from '../domain/terminal';
import { planificarImportacion } from '../domain/terminal-import';
import { filasDeImportacion } from '../domain/terminal-csv';
import { AppError } from './errors';
import { type TerminalDeps, usuarioQue } from './terminal-deps';

export class ImportTerminals {
  private readonly deps: TerminalDeps;

  constructor(deps: TerminalDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, csv: string): Promise<ImportResult> {
    const usuario = await usuarioQue(this.deps, token, puedeEscribirTerminales);
    const filas = filasDeImportacion(csv);
    if (filas === null) throw new AppError('VALIDATION_ERROR');
    const existentes = await this.deps.terminals.listByMerchant(usuario.merchantId);
    const plan = planificarImportacion(filas, new Set(existentes.map((t) => t.serial)));
    const nuevas = plan.crear.map((campos) =>
      crearTerminal(campos, { id: this.deps.ids.id(), createdAt: this.deps.clock.nowMs() }),
    );
    await this.deps.terminals.insertMany(usuario.merchantId, nuevas);
    // Una importación sin filas nuevas no cambia nada: no deja entrada.
    if (nuevas.length > 0) {
      await this.deps.audit.record({
        merchantId: usuario.merchantId,
        atMs: this.deps.clock.nowMs(),
        actorId: usuario.id,
        actorName: usuario.name,
        action: 'terminal.imported',
        entityType: 'terminal',
        entityId: null,
        detail: { count: String(nuevas.length) },
      });
    }
    return { created: nuevas.length, invalid: plan.invalidas };
  }
}
