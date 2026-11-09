import type { SalesItem } from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS, reportBar } from '../../testids';
import { alturaBarra, maximoNeto } from './valores';

const ANCHO_BARRA = 10;
const HUECO = 2;

interface Props {
  items: SalesItem[];
}

// Barras SVG del neto por ítem. La tabla de al lado es su alternativa accesible.
export default function GraficoVentas({ items }: Props) {
  const { t } = useI18n();
  const maximo = maximoNeto(items);
  return (
    <svg
      role="img"
      aria-label={t('reports.chart')}
      data-testid={TESTIDS['report-chart']}
      viewBox={`0 0 ${items.length * ANCHO_BARRA} 100`}
      preserveAspectRatio="none"
      className="h-48 w-full fill-accent"
    >
      {items.map((item, indice) => {
        const altura = alturaBarra(item.totalNet, maximo);
        return (
          <rect
            key={item.key}
            data-testid={reportBar(item.key)}
            data-value={item.totalNet}
            x={indice * ANCHO_BARRA + HUECO / 2}
            y={100 - altura}
            width={ANCHO_BARRA - HUECO}
            height={altura}
          />
        );
      })}
    </svg>
  );
}
