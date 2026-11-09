import { useI18n, type MessageKey } from '../../i18n';
import { TESTIDS } from '../../testids';
import EnlaceIngreso from './EnlaceIngreso';

interface ParTextos {
  titulo: MessageKey;
  detalle: MessageKey;
}

type IdFila = 'landing-fila-1' | 'landing-fila-2' | 'landing-fila-3' | 'landing-fila-4' | 'landing-fila-5';

interface FilaEjemplo {
  testId: IdFila;
  folio: string;
  terminal: MessageKey;
  medio: MessageKey;
  importe: string;
  estado: MessageKey;
  tono: 'landing-pastilla-ok' | 'landing-pastilla-devuelta' | 'landing-pastilla-anulada';
}

const AREAS: readonly ParTextos[] = [
  { titulo: 'landing.areas.terminales', detalle: 'landing.areas.terminales.detalle' },
  { titulo: 'landing.areas.usuarios', detalle: 'landing.areas.usuarios.detalle' },
  { titulo: 'landing.areas.transacciones', detalle: 'landing.areas.transacciones.detalle' },
  { titulo: 'landing.areas.reportes', detalle: 'landing.areas.reportes.detalle' },
  { titulo: 'landing.areas.alertas', detalle: 'landing.areas.alertas.detalle' },
];

// Datos de ejemplo de la tabla: cinco filas, como en el prototipo.
const FILAS: readonly FilaEjemplo[] = [
  { testId: 'landing-fila-1', folio: 'T-000412', terminal: 'landing.ejemplo.barra', medio: 'landing.ejemplo.contactless', importe: '$12.500', estado: 'tx.status.approved', tono: 'landing-pastilla-ok' },
  { testId: 'landing-fila-2', folio: 'T-000411', terminal: 'landing.ejemplo.terraza', medio: 'landing.ejemplo.chip', importe: '$38.900', estado: 'tx.status.approved', tono: 'landing-pastilla-ok' },
  { testId: 'landing-fila-3', folio: 'T-000410', terminal: 'landing.ejemplo.barra', medio: 'landing.ejemplo.contactless', importe: '$4.200', estado: 'tx.status.refunded', tono: 'landing-pastilla-devuelta' },
  { testId: 'landing-fila-4', folio: 'T-000409', terminal: 'landing.ejemplo.pista', medio: 'landing.ejemplo.contactless', importe: '$21.000', estado: 'tx.status.voided', tono: 'landing-pastilla-anulada' },
  { testId: 'landing-fila-5', folio: 'T-000408', terminal: 'landing.ejemplo.terraza', medio: 'landing.ejemplo.contactless', importe: '$9.750', estado: 'tx.status.approved', tono: 'landing-pastilla-ok' },
];

// Panel claro «cinco áreas» con la tabla de ejemplo. El efecto de ancho solo mueve el fondo.
export function PanelAreas() {
  const { t } = useI18n();
  return (
    <section
      id="producto"
      className="landing-panel landing-panel-claro landing-panel-recogido landing-efecto-encoge landing-separado"
      data-testid={TESTIDS['landing-producto']}
    >
      <div className="landing-panel-in landing-dos-columnas">
        <div>
          <h2>{t('landing.areas.title')}</h2>
          <p className="landing-sub">{t('landing.areas.sub')}</p>
          <dl className="landing-areas">
            {AREAS.map((area) => (
              <div key={area.titulo}>
                <dt>{t(area.titulo)}</dt>
                <dd>{t(area.detalle)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="landing-ventana" data-testid={TESTIDS['landing-ejemplo']}>
          <div className="landing-ventana-cabecera">
            <h3>{t('landing.ejemplo.titulo')}</h3>
            <span>{t('landing.ejemplo.nota')}</span>
          </div>
          <div className="landing-tabla-wrap">
            <table className="landing-tabla">
              <caption className="landing-sr">{t('landing.ejemplo.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('tx.col.folio')}</th>
                  <th scope="col">{t('tx.col.terminal')}</th>
                  <th scope="col" className="landing-col-medio">
                    {t('tx.col.method')}
                  </th>
                  <th scope="col" className="landing-n">
                    {t('tx.col.amount')}
                  </th>
                  <th scope="col">{t('tx.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {FILAS.map((fila) => (
                  <tr key={fila.testId} data-testid={TESTIDS[fila.testId]}>
                    <td>{fila.folio}</td>
                    <td>{t(fila.terminal)}</td>
                    <td className="landing-col-medio">{t(fila.medio)}</td>
                    <td className="landing-n">{fila.importe}</td>
                    <td>
                      <span className={`landing-pastilla ${fila.tono}`}>{t(fila.estado)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

const PARES: readonly ParTextos[] = [
  { titulo: 'landing.auto.id.titulo', detalle: 'landing.auto.id.detalle' },
  { titulo: 'landing.auto.dom.titulo', detalle: 'landing.auto.dom.detalle' },
  { titulo: 'landing.auto.anim.titulo', detalle: 'landing.auto.anim.detalle' },
];

// El mismo selector en las tres herramientas. Los tres ejemplos van a la vista a la vez, como en el prototipo.
const EJEMPLOS = [
  { herramienta: 'Playwright', codigo: `await page.getByTestId('landing-cta-login').click();` },
  { herramienta: 'Cypress', codigo: `cy.get('[data-testid="landing-cta-login"]').click();` },
  { herramienta: 'Selenium', codigo: `driver.findElement(By.css('[data-testid="landing-cta-login"]')).click();` },
] as const;

// Panel oscuro de automatización: su fondo crece con el scroll; el contenido no se mueve.
export function PanelAutomatizacion() {
  const { t } = useI18n();
  return (
    <section
      id="automatizacion"
      className="landing-panel landing-panel-oscuro landing-efecto-crece landing-separado"
      data-testid={TESTIDS['landing-automatizacion']}
    >
      <div className="landing-panel-in landing-dos-columnas">
        <div>
          <h2>{t('landing.auto.title')}</h2>
          <p className="landing-sub">{t('landing.auto.sub')}</p>
          <ul className="landing-pares">
            {PARES.map((par) => (
              <li key={par.titulo}>
                <strong>{t(par.titulo)}</strong>
                <span>{t(par.detalle)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div id="selectores" className="landing-codigo" data-testid={TESTIDS['landing-selectores']}>
          {EJEMPLOS.map((ejemplo) => (
            <figure key={ejemplo.herramienta}>
              <figcaption>{ejemplo.herramienta}</figcaption>
              <pre>
                <code>{ejemplo.codigo}</code>
              </pre>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

interface PropsCierre {
  onEntrar: () => void;
}

// Cierre con CTA. Es un panel claro con el mismo efecto de fondo que el de áreas.
export function PanelCierre({ onEntrar }: PropsCierre) {
  const { t } = useI18n();
  return (
    <section
      id="entrar"
      className="landing-panel landing-panel-claro landing-panel-recogido landing-efecto-encoge landing-separado"
      data-testid={TESTIDS['landing-final']}
    >
      <div className="landing-panel-in">
        <h2>{t('landing.final.title')}</h2>
        <p className="landing-sub">{t('landing.final.sub')}</p>
        <div className="landing-cta-fila">
          <EnlaceIngreso testId="landing-cta-final" clase="landing-btn landing-btn-principal" onEntrar={onEntrar}>
            {t('landing.cta')}
          </EnlaceIngreso>
        </div>
        <p className="landing-nota">{t('landing.final.nota')}</p>
      </div>
    </section>
  );
}
