import { describe, expect, it } from 'vitest';
import { type FilaAuditoria, auditoriaACsv } from '../src/domain/auditoria';
import { celdaCsv } from '../src/domain/reporte';

const CABECERA = 'seq,atMs,actorId,actorName,action,entityType,entityId,detail\r\n';
const fila = (over: Partial<FilaAuditoria> = {}): FilaAuditoria => ({
  seq: 7, atMs: 1_700_000_000_000, actorId: 'u1', actorName: 'Ana', action: 'terminal.created', entityType: 'terminal',
  entityId: 't1', detail: {}, ...over,
});

describe('celdaCsv (A10: se reutiliza la de aCsv)', () => {
  it('antepone «\'» a lo que empieza con =, +, -, @, tab o retorno', () => {
    expect(celdaCsv('=1+1')).toBe("'=1+1");
    expect(celdaCsv('+1')).toBe("'+1");
    expect(celdaCsv('-1')).toBe("'-1");
    expect(celdaCsv('@x')).toBe("'@x");
    expect(celdaCsv('\tx')).toBe("'\tx");
    expect(celdaCsv('\rx')).toBe('"\'\rx"');
  });
  it('entrecomilla lo que trae coma, comilla o salto de línea, y deja lo demás', () => {
    expect(celdaCsv('a,b')).toBe('"a,b"');
    expect(celdaCsv('di "hola"')).toBe('"di ""hola"""');
    expect(celdaCsv('a\nb')).toBe('"a\nb"');
    expect(celdaCsv('normal')).toBe('normal');
    expect(celdaCsv('')).toBe('');
  });
});

describe('auditoriaACsv (A10)', () => {
  it('sin filas: solo la cabecera con su \\r\\n', () => {
    expect(auditoriaACsv([])).toBe(CABECERA);
  });
  it('una fila: columnas en orden, detail como JSON compacto entrecomillado, \\r\\n al final', () => {
    expect(auditoriaACsv([fila({ detail: { a: '1', b: '2' } })])).toBe(
      `${CABECERA}7,1700000000000,u1,Ana,terminal.created,terminal,t1,"{""a"":""1"",""b"":""2""}"\r\n`,
    );
  });
  it('detail vacío sale como {} y los nulos como celda vacía', () => {
    expect(auditoriaACsv([fila({ actorId: null, entityId: null })])).toBe(`${CABECERA}7,1700000000000,,Ana,terminal.created,terminal,,{}\r\n`);
  });
  it('aplica el antídoto de inyección al nombre del actor y a los ids, no a las columnas numéricas', () => {
    const csv = auditoriaACsv([fila({ actorName: '=HYPERLINK("http://x","y")', actorId: '@u', entityId: '-t' })]);
    expect(csv).toBe(`${CABECERA}7,1700000000000,'@u,"'=HYPERLINK(""http://x"",""y"")",terminal.created,terminal,'-t,{}\r\n`);
  });
  it('conserva el orden recibido y cierra cada línea con \\r\\n', () => {
    const csv = auditoriaACsv([fila({ seq: 9 }), fila({ seq: 8 })]);
    expect(csv.split('\r\n')).toEqual([CABECERA.trimEnd(), expect.stringMatching(/^9,/), expect.stringMatching(/^8,/), '']);
  });
});
