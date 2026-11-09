import { z } from 'zod';

// zod 4 sondea `Function('')` al arrancar para decidir si usa su modo JIT. La CSP del front compilado prohíbe eval
// (script-src 'self'), así que el sondeo deja una violación en la consola en cada carga. Con `jitless` no sondea:
// la validación es la misma, solo cambia el camino interno. Debe importarse antes que cualquier esquema (main.tsx).
z.config({ jitless: true });
