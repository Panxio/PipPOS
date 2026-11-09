import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import EnlaceIngreso from './EnlaceIngreso';

interface Props {
  onEntrar: () => void;
}

// Comprobante de adorno: un cobro de ejemplo con los mismos tipos de dato que la app. No es interactivo.
function Recibo() {
  const { t } = useI18n();
  return (
    <div className="landing-recibo-caja">
      <figure className="landing-recibo" aria-label={t('landing.receipt.label')} data-testid={TESTIDS['landing-receipt']}>
        <h2 className="landing-recibo-titulo">{t('landing.receipt.title')}</h2>
        <dl className="landing-recibo-datos">
          <dt>{t('tx.field.terminal')}</dt>
          <dd>{t('landing.ejemplo.barra')}</dd>
          <dt>{t('tx.field.date')}</dt>
          <dd>07-11-2026</dd>
          <dt>{t('tx.method.card')}</dt>
          <dd>{`${t('tx.brand.visa')} ••4242`}</dd>
          <dt>{t('tx.field.auth')}</dt>
          <dd>A1F3C9</dd>
          <dt className="landing-recibo-total">{t('tx.total')}</dt>
          <dd className="landing-recibo-total">$12.500</dd>
        </dl>
        <p className="landing-recibo-ok">{t('tx.status.approved')}</p>
        <small>{t('landing.receipt.nota')}</small>
      </figure>
    </div>
  );
}

export default function LandingHero({ onEntrar }: Props) {
  const { t } = useI18n();
  return (
    <section id="inicio" className="landing-hero" data-testid={TESTIDS['landing-hero']}>
      <div className="rings" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="landing-hero-in">
        <div>
          <h1 data-testid={TESTIDS['landing-title']}>{t('landing.title')}</h1>
          <p className="landing-lead">{t('landing.lead')}</p>
          <div className="landing-cta-fila">
            <EnlaceIngreso testId="landing-cta-login" clase="landing-btn landing-btn-principal" onEntrar={onEntrar}>
              {t('landing.cta')}
            </EnlaceIngreso>
            <a
              href="#automatizacion"
              className="landing-btn landing-btn-fantasma"
              data-testid={TESTIDS['landing-cta-automatizacion']}
            >
              {t('landing.cta.automatizacion')}
            </a>
          </div>
        </div>
        <Recibo />
      </div>
    </section>
  );
}
