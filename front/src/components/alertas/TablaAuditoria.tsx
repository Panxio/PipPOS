import type { AuditEntry } from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS, auditRow } from '../../testids';

interface Props {
  items: readonly AuditEntry[];
}

export default function TablaAuditoria({ items }: Props) {
  const { t, lang } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table data-testid={TESTIDS['audit-table']} className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-2 font-semibold">{t('audit.col.date')}</th>
            <th className="px-2 py-2 font-semibold">{t('audit.col.actor')}</th>
            <th className="px-2 py-2 font-semibold">{t('audit.col.action')}</th>
            <th className="px-2 py-2 font-semibold">{t('audit.col.entity')}</th>
            <th className="px-2 py-2 font-semibold">{t('audit.col.detail')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entrada) => (
            <tr key={entrada.seq} data-testid={auditRow(entrada.seq)} className="border-b border-border">
              <td className="px-2 py-2">{new Date(entrada.atMs).toLocaleString(lang)}</td>
              <td className="px-2 py-2">{entrada.actorName}</td>
              <td className="px-2 py-2">{t(`audit.action.${entrada.action}` as const)}</td>
              <td className="px-2 py-2">{entidadDe(entrada)}</td>
              <td className="px-2 py-2">{detalleDe(entrada.detail)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// «terminal · t-2», o solo el tipo si la entrada no tiene una entidad concreta.
function entidadDe(entrada: AuditEntry): string {
  return entrada.entityId === null ? entrada.entityType : `${entrada.entityType} · ${entrada.entityId}`;
}

// «alias: Caja 2, till: C2»; sin detalle, la celda va vacía.
function detalleDe(detalle: Record<string, string>): string {
  return Object.entries(detalle)
    .map(([clave, valor]) => `${clave}: ${valor}`)
    .join(', ');
}
