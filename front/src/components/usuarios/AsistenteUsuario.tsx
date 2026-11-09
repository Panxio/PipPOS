import { useState } from 'react';
import { ROLES, type Branch, type ErrorCode, type Role } from '@pippos/shared';
import { codigoDe, crearUsuario } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

type Paso = 'datos' | 'rol' | 'resumen';

interface Props {
  sucursales: Branch[];
  onCreado: () => void;
  onCancelar: () => void;
}

function esRol(valor: string): valor is Role {
  return (ROLES as readonly string[]).includes(valor);
}

// Asistente de 3 pasos. Al cerrarse se desmonta: al reabrir todo parte vacío.
export default function AsistenteUsuario({ sucursales, onCreado, onCancelar }: Props) {
  const { t } = useI18n();
  const [paso, setPaso] = useState<Paso>('datos');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [rol, setRol] = useState<Role>('cajero');
  const [sucursalId, setSucursalId] = useState('');
  const [error, setError] = useState<ErrorCode | null>(null);
  const [enviando, setEnviando] = useState(false);

  const datosValidos = nombre.trim() !== '' && correo.trim() !== '';
  const rolValido = rol !== 'cajero' || sucursalId !== '';
  const nombreSucursal = sucursales.find((s) => s.id === sucursalId)?.name ?? '';

  async function enviar(): Promise<void> {
    setError(null);
    setEnviando(true);
    try {
      await crearUsuario({ name: nombre, email: correo, role: rol, branchId: sucursalId === '' ? null : sucursalId });
      onCreado();
    } catch (fallo) {
      setError(codigoDe(fallo));
      setEnviando(false);
    }
  }

  return (
    <div data-testid={TESTIDS['user-wizard']} className="flex w-full max-w-[720px] flex-col gap-4 rounded border border-border bg-surface p-4">
      <h3 className="font-semibold">{t('wizard.title')}</h3>

      {paso === 'datos' && (
        <div data-testid={TESTIDS['wizard-step-data']} className="flex flex-col gap-3">
          <p className="text-sm">{t('wizard.step.data')}</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={TESTIDS['wizard-name']}>{t('wizard.name')}</label>
            <input
              id={TESTIDS['wizard-name']}
              data-testid={TESTIDS['wizard-name']}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="rounded border border-border bg-surface px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={TESTIDS['wizard-email']}>{t('wizard.email')}</label>
            <input
              id={TESTIDS['wizard-email']}
              data-testid={TESTIDS['wizard-email']}
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="rounded border border-border bg-surface px-3 py-2"
            />
          </div>
          <div className="flex gap-2">
            <BotonPaso testid={TESTIDS['wizard-next']} deshabilitado={!datosValidos} onClick={() => setPaso('rol')}>
              {t('wizard.next')}
            </BotonPaso>
            <BotonCancelar onCancelar={onCancelar} />
          </div>
        </div>
      )}

      {paso === 'rol' && (
        <div data-testid={TESTIDS['wizard-step-role']} className="flex flex-col gap-3">
          <p className="text-sm">{t('wizard.step.role')}</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={TESTIDS['wizard-role']}>{t('wizard.role')}</label>
            <select
              id={TESTIDS['wizard-role']}
              data-testid={TESTIDS['wizard-role']}
              value={rol}
              onChange={(e) => {
                if (esRol(e.target.value)) setRol(e.target.value);
              }}
              className="rounded border border-border bg-surface px-3 py-2"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}` as const)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={TESTIDS['wizard-branch']}>{t('wizard.branch')}</label>
            <select
              id={TESTIDS['wizard-branch']}
              data-testid={TESTIDS['wizard-branch']}
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="rounded border border-border bg-surface px-3 py-2"
            >
              <option value="">{t('wizard.branch.none')}</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {!rolValido && <p className="text-sm">{t('wizard.branch.required')}</p>}
          </div>
          <div className="flex gap-2">
            <BotonPaso testid={TESTIDS['wizard-back']} onClick={() => setPaso('datos')} secundario>
              {t('wizard.back')}
            </BotonPaso>
            <BotonPaso testid={TESTIDS['wizard-next']} deshabilitado={!rolValido} onClick={() => setPaso('resumen')}>
              {t('wizard.next')}
            </BotonPaso>
            <BotonCancelar onCancelar={onCancelar} />
          </div>
        </div>
      )}

      {paso === 'resumen' && (
        <div data-testid={TESTIDS['wizard-step-summary']} className="flex flex-col gap-3">
          <p className="text-sm">{t('wizard.step.summary')}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>{t('wizard.name')}</dt>
            <dd data-testid={TESTIDS['wizard-summary-name']}>{nombre}</dd>
            <dt>{t('wizard.email')}</dt>
            <dd data-testid={TESTIDS['wizard-summary-email']}>{correo}</dd>
            <dt>{t('wizard.role')}</dt>
            <dd data-testid={TESTIDS['wizard-summary-role']}>{t(`role.${rol}` as const)}</dd>
            <dt>{t('wizard.branch')}</dt>
            <dd data-testid={TESTIDS['wizard-summary-branch']}>{nombreSucursal}</dd>
          </dl>
          {error !== null && (
            <p role="alert" data-testid={TESTIDS['wizard-error']}>
              {t(`error.${error}` as const)}
            </p>
          )}
          <div className="flex gap-2">
            <BotonPaso testid={TESTIDS['wizard-back']} onClick={() => setPaso('rol')} secundario>
              {t('wizard.back')}
            </BotonPaso>
            <BotonPaso testid={TESTIDS['wizard-submit']} deshabilitado={enviando} onClick={() => void enviar()}>
              {t('wizard.submit')}
            </BotonPaso>
            <BotonCancelar onCancelar={onCancelar} />
          </div>
        </div>
      )}
    </div>
  );
}

interface BotonProps {
  testid: string;
  children: string;
  onClick: () => void;
  deshabilitado?: boolean;
  secundario?: boolean;
}

function BotonPaso({ testid, children, onClick, deshabilitado = false, secundario = false }: BotonProps) {
  return (
    <button
      type="button"
      data-testid={testid}
      disabled={deshabilitado}
      onClick={onClick}
      className={
        secundario
          ? 'rounded border border-border bg-surface px-4 py-2'
          : 'rounded bg-accent px-4 py-2 text-surface disabled:opacity-50'
      }
    >
      {children}
    </button>
  );
}

function BotonCancelar({ onCancelar }: { onCancelar: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      data-testid={TESTIDS['wizard-cancel']}
      onClick={onCancelar}
      className="rounded border border-border bg-surface px-4 py-2"
    >
      {t('wizard.cancel')}
    </button>
  );
}
