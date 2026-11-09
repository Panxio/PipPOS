import type { Branch } from '@pippos/shared';
import { puedeEscribirSucursales, puedeLeerSucursales } from '../domain/access';
import { AppError } from './errors';
import type { SessionDeps } from './get-session';
import type { BranchRepository, IdGenerator } from './ports';
import { usuarioQue } from './terminal-deps';

export interface BranchDeps extends SessionDeps {
  branches: BranchRepository;
  ids: IdGenerator;
}

export class ListBranches {
  private readonly deps: BranchDeps;

  constructor(deps: BranchDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined): Promise<Branch[]> {
    const usuario = await usuarioQue(this.deps, token, puedeLeerSucursales);
    return this.deps.branches.listByMerchant(usuario.merchantId);
  }
}

// Un nombre repetido (sin distinguir mayúsculas) lo rechaza la BD con UNIQUE y el repositorio lo traduce a CONFLICT.
export class CreateBranch {
  private readonly deps: BranchDeps;

  constructor(deps: BranchDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, name: string): Promise<Branch> {
    const usuario = await usuarioQue(this.deps, token, puedeEscribirSucursales);
    const id = this.deps.ids.id();
    await this.deps.branches.insertBranch(usuario.merchantId, { id, name });
    return { id, name, tills: [] };
  }
}

export class CreateTill {
  private readonly deps: BranchDeps;

  constructor(deps: BranchDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, branchId: string, name: string): Promise<Branch> {
    const usuario = await usuarioQue(this.deps, token, puedeEscribirSucursales);
    const sucursal = await this.deps.branches.findInMerchant(usuario.merchantId, branchId);
    if (sucursal === null) throw new AppError('NOT_FOUND');
    await this.deps.branches.insertTill(sucursal.id, { id: this.deps.ids.id(), name });
    const actualizada = await this.deps.branches.findInMerchant(usuario.merchantId, branchId);
    if (actualizada === null) throw new AppError('NOT_FOUND');
    return actualizada;
  }
}
