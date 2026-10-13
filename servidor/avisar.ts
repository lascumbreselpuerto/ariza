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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const secreto = Deno.env.get('AVISOS_SECRETO') || '';
    if (!secreto || req.headers.get('x-ariza-secreto') !== secreto) return ok({ error: 'no autorizado' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const ADMIN_MAIL = Deno.env.get('AVISOS_ADMIN') || 'arizapuertasautomaticas@gmail.com';
    const { tipo, aviso_id, contrato_id } = await req.json();

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

    const contacto = [a.contacto_nombre, a.contacto_telefono, a.contacto_email].filter(Boolean).join(' · ') || a.contacto || '';
    const tel = (a.contacto_telefono || '').replace(/\s/g, '');
    const filas: string[][] = [
      ['Puerta', `<b>${p?.codigo || ''}</b> · ${p?.tipo || ''} ${p?.marca || ''} ${p?.modelo || ''}`],
      ['Cliente', p?.cliente || ''],
      ['Dirección', [p?.direccion, p?.ubicacion].filter(Boolean).join(' · ')],
      ['Tipo', TIPOS[a.tipo] || a.tipo],
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
      // si fue una revisión periódica, el resumen del guión
      const { data: rev } = await admin.from('revisiones').select('*').eq('aviso_id', a.id).limit(1).maybeSingle();
      const revFilas: string[][] = [];
      if (rev) {
        const malos = (rev.puntos || []).filter((x: Record<string, unknown>) => x.r === 'mal');
        const nombreRes: Record<string, string> = { apta: 'Apta para el servicio', reservas: 'Apta con reservas', no_apta: 'NO APTA' };
        revFilas.push(['Revisión', `${rev.tipo_puerta || ''} · ${nombreRes[rev.resultado] || 'Apta'}`]);
        if (rev.riesgo) revFilas.push(['Atención', '<b style="color:#B3271E">Riesgo para las personas: procede dejarla fuera de servicio</b>']);
        revFilas.push(['No conformes', malos.length
          ? malos.map((x: Record<string, string>) => '· ' + x.t + (x.nota ? ' (' + x.nota + ')' : '')).join('<br>')
          : 'Ninguno']);
        const medidos = (rev.puntos || []).filter((x: Record<string, unknown>) => x.v != null);
        if (medidos.length) revFilas.push(['Valores medidos',
          medidos.map((x: Record<string, string>) => x.t + ': <b>' + x.v + '</b>').join('<br>')]);
        if (rev.recomendaciones) revFilas.push(['Recomendaciones', rev.recomendaciones]);
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

      const asunto = `Visita cerrada · ${TIPOS[a.tipo] || a.tipo} · ${p?.codigo || ''} ${p?.cliente || ''}`;
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
