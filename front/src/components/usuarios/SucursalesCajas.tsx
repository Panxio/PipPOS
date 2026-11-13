import { useState } from 'react';
import type { Branch, ErrorCode } from '@pippos/shared';
import { codigoDe, crearCaja, crearSucursal } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS, branchRow, tillNewName, tillNewSubmit } from '../../testids';

interface Props {
  sucursales: Branch[] | null;
  error: ErrorCode | null;
  onCambiado: () => void;
}

export default function SucursalesCajas({ sucursales, error, onCambiado }: Props) {
  const { t } = useI18n();
  const [nombre, setNombre] = useState('');
  const [errorAccion, setErrorAccion] = useState<ErrorCode | null>(null);
  const errorVisible = errorAccion ?? error;

  // Ejecuta una alta; si sale bien recarga las sucursales y devuelve true.
  async function ejecutar(accion: () => Promise<unknown>): Promise<boolean> {
    setErrorAccion(null);
    try {
      await accion();
      onCambiado();
      return true;
    } catch (fallo) {
      setErrorAccion(codigoDe(fallo));
      return false;
    }
  }

  async function crear(): Promise<void> {
    if (await ejecutar(() => crearSucursal({ name: nombre }))) setNombre('');
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('branches.title')}</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={TESTIDS['branch-new-name']}>{t('branches.new.name')}</label>
          <input
            id={TESTIDS['branch-new-name']}
            data-testid={TESTIDS['branch-new-name']}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="rounded border border-border bg-surface px-3 py-2"
          />
        </div>
        <button
          type="button"
          data-testid={TESTIDS['branch-new-submit']}
          disabled={nombre.trim() === ''}
          onClick={() => void crear()}
          className="rounded bg-accent px-3 py-2 text-surface disabled:opacity-50"
        >
          {t('branches.new.submit')}
        </button>
      </div>
      {errorVisible !== null && (
        <p role="alert" data-testid={TESTIDS['branches-error']}>
          {t(`error.${errorVisible}` as const)}
        </p>
      )}
      {sucursales === null && error === null && <p role="status" aria-busy="true" data-testid={TESTIDS['branches-loading']}>{t('users.loading')}</p>}
      {sucursales !== null && (
        <ul className="flex flex-col gap-3">
          {sucursales.map((sucursal) => (
            <FilaSucursal key={sucursal.id} sucursal={sucursal} alEjecutar={ejecutar} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface FilaProps {
  sucursal: Branch;
  alEjecutar: (accion: () => Promise<unknown>) => Promise<boolean>;
}

function FilaSucursal({ sucursal, alEjecutar }: FilaProps) {
  const { t } = useI18n();
  const [nombreCaja, setNombreCaja] = useState('');

  async function crearNuevaCaja(): Promise<void> {
    if (await alEjecutar(() => crearCaja(sucursal.id, { name: nombreCaja }))) setNombreCaja('');
  }

  return (
    <li data-testid={branchRow(sucursal.name)} className="flex flex-col gap-2 rounded border border-border bg-surface p-3">
      <p className="font-semibold">{sucursal.name}</p>
      {sucursal.tills.length === 0 ? (
        <p className="text-sm">{t('branches.till.none')}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {sucursal.tills.map((caja) => (
            <li key={caja.id}>{caja.name}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input
          data-testid={tillNewName(sucursal.name)}
          aria-label={t('branches.till.name')}
          placeholder={t('branches.till.name')}
          value={nombreCaja}
          onChange={(e) => setNombreCaja(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-1"
        />
        <button
          type="button"
          data-testid={tillNewSubmit(sucursal.name)}
          disabled={nombreCaja.trim() === ''}
          onClick={() => void crearNuevaCaja()}
          className="rounded border border-border bg-surface px-3 py-1 disabled:opacity-50"
        >
          {t('branches.till.submit')}
        </button>
      </div>
    </li>
  );
}
