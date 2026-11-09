import type { Terminal } from '@pippos/shared';
import { puedeLeerTerminales } from '../domain/access';
import { AppError } from './errors';
import type { Acceso } from './get-session';
import { type TerminalDeps, usuarioQue } from './terminal-deps';

export class GetTerminal {
  private readonly deps: TerminalDeps;

  constructor(deps: TerminalDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, id: string): Promise<Terminal> {
    const usuario = await usuarioQue(this.deps, acceso, puedeLeerTerminales);
    const terminal = await this.deps.terminals.findById(usuario.merchantId, id);
    if (terminal === null) throw new AppError('NOT_FOUND');
    return terminal;
  }
}
