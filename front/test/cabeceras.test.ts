import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import config, { CABECERAS_PREVIEW } from '../vite.config';

const cabecera = (nombre: string): string => CABECERAS_PREVIEW[nombre] ?? '';
const directivas = (): Record<string, string> =>
  Object.fromEntries(
    cabecera('Content-Security-Policy')
      .split(';')
      .map((parte) => parte.trim())
      .filter((parte) => parte !== '')
      .map((parte) => {
        const [nombre = '', ...valores] = parte.split(/\s+/);
        return [nombre, valores.join(' ')];
      }),
  );

describe('cabeceras de seguridad del front compilado (vite preview)', () => {
  it('CSP: todo del mismo origen, sin scripts ni estilos en línea, sin plugins ni marcos', () => {
    const d = directivas();
    expect(d['default-src']).toBe("'self'");
    expect(d['script-src']).toBe("'self'");
    expect(d['style-src']).toBe("'self'");
    expect(d['connect-src']).toBe("'self'");
    expect(d['font-src']).toBe("'self'");
    expect(d['img-src']).toBe("'self' data:");
    expect(d['object-src']).toBe("'none'");
    expect(d['base-uri']).toBe("'self'");
    expect(d['form-action']).toBe("'self'");
    expect(d['frame-ancestors']).toBe("'none'");
  });

  it('la CSP no admite comodines ni «unsafe»', () => {
    expect(cabecera('Content-Security-Policy')).not.toMatch(/unsafe|\*|https?:/);
  });

  it('anti-clickjacking, sin adivinar tipos, referrer mínimo y permisos cerrados', () => {
    expect(cabecera('X-Frame-Options')).toBe('DENY');
    expect(cabecera('X-Content-Type-Options')).toBe('nosniff');
    expect(cabecera('Referrer-Policy')).toBe('no-referrer');
    expect(cabecera('Permissions-Policy')).toMatch(/camera=\(\)/);
    expect(cabecera('Permissions-Policy')).toMatch(/microphone=\(\)/);
    expect(cabecera('Permissions-Policy')).toMatch(/geolocation=\(\)/);
    expect(cabecera('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(cabecera('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('las cabeceras se aplican en preview y NO en dev (una CSP en dev rompe el HMR)', () => {
    expect(config.preview?.headers).toEqual(CABECERAS_PREVIEW);
    expect(config.server?.headers ?? {}).toEqual({});
  });
});

describe('zod bajo la CSP', () => {
  it('arranca en modo jitless: no sondea Function(), que la CSP bloquea y deja una violación en cada carga', async () => {
    await import('../src/zod-sin-eval');
    expect(z.core.globalConfig.jitless).toBe(true);
  });
});
