import { SECTIONS } from '@pippos/shared';
import { describe, expect, it } from 'vitest';
import { TESTIDS } from '../src/testids';

const TERMINALES = [
  'terminals-page', 'terminals-search', 'terminals-status-filter', 'terminals-sort', 'terminals-order', 'terminals-table',
  'terminals-empty', 'terminals-error', 'terminals-total', 'terminals-page-info', 'terminals-prev', 'terminals-next',
  'terminal-new-button', 'terminal-form', 'terminal-form-submit', 'terminal-form-cancel', 'terminal-form-error',
  ...['serial', 'alias', 'model', 'branch', 'till'].map((c) => `terminal-field-${c}`),
  ...['button', 'form', 'alias', 'branch', 'till', 'submit', 'cancel', 'error'].map((c) => `terminal-edit-${c}`),
  'terminal-confirm', 'terminal-confirm-accept', 'terminal-confirm-cancel',
  'terminal-detail', 'terminal-detail-close', 'terminal-detail-error', 'terminal-toggle-status',
  ...['serial', 'alias', 'model', 'branch', 'till', 'status', 'firmware', 'battery', 'connection'].map((c) => `terminal-detail-${c}`),
  'terminal-import-file', 'terminal-import-result', 'terminal-import-created', 'terminal-import-invalid-row', 'terminal-import-error',
];

const USUARIOS = [
  'users-page', 'users-table', 'users-error', 'users-action-error', 'user-confirm', 'user-confirm-accept', 'user-confirm-cancel',
  'user-new-button', 'user-wizard', 'wizard-step-data', 'wizard-step-role', 'wizard-step-summary', 'wizard-name', 'wizard-email',
  'wizard-role', 'wizard-branch', 'wizard-next', 'wizard-back', 'wizard-submit', 'wizard-cancel', 'wizard-error',
  ...['name', 'email', 'role', 'branch'].map((c) => `wizard-summary-${c}`),
  'branch-new-name', 'branch-new-submit', 'branches-error',
  'mailbox-item', 'mailbox-link', 'mailbox-empty', 'mailbox-error',
  'invitation-page', 'invitation-password', 'invitation-submit', 'invitation-done', 'invitation-login', 'invitation-error',
  'password-button', 'password-form', 'password-current', 'password-next', 'password-submit', 'password-cancel', 'password-error',
  'login-notice',
];

const COBRO = [
  'transactions-page', 'charge-form', 'charge-terminal', 'charge-amount', 'charge-method', 'charge-brand', 'charge-last4', 'charge-submit',
  'charge-error', 'charge-new', ...['status', 'folio', 'code', 'auth'].map((c) => `charge-result-${c}`), 'charge-result',
  'tx-table', 'tx-empty', 'tx-error', 'tx-total', 'tx-page-info', 'tx-prev', 'tx-next',
  ...['status', 'method', 'brand', 'terminal', 'from', 'to', 'min', 'max'].map((c) => `tx-filter-${c}`),
  'tx-detail', 'tx-detail-close', 'tx-detail-error', 'tx-event', 'tx-receipt-link',
  ...['folio', 'status', 'terminal', 'amount', 'refunded', 'method', 'brand', 'last4', 'auth'].map((c) => `tx-detail-${c}`),
  'tx-void', 'tx-confirm', 'tx-confirm-accept', 'tx-confirm-cancel', 'tx-refund-amount', 'tx-refund-submit',
  'receipt-page', 'receipt-print', 'receipt-error',
  ...['folio', 'merchant', 'terminal', 'amount', 'refunded', 'method', 'brand', 'last4', 'status', 'auth', 'date'].map((c) => `receipt-${c}`),
];

const REPORTES = [
  'reports-page', 'report-groupby', 'report-from', 'report-to', 'report-range-error', 'report-error',
  ...['today', '7d', '30d', 'month'].map((c) => `report-preset-${c}`),
  ...['total', 'sales', 'avg', 'attempts', 'approval', 'voided'].flatMap((c) => [`kpi-${c}-value`, `kpi-${c}-delta`]),
  'kpi-voided-amount', 'report-table', 'report-chart', 'report-empty', 'report-export', 'report-export-error',
];

const ALERTAS = [
  'alerts-bell', 'alerts-badge', 'alerts-panel', 'alerts-panel-empty', 'alerts-panel-error', 'alerts-read-all', 'alerts-view-all',
  'alerts-page', 'alerts-tab-alerts', 'alerts-tab-thresholds', 'alerts-tab-audit', 'alerts-unread-only', 'alerts-empty', 'alerts-error',
  'alerts-action-error',
  'alert-battery', 'alert-void-amount', 'alert-settings-save', 'alert-settings-saved', 'alert-settings-error',
  'audit-action', 'audit-actor', 'audit-from', 'audit-to', 'audit-range-error', 'audit-table', 'audit-empty', 'audit-error', 'audit-total',
  'audit-page-info', 'audit-prev', 'audit-next', 'audit-export', 'audit-export-error',
];

const LANDING = [
  'landing', 'landing-skip', 'landing-bar', 'landing-brand', 'landing-nav', 'landing-lang',
  'landing-menu-producto', 'landing-menu-producto-lista', 'landing-menu-automatizacion', 'landing-menu-automatizacion-lista',
  'landing-menu-toggle', 'landing-mobile-nav',
  ...['producto', 'automatizacion', 'entrar'].map((c) => `landing-mobile-link-${c}`),
  ...['terminales', 'cobros', 'alertas', 'contrato', 'selectores'].map((c) => `landing-link-${c}`),
  'landing-cta-bar', 'landing-hero', 'landing-title', 'landing-cta-login', 'landing-cta-automatizacion', 'landing-receipt',
  'landing-producto', 'landing-ejemplo', ...[1, 2, 3, 4, 5].map((n) => `landing-fila-${n}`),
  'landing-automatizacion', 'landing-selectores', 'landing-final', 'landing-cta-final', 'landing-footer',
  ...['producto', 'automatizacion', 'entrar'].map((c) => `landing-footer-${c}`),
];

const REDISENO = [
  ...['operacion', 'analisis', 'admin'].flatMap((g) => [`nav-group-${g}`, `nav-group-${g}-list`]),
  'login-page', 'login-waves',
];

describe('contrato de data-testid (los E2E dependen de esta lista)', () => {
  it('TESTIDS tiene exactamente los ids acordados', () => {
    const esperados = [
      'login-form', 'login-email', 'login-password', 'login-submit', 'login-error', 'app-shell', 'demo-banner', 'nav',
      ...SECTIONS.map((s) => `nav-${s}`),
      'user-name', 'user-role', 'logout-button', 'lang-select', 'theme-toggle', 'home-welcome', 'home-merchant', 'placeholder-page',
      ...TERMINALES,
      ...USUARIOS,
      ...COBRO,
      ...REPORTES,
      ...ALERTAS,
      ...LANDING,
      ...REDISENO,
    ];
    expect(Object.values(TESTIDS).sort()).toEqual([...esperados].sort());
  });
});
