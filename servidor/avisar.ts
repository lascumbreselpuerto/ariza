// ARIZA SAT · avisos por correo
// Lo llama la base de datos cuando entra un aviso nuevo o se asigna a un técnico,
// y una vez por semana para las revisiones que vencen.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ariza-secreto',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ok = (c: unknown, e = 200) =>
  new Response(JSON.stringify(c), { status: e, headers: { ...cors, 'Content-Type': 'application/json' } });

const AMARILLO = '#FCBA1D';
const APP = 'https://arizapa.es/';

/* Los subtipos, para que el aviso al grupo diga «Correctiva (avería) · Garantía»
   y no solo «Correctiva». Desde el 04-11-2026. Si algún día se añaden más en la
   aplicación, aquí hay que añadirlos también: esta función no lee ese catálogo. */
const SUBTIPOS: Record<string, string> = {
  averia: 'Avería', garantia: 'Garantía',
  puerta_automatica: 'Puerta completa automática',
  puerta_manual: 'Puerta completa manual',
  puerta_peatonal: 'Puerta completa peatonal',
  automatismo: 'Automatismo sobre puerta existente',
  normativa: 'Normativa y adecuación',
};
const laVisita = (a: Record<string, unknown>) => {
  const base = TIPOS[String(a.tipo)] || String(a.tipo);
  const s = String(a.subtipo || '').trim();
  return s ? base + ' · ' + (SUBTIPOS[s] || s) : base;
};
/* ---- La toma de medidas de la comercial (05-11-2026) ----
   Los mismos textos que la aplicación, escritos aquí porque esta función no
   comparte código con ella. Si un día se añade una opción en un sitio y no en
   el otro, el grupo recibiría la clave en crudo («por_comprobar») en vez de la
   frase: fea, pero no engaña a nadie, que es lo que importa. */
const SIT_TG: Record<string, string> = {
  hueco: 'hueco vacío, obra nueva',
  manual: 'sustituye a una puerta manual',
  automatica: 'sustituye a una puerta automática',
  otro: 'otra situación, ver notas',
};
const ELEC_TG: Record<string, string> = {
  existe: 'hay acometida',
  llevar: '<b>hay que llevar la acometida</b>',
  por_comprobar: 'acometida por comprobar',
};
/* Los milímetros, enteros: un hueco no mide 4000,5 mm */
const mmTg = (n: unknown) => String(Math.round(Number(n) || 0));
const TIPOS: Record<string, string> = {
  averia: 'Correctiva (avería)', mantenimiento: 'Preventiva (mantenimiento)', comercial: 'Comercial (ofertar)',
  instalacion: 'Instalación', puesta_servicio: 'Puesta en servicio', normativa: 'Normativa y adecuación',
  garantia: 'Garantía', falso: 'Desplazamiento en falso', urgencia: 'Urgencia fuera de horario',
};

function plantilla(titulo: string, lineas: string[][], texto: string, pie: string) {
  const filas = lineas.filter(l => l[1]).map(l =>
    `<tr><td style="padding:6px 14px 6px 0;color:#6B6560;font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;white-space:nowrap;vertical-align:top">${l[0]}</td>
         <td style="padding:6px 0;color:#1C1817;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif">${l[1]}</td></tr>`).join('');
  return `<div style="background:#F4F3F1;padding:24px 12px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E3E0DC">
    <div style="background:#222;padding:16px 20px">
      <span style="color:#fff;font:700 18px -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.02em">ARIZA <span style="color:${AMARILLO}">SAT</span></span>
    </div>
    <div style="padding:20px">
      <h1 style="margin:0 0 4px;font:600 20px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#1C1817">${titulo}</h1>
      ${texto ? `<p style="margin:0 0 14px;font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#45403C">${texto}</p>` : ''}
      <table style="border-collapse:collapse;width:100%">${filas}</table>
      <a href="${APP}" style="display:inline-block;margin-top:18px;background:${AMARILLO};color:#1C1817;text-decoration:none;
         font:600 15px -apple-system,Segoe UI,Roboto,sans-serif;padding:10px 18px;border-radius:6px">Abrir ARIZA SAT</a>
    </div>
    <div style="padding:12px 20px;border-top:1px solid #E3E0DC;color:#8A837D;font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif">${pie}</div>
  </div></div>`;
}

async function enviar(to: string[], subject: string, html: string) {
  const KEY = Deno.env.get('RESEND_API_KEY');
  const DE = Deno.env.get('AVISOS_DE') || 'ARIZA SAT <avisos@arizapa.es>';
  const destinos = [...new Set(to.filter(Boolean))];
  if (!KEY || !destinos.length) return { enviado: false, destinos };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: DE, to: destinos, subject, html }),
  });
  return { enviado: r.ok, destinos, detalle: r.ok ? '' : (await r.text()).slice(0, 300) };
}

/* ============================================================================
   AVISOS AL GRUPO DE TELEGRAM                                     03-11-2026

   POR QUÉ
   David, 03-11-2026: «Cuando se pulsa el botón de He llegado se le podría
   enviar a la oficina un whatsapp o similar e incluso cuando cierre el parte
   otro mensaje. De esta manera no tendrían que enviar un whatsapp al llegar y
   otro al salir al grupo de técnicos, que es lo que deben hacer pero muchas
   veces se les olvida.»

   El dato ya estaba: «He llegado» sella la hora y cerrar el parte sella el
   cierre. Lo que faltaba era que saliera del ordenador de la oficina.

   POR QUÉ TELEGRAM Y NO WHATSAPP
   Decisión de David el 03-11-2026, sobre cuatro opciones. La API oficial de
   WhatsApp no puede escribir en un grupo que ya existe, necesita un número
   dedicado, verificación de Meta y plantillas aprobadas, y cobra por mensaje.
   Los puentes no oficiales sí escriben en el grupo, pero van contra las
   condiciones de WhatsApp y el riesgo es que baneen el número de la empresa,
   que está impreso en las etiquetas QR de todas las puertas y en los contratos.
   Telegram es gratis, el grupo es un grupo de verdad y no hay nada que aprobar.

   DÓNDE VIVE EL TOKEN
   Aquí, en las variables de la función, NUNCA en la aplicación: el index.html
   es público y cualquiera podría escribir en el grupo.
   ============================================================================ */
const escTg = (s: unknown) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* La hora, SIEMPRE en hora de Madrid. La función corre en UTC: sin esto, un
   técnico que llega a las 00:30 saldría llegando «a las 23:30 de ayer». */
const hhmm = (d: unknown) => d
  ? new Date(String(d)).toLocaleTimeString('es-ES',
      { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
  : '';
const diaES = (d: unknown) => d
  ? new Date(String(d)).toLocaleDateString('es-ES',
      { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long' })
  : '';
const num = (n: unknown) => n == null || n === '' ? '' : String(n).replace('.', ',');
/* El dinero, siempre con sus dos decimales: «121 €» en una nota de la que sale
   una factura se lee como un redondeo, y «121,00 €» no. */
const eur = (n: unknown) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';

async function telegram(texto: string) {
  const TOKEN = Deno.env.get('TELEGRAM_TOKEN');
  const CHAT = Deno.env.get('TELEGRAM_CHAT');
  if (!TOKEN || !CHAT) return { telegram: false, detalle: 'sin configurar' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT, text: texto, parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    });
    return { telegram: r.ok, detalle: r.ok ? '' : (await r.text()).slice(0, 300) };
  } catch (e) {
    return { telegram: false, detalle: String(e).slice(0, 300) };
  }
}

/* ---- Un aviso, una vez ----
   Los disparadores de la base pueden llamar aquí más de una vez para el mismo
   hecho (un update que vuelve a pasar por la misma condición, un reintento).
   Un correo repetido se perdona; un grupo que suena tres veces por la misma
   llegada se silencia, y entonces no sirve de nada. Así que cada aviso se
   apunta y el segundo no sale. */
async function yaAvisado(admin: ReturnType<typeof createClient>, clave: string) {
  const { error } = await admin.from('telegram_enviados').insert({ clave });
  // si la clave ya estaba, el insert falla por clave duplicada: ya se avisó
  return !!error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const secreto = Deno.env.get('AVISOS_SECRETO') || '';
    if (!secreto || req.headers.get('x-ariza-secreto') !== secreto) return ok({ error: 'no autorizado' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const ADMIN_MAIL = Deno.env.get('AVISOS_ADMIN') || 'arizapuertasautomaticas@gmail.com';
    const { tipo, aviso_id, contrato_id, jornada_id } = await req.json();

    // ---- Resumen semanal de revisiones ----
    if (tipo === 'revisiones') {
      const hasta = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
      const { data: ptas } = await admin.from('puertas')
        .select('codigo, cliente, direccion, ubicacion, proxima_revision')
        .not('proxima_revision', 'is', null).lte('proxima_revision', hasta)
        .order('proxima_revision');
      if (!ptas || !ptas.length) return ok({ ok: true, nada: true });
      const hoy = new Date().toISOString().slice(0, 10);
      const filas = ptas.map(p => [
        p.proxima_revision + (p.proxima_revision < hoy ? ' · vencida' : ''),
        `<b>${p.codigo || ''}</b> · ${p.cliente || 'Sin cliente'}<br><span style="color:#6B6560">${[p.direccion, p.ubicacion].filter(Boolean).join(' · ')}</span>`,
      ]);
      const r = await enviar([ADMIN_MAIL],
        `Revisiones de esta semana: ${ptas.length} puerta${ptas.length === 1 ? '' : 's'}`,
        plantilla('Revisiones pendientes', filas,
          'Puertas con la próxima revisión vencida o dentro de los próximos ocho días.', 'Resumen semanal automático · ARIZA SAT'));
      return ok({ ok: true, ...r });
    }

    // ---- Contratos de mantenimiento por renovar ----
    if (tipo === 'contratos') {
      const { data: cs } = await admin.from('contratos')
        .select('*, clientes(nombre, telefono, email)')
        .eq('estado', 'activo').not('fecha_vencimiento', 'is', null)
        .lte('fecha_vencimiento', new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10))
        .order('fecha_vencimiento');
      if (!cs || !cs.length) return ok({ ok: true, nada: true });
      const hoy = new Date().toISOString().slice(0, 10);
      // solo los que ya han entrado en su ventana de aviso
      const tocan = cs.filter(c => {
        const d = Math.round((new Date(c.fecha_vencimiento).getTime() - Date.now()) / 86400000);
        return d <= (c.aviso_dias ?? 30);
      });
      if (!tocan.length) return ok({ ok: true, nada: true });
      const filas = tocan.map(c => [
        c.fecha_vencimiento + (c.fecha_vencimiento < hoy ? ' · vencido' : ''),
        `<b>${c.clientes?.nombre || 'Cliente'}</b>${c.referencia ? ' · ' + c.referencia : ''}` +
        `<br><span style="color:#6B6560">${c.precio_anual != null ? c.precio_anual + ' €/año · ' : ''}` +
        `${c.renovacion_auto ? 'se renueva solo' : 'hay que renovarlo a mano'}` +
        `${c.clientes?.telefono ? ' · ' + c.clientes.telefono : ''}</span>`,
      ]);
      const r = await enviar([ADMIN_MAIL],
        `Contratos de mantenimiento: ${tocan.length} por renovar`,
        plantilla('Contratos por renovar', filas,
          'Contratos activos cuyo vencimiento entra dentro del plazo de aviso que les pusiste.',
          'Resumen semanal automático · ARIZA SAT'));
      return ok({ ok: true, ...r });
    }

    // ---- Contrato de mantenimiento al cliente ----
    if (tipo === 'contrato') {
      const { data: k } = await admin.from('contratos')
        .select('*, clientes(nombre, email)').eq('id', contrato_id).maybeSingle();
      if (!k) return ok({ error: 'contrato no encontrado' }, 404);
      const mail = k.clientes?.email;
      if (!mail) return ok({ error: 'el cliente no tiene correo' }, 400);

      const { data: cps } = await admin.from('contrato_puertas')
        .select('cuota_anual, periodicidad_meses, puertas(codigo, tipo, direccion, ubicacion)')
        .eq('contrato_id', k.id);
      const puertas = (cps || []).map((x: any) => {
        const p = x.puertas || {};
        return `<b>${p.codigo || ''}</b> ${p.tipo || ''}<br><span style="color:#6B6560">${[p.direccion, p.ubicacion].filter(Boolean).join(' · ')}</span>`;
      }).join('<br><br>');

      const vigencia = k.a_peticion
        ? 'Sin plazo: revisiones a petición'
        : (k.fecha_vencimiento ? `Del ${k.fecha_alta} al ${k.fecha_vencimiento}` : `Desde ${k.fecha_alta}`);
      const cada = k.periodicidad_meses === 12 ? 'Una revisión al año'
                 : (k.periodicidad_meses === 6 ? 'Dos revisiones al año'
                 : `Una revisión cada ${k.periodicidad_meses} meses`);

      const filas: string[][] = [
        ['Referencia', k.referencia || ''],
        ['Titular', k.clientes?.nombre || ''],
        ['Vigencia', vigencia],
        ['Revisiones', cada],
        ['Puertas', puertas],
        ['Incluye', k.incluye || ''],
        ['No incluye', k.excluye || ''],
      ];
      const clausulas: string[] = Array.isArray(k.clausulas) ? k.clausulas as string[] : [];
      const cuerpo = plantilla(
        `Contrato de mantenimiento ${k.referencia || ''}`, filas,
        'Te adjuntamos las condiciones de tu contrato de mantenimiento. Puedes consultarlo en cualquier momento escaneando el código QR que figura en el documento impreso.',
        'ARIZA puertas automáticas · arizapa.es') +
        (clausulas.length
          ? `<div style="max-width:560px;margin:0 auto;padding:18px 12px;color:#45403C;font:13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif">
               <b style="display:block;margin-bottom:8px;color:#1C1817">Condiciones</b>
               <ol style="padding-left:18px;margin:0">${clausulas.map(t => `<li style="margin-bottom:7px">${t}</li>`).join('')}</ol>
             </div>`
          : '');
      const r = await enviar([mail], `Tu contrato de mantenimiento ${k.referencia || ''}`.trim(), cuerpo);
      return ok({ ok: true, ...r });
    }

    // ---- Avisos ----
    const { data: a } = await admin.from('avisos').select('*').eq('id', aviso_id).maybeSingle();
    if (!a) return ok({ error: 'aviso no encontrado' }, 404);
    const { data: p } = await admin.from('puertas').select('*').eq('id', a.puerta_id).maybeSingle();

    /* ---- Quién, dónde y qué, para los avisos de Telegram (03-11-2026) ----
       El grupo tiene que poder leerse de un vistazo y sin abrir nada: quién ha
       llegado, a casa de quién y a qué puerta. Así que el sitio se busca igual
       que lo hace la aplicación: el centro de la puerta, si lo tiene, y si no
       la dirección escrita en la puerta, y si no la del propio aviso. */
    let nombreCli = (p?.cliente || '').trim();
    const cliId = a.cliente_id || p?.cliente_id || null;
    if (!nombreCli && cliId) {
      const { data: c } = await admin.from('clientes').select('nombre').eq('id', cliId).maybeSingle();
      nombreCli = (c?.nombre || '').trim();
    }
    let donde = '';
    if (p?.centro_id) {
      const { data: ce } = await admin.from('centros')
        .select('nombre, direccion, poblacion').eq('id', p.centro_id).maybeSingle();
      if (ce) donde = [ce.nombre, ce.direccion, ce.poblacion].filter(Boolean).join(' · ');
    }
    if (!donde) donde = [p?.direccion, p?.ubicacion].filter(Boolean).join(' · ');
    if (!donde) donde = (a.direccion_libre || '').trim();
    const quien = (a.tecnico || a.cerrado_por || '').trim() || 'Un técnico';
    const laPuerta = p?.codigo ? `puerta ${p.codigo}` : 'sin puerta concreta';
    const cabecera = (titulo: string) => [
      `<b>${escTg(titulo)}</b> · ${escTg(quien)}`,
      escTg(nombreCli || 'Sin cliente en la ficha'),
      donde ? escTg(donde) : '',
      `${escTg(laVisita(a))} · ${escTg(laPuerta)}`,
    ].filter(Boolean);
    const pieTg = `\n${APP}`;

    /* ---- Ha llegado (03-11-2026) ----
       Lo dispara la base de datos cuando se sella la hora de entrada, que es lo
       que hace el botón «He llegado». Solo va a Telegram: un correo por cada
       llegada sería un correo que nadie abre. */
    if (tipo === 'llegada') {
      if (await yaAvisado(admin, 'llegada:' + a.id)) return ok({ ok: true, repetido: true });
      const r = await telegram([
        ...cabecera('HA LLEGADO'),
        `Hora de entrada: <b>${escTg(hhmm(a.hora_inicio))}</b>`,
        a.fecha_prevista ? `Estaba prevista para el ${escTg(a.fecha_prevista)}` : '',
        a.descripcion ? `Lo que dice el cliente: ${escTg(a.descripcion)}` : '',
      ].filter(Boolean).join('\n') + pieTg);
      return ok({ ok: true, ...r });
    }

    /* ---- Obra sin terminar al final del día (03-11-2026) ----
       Lo que el técnico deja dicho para el día siguiente es lo que la oficina
       necesita para saber qué hay que llevar mañana, y hasta hoy solo lo veía
       quien abriera la asistencia. */
    if (tipo === 'jornada') {
      const { data: j } = await admin.from('jornadas').select('*').eq('id', jornada_id).maybeSingle();
      if (!j) return ok({ error: 'jornada no encontrada' }, 404);
      if (await yaAvisado(admin, 'jornada:' + j.id)) return ok({ ok: true, repetido: true });
      const r = await telegram([
        ...cabecera('OBRA SIN TERMINAR'),
        `Jornada del ${escTg(diaES(j.fecha))}: ` + [
          j.horas != null ? `<b>${escTg(num(j.horas))} h</b>` : '',
          j.num_tecnicos > 1 ? `${j.num_tecnicos} técnicos` : '',
          j.hora_inicio && j.hora_fin ? `de ${escTg(hhmm(j.hora_inicio))} a ${escTg(hhmm(j.hora_fin))}` : '',
        ].filter(Boolean).join(' · '),
        j.trabajo ? `Lo hecho hoy: ${escTg(j.trabajo)}` : '',
        j.proxima ? `<b>Para el día siguiente:</b> ${escTg(j.proxima)}` : 'No ha dejado dicho nada para el día siguiente.',
      ].filter(Boolean).join('\n') + pieTg);
      return ok({ ok: true, ...r });
    }

    /* ---- Parte cerrado (03-11-2026) ----
       Es el mensaje que sustituye al WhatsApp que el técnico tenía que mandar
       al salir. Va aparte del correo del parte a propósito: el correo lleva el
       parte entero para archivarlo, y esto es para leerlo de un vistazo en el
       móvil. Y va con su propio disparador, no colgado del que manda el correo:
       así uno no se lleva al otro por delante si algún día cambia. */
    if (tipo === 'cierre') {
      if (await yaAvisado(admin, 'cierre:' + a.id)) return ok({ ok: true, repetido: true });
      const { data: mats } = await admin.from('materiales')
        .select('descripcion, precio').eq('aviso_id', a.id);
      /* Lo que hay que rematar antes de facturar. Esto no se le dice al cliente
         ni sale en el parte: es trabajo de oficina, y hasta hoy solo se veía si
         alguien entraba en Gestión a mirarlo. */
      const sinPrecio = (mats || []).filter((m: Record<string, unknown>) => m.precio == null);
      const pendientes: string[] = [];
      if (sinPrecio.length)
        pendientes.push(`${sinPrecio.length} material${sinPrecio.length === 1 ? '' : 'es'} sin precio: ` +
          sinPrecio.map((m: Record<string, string>) => m.descripcion).filter(Boolean).join(', ') +
          '. No entra en la factura hasta que se le ponga.');
      const ruta = String(a.ruta || '').trim();
      let nombreRuta = '';
      if (ruta && ruta !== 'km') {
        const { data: t } = await admin.from('tarifas').select('*').eq('id', 1).maybeSingle();
        const tt = (t || {}) as Record<string, unknown>;
        const imp = tt[ruta + '_importe'];
        nombreRuta = String(tt[ruta + '_nombre'] || '').trim() || 'Ruta ' + ruta.slice(-1);
        // la ruta 1 cae al importe fijo de siempre: solo está sin valorar si tampoco lo hay
        const respaldo = ruta === 'ruta1' ? tt.desplazamiento_fijo : null;
        if ((imp == null || imp === '') && (respaldo == null || respaldo === ''))
          pendientes.push(`la ruta ${nombreRuta} no tiene importe puesto en Tarifas: ` +
            'el desplazamiento de esta visita entra a cero euros.');
      }
      /* ---- El cobro y la factura, SIEMPRE los dos (04-11-2026) ----
         David: «Falta en la nota que envía a Telegram en el cierre si se ha
         cobrado o no, y el cómo, y si hay que facturar o no.»
         Antes la línea del cobro solo salía cuando se había cobrado. Y en un
         grupo donde la oficina se fía de lo que lee, que no aparezca nada no
         se entiende como «no se ha cobrado»: se entiende como «no se sabe».
         Así que las dos líneas salen siempre, pase lo que pase.
         Y van separadas a propósito, porque cobrar y facturar son dos cosas
         distintas: lo que se cobra en obra hay que facturarlo igual, y eso ya
         nos dejó una vez visitas cobradas que no facturaba nadie. */
      /* ---- Las medidas de la comercial (05-11-2026) ----
         De una visita comercial lo que espera la oficina es la medida, para
         ponerse a redactar la oferta sin llamar al tecnico. Una linea por
         hueco, igual que hay una linea por puerta en las revisiones. */
      const medFilas: string[] = [];
      if (a.tipo === 'comercial') {
        const { data: meds } = await admin.from('medidas').select('*').eq('aviso_id', a.id).order('orden');
        const lis = (meds || []) as Record<string, unknown>[];
        const variosH = lis.length > 1;
        lis.forEach((m, i) => {
          const et = variosH ? `Hueco ${i + 1}` : 'Hueco';
          if (m.sin_medir) {
            medFilas.push(`${et}: <b>SIN MEDIR</b>. ` +
              escTg(String(m.sin_medir_motivo || 'sin motivo apuntado')) + '. Hay que volver');
            return;
          }
          const trozos = [
            m.ubicacion ? escTg(String(m.ubicacion)) : '',
            m.tipo_puerta ? escTg(String(m.tipo_puerta)) : '',
            (Number(m.ancho_mm) > 0 && Number(m.alto_mm) > 0)
              ? `<b>${escTg(mmTg(m.ancho_mm))} x ${escTg(mmTg(m.alto_mm))} mm</b>` : '',
          ].filter(Boolean).join(' · ');
          medFilas.push(`${et}: ${trozos || 'sin datos'}`);
          const extra = [
            (m.dintel_mm != null && m.dintel_mm !== '') ? `dintel ${mmTg(m.dintel_mm)} mm` : '',
            (m.lateral_mm != null && m.lateral_mm !== '') ? `lateral ${mmTg(m.lateral_mm)} mm` : '',
            m.situacion ? SIT_TG[String(m.situacion)] || String(m.situacion) : '',
            m.electricidad ? ELEC_TG[String(m.electricidad)] || String(m.electricidad) : '',
          ].filter(Boolean).join(' · ');
          if (extra) medFilas.push('  ' + escTg(extra));
          if (m.auxiliares) medFilas.push('  Auxiliares: ' + escTg(String(m.auxiliares)));
          if (m.notas) medFilas.push('  Notas: ' + escTg(String(m.notas)));
        });
        if (!lis.length) medFilas.push('<b>Visita comercial cerrada sin ninguna medida apuntada.</b>');
      }
      const cobro = a.cobrado
        ? 'Cobro: <b>cobrado en obra</b>, ' + escTg(eur(a.cobro_importe)) +
          (a.cobro_forma ? ' en ' + escTg(a.cobro_forma) : '') +
          (a.cobro_ref ? ' (' + escTg(a.cobro_ref) + ')' : '')
        : 'Cobro: <b>no se ha cobrado en obra</b>';
      /* Por qué NO se factura, cuando no se factura. Dos motivos distintos:
         el que marcó el técnico a mano, y el que viene del tipo de visita. */
      /* La garantía es subtipo desde el 04-11-2026, pero el histórico la tiene
         como tipo. Se miran las dos, igual que en la base de datos. */
      const porTipo = (a.tipo === 'garantia' || a.subtipo === 'garantia') ? 'es una visita de garantía'
                    : (a.tipo === 'comercial' ? 'es una visita comercial, para ofertar' : '');
      const facturar = a.sin_cargo
        ? 'Facturar: <b>NO</b>. ' + escTg(a.sin_cargo_motivo || 'marcada como que no se cobra')
        : (porTipo
            ? 'Facturar: <b>NO</b>, ' + porTipo
            : (a.cobrado
                ? 'Facturar: <b>SÍ</b>. Hay que facturarla igual, aunque esté cobrada'
                : 'Facturar: <b>SÍ</b>. Queda pendiente de facturar'));
      const r = await telegram([
        ...cabecera('PARTE CERRADO'),
        [
          a.hora_inicio && a.hora_fin ? `De ${escTg(hhmm(a.hora_inicio))} a ${escTg(hhmm(a.hora_fin))}` : '',
          a.horas != null ? `<b>${escTg(num(a.horas))} h</b>` : '',
          a.num_tecnicos > 1 ? `${a.num_tecnicos} técnicos` : '',
        ].filter(Boolean).join(' · '),
        ruta ? `Desplazamiento: ${escTg(ruta === 'km'
          ? (a.desplazamiento != null ? num(a.desplazamiento) + ' km' : 'por kilómetros')
          : nombreRuta)}` : '',
        a.trabajo ? `Trabajo: ${escTg(a.trabajo)}` : '',
        medFilas.length ? medFilas.join('\n') : '',
        a.firma_ruta
          ? `Firmado por ${escTg(a.firma_nombre || 'el cliente')}`
          : `<b>Sin firma del cliente.</b> ${escTg(a.firma_sin || '')}`,
        cobro,
        facturar,
        a.pendiente ? `<b>QUEDA PENDIENTE:</b> ${escTg(a.pendiente_texto || 'sí')}` : '',
        pendientes.length
          ? '<b>A rematar en oficina:</b>\n' + pendientes.map(x => '· ' + escTg(x)).join('\n')
          : '',
      ].filter(Boolean).join('\n') + pieTg);
      return ok({ ok: true, ...r });
    }

    const contacto = [a.contacto_nombre, a.contacto_telefono, a.contacto_email].filter(Boolean).join(' · ') || a.contacto || '';
    const tel = (a.contacto_telefono || '').replace(/\s/g, '');
    const filas: string[][] = [
      ['Puerta', `<b>${p?.codigo || ''}</b> · ${p?.tipo || ''} ${p?.marca || ''} ${p?.modelo || ''}`],
      ['Cliente', p?.cliente || ''],
      ['Dirección', [p?.direccion, p?.ubicacion].filter(Boolean).join(' · ')],
      ['Tipo', laVisita(a)],
      ['Lo que dice', a.descripcion || ''],
      ['Contacto', tel ? `${a.contacto_nombre || ''} · <a href="tel:${tel}" style="color:#1C1817">${a.contacto_telefono}</a>${a.contacto_email ? ' · ' + a.contacto_email : ''}` : contacto],
      ['Visita prevista', a.fecha_prevista || ''],
    ];

    /* ---- Visita cerrada: parte completo ----
       Dos entradas al mismo sitio:
         · tipo 'cerrado': lo dispara la base de datos al cerrar la visita. Manda el
           parte a la oficina y, si el técnico marcó la casilla, copia al cliente.
         · tipo 'parte':   lo pide la oficina desde la aplicación, con enviar_parte.
           Manda SOLO la copia del cliente, y no mira la casilla: si se pide, se
           manda. Sirve para enviarlo después o para repetirlo si no llegó. */
    if (tipo === 'cerrado' || tipo === 'parte') {
      const { data: mats } = await admin.from('materiales').select('*').eq('aviso_id', a.id).order('creado');
      const material = (mats || []).map(m => `${m.descripcion} · ${m.cantidad} ${m.unidad || ''}`).join('<br>');
      /* ---- El resumen del guión, UNA POR PUERTA (04-11-2026) ----
         Desde hoy una preventiva puede llevar varias puertas y cada una deja su
         propia revisión. Antes se traía una sola con .limit(1), así que en una
         visita de cuatro puertas el correo contaba la primera y callaba las
         otras tres: tres puertas revisadas que no constaban en ninguna parte. */
      const { data: revs } = await admin.from('revisiones').select('*').eq('aviso_id', a.id);
      const revFilas: string[][] = [];
      const nombreRes: Record<string, string> = { apta: 'Apta para el servicio', reservas: 'Apta con reservas', no_apta: 'NO APTA' };
      const varias = (revs || []).length > 1;
      for (const rev of (revs || [])) {
        let cual = '';
        if (rev.puerta_id) {
          const { data: pr } = await admin.from('puertas').select('codigo').eq('id', rev.puerta_id).maybeSingle();
          cual = pr?.codigo ? String(pr.codigo) : '';
        }
        const et = (t: string) => varias ? `${t} · ${cual || rev.tipo_puerta || ''}` : t;
        const malos = (rev.puntos || []).filter((x: Record<string, unknown>) => x.r === 'mal');
        revFilas.push([et('Revisión'), `${rev.tipo_puerta || ''} · ${nombreRes[rev.resultado] || 'Apta'}`]);
        if (rev.riesgo) revFilas.push([et('Atención'), '<b style="color:#B3271E">Riesgo para las personas: procede dejarla fuera de servicio</b>']);
        revFilas.push([et('No conformes'), malos.length
          ? malos.map((x: Record<string, string>) => '· ' + x.t + (x.nota ? ' (' + x.nota + ')' : '')).join('<br>')
          : 'Ninguno']);
        const medidos = (rev.puntos || []).filter((x: Record<string, unknown>) => x.v != null);
        if (medidos.length) revFilas.push([et('Valores medidos'),
          medidos.map((x: Record<string, string>) => x.t + ': <b>' + x.v + '</b>').join('<br>')]);
        if (rev.recomendaciones) revFilas.push([et('Recomendaciones'), rev.recomendaciones]);
      }
      const cierre: string[][] = [
        ...filas,
        ...revFilas,
        ['Diagnóstico', a.diagnostico || ''],
        ['Trabajo realizado', a.trabajo || ''],
        ['Materiales', material],
        ['Tiempo', [a.horas != null ? a.horas + ' h' : '', a.num_tecnicos > 1 ? a.num_tecnicos + ' técnicos' : '',
                    a.desplazamiento != null ? a.desplazamiento + ' km' : ''].filter(Boolean).join(' · ')],
        ['Cómo queda', a.estado_final || ''],
        ['Pendiente', a.pendiente ? (a.pendiente_texto || 'Sí') : ''],
        ['Cobro', a.cobrado ? `${a.cobro_importe || 0} € · ${a.cobro_forma || ''}${a.cobro_ref ? ' · ' + a.cobro_ref : ''}` : 'No se ha cobrado en obra'],
        ['Firma', a.firma_ruta ? ('Firmado por ' + (a.firma_nombre || 'el cliente')) : ('Sin firma. ' + (a.firma_sin || ''))],
        ['Cerró la visita', a.cerrado_por || ''],
      ];
      /* El correo del cliente: primero el contacto de esta asistencia y, si no hay,
         el de su ficha. Antes solo se miraba contacto_email, de modo que cuando el
         correo estaba en la ficha del cliente la aplicación ofrecía mandarle el
         parte y no salía nada. Es el mismo orden que usa la casilla en la app. */
      let mailCli = (a.contacto_email || '').trim();
      if (!mailCli) {
        const cid = a.cliente_id || p?.cliente_id || null;
        if (cid) {
          const { data: c } = await admin.from('clientes').select('email').eq('id', cid).maybeSingle();
          mailCli = (c?.email || '').trim();
        }
      }
      const copiaCliente = () => enviar([mailCli],
        `Parte de asistencia · ${p?.codigo || 'Ariza Puertas'}`,
        plantilla('Parte de la visita', cierre.filter(l => !['Cobro', 'Cerró la visita'].includes(l[0])),
          'Gracias por confiar en Ariza Puertas y Automatismos. Este es el resumen de la visita.',
          'Si algo no cuadra, responde a este correo.'));

      // La oficina pide la copia del cliente y nada más
      if (tipo === 'parte') {
        if (!mailCli) return ok({ error: 'no hay ningún correo al que mandarlo' }, 400);
        const rc = await copiaCliente();
        if (rc.enviado) {
          await admin.from('avisos')
            .update({ enviado_cliente: true, parte_enviado_el: new Date().toISOString() })
            .eq('id', a.id);
        }
        return ok({ ok: true, ...rc });
      }

      const asunto = `Visita cerrada · ${laVisita(a)} · ${p?.codigo || ''} ${p?.cliente || ''}`;
      const cuerpo = plantilla('Parte de asistencia', cierre,
        `${a.cerrado_por || 'El técnico'} ha cerrado la visita${a.pendiente ? '. <b>Queda algo pendiente.</b>' : '.'}`,
        'Parte generado por ARIZA SAT');
      const r = await enviar([ADMIN_MAIL], asunto, cuerpo);
      // copia al cliente, si el técnico lo marcó al cerrar
      if (a.enviado_cliente && mailCli) {
        const rc = await copiaCliente();
        if (rc.enviado) {
          await admin.from('avisos')
            .update({ parte_enviado_el: new Date().toISOString() })
            .eq('id', a.id);
        }
      }
      return ok({ ok: true, ...r, copiaCliente: a.enviado_cliente ? (mailCli || 'sin correo') : 'no pedida' });
    }

    if (tipo === 'asignado') {
      let mailTec = '';
      if (a.tecnico_id) {
        const { data: u } = await admin.auth.admin.getUserById(a.tecnico_id);
        mailTec = u?.user?.email || '';
      }
      const r = await enviar([mailTec, ADMIN_MAIL],
        `Trabajo asignado · ${p?.codigo || ''} · ${p?.cliente || ''}`,
        plantilla('Tienes un trabajo asignado', filas,
          `Se te ha asignado ${(TIPOS[a.tipo] || 'un aviso').toLowerCase()} en ${p?.cliente || 'un cliente'}.`,
          'Lo tienes también en la app, en «Mis avisos».'));
      return ok({ ok: true, ...r });
    }

    const comercial = a.tipo === 'comercial';
    const r = await enviar([ADMIN_MAIL],
      (comercial ? 'Piden presupuesto · ' : 'Aviso de avería · ') + (p?.codigo || '') + ' · ' + (p?.cliente || ''),
      plantilla(comercial ? 'Petición de presupuesto' : 'Aviso de avería', filas,
        comercial
          ? 'Un cliente ha pedido oferta escaneando el QR de esta puerta. Conviene llamarle hoy.'
          : 'Un cliente ha dado un aviso escaneando el QR de esta puerta.',
        'Entró por la etiqueta QR · ARIZA SAT'));
    return ok({ ok: true, ...r });
  } catch (e) {
    return ok({ error: String(e) }, 500);
  }
});
