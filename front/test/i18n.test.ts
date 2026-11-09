import { AUDIT_ACTIONS, ERROR_CODES, ROLES, SECTIONS } from '@pippos/shared';
import { describe, expect, it } from 'vitest';
import { en, es, t } from '../src/i18n';

describe('S12 catálogos de idioma', () => {
  it('es y en tienen exactamente las mismas claves, todas con texto', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const [k, v] of [...Object.entries(es), ...Object.entries(en)]) expect(v.trim(), k).not.toBe('');
  });

  it('hay una clave por código de error, por rol y por sección', () => {
    for (const c of ERROR_CODES) expect(es, `error.${c}`).toHaveProperty(`error.${c}`);
    for (const r of ROLES) expect(es, `role.${r}`).toHaveProperty(`role.${r}`);
    for (const s of SECTIONS) expect(es, `nav.${s}`).toHaveProperty(`nav.${s}`);
    for (const k of ['app.title', 'demo.banner', 'home.welcome', 'placeholder.soon', 'prefs.language', 'prefs.theme', 'logout'])
      expect(es, k).toHaveProperty(k);
  });

  it('R2: claves obligatorias de usuarios, invitación y avisos del login', () => {
    for (const k of ['users.status.invited', 'users.status.active', 'users.status.inactive', 'invitation.done', 'login.passwordChanged', 'login.sessionExpired'])
      expect(es, k).toHaveProperty(k);
    expect([es['users.status.invited'], es['users.status.active'], es['users.status.inactive']]).toEqual(['Invitado', 'Activo', 'Inactivo']);
  });

  it('R3: claves obligatorias de estados, medios, marcas y eventos de transacciones', () => {
    const claves = ['approved', 'declined', 'timeout', 'voided', 'partially_refunded', 'refunded'].map((e) => `tx.status.${e}`)
      .concat(['card', 'wallet'].map((m) => `tx.method.${m}`), ['visa', 'mastercard', 'amex'].map((m) => `tx.brand.${m}`),
        ['created', 'voided', 'refunded'].map((e) => `tx.event.${e}`));
    for (const k of claves) expect(es, k).toHaveProperty(k);
    expect(['approved', 'declined', 'timeout', 'voided', 'partially_refunded', 'refunded'].map((e) => es[`tx.status.${e}` as keyof typeof es]))
      .toEqual(['Aprobada', 'Rechazada', 'Sin respuesta', 'Anulada', 'Devuelta parcialmente', 'Devuelta']);
    expect([es['tx.method.card'], es['tx.method.wallet']]).toEqual(['Tarjeta', 'Billetera']);
  });

  it('R4: claves obligatorias de presets y agrupados de reportes', () => {
    const presets = ['today', '7d', '30d', 'month'].map((k) => `reports.preset.${k}`);
    const grupos = ['day', 'hour', 'terminal', 'cashier', 'method', 'brand'].map((k) => `reports.groupBy.${k}`);
    for (const k of [...presets, ...grupos]) expect(es, k).toHaveProperty(k);
    expect(presets.map((k) => es[k as keyof typeof es])).toEqual(['Hoy', '7 días', '30 días', 'Mes actual']);
    expect(grupos.map((k) => es[k as keyof typeof es])).toEqual(['Día', 'Hora', 'Terminal', 'Cajero', 'Medio de pago', 'Marca']);
  });

  it('t() devuelve el texto del idioma pedido y los idiomas se distinguen', () => {
    expect(t('logout', 'es')).toBe(es.logout);
    expect(t('logout', 'en')).toBe(en.logout);
    expect(t('demo.banner', 'es')).not.toBe(t('demo.banner', 'en'));
  });
  it('R5: claves obligatorias de alertas y auditoría, con sus textos en ES y EN', () => {
    const tipos = ['terminal_offline', 'battery_low', 'void_over_threshold'].map((k) => `alerts.type.${k}`);
    const acciones = AUDIT_ACTIONS.map((a) => `audit.action.${a}`);
    for (const k of [...tipos, ...acciones, 'alerts.resolved', 'alerts.settings.invalid']) {
      expect(es, k).toHaveProperty(k);
      expect(en, k).toHaveProperty(k);
    }
    expect(tipos.map((k) => es[k as keyof typeof es])).toEqual([
      'Terminal {alias} sin conexión', 'Terminal {alias} con batería baja ({batteryPct} %)', 'Anulación del folio {folio} por {amount}',
    ]);
    expect(tipos.map((k) => en[k as keyof typeof en])).toEqual([
      'Terminal {alias} is offline', 'Terminal {alias} low battery ({batteryPct}%)', 'Void of receipt {folio} for {amount}',
    ]);
    expect([es['alerts.resolved'], en['alerts.resolved']]).toEqual(['Resuelta', 'Resolved']);
  });

  it('R9: claves obligatorias de la landing, con ES y EN distintos', () => {
    const claves = ['landing.title', 'landing.cta', 'landing.lead', 'landing.menu.producto', 'landing.menu.automatizacion', 'landing.areas.title', 'landing.auto.title', 'landing.final.title', 'landing.skip'];
    for (const k of claves) {
      expect(es, k).toHaveProperty(k);
      expect(en, k).toHaveProperty(k);
    }
    expect(es['landing.title']).toBe('Toda la operación de tus terminales en un solo panel');
    expect(es['landing.cta']).toBe('Entrar a la demo');
    expect(en['landing.title']).toBe('Your whole terminal operation in a single panel');
    expect(en['landing.cta']).toBe('Enter the demo');
  });
});
