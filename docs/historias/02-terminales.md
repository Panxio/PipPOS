# Terminales

Con los datos de demo hay tres terminales del comercio «Boliche La Noche»: dos activas y una inactiva. Solo administración y supervisión ven la sección; escribir (crear, editar, activar, importar) es cosa del administrador.

### Encontrar un terminal en la lista
**Nivel:** fácil

**Como** supervisor, **quiero** buscar, filtrar y ordenar los terminales **para** encontrar uno rápido y ver su estado.

- **Dado** la lista de terminales, **cuando** escribo parte del serial o del alias (sin importar mayúsculas), **entonces** veo solo los que coinciden; la sucursal no participa en la búsqueda.
- **Dado** la lista, **cuando** filtro por estado activo o inactivo, **entonces** veo solo los de ese estado y el total refleja el filtro.
- **Dado** que cambio el orden (serial, alias, sucursal o fecha de alta, ascendente o descendente), **cuando** se recarga la lista, **entonces** las filas siguen ese orden y la paginación vuelve a la primera página.
- **Dado** más de 20 terminales, **cuando** recorro las páginas, **entonces** cada página trae hasta 20 filas y los botones de anterior y siguiente se deshabilitan en los extremos.
- **Dado** un filtro sin coincidencias, **cuando** se aplica, **entonces** la lista muestra el estado vacío y no un error.
- **Dado** un cajero, **cuando** mira su menú, **entonces** no tiene la sección de terminales.

**Fuera de alcance:** búsqueda por sucursal o por modelo, y ordenar por más de una columna a la vez.

### Alta, edición y desactivación
**Nivel:** media

**Como** administrador, **quiero** dar de alta, editar y desactivar terminales **para** mantener al día el parque de equipos.

- **Dado** el formulario de alta, **cuando** envío serial, alias, modelo, sucursal y caja válidos, **entonces** el terminal aparece en la lista, activo, y el total sube en uno.
- **Dado** un serial con espacios o en minúsculas, **cuando** lo envío, **entonces** se guarda sin espacios y en mayúsculas; un serial de menos de 6 o más de 20 caracteres, o con símbolos distintos de letras, números y guion, se rechaza con un error de validación.
- **Dado** un serial que ya existe (aunque lo escriba distinto en mayúsculas), **cuando** intento crearlo, **entonces** veo un error, el formulario sigue abierto y no se crea nada.
- **Dado** un terminal, **cuando** edito alias, sucursal o caja, **entonces** el detalle y la lista muestran los valores nuevos; el serial no se puede editar.
- **Dado** un terminal activo, **cuando** pido desactivarlo, **entonces** la app pide confirmación; si cancelo, el estado no cambia; si acepto, queda inactivo también tras recargar la página. Activar un terminal inactivo no pide confirmación.
- **Dado** un terminal inactivo, **cuando** alguien intenta cobrar con él, **entonces** el cobro se rechaza con un conflicto.
- **Dado** un supervisor, **cuando** intenta escribir (por la pantalla o directo por la API), **entonces** no hay controles para hacerlo y la API responde «prohibido».

**Fuera de alcance:** eliminar terminales (solo se desactivan) y editar el modelo.

### Importar terminales desde un CSV
**Nivel:** difícil

**Como** administrador, **quiero** cargar muchos terminales de una vez desde un archivo CSV **para** no darlos de alta uno por uno.

- **Dado** un CSV con la cabecera exacta `serial,alias,model,branch,till`, **cuando** lo importo, **entonces** se crean las filas válidas y el resultado informa cuántas se crearon.
- **Dado** un CSV mezclado, **cuando** lo importo, **entonces** las filas inválidas no detienen a las demás y el resultado las lista con el número de línea del archivo (la cabecera es la línea 1) y el motivo: serial inválido, serial repetido (contra la base o contra una fila anterior aceptada del mismo archivo), campo faltante, campo demasiado largo o valor inseguro.
- **Dado** un valor de texto que empieza con `=`, `+`, `-` o `@`, **cuando** lo importo, **entonces** esa fila se rechaza como valor inseguro (evita fórmulas de hoja de cálculo).
- **Dado** valores entre comillas con comas dentro y fines de línea CRLF, **cuando** los importo, **entonces** se leen como un solo campo y se crean bien.
- **Dado** un archivo sin la cabecera exacta o con más de 500 filas de datos, **cuando** lo importo, **entonces** se rechaza completo con un error de validación y no se crea nada.
- **Dado** una importación terminada, **cuando** vuelvo a la lista, **entonces** el total y las filas ya incluyen los terminales creados y puedo importar otro archivo enseguida.
- **Dado** un supervisor, **cuando** intenta importar, **entonces** no tiene el control y la API responde «prohibido».

**Fuera de alcance:** importar otros formatos (Excel, JSON) y deshacer una importación.
