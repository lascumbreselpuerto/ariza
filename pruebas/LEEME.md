# Banco de pruebas de ARIZA SAT

Esta carpeta comprueba, sola y en unos minutos, que la aplicación sigue haciendo lo
que tiene que hacer. Está **dentro del repositorio a propósito**: el 11 de octubre de
2026 se perdió un banco de 733 comprobaciones que vivía en un directorio temporal de
la máquina de trabajo. Lo que está aquí no se pierde, porque está donde está el
`index.html`.

## Cómo se usa

```bash
cd pruebas
./preparar.sh      # consigue el index.html y arranca el servidor local
./todas.sh         # lanza todas las suites
```

Y para una sola:

```bash
./todas.sh regresion
```

Hace falta `python3`, `node` y `playwright`. Si playwright no está, `preparar.sh` lo
dice y se instala con `npm i playwright` dentro de esta carpeta.

## Qué hace `preparar.sh`

1. **Consigue el `index.html` que se va a probar.** Si existe `../index.html`, usa ese,
   que es la copia de trabajo. Si no, lo descarga de `https://arizapa.es/index.html`.
   Con `./preparar.sh --bajar` fuerza la descarga, para comprobar **lo que está
   publicado de verdad**.
2. **Hace una copia para pruebas y le cambia tres cosas, solo en la copia:**
   - el Supabase de internet por `mock-supabase.js`, el simulador local;
   - la librería de QR de internet por `qrcode-local.js`;
   - añade al final una línea que deja las funciones internas a la vista en
     `window.__T`, para poder comprobar la lógica sin simular clics.
3. **Arranca el servidor** en `http://127.0.0.1:8899`.

El `index.html` de producción **no se toca nunca**. La copia de pruebas es
`pruebas/index.html`, que no debe subirse al repositorio.

## Las suites

| Suite | Qué fija |
|---|---|
| `humo.mjs` | Que la aplicación arranca contra el simulador y monta sus pestañas |
| `regresion.mjs` | Lo esencial de las fases 1 a 5, reconstruido: horas facturables, hoja igual a puerta, qué acredita conformidad, marco legal por fecha, régimen de cada familia, perfiles de fuerza sin validar, prioridades, huecos, motor de intervención, conservación del expediente, mantenimiento, salida documental, validación, entregas, firma y estados. Más pantalla y documentos |
| `fase6.mjs` | Apartados 12 a 15: árbol de modificación con segundo nivel, motorización deducida, puertas peatonales, puertas cortafuegos |
| `fase7.mjs` | Apartados 17, 21, 24 y 25: expediente interno frente a documentación de cliente, mantenimiento según uso y entorno, generado frente a entregado, la firma no convierte un pendiente en conforme |

`regresion.mjs` tiene dos partes:

- **Parte A, lógica.** Construye expedientes de mentira y comprueba las funciones
  directamente. Es rápida y no se rompe porque se mueva un botón.
- **Parte B, pantalla y documentos.** Lo que hay que mirar con los ojos: que la
  aplicación arranque, que los pasos estén y que los documentos salgan con sus
  apartados.

## Reglas de la casa

1. **Cada cambio en la aplicación añade comprobaciones.** Si se arregla un fallo que
   David ha encontrado usando la aplicación, va una comprobación que lo fije, para que
   no vuelva.
2. **Una comprobación dice qué fija y por qué importa**, en español, en la misma línea.
   El listado se lee de corrido y se entiende sin mirar el código.
3. **Lo que no está verificado no se da por bueno.** Si un dato normativo no se ha
   podido leer en su fuente oficial, la comprobación fija que la aplicación lo dice,
   no que lo afirma. Por eso hay comprobaciones de que los perfiles de fuerza siguen
   marcados como no validados y de que las periodicidades llevan su procedencia.
4. **Antes de entregar un `index.html`, se pasan todas.** Si algo se pone en rojo por
   un cambio deliberado de criterio, se cambia la comprobación y se deja escrito en el
   comentario por qué cambió.

## Lo que no debe subirse al repositorio

`index.html` (la copia de pruebas), `index-descargado.html`, `node_modules`,
`servidor.log`, `resultado.txt`, `reg.log`. Están en el `.gitignore` de esta carpeta.

## Copias de seguridad

La suite `copias.mjs` comprueba la copia de seguridad de la aplicación de
extremo a extremo: descarga el ZIP de verdad, lo abre, comprueba que el
manifiesto cuadra con los datos, que el SQL de restauración escapa bien los
apóstrofos y los nulos, que los ficheros llegan con su tamaño completo y que
el aviso de copia vieja aparece cuando toca.

Dos cosas que conviene no olvidar:

- **El CRC32 se comprueba contra un valor conocido** (`123456789` → `0xCBF43926`).
  Si alguien toca el generador de ZIP y lo rompe, se nota ahí.
- **Las pruebas que rellenan campos de la puerta cortafuegos usan `rellenarCf`**,
  que escribe, comprueba y reintenta. Esos campos repintan la pantalla al salir
  de cada uno, y rellenarlos de corrido hacía fallar la prueba una vez de cada
  muchas. Una prueba que falla a veces es peor que no tenerla: enseña a ignorar
  los fallos.
