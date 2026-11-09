import type { ErrorCode, MailboxMessage } from '@pippos/shared';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

interface Props {
  mensajes: MailboxMessage[] | null;
  error: ErrorCode | null;
}

// Bandeja simulada: en la demo las invitaciones no salen por correo; el enlace se abre aquí.
export default function Bandeja({ mensajes, error }: Props) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t('mailbox.title')}</h2>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['mailbox-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {error === null && mensajes === null && <p>{t('users.loading')}</p>}
      {mensajes !== null && mensajes.length === 0 && <p data-testid={TESTIDS['mailbox-empty']}>{t('mailbox.empty')}</p>}
      {mensajes !== null && mensajes.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {mensajes.map((mensaje) => (
            <li key={mensaje.id} data-testid={TESTIDS['mailbox-item']} className="flex flex-wrap items-center gap-3">
              <span>
                {t('mailbox.to')}: {mensaje.to}
              </span>
              <a data-testid={TESTIDS['mailbox-link']} href={mensaje.link} className="text-accent underline">
                {t('mailbox.link')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
