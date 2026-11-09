import { AUDIT_ACTIONS, type AuditAction, type User } from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

interface Props {
  accion: AuditAction | undefined;
  actorId: string | undefined;
  desde: string;
  hasta: string;
  usuarios: readonly User[];
  onAccion: (valor: string) => void;
  onActor: (valor: string) => void;
  onDesde: (valor: string) => void;
  onHasta: (valor: string) => void;
}

const SELECT = 'rounded border border-border bg-surface px-2 py-2';
const CAMPO_FECHA = 'rounded border border-border bg-surface px-2 py-1';

// Filtros de la bitácora: cada control solo avisa; quien decide la página y la consulta es la pestaña.
export default function FiltrosBitacora({ accion, actorId, desde, hasta, usuarios, onAccion, onActor, onDesde, onHasta }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <select
        aria-label={t('audit.filter.action')}
        data-testid={TESTIDS['audit-action']}
        value={accion ?? ''}
        onChange={(evento) => onAccion(evento.target.value)}
        className={SELECT}
      >
        <option value="">{t('audit.filter.allActions')}</option>
        {AUDIT_ACTIONS.map((clave) => (
          <option key={clave} value={clave}>
            {t(`audit.action.${clave}` as const)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('audit.filter.actor')}
        data-testid={TESTIDS['audit-actor']}
        value={actorId ?? ''}
        onChange={(evento) => onActor(evento.target.value)}
        className={SELECT}
      >
        <option value="">{t('audit.filter.allActors')}</option>
        {usuarios.map((usuario) => (
          <option key={usuario.id} value={usuario.id}>
            {usuario.name}
          </option>
        ))}
      </select>
      <label className="flex flex-col gap-1">
        <span>{t('audit.filter.from')}</span>
        <input
          type="date"
          data-testid={TESTIDS['audit-from']}
          value={desde}
          onChange={(evento) => onDesde(evento.target.value)}
          className={CAMPO_FECHA}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t('audit.filter.to')}</span>
        <input
          type="date"
          data-testid={TESTIDS['audit-to']}
          value={hasta}
          onChange={(evento) => onHasta(evento.target.value)}
          className={CAMPO_FECHA}
        />
      </label>
    </div>
  );
}
