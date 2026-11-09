import type { MailboxMessage, Role, User } from '@pippos/shared';
import { puedeAdministrarUsuarios } from '../domain/access';
import { enlaceDeInvitacion, expiraInvitacion } from '../domain/invitacion';
import { estadoDeUsuario, sucursalValida } from '../domain/usuario';
import { AppError } from './errors';
import type { SessionDeps } from './get-session';
import type {
  AuditLog,
  BranchRepository,
  IdGenerator,
  InvitationRepository,
  MailboxRepository,
  NewInvitation,
  UserChanges,
  UserRecord,
  UserRepository,
} from './ports';
import { usuarioQue } from './terminal-deps';

export interface UsersDeps extends SessionDeps {
  users: UserRepository;
  branches: BranchRepository;
  invitations: InvitationRepository;
  mailbox: MailboxRepository;
  ids: IdGenerator;
  audit: AuditLog;
}

export interface NuevoUsuario {
  name: string;
  email: string;
  role: Role;
  branchId?: string | null;
}

export interface CambiosDeUsuario {
  status?: 'active' | 'inactive';
  role?: Role;
  branchId?: string | null;
}

export function aUsuario(usuario: UserRecord): User {
  return {
    id: usuario.id,
    name: usuario.name,
    email: usuario.email,
    role: usuario.role,
    status: estadoDeUsuario(usuario),
    branchId: usuario.branchId,
  };
}

// Una sucursal se busca dentro del comercio: una ajena o inexistente es un dato inválido del cuerpo (400).
async function exigirSucursalDelComercio(branches: BranchRepository, merchantId: string, branchId: string | null | undefined) {
  if (typeof branchId !== 'string') return;
  if ((await branches.findInMerchant(merchantId, branchId)) === null) throw new AppError('VALIDATION_ERROR');
}

function nuevaInvitacion(deps: Pick<UsersDeps, 'ids' | 'clock'>, email: string): NewInvitation {
  const ahora = deps.clock.nowMs();
  const token = deps.ids.token();
  return {
    token,
    createdAtMs: ahora,
    expiresAtMs: expiraInvitacion(ahora),
    message: { id: deps.ids.id(), to: email, link: enlaceDeInvitacion(token) },
  };
}

export class ListUsers {
  private readonly deps: UsersDeps;

  constructor(deps: UsersDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined): Promise<User[]> {
    const admin = await usuarioQue(this.deps, token, puedeAdministrarUsuarios);
    return (await this.deps.users.listByMerchant(admin.merchantId)).map(aUsuario);
  }
}

export class CreateUser {
  private readonly deps: UsersDeps;

  constructor(deps: UsersDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, entrada: NuevoUsuario): Promise<User> {
    const admin = await usuarioQue(this.deps, token, puedeAdministrarUsuarios);
    const branchId = entrada.branchId ?? null;
    if (!sucursalValida(entrada.role, branchId)) throw new AppError('VALIDATION_ERROR');
    await exigirSucursalDelComercio(this.deps.branches, admin.merchantId, branchId);
    if ((await this.deps.users.findByEmail(entrada.email)) !== null) throw new AppError('CONFLICT');

    const id = this.deps.ids.id();
    const { name, email, role } = entrada;
    await this.deps.users.insertInvited({ id, merchantId: admin.merchantId, name, email, role, branchId }, nuevaInvitacion(this.deps, email));
    await this.deps.audit.record({
      merchantId: admin.merchantId,
      atMs: this.deps.clock.nowMs(),
      actorId: admin.id,
      actorName: admin.name,
      action: 'user.created',
      entityType: 'user',
      entityId: id,
      detail: { role },
    });
    // Un usuario nuevo nunca tiene contraseña: nace invitado.
    return { id, name, email, role, status: 'invited', branchId };
  }
}

export class UpdateUser {
  private readonly deps: UsersDeps;

  constructor(deps: UsersDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, id: string, cambios: CambiosDeUsuario): Promise<User> {
    const admin = await usuarioQue(this.deps, token, puedeAdministrarUsuarios);
    const objetivo = await this.deps.users.findInMerchant(admin.merchantId, id);
    if (objetivo === null) throw new AppError('NOT_FOUND');
    revisarAutoCambio(admin, objetivo, cambios);

    const tocaRolOSucursal = cambios.role !== undefined || cambios.branchId !== undefined;
    const branchFinal = cambios.branchId !== undefined ? cambios.branchId : objetivo.branchId;
    if (tocaRolOSucursal && !sucursalValida(cambios.role ?? objetivo.role, branchFinal)) throw new AppError('VALIDATION_ERROR');
    await exigirSucursalDelComercio(this.deps.branches, admin.merchantId, cambios.branchId);

    await this.deps.users.update(admin.merchantId, id, aCambiosDeRepositorio(cambios));
    // Desactivar corta las sesiones abiertas; el login de esa cuenta falla desde ya.
    if (cambios.status === 'inactive') await this.deps.sessions.deleteByUser(id);

    const actualizado = await this.deps.users.findInMerchant(admin.merchantId, id);
    if (actualizado === null) throw new AppError('NOT_FOUND');
    const detalle = detalleDeCambios(objetivo, cambios);
    // Sin campos realmente cambiados no hay entrada.
    if (Object.keys(detalle).length > 0) {
      await this.deps.audit.record({
        merchantId: admin.merchantId,
        atMs: this.deps.clock.nowMs(),
        actorId: admin.id,
        actorName: admin.name,
        action: 'user.updated',
        entityType: 'user',
        entityId: id,
        detail: detalle,
      });
    }
    return aUsuario(actualizado);
  }
}

// Solo los campos que de verdad cambian, como texto. Una sucursal quitada queda como cadena vacía.
function detalleDeCambios(objetivo: UserRecord, cambios: CambiosDeUsuario): Record<string, string> {
  const detalle: Record<string, string> = {};
  if (cambios.role !== undefined && cambios.role !== objetivo.role) detalle.role = cambios.role;
  if (cambios.status !== undefined && cambios.status !== estadoDeUsuario(objetivo)) detalle.status = cambios.status;
  if (cambios.branchId !== undefined && cambios.branchId !== objetivo.branchId) detalle.branchId = cambios.branchId ?? '';
  return detalle;
}

// El admin no puede desactivarse ni quitarse el rol a sí mismo: así siempre queda un admin activo (U8).
function revisarAutoCambio(admin: UserRecord, objetivo: UserRecord, cambios: CambiosDeUsuario): void {
  if (admin.id !== objetivo.id) return;
  const cambiaRol = cambios.role !== undefined && cambios.role !== objetivo.role;
  if (cambios.status === 'inactive' || cambiaRol) throw new AppError('CONFLICT');
}

function aCambiosDeRepositorio(cambios: CambiosDeUsuario): UserChanges {
  const repo: UserChanges = {};
  if (cambios.status !== undefined) repo.active = cambios.status === 'active';
  if (cambios.role !== undefined) repo.role = cambios.role;
  if (cambios.branchId !== undefined) repo.branchId = cambios.branchId;
  return repo;
}

// Reenviar: solo para invitados. Borra el token anterior y deja un mensaje nuevo en la bandeja (U7).
export class ReissueInvitation {
  private readonly deps: UsersDeps;

  constructor(deps: UsersDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, id: string): Promise<void> {
    const admin = await usuarioQue(this.deps, token, puedeAdministrarUsuarios);
    const objetivo = await this.deps.users.findInMerchant(admin.merchantId, id);
    if (objetivo === null) throw new AppError('NOT_FOUND');
    if (estadoDeUsuario(objetivo) !== 'invited') throw new AppError('CONFLICT');
    await this.deps.invitations.replaceFor(admin.merchantId, objetivo.id, nuevaInvitacion(this.deps, objetivo.email));
  }
}

export class ListMailbox {
  private readonly deps: UsersDeps;

  constructor(deps: UsersDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined): Promise<MailboxMessage[]> {
    const admin = await usuarioQue(this.deps, token, puedeAdministrarUsuarios);
    return this.deps.mailbox.listByMerchant(admin.merchantId);
  }
}
