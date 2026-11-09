import type { Terminal } from '@pippos/shared';
import { puedeEscribirTerminales } from '../domain/access';
import { type CamposTerminal, crearTerminal, validarCampos } from '../domain/terminal';
import { AppError } from './errors';
import { type TerminalDeps, usuarioQue } from './terminal-deps';

export class CreateTerminal {
  private readonly deps: TerminalDeps;

  constructor(deps: TerminalDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, entrada: CamposTerminal): Promise<Terminal> {
    const usuario = await usuarioQue(this.deps, token, puedeEscribirTerminales);
    const valida = validarCampos(entrada);
    if (!valida.ok) throw new AppError('VALIDATION_ERROR');
    const existentes = await this.deps.terminals.listByMerchant(usuario.merchantId);
    if (existentes.some((t) => t.serial === valida.campos.serial)) throw new AppError('CONFLICT');
    const terminal = crearTerminal(valida.campos, { id: this.deps.ids.id(), createdAt: this.deps.clock.nowMs() });
    await this.deps.terminals.insertMany(usuario.merchantId, [terminal]);
    await this.deps.audit.record({
      merchantId: usuario.merchantId,
      atMs: terminal.createdAt,
      actorId: usuario.id,
      actorName: usuario.name,
      action: 'terminal.created',
      entityType: 'terminal',
      entityId: terminal.id,
      detail: { serial: terminal.serial },
    });
    return terminal;
  }
}
