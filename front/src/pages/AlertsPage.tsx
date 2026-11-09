import { useState } from 'react';
import type { SessionUser } from '@pippos/shared';
import PestanaAlertas from '../components/alertas/PestanaAlertas';
import PestanaAuditoria from '../components/alertas/PestanaAuditoria';
import PestanaUmbrales from '../components/alertas/PestanaUmbrales';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

type Pestana = 'alertas' | 'umbrales' | 'auditoria';

const PESTANAS = [
  { id: 'alertas', testid: TESTIDS['alerts-tab-alerts'], clave: 'alerts.tab.alerts', soloAdmin: false },
  { id: 'umbrales', testid: TESTIDS['alerts-tab-thresholds'], clave: 'alerts.tab.thresholds', soloAdmin: false },
  { id: 'auditoria', testid: TESTIDS['alerts-tab-audit'], clave: 'alerts.tab.audit', soloAdmin: true },
] as const;

interface Props {
  user: SessionUser;
  version: number;
  onCambio: () => void;
}

// Sección Alertas: alertas, umbrales y, solo para el administrador, la auditoría.
export default function AlertsPage({ user, version, onCambio }: Props) {
  const { t } = useI18n();
  const esAdmin = user.role === 'admin';
  const [pestana, setPestana] = useState<Pestana>('alertas');
  const visibles = PESTANAS.filter((p) => esAdmin || !p.soloAdmin);

  return (
    <section data-testid={TESTIDS['alerts-page']} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('alerts.title')}</h2>
      <div role="tablist" className="flex flex-wrap gap-2 border-b border-border">
        {visibles.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            data-testid={p.testid}
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${pestana === p.id ? 'border-accent font-semibold' : 'border-transparent'}`}
          >
            {t(p.clave)}
          </button>
        ))}
      </div>
      {pestana === 'alertas' && <PestanaAlertas version={version} onCambio={onCambio} />}
      {pestana === 'umbrales' && <PestanaUmbrales puedeEditar={esAdmin} onGuardado={onCambio} />}
      {pestana === 'auditoria' && esAdmin && <PestanaAuditoria />}
    </section>
  );
}
