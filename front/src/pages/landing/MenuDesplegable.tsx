import { useI18n, type MessageKey } from '../../i18n';
import { TESTIDS } from '../../testids';

export interface EnlaceMenu {
  testId:
    | 'landing-link-terminales'
    | 'landing-link-cobros'
    | 'landing-link-alertas'
    | 'landing-link-contrato'
    | 'landing-link-selectores';
  ancla: string;
  titulo: MessageKey;
  detalle: MessageKey;
}

interface Props {
  nombre: 'producto' | 'automatizacion';
  abierto: boolean;
  onAlternar: () => void;
  onElegir: () => void;
  enlaces: readonly EnlaceMenu[];
}

// Botón con aria-expanded que despliega su lista. La lista siempre está en el DOM y se oculta con `hidden`.
export default function MenuDesplegable({ nombre, abierto, onAlternar, onElegir, enlaces }: Props) {
  const { t } = useI18n();
  const idLista = `landing-lista-${nombre}`;

  return (
    <div className="landing-menu">
      <button
        type="button"
        className="landing-menu-boton"
        data-testid={TESTIDS[`landing-menu-${nombre}` as const]}
        aria-expanded={abierto}
        aria-controls={idLista}
        onClick={onAlternar}
      >
        {t(`landing.menu.${nombre}` as const)}
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>
      <ul
        id={idLista}
        className="landing-drop"
        data-testid={TESTIDS[`landing-menu-${nombre}-lista` as const]}
        hidden={!abierto}
      >
        {enlaces.map((enlace) => (
          <li key={enlace.testId}>
            <a href={enlace.ancla} data-testid={TESTIDS[enlace.testId]} onClick={onElegir}>
              <strong>{t(enlace.titulo)}</strong>
              <span>{t(enlace.detalle)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
