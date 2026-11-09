import type { Terminal } from '@pippos/shared';
import { puedeEscribirTerminales } from '../domain/access';
import { type CambiosTerminal, validarCambios } from '../domain/terminal';
import { AppError } from './errors';
import { type TerminalDeps, usuarioQue } from './terminal-deps';

export class UpdateTerminal {
  private readonly deps: TerminalDeps;

  constructor(deps: TerminalDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, id: string, cambios: CambiosTerminal): Promise<Terminal> {
    const usuario = await usuarioQue(this.deps, token, puedeEscribirTerminales);
    const validos = validarCambios(cambios);
    if (validos === null) throw new AppError('VALIDATION_ERROR');
    const previo = await this.deps.terminals.findById(usuario.merchantId, id);
    if (previo === null) throw new AppError('NOT_FOUND');
    const actualizado = await this.deps.terminals.update(usuario.merchantId, id, validos);
    if (actualizado === null) throw new AppError('NOT_FOUND');
    const detalle = detalleDeCambios(previo, validos);
    // Sin campos realmente cambiados no hay entrada (la operación no cambió nada).
    if (Object.keys(detalle).length > 0) {
      await this.deps.audit.record({
        merchantId: usuario.merchantId,
        atMs: this.deps.clock.nowMs(),
        actorId: usuario.id,
        actorName: usuario.name,
        action: 'terminal.updated',
        entityType: 'terminal',
        entityId: id,
        detail: detalle,
      });
    }
    return actualizado;
  }
}

// Solo los campos que de verdad cambian, como texto.
function detalleDeCambios(previo: Terminal, cambios: CambiosTerminal): Record<string, string> {
  const detalle: Record<string, string> = {};
  for (const clave of ['alias', 'branch', 'till', 'status'] as const) {
    const valor = cambios[clave];
    if (valor !== undefined && valor !== previo[clave]) detalle[clave] = valor;
  }
  return detalle;
}
