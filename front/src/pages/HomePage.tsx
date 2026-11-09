import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

interface Props {
  merchantName: string;
}

export default function HomePage({ merchantName }: Props) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-2">
      <p data-testid={TESTIDS['home-welcome']}>{t('home.welcome')}</p>
      <p data-testid={TESTIDS['home-merchant']} className="font-medium">
        {merchantName}
      </p>
    </section>
  );
}
