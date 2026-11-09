import type { Section } from '@pippos/shared';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

interface Props {
  seccion: Section;
}

export default function PlaceholderPage({ seccion }: Props) {
  const { t } = useI18n();
  return (
    <section data-testid={TESTIDS['placeholder-page']} className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{t(`nav.${seccion}`)}</h2>
      <p>{t('placeholder.soon')}</p>
    </section>
  );
}
