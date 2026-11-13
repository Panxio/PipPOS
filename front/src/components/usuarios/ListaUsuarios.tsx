import { useId, useState } from 'react';
import type { Branch, ErrorCode, User } from '@pippos/shared';
import { codigoDe, editarUsuario, reenviarInvitacion } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS, userRow, userResend, userToggle } from '../../testids';

interface Props {
  usuarios: User[] | null;
  error: ErrorCode | null;
  sucursales: Branch[];
  propioId: string;
  onCambiado: () => void;
  onInvitacionEnviada: () => void;
}

export default function ListaUsuarios({
  usuarios,
  error,
  sucursales,
  propioId,
  onCambiado,
  onInvitacionEnviada,
}: Props) {
  const { t } = useI18n();
  const idTituloConfirmacion = useId();
  const [confirmando, setConfirmando] = useState<User | null>(null);
  const [errorAccion, setErrorAccion] = useState<ErrorCode | null>(null);

  async function cambiarEstado(usuario: User): Promise<void> {
    setErrorAccion(null);
    try {
      await editarUsuario(usuario.id, { status: usuario.status === 'inactive' ? 'active' : 'inactive' });
      onCambiado();
    } catch (fallo) {
      setErrorAccion(codigoDe(fallo));
    }
  }

  // Desactivar pide confirmación y no envía nada hasta aceptar; activar es directo.
  function alPulsarEstado(usuario: User): void {
    if (usuario.status === 'inactive') void cambiarEstado(usuario);
    else setConfirmando(usuario);
  }

  function aceptarDesactivar(): void {
    const usuario = confirmando;
    setConfirmando(null);
    if (usuario !== null) void cambiarEstado(usuario);
  }

  async function reenviar(usuario: User): Promise<void> {
    setErrorAccion(null);
    try {
      await reenviarInvitacion(usuario.id);
      onInvitacionEnviada();
    } catch (fallo) {
      setErrorAccion(codigoDe(fallo));
    }
  }

  return (
    <section className="flex flex-col gap-3">
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['users-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {error === null && usuarios === null && <p role="status" aria-busy="true" data-testid={TESTIDS['users-loading']}>{t('users.loading')}</p>}
      {usuarios !== null && (
        <div className="overflow-x-auto">
          <table data-testid={TESTIDS['users-table']} className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-semibold">{t('users.col.name')}</th>
                <th className="px-2 py-2 font-semibold">{t('users.col.email')}</th>
                <th className="px-2 py-2 font-semibold">{t('users.col.role')}</th>
                <th className="px-2 py-2 font-semibold">{t('users.col.status')}</th>
                <th className="px-2 py-2 font-semibold">{t('users.col.branch')}</th>
                <th className="relative">
                  <span className="sr-only">{t('table.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <FilaUsuario
                  key={usuario.id}
                  usuario={usuario}
                  sucursal={sucursales.find((s) => s.id === usuario.branchId)?.name ?? ''}
                  esPropio={usuario.id === propioId}
                  onAlternarEstado={() => alPulsarEstado(usuario)}
                  onReenviar={() => void reenviar(usuario)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {errorAccion !== null && (
        <p role="alert" data-testid={TESTIDS['users-action-error']}>
          {t(`error.${errorAccion}` as const)}
        </p>
      )}
      {confirmando !== null && (
        <div
          role="alertdialog"
          aria-labelledby={idTituloConfirmacion}
          data-testid={TESTIDS['user-confirm']}
          className="flex flex-col gap-2 rounded border border-border bg-surface p-3"
        >
          <p id={idTituloConfirmacion} className="font-semibold">
            {t('users.confirm.title')}
          </p>
          <p className="text-sm">{t('users.confirm.text')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid={TESTIDS['user-confirm-accept']}
              onClick={aceptarDesactivar}
              className="rounded bg-accent px-4 py-2 text-surface"
            >
              {t('users.confirm.accept')}
            </button>
            <button
              type="button"
              autoFocus
              data-testid={TESTIDS['user-confirm-cancel']}
              onClick={() => setConfirmando(null)}
              className="rounded border border-border bg-surface px-4 py-2"
            >
              {t('users.confirm.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

interface FilaProps {
  usuario: User;
  sucursal: string;
  esPropio: boolean;
  onAlternarEstado: () => void;
  onReenviar: () => void;
}

function FilaUsuario({ usuario, sucursal, esPropio, onAlternarEstado, onReenviar }: FilaProps) {
  const { t } = useI18n();
  return (
    <tr data-testid={userRow(usuario.email)} className="border-b border-border">
      <td className="px-2 py-2">{usuario.name}</td>
      <td className="px-2 py-2">{usuario.email}</td>
      <td className="px-2 py-2">{t(`role.${usuario.role}` as const)}</td>
      <td className="px-2 py-2">{t(`users.status.${usuario.status}` as const)}</td>
      <td className="px-2 py-2">{sucursal}</td>
      <td className="px-2 py-2">
        {!esPropio && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid={userToggle(usuario.email)}
              onClick={onAlternarEstado}
              className="rounded border border-border bg-surface px-3 py-1"
            >
              {usuario.status === 'inactive' ? t('users.action.activate') : t('users.action.deactivate')}
            </button>
            {usuario.status === 'invited' && (
              <button
                type="button"
                data-testid={userResend(usuario.email)}
                onClick={onReenviar}
                className="rounded border border-border bg-surface px-3 py-1"
              >
                {t('users.action.resend')}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
