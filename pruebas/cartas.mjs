// ================================================================
// Cartas de presentación del envío a revisión + cuestionario común.
//
// Para qué: mandar los documentos que emite ARIZA SAT a quien pueda
// revisarlos (asociaciones del sector, Administración, laboratorio) y
// recibir respuestas que se puedan cargar en la aplicación.
//
// El cuestionario va NUMERADO y es el mismo para todos, para poder
// cruzar respuestas: si AEPA y el laboratorio contestan distinto a la
// pregunta 4, se ve de un vistazo.
//
// Los datos de contacto de cada destinatario están comprobados en sus
// webs el 19-10-2026 y se citan en la propia carta. Lo que no se ha
// podido comprobar se deja en blanco para rellenar a mano, en vez de
// inventarlo.
//
//   Uso:  ./preparar.sh && node cartas.mjs [carpeta-de-salida]
// ================================================================
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = process.argv[2] || join(AQUI, 'revision');
mkdirSync(SALIDA, { recursive: true });

const EMPRESA = {
  razon:'Ariza Puertas y Automatismos S.L.U.', nif:'B72004849',
  dir:'Calle Orilla 19, 11500 El Puerto de Santa María (Cádiz)',
  tel:'661 352 795', mail:'arizapuertasautomaticas@gmail.com',
  firmante:'David Ariza Arana', cargo:'Administrador único',
};
const FECHA = 'El Puerto de Santa María, a 19 de octubre de 2026';

const ESTILO = `
@page{size:A4;margin:18mm 18mm 16mm}
*{box-sizing:border-box}
body{font:11.5px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,sans-serif;color:#1C1817;margin:0}
.cab{display:flex;justify-content:space-between;align-items:flex-start;
  border-bottom:3px solid #1C1817;padding-bottom:8px;margin-bottom:14px}
.marca{font-weight:800;font-size:15px;letter-spacing:-.01em}
.marca span{color:#C98F08}
.emisor{font-size:10px;color:#6B6560;line-height:1.45;text-align:right}
h1{font-size:16px;margin:0 0 3px}
h2{font-size:12.5px;margin:16px 0 6px;border-bottom:2px solid #FCBA1D;padding-bottom:3px}
h3{font-size:11.5px;margin:12px 0 4px}
p{margin:0 0 8px}
ul,ol{margin:0 0 8px;padding-left:20px}
li{margin:0 0 4px}
.dest{background:#F3F2F0;border-left:3px solid #1C1817;padding:8px 11px;margin:0 0 14px;font-size:11px}
.dest b{display:block;font-size:12px;margin-bottom:2px}
.asunto{font-weight:700;margin:0 0 12px}
.caja{border:1px solid #d8d4d0;border-radius:5px;padding:9px 12px;margin:0 0 10px;background:#FAF9F8}
.ojo{background:#FCEFD3;border-left:3px solid #9A6206;padding:8px 11px;margin:0 0 10px;font-size:11px}
table{width:100%;border-collapse:collapse;margin:0 0 10px;font-size:10.5px}
th,td{border:1px solid #d8d4d0;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#F3F2F0;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em}
.firma{margin-top:22px}
.firma .linea{margin-top:34px;border-top:1px solid #1C1817;width:62mm;padding-top:3px;font-size:10px;color:#6B6560}
.pie{margin-top:16px;border-top:1px solid #d8d4d0;padding-top:6px;font-size:9.5px;color:#6B6560}
.q{border:1px solid #d8d4d0;border-radius:5px;margin:0 0 9px;overflow:hidden;page-break-inside:avoid}
.q .n{background:#1C1817;color:#fff;font-weight:700;font-size:10px;padding:3px 8px;display:inline-block;
  border-radius:0 0 5px 0}
.q .cuerpo{padding:7px 11px 9px}
.q .tema{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#6B6560;margin:0 0 3px}
.q .pregunta{font-weight:600;margin:0 0 5px}
.q .nuestro{font-size:10.5px;color:#3A3532;margin:0 0 5px}
.q .resp{border-top:1px dashed #c9c2ba;margin-top:7px;padding-top:5px;font-size:9.5px;color:#9A9089}
.mini{font-size:10px;color:#6B6560}
`;

const marco = (titulo, cuerpo) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${titulo}</title><style>${ESTILO}</style></head><body>
<div class="cab">
  <div><div class="marca">ARIZA <span>puertas automáticas</span></div><h1>${titulo}</h1></div>
  <div class="emisor">${EMPRESA.razon}<br>NIF ${EMPRESA.nif}<br>${EMPRESA.dir}<br>${EMPRESA.tel} · ${EMPRESA.mail}</div>
</div>
${cuerpo}
<div class="pie">${EMPRESA.razon} · NIF ${EMPRESA.nif} · ${EMPRESA.dir} · ${EMPRESA.tel} · ${EMPRESA.mail}</div>
</body></html>`;

const firma = `<div class="firma"><p>Atentamente,</p>
  <div class="linea">${EMPRESA.firmante} · ${EMPRESA.cargo}<br>${EMPRESA.razon}</div></div>`;

/* ================================================================
   El cuestionario. Es el mismo para todos y va numerado: así se
   pueden cruzar respuestas de distintas fuentes sobre la misma
   pregunta. Cada una dice qué tenemos cargado hoy, para que quien
   responda corrija en vez de empezar de cero.
   ================================================================ */
const PREGUNTAS = [
  { tema:'Matriz de protección · UNE-EN 12453',
    p:'¿Es correcta la tabla que cruza el modo de accionamiento con el tipo de usuario, y los niveles de protección que exige cada combinación?',
    n:'La aplicación tiene cargada una matriz de trabajo con cuatro modos de accionamiento (hombre presente, impulso con el hueco a la vista, impulso sin verlo y funcionamiento automático) y tres tipos de usuario (personas informadas en uso privado, informadas en uso público y no informadas). Está marcada como PENDIENTE DE VALIDAR y así se dice en pantalla y en los documentos: sirve de recordatorio y no acredita cumplimiento. Lo que necesitamos es confirmar, combinación por combinación, qué protección exige la norma.' },

  { tema:'Ensayo de fuerzas · UNE-EN 12453, anexos A.2.1 y A.2.2',
    p:'¿Son correctos los límites y los puntos de medida que aplicamos, y la forma de decidir cuál toca en cada puerta?',
    n:'Aplicamos el límite por el eje de movimiento y la abertura: 400 N con carácter general y 1.400 N solo donde la norma lo admite por la abertura, con el caso de la superficie plana de más de 0,1 m² y ninguna dimensión lateral menor de 100 mm. Td máximo 0,75 s, 150 N tras la fase dinámica, bajando de 25 N antes de 5 s en total. Los puntos y las aberturas de ensayo los tomamos por forma de puerta, y cambian cuando la altura pasa de 2.800 mm. Tres lecturas por punto y se anota la mayor.' },

  { tema:'Maniobra manual · UNE-EN 12453',
    p:'¿Cuál es el apartado exacto de la norma del que salen las fuerzas de maniobra manual, y son correctos los valores?',
    n:'Tenemos cargados 150 N en condiciones normales y 225 N en emergencia para garaje en área privada, y 260 N y 390 N por persona en industrial o comercial. El apartado del que salen lo tenemos anotado como pendiente: querríamos citarlo correctamente en nuestros documentos.' },

  { tema:'Puertas peatonales automáticas · UNE-EN 16005',
    p:'¿Qué fuerzas, tiempos y puntos de medida hay que aplicar a una puerta peatonal automática, y dónde está la frontera con la UNE-EN 12453?',
    n:'En la aplicación, las peatonales quedan expresamente FUERA de la matriz de la 12453 y se remiten a la 16005, pero su perfil de fuerzas no está cargado porque no disponemos del texto de la norma. Hoy, en esos puntos, la aplicación da el método de medida y dice que el límite no está cargado, y manda medir y anotar igualmente.' },

  { tema:'Separaciones y velocidades · UNE-EN 12604 y UNE-EN 12453',
    p:'¿Qué valores hay que aplicar a la separación entre la hoja y los elementos fijos, a la separación entre paneles para evitar el atrapamiento de dedos, y a la velocidad máxima de cierre?',
    n:'Son tres de los seis límites que la aplicación tiene deliberadamente sin cargar. En esos puntos del chequeo del técnico aparece el método de medida y un aviso de que el límite no está puesto. No los hemos rellenado de memoria a propósito.' },

  { tema:'Tiempos en peatonales · UNE-EN 16005',
    p:'¿Cuál es el tiempo mínimo de mantenimiento en abierto de una puerta peatonal automática y cómo se mide?',
    n:'Es otro de los seis límites sin cargar.' },

  { tema:'Puertas cortafuegos',
    p:'¿Cuál es el tiempo máximo admisible de cierre de una puerta resistente al fuego y de qué documento sale?',
    n:'Es el último de los seis límites sin cargar. En esta familia la aplicación no aplica la matriz de protección: avisa de que sus elementos salen de su propia norma.' },

  { tema:'UNE-EN 13241 · comprobaciones',
    p:'¿Son correctos los siete puntos de comprobación que aplicamos a la familia industrial, comercial y de garaje, y de qué apartados de la norma salen?',
    n:'Los tenemos en la aplicación marcados como pendientes de contrastar con el texto de la norma. Son los que aparecen en el informe de situación y en el libro del expediente.' },

  { tema:'Modificación sustancial · informe del Ministerio v9',
    p:'Aplicando los criterios del informe, ¿cuáles de estas intervenciones convierten al instalador en fabricante de la máquina: motorizar una puerta manual existente, sustituir el cuadro de maniobra por otro de tipo distinto, sustituir muelles o cables, o añadir seguridades sin tocar la lógica del cuadro?',
    n:'La aplicación distingue hoy cuatro situaciones: puerta nueva ensamblada por nosotros, puerta nueva de kit completo, adecuación a normativa y motorización o modificación sustancial. De esa elección depende qué documento sale y quién responde. El caso 14 del envío es precisamente una motorización.' },

  { tema:'Autocertificación en microempresa',
    p:'Cuando ensamblamos una puerta combinando componentes de varios proveedores y emitimos declaración de prestaciones, declaración de conformidad y marcado CE propios, ¿qué documentación mínima debe conservar la empresa y durante cuánto tiempo?',
    n:'Los documentos 01, 02, 03 y 18 del envío son nuestra respuesta actual a esa pregunta: libro del expediente, etiqueta de marcado CE, documentación técnica específica y control de producción en fábrica.' },

  { tema:'Marco legal aplicable',
    p:'Para una puerta puesta en servicio en los meses anteriores y posteriores al 20 de enero de 2027, ¿qué marco se aplica y qué pasa con las puertas que queden a caballo?',
    n:'La aplicación calcula el marco por la fecha de puesta en servicio, no por la de la firma, y avisa cuando falta esa fecha porque sin ella no puede decidir.' },

  { tema:'Documentación de cliente',
    p:'¿Falta algún documento en lo que entregamos al titular, o sobra alguno que no debería salir de la empresa?',
    n:'Entregamos instrucciones de uso y de desbloqueo de emergencia, libro de mantenimiento, la declaración que corresponda y el acta de entrega. El expediente técnico lo conservamos y no se entrega. Los documentos 05, 06 y 15 del envío son lo que ve el cliente.' },

  { tema:'Mantenimiento',
    p:'¿Son razonables las periodicidades de mantenimiento que proponemos según uso y entorno, y qué debe quedar registrado en el libro después de cada visita?',
    n:'La aplicación propone la periodicidad según el uso y el entorno de la puerta, y permite fijar otra por contrato o por puerta. El documento 05 es el libro de mantenimiento tal y como lo emitimos.' },

  { tema:'Puertas no conformes',
    p:'Cuando una puerta existente no cumple y el titular no autoriza la adecuación, ¿cuál es la forma correcta de dejarlo documentado sin asumir una responsabilidad que no nos corresponde?',
    n:'Hoy emitimos informe de situación con las deficiencias y su prioridad, y propuesta de actuaciones valorada. El documento no se titula como conforme y lo dice expresamente. Son los documentos 07 y 08 del envío.' },
];

const bloqueQ = (q, i) => `<div class="q"><span class="n">${String(i+1).padStart(2,'0')}</span>
  <div class="cuerpo">
    <p class="tema">${q.tema}</p>
    <p class="pregunta">${q.p}</p>
    <p class="nuestro"><b>Lo que tenemos hoy:</b> ${q.n}</p>
    <p class="resp">Respuesta:</p>
  </div></div>`;

const CUESTIONARIO = marco('Cuestionario técnico para revisión', `
<p class="asunto">Catorce preguntas sobre la documentación de puertas automáticas que emite Ariza Puertas y Automatismos S.L.U.</p>
<div class="ojo"><b>Cómo usarlo.</b> Las preguntas van numeradas y son las mismas para todos los destinatarios del envío,
de modo que podamos cruzar las respuestas. No hace falta contestarlas todas: con señalar el número y responder lo que
corresponda a su ámbito es suficiente. Cada pregunta dice qué tiene cargado hoy nuestra aplicación, para que se pueda
corregir en vez de empezar de cero.</div>
<div class="caja"><b>Por qué preguntamos esto y no otra cosa.</b> La aplicación con la que trabajamos tiene una regla:
el método de medida se escribe siempre, y los límites solo se cargan cuando se han leído del texto de la norma.
Lo que no está leído aparece en pantalla y en los documentos como «no cargado», y aun así se manda medir y anotar.
Estas catorce preguntas son, exactamente, lo que hoy está sin cargar o sin contrastar.</div>
${PREGUNTAS.map(bloqueQ).join('')}
<div class="caja"><b>Una última, abierta:</b> ¿hay algo en los documentos del envío que, tal y como está redactado,
pueda inducir a error al titular de la puerta o a un tercero? Es lo que más nos preocupa y lo que menos podemos
ver nosotros desde dentro.</div>
${firma}
`);

/* ================================================================
   Las cartas
   ================================================================ */
const COMUN_ENVIO = `
<h2>Qué le mandamos</h2>
<p>Veinte documentos en PDF, generados por nuestra propia aplicación de campo con <b>datos de ejemplo</b>.
No corresponden a ninguna puerta real: cada uno lleva impreso un aviso que lo dice. Son exactamente los
documentos que entregamos o conservamos, no una maqueta hecha para la ocasión.</p>
<table>
  <thead><tr><th style="width:30%">Caso de ejemplo</th><th>Documentos</th></tr></thead>
  <tbody>
    <tr><td><b>Puerta nueva ensamblada por nosotros</b><br><span class="mini">Seccional de garaje. Somos fabricante y autocertificamos.</span></td>
        <td>01 libro del expediente · 02 etiqueta de marcado CE · 03 documentación técnica específica ·
            04 hoja de campo · 05 libro de mantenimiento · 06 acta de entrega y recepción</td></tr>
    <tr><td><b>Adecuación de puerta existente</b><br><span class="mini">Corredera industrial con deficiencias.</span></td>
        <td>07 informe de situación y deficiencias · 08 propuesta de actuaciones · 09 libro de la adecuación</td></tr>
    <tr><td><b>Peatonal automática</b><br><span class="mini">En recorrido de evacuación.</span></td>
        <td>10 informe · 11 libro del expediente</td></tr>
    <tr><td><b>Resistente al fuego</b><br><span class="mini">Con un componente sustituido.</span></td>
        <td>12 informe · 13 libro del expediente</td></tr>
    <tr><td><b>Motorización de puerta manual</b><br><span class="mini">Modificación sustancial.</span></td>
        <td>14 libro del expediente</td></tr>
    <tr><td><b>Documentos de uso diario</b></td>
        <td>15 y 16 vida de la puerta (para el titular y para uso interno) · 17 etiquetas con QR ·
            18 control de producción en fábrica · 19 parte de trabajo · 20 contrato de mantenimiento</td></tr>
  </tbody>
</table>
<p>Va también un documento <b>00</b> que explica qué es cada uno y a quién se entrega, y el
<b>cuestionario técnico</b> con catorce preguntas numeradas.</p>`;

const CARTAS = [
  { fichero:'A1-carta-AEMIPA',
    titulo:'Solicitud de revisión técnica de documentación',
    dest:`<b>AEMIPA · Asociación Española de Mantenedores e Instaladores de Puertas Automáticas</b>
      aemipa@aemipa.es · 910 111 007<br>
      <span class="mini">Datos tomados de aemipa.es el 19-10-2026. Dirección postal: pendiente de confirmar con la asociación.</span>`,
    cuerpo:`
<p class="asunto">Asunto: revisión de la documentación técnica que emitimos, como empresa asociada.</p>
<p>Somos una empresa asociada dedicada a la instalación, el mantenimiento, la reparación y la adecuación a
normativa de puertas automáticas, con más de veinticinco años de oficio y estructura de microempresa.</p>
<p>Hemos puesto en orden toda nuestra documentación técnica y la emitimos ahora desde una aplicación propia.
Antes de seguir usándola con clientes queremos que alguien de fuera la mire, y nos parece que el primer sitio
donde preguntar es la asociación a la que pertenecemos.</p>
${COMUN_ENVIO}
<h2>Qué le pedimos</h2>
<p>Dos cosas distintas:</p>
<ol>
  <li><b>Una lectura práctica de los documentos:</b> si falta algo de lo que hay que entregar, si sobra algo que
      no debería salir de la empresa, y si el lenguaje es el que el sector usa y entiende.</li>
  <li><b>Respuesta al cuestionario adjunto,</b> al menos a las preguntas que entren en el ámbito de la asociación.
      Son los puntos que hoy tenemos deliberadamente sin cargar en la aplicación porque no los hemos leído del
      texto de la norma, y no queremos rellenarlos de memoria.</li>
</ol>
<p>Si la asociación tiene un cauce establecido para este tipo de consultas, o si procede trasladar alguna de las
preguntas a FIMPA o al comité técnico correspondiente, le agradeceríamos que nos lo indicara.</p>
<p>Quedamos a su disposición para ampliar cualquier punto, enviar los ficheros en otro formato o mantener una
conversación técnica si lo ven útil.</p>
${firma}` },

  { fichero:'A2-carta-AEPA',
    titulo:'Solicitud de revisión técnica de documentación',
    dest:`<b>AEPA · Asociación Empresarial de Puertas Manuales y Automáticas</b>
      Plaza de Santa Ana, 8 – 2º · 28012 Madrid<br>info@aepa.ws · 91 429 31 02<br>
      <span class="mini">Datos tomados de aepa.ws el 19-10-2026.</span>`,
    cuerpo:`
<p class="asunto">Asunto: revisión de la documentación técnica que emite una empresa instaladora y mantenedora.</p>
<p>Nos dirigimos a ustedes por su trabajo de difusión normativa y por sus guías sobre el marcado CE de puertas
industriales, comerciales y de garaje y de puertas peatonales automáticas, que seguimos y usamos.</p>
<p>Somos una empresa pequeña de instalación, mantenimiento y adecuación de puertas automáticas. Hemos
reconstruido toda nuestra documentación técnica y la emitimos desde una aplicación propia. Queremos que la
revise alguien ajeno a la casa antes de seguir usándola.</p>
${COMUN_ENVIO}
<h2>Qué le pedimos</h2>
<ol>
  <li><b>Que nos digan si los documentos sostienen lo que dicen sostener.</b> En particular, si el libro del
      expediente de una puerta ensamblada por nosotros respalda de verdad la autocertificación, y si el informe
      de situación de una puerta no conforme deja las responsabilidades donde corresponde.</li>
  <li><b>Respuesta al cuestionario adjunto</b> en lo que entre en su ámbito. Las preguntas 09, 10 y 11 tocan
      directamente los criterios del informe del Ministerio sobre marcado CE y modificación sustancial, del que
      ustedes publicaron el análisis en su día.</li>
</ol>
<p>Somos conscientes de que no estamos asociados a AEPA. Si el servicio de consultas técnicas está reservado a
sus asociados, díganoslo sin problema y, si procede, indíquenos las condiciones de asociación.</p>
${firma}` },

  { fichero:'A3-carta-Ministerio-de-Industria',
    titulo:'Consulta sobre marcado CE y modificación sustancial de puertas',
    dest:`<b>Ministerio de Industria y Turismo</b><br>
      Dirección General de Estrategia Industrial y de la Pequeña y Mediana Empresa (DIR3 E04934602)<br>
      Subdirección General de Calidad y Seguridad Industrial<br>
      Paseo de la Castellana 160, 28046 Madrid · 91 349 46 40<br>
      <span class="mini">Esta consulta NO se manda por correo electrónico: el Ministerio no publica buzón para esto.
      Se presenta en el Registro de Consultas y Comunicaciones SGCSI,
      industria.serviciosmin.gob.es/consultasSGCSI, eligiendo el tema «Seguridad de productos e instalaciones».
      No hace falta certificado digital. Comprobado el 20-10-2026.</span>`,
    cuerpo:`
<p class="asunto">Asunto: consulta sobre la aplicación del informe de requisitos de marcado CE, instalación y
modificación de puertas industriales, comerciales, de garaje, portones y barreras (versión 9, de 14 de febrero
de 2024), a los casos concretos que se describen.</p>
<p>Ariza Puertas y Automatismos S.L.U. es una microempresa dedicada a la instalación, el mantenimiento y la
adecuación a normativa de puertas automáticas. En parte de nuestros trabajos ensamblamos puertas combinando
componentes de distintos proveedores, de modo que asumimos la condición de fabricante y autocertificamos.</p>
<p>Hemos tomado como referencia el informe citado, que anula y sustituye al informe 8 de septiembre de 2019, y
hemos construido con él nuestra documentación técnica. Al aplicarlo a casos reales nos quedan dudas de
interpretación que preferimos resolver preguntando antes que decidiendo por nuestra cuenta.</p>
${COMUN_ENVIO}
<h2>Sobre qué consultamos</h2>
<p>Las preguntas van numeradas en el cuestionario adjunto. Las que corresponden a esta consulta son:</p>
<ul>
  <li><b>09. Modificación sustancial.</b> Qué intervenciones convierten al instalador en fabricante de la
      máquina: motorizar una puerta manual existente, sustituir el cuadro de maniobra por otro de tipo distinto,
      sustituir muelles o cables, o añadir dispositivos de seguridad sin modificar la lógica de mando.</li>
  <li><b>10. Autocertificación.</b> Documentación mínima que debe reunir y conservar quien ensambla una puerta
      con componentes de varios proveedores, y durante cuánto tiempo.</li>
  <li><b>11. Marco aplicable.</b> Tratamiento de las puertas puestas en servicio en los meses anteriores y
      posteriores al 20 de enero de 2027, fecha de aplicación del Reglamento (UE) 2023/1230.</li>
</ul>
<div class="caja"><b>Para qué queremos la respuesta.</b> No se trata de una consulta académica: de la respuesta
depende qué documento emitimos en cada intervención y quién responde de la puerta a partir de ese momento.
Hoy nuestra aplicación distingue cuatro situaciones (puerta nueva ensamblada, puerta nueva de kit completo,
adecuación a normativa, y motorización o modificación sustancial) y emite un documento distinto en cada una.
Los ejemplos adjuntos enseñan exactamente qué sale en cada caso.</div>
<p>Si la consulta corresponde a otra unidad, o si procede dirigirla al órgano competente de la comunidad
autónoma por tratarse de vigilancia de mercado, agradeceríamos que se nos indicara.</p>
<div class="caja"><b>Cómo se presenta esta consulta.</b> Por el Registro de Consultas y Comunicaciones SGCSI
(industria.serviciosmin.gob.es/consultasSGCSI), tema «Seguridad de productos e instalaciones». El formulario
admite 4.000 caracteres de texto y adjuntos en PDF de hasta 10 MB cada uno: esta carta y los documentos del
envío van como adjuntos, y el texto del formulario es el resumen que se acompaña aparte.</div>
${firma}` },

  { fichero:'A4-carta-laboratorio-u-organismo-de-control',
    titulo:'Petición de revisión del ensayo de fuerzas y presupuesto de contraste',
    dest:`<b>Destinatario:</b> _______________________________________________<br>
      <span class="mini">Laboratorio de ensayo u organismo de control. Antes de enviarla, confirmar que su alcance
      acreditado cubre los ensayos de fuerzas de maniobra de puertas (UNE-EN 12453 y UNE-EN 12445) y, si procede,
      puertas peatonales automáticas (UNE-EN 16005). Candidatos a consultar por su actividad en ensayo de puertas:
      Tecnalia (organismo notificado 1292 y laboratorio acreditado por ENAC), Applus+, DEKRA y Bureau Veritas.
      Comprobado el 19-10-2026; su alcance concreto para estas normas está por confirmar con cada uno.</span>`,
    cuerpo:`
<p class="asunto">Asunto: revisión del método de ensayo de fuerzas que aplicamos en obra y presupuesto para un
ensayo de contraste.</p>
<p>Somos una empresa instaladora y mantenedora de puertas automáticas. Medimos fuerzas de maniobra en obra con
dinamómetro y anotamos los resultados en el expediente de cada puerta. Queremos que un laboratorio revise el
método que aplicamos y, si procede, contrastarlo con un ensayo suyo.</p>
<h2>Qué aplicamos hoy</h2>
<ul>
  <li><b>Límite por el eje de movimiento y la abertura,</b> no por una apreciación de si la puerta puede
      aplastar o no. Con carácter general, 400 N; 1.400 N solo donde la norma lo admite por la abertura.</li>
  <li><b>Superficie plana de más de 0,1 m²</b> y sin ninguna dimensión lateral menor de 100 mm como único caso
      que eleva el tope.</li>
  <li><b>Fases:</b> Td máximo de 0,75 s, 150 N tras la fase dinámica y por debajo de 25 N antes de 5 s en total.</li>
  <li><b>Puntos y aberturas de ensayo por forma de puerta,</b> con variación cuando la altura supera los
      2.800 mm. Tres lecturas por punto, se anota la mayor, y queda registrada la configuración de la puerta
      durante el ensayo.</li>
</ul>
<div class="ojo">Estos valores los tenemos contrastados con el ejemplar de la norma que maneja la empresa. Lo que
pedimos es una revisión independiente, porque un error aquí se propaga a todas las puertas que certificamos.</div>
${COMUN_ENVIO}
<h2>Qué le pedimos</h2>
<ol>
  <li><b>Revisión del método</b>, en particular de las preguntas 02 y 03 del cuestionario adjunto: límites,
      puntos de medida, aberturas, número de lecturas y fases.</li>
  <li><b>Las preguntas 04, 05, 06 y 07,</b> que son los valores que hoy tenemos sin cargar porque no disponemos
      del texto de esas normas: puertas peatonales, separaciones, velocidad de cierre y tiempo de cierre de
      puertas resistentes al fuego.</li>
  <li><b>Presupuesto de un ensayo de contraste</b> sobre una puerta de nuestras instalaciones, con su
      instrumento y el nuestro, y del calibrado periódico de nuestro dinamómetro.</li>
</ol>
<p>Los documentos 04 (hoja de campo) y 01 (libro del expediente) del envío enseñan cómo recogemos y cómo
documentamos las medidas.</p>
${firma}` },
];

/* ================================================================
   A PDF
   ================================================================ */
const nav = await chromium.launch({ args:['--lang=es-ES'] });
const ctx = await nav.newContext({ locale:'es-ES' });
const pag = await ctx.newPage();
const pdf = async (fichero, html) => {
  const tmp = resolve(SALIDA, fichero+'.html');
  writeFileSync(tmp, html, 'utf8');
  await pag.goto('file://'+tmp);
  await pag.waitForTimeout(300);
  await pag.pdf({ path: join(SALIDA, fichero+'.pdf'), format:'A4', printBackground:true });
  console.log('  OK  '+fichero+'.pdf');
};

for (const c of CARTAS)
  await pdf(c.fichero, marco(c.titulo,
    `<div class="dest">${c.dest}</div><p class="mini">${FECHA}</p>${c.cuerpo}`));
await pdf('A5-cuestionario-tecnico', CUESTIONARIO);

await nav.close();
console.log('\nCartas y cuestionario generados en '+SALIDA);
