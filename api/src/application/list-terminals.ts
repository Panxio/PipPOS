import type { ListTerminalsQuery, TerminalPage } from '@pippos/shared';
import { puedeLeerTerminales } from '../domain/access';
import { consultarTerminales } from '../domain/terminal-list';
import type { Acceso } from './get-session';
import { type TerminalDeps, usuarioQue } from './terminal-deps';

export class ListTerminals {
  private readonly deps: TerminalDeps;

  constructor(deps: TerminalDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, consulta: ListTerminalsQuery): Promise<TerminalPage> {
    const usuario = await usuarioQue(this.deps, acceso, puedeLeerTerminales);
    return consultarTerminales(await this.deps.terminals.listByMerchant(usuario.merchantId), consulta);
  }
}
