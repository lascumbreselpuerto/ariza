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
| `fuerzas.mjs` | Las tres vías del ensayo de fuerzas: medido, no procede porque la protección va por detección de presencia, o no se incluye por decisión del firmante. Y que el libro nunca se calla que no hubo ensayo |
| `componentes.mjs` | El inventario de lo que hay montado en cada puerta: qué componentes le tocan y de dónde sale cada uno, alta y retirada, marcado automático de la seguridad instalada, y el puente con el expediente en los dos sentidos |
| `tipos.mjs` | Qué forma tiene la puerta: el desplegable afinado, el reconocimiento del tipo escrito a mano y su orden, los peligros, componentes y familia que recibe cada forma, y que un tipo que no se reconoce se diga en vez de callarse |
| `centros.mjs` | El sitio donde están las puertas: que el centro es opcional, que es de un cliente y una puerta no acaba en el sitio de otro, la herencia de la dirección sin pisar lo escrito a mano, los cuatro datos del sitio allí donde el técnico los lee antes de ir, y agrupar las puertas que ya comparten dirección |
| `basico.mjs` | Los flujos de todos los días: buscador de clientes, enlace puerta-cliente, alta de puerta y de cliente, asistencia, asignación, cierre con firma y parte, contrato, etiquetas y búsquedas |
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
- **`basico.mjs` existe por un fallo que encontró David usando la aplicación**: una
  puerta podía quedarse con el nombre del cliente escrito a mano y sin enlazar con
  su ficha, y eso la dejaba fuera del cliente (no salía en su listado, ni en sus
  contratos, ni en su historial) sin que nada lo dijera. Nos habíamos centrado
  tanto en la documentación normativa que la funcionalidad básica no tenía banco
  propio. Ahora lo tiene, y al escribirlo aparecieron dos fallos más: la dirección
  autorrellenada de un cliente equivocado se quedaba pegada al corregirlo, y el
  alta de asistencia no enseñaba el cliente de la puerta elegida.

- **El bloque 10 de `basico.mjs` fija los fallos de la revisión general del
  12-10-2026.** Son fallos que estaban en la aplicación y que el banco no
  detectaba: la próxima revisión no se programaba al cerrar la preventiva, una
  visita de pago se podía cerrar sin horas y desaparecía de «pendiente de
  facturar», un desplegable podía borrar el valor guardado, una foto o un PDF se
  quedaban en el almacén sin fila y aun así se decía «subido», hacer público un
  documento podía dejarlo expuesto si fallaba el cambio de ficha, y la
  periodicidad que el contrato fija para una puerta se guardaba sin leerse nunca.

- **El bloque 11 fija el envío del parte al cliente.** El correo lo manda el
  servidor, así que lo que se puede comprobar aquí es que la aplicación elige el
  mismo correo que él (contacto de la asistencia y, si no hay, la ficha del
  cliente), que el botón solo aparece en visitas cerradas y no anuladas, y que no
  se manda un correo a un cliente de un solo toque. El simulador apunta cada
  envío pedido en `DB.__partes`.

- **El inventario de componentes vive en la PUERTA, no en el expediente.** El
  expediente ya pedía marca, modelo y número de serie de cada elemento, pero esos
  datos se quedaban dentro de él: en el segundo expediente de la misma puerta
  había que teclearlo todo otra vez. Ahora la puerta lleva su inventario y el
  expediente lo trae cuando se le pide. Las dos direcciones del puente se prueban,
  y las dos respetan lo que ya estuviera escrito a mano.

- **`sincronizarSeguridad` se llama DESPUÉS de `cargar()`.** Mira los componentes
  que hay en memoria, así que llamarla antes de recargar la dejaba trabajando con
  la lista vieja y las casillas de seguridad no se marcaban. Hay comprobaciones que
  lo fijan.

- **El ensayo de fuerzas tiene tres vías, y ninguna deja el libro mudo.** Medir
  exige un dinamómetro calibrado que buena parte del sector no tiene, así que la
  aplicación no lo impone: se puede emitir sin ensayo. Lo que no se puede es que el
  documento no lo mencione, porque un libro que calla el ensayo deja suponer que se
  hizo, y eso perjudica a quien firma. Hay comprobaciones que fijan el texto en el
  apartado propio y en las limitaciones, y que la nota va en texto normal, sin
  recuadros de aviso.

- **Un centro es el sitio, y es OPCIONAL.** Un particular con una puerta de
  garaje no necesita ninguno y su puerta funciona exactamente igual que antes de
  que los centros existieran. El centro hace falta cuando un cliente tiene varias
  puertas en el mismo sitio, o cuando hay algo que recordar para entrar. Hay
  comprobaciones de que sin centro no se pinta ningún recuadro del sitio y de que
  la primera opción del desplegable es seguir sin centro.

- **Un centro pertenece a un cliente, y eso se comprueba al guardar.** Una puerta
  no puede acabar colocada en el sitio de otro cliente: si al guardar la puerta el
  centro elegido no es del cliente que queda enlazado, el centro se suelta. Más
  vale una puerta sin centro que una puerta en el sitio equivocado.

- **La dirección del centro baja a la puerta, y lo escrito a mano no se pisa.**
  Mismo criterio que el autorrelleno del cliente, con el mismo `data-auto`: lo que
  puso la aplicación se cambia, lo que escribió el técnico se queda.

- **Los cuatro datos del sitio no son decoración: son lo que el técnico lee antes
  de salir.** Cómo se entra, el horario de acceso, la persona de contacto en el
  sitio y los avisos de seguridad del sitio. Hay comprobaciones de que llegan a la
  tarjeta de trabajo, a la ficha de la puerta y a la hoja de campo impresa, porque
  en una nave puede no haber cobertura. Los avisos de seguridad van separados del
  resto, porque no son un dato más de la lista.

- **Lo que no está en `TABLAS_COPIA` no entra en la copia de seguridad.** Al meter
  los centros se vio que los `componentes` llevaban desde su alta fuera de la
  lista: se habrían perdido el día que hubiera que restaurar. El orden de esa
  lista tampoco es decorativo: es el orden en que el SQL de restauración inserta,
  y una fila no puede apuntar a otra que todavía no esté.

- **Quien decide qué le toca a una puerta NO es la lista de tipos, es
  `formaDePuerta()`.** La lista del desplegable el administrador la cambia en
  Ajustes, y el técnico puede escribir el tipo a mano en obra. Si lo que decide
  los peligros fuera una comparación exacta con la lista, bastaría escribir
  «seccional rápida de lona» para que la puerta se quedara sin peligros. El
  reconocedor es una LISTA ORDENADA, no un objeto, y el orden es lo que hace que
  funcione: «peatonal automática corredera» lleva dentro la palabra «corredera» y
  tiene que reconocerse como peatonal. Si alguien reordena `FORMAS_PUERTA`,
  `tipos.mjs` se pone en rojo.

- **El fallo que destapó esto:** el motor ya sabía tratar rápidas, plegables y
  guillotinas, pero el desplegable no las ofrecía y nadie podía escribirlas de
  forma que se reconocieran. Una puerta rápida se quedaba sin sus peligros
  propios y una guillotina sin su paracaídas, **sin que nada lo dijera**. Ahora,
  cuando un tipo no se reconoce, se dice en pantalla y en el validador.

- **Una peatonal sin lista de peligros NO es un fallo.** Sus peligros están en
  sus comprobaciones de la UNE-EN 16005. Antes caía en la misma rama que el tipo
  desconocido y generaba un aviso falso. Hay una comprobación de que ese aviso no
  sale: un aviso falso enseña a ignorar los avisos de verdad.

- **El informe del Ministerio se cita SIEMPRE con versión y fecha.** Hay nueve
  versiones circulando y la número 8, de septiembre de 2019, sigue apareciendo en
  medio sector. Citarlo «a secas» no dice cuál se ha seguido. Y no se cita en los
  documentos de una puerta peatonal, porque su título no las alcanza: citar un
  papel que no habla de tu producto es peor que no citar ninguno. El bloque B10 de
  `regresion.mjs` lo fija, incluido que conste que la portada del PDF no se ha
  leído directamente (son 32 MB y no se ha podido abrir): la fecha viene de la
  asociación AEPA y de publicaciones del sector.

- **Los siete apartados nuevos de la EN 13241 NO citan ningún apartado concreto.**
  La 13241, la 12604 y la 12453 son de pago y no se ha trabajado sobre su texto.
  Los siete puntos (tropiezo, aprisionamiento, levantar personas, compatibilidad
  electromagnética, durabilidad mecánica, sustancias peligrosas y resistencia al
  viento) recogen peligros que esas normas tratan, pero su enunciado no está
  contrastado, así que van marcados con un asterisco y con su nota al pie, y
  ninguno es imprescindible. El bloque B11 comprueba precisamente eso: que ninguno
  cite un apartado, que ninguno bloquee el documento y que la nota diga que un «no
  conforme» sí es una deficiencia real. Para quitar la marca hay que escribir el
  apartado exacto con el ejemplar de la norma delante y pasar la clave a
  `contrastadas`.

- **El criterio del texto NO es la longitud, es el énfasis.** Los textos de ARIZA
  SAT son amplios y explicativos a propósito. Lo que no puede hacer el apartado del
  ensayo es marcar máxima atención sobre el hecho de no haber medido: nada de
  mayúsculas de alarma, ni llamarlo deficiencia, carencia o incumplimiento. Eso es
  lo que comprueban las pruebas, no cuántos caracteres ocupa.

- **Sin motivo escrito, el párrafo del motivo no se imprime.** No se deja una
  etiqueta «Motivo» vacía esperando a que alguien la rellene. Hay una comprobación.

- **`conFuerzas` del libro mira que la vía sea exactamente «si».** Comparar con
  `!== 'no'` dejaba fuera solo una de las tres vías, de modo que «no procede»
  imprimía el apartado de mediciones vacío. Una comprobación lo fija.

- **Algunas pruebas provocan errores a propósito.** Sustituyen el `insert` de una
  tabla por uno que falla, para comprobar que la aplicación no dice que ha
  guardado lo que no ha guardado. Esos errores llevan el texto «provocado por la
  prueba» y el filtro de errores de JavaScript los descarta. Si se cambia ese
  texto, hay que cambiar también el filtro del final de la suite.

- **Las pruebas que rellenan campos de la puerta cortafuegos usan `rellenarCf`**,
  que escribe, comprueba y reintenta. Esos campos repintan la pantalla al salir
  de cada uno, y rellenarlos de corrido hacía fallar la prueba una vez de cada
  muchas. Una prueba que falla a veces es peor que no tenerla: enseña a ignorar
  los fallos.
