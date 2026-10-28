/* ================================================================
   Simulador de Supabase para el banco de pruebas de ARIZA SAT.
   Reconstruido el 10-10-2026 después de que el entorno se reciclara.

   No pretende imitar Postgres: imita exactamente lo que la aplicación
   le pide. Una base de datos en memoria por pestaña, un constructor de
   consultas con los métodos que la aplicación encadena, almacenamiento
   de ficheros en memoria y los procedimientos (RPC) que la aplicación
   llama de verdad.
   ================================================================ */

let n = 0;
const id = () => 'id-' + (++n).toString().padStart(6, '0');
const ahora = () => new Date().toISOString();

/* ---- Semilla ---- */
function semilla(){
  const cliente = {
    id: id(), nombre: 'Comunidad Las Flores', nif: 'H11223344',
    direccion: 'Avenida de la Bajamar 14, 11500 El Puerto de Santa María',
    telefono: '600 000 001', email: 'presidencia@lasflores.es',
    contrato: false, archivado: false, creado: ahora(),
  };
  const cliente2 = {
    id: id(), nombre: 'Talleres Guadalete', nif: 'B11556677',
    direccion: 'Polígono El Palmar, nave 7, 11500 El Puerto de Santa María',
    telefono: '600 000 002', email: 'taller@guadalete.es',
    contrato: true, archivado: false, creado: ahora(),
  };
  const puerta = {
    id: id(), codigo: 'AR-0001', cliente_id: cliente.id, cliente: cliente.nombre,
    direccion: cliente.direccion, ubicacion: 'Rampa de garaje',
    tipo: 'Corredera', marca: 'Erreka', modelo: 'Rino 4',
    estado: 'ok', token: 'tok-0001', creado: ahora(),
  };
  const puerta2 = {
    id: id(), codigo: 'AR-0002', cliente_id: cliente2.id, cliente: cliente2.nombre,
    direccion: cliente2.direccion, ubicacion: 'Muelle 2',
    tipo: 'Seccional', marca: 'Hörmann', modelo: 'SPU F42',
    estado: 'ok', token: 'tok-0002', creado: ahora(),
  };
  const perfil = {
    id: 'usuario-admin', nombre: 'David Ariza Arana',
    rol: 'admin', activo: true, creado: ahora(),
  };
  return {
    clientes: [cliente, cliente2],
    puertas: [puerta, puerta2],
    perfiles: [perfil],
    etiquetas: [
      { codigo:'AR-0001', token:'tok-0001', creado: ahora() },
      { codigo:'AR-0002', token:'tok-0002', creado: ahora() },
      { codigo:'AR-0003', token:'tok-0003', creado: ahora() },
    ],
    avisos: [],
    ajustes: [],
    contratos: [],
    contrato_puertas: [],
    tarifas: [{
      id: id(), hora_tecnico: 38, hora_equipo: 62, desplazamiento: 25,
      minimo_horas: 1, margen_material: 35, kilometro: 0.45,
    }],
    catalogo: [],
    valoraciones: [],
    expedientes: [],
    expediente_fotos: [],
    expediente_docs: [],
    materiales: [],
    documentos: [],
    fotos: [],
    articulos: [],
    movimientos: [],
    revisiones: [],
    componentes: [],
    centros: [],
    partes: [],
    lineas_parte: [],
    historico: [],
    ubicaciones: [{ id:'ubi-nave', nombre:'Nave', tipo:'nave', activo:true, creado: ahora() }],
    presupuestos: [],
    presupuesto_lineas: [],
    textos_presu: [],
    contactos: [],
    presupuesto_envios: [],
    presupuesto_visitas: [],
    presupuesto_adjuntos: [],
    proveedores: [],
    conjuntos: [],
    conjunto_lineas: [],
    jornadas: [],
    entregas_obra: [],
    aviso_puertas: [],
    movimientos_material: [],
    materiales_previstos: [],
  };
}

function existenciasCalculadas(){
  const suma = {};
  (DB.movimientos_material || []).forEach(m => {
    const n = Number(m.cantidad || 0);
    if (m.hasta){ const k = m.articulo_id+'|'+m.hasta; suma[k] = (suma[k] || 0) + n; }
    if (m.desde){ const k = m.articulo_id+'|'+m.desde; suma[k] = (suma[k] || 0) - n; }
  });
  return Object.keys(suma).filter(k => suma[k] !== 0).map(k => ({
    articulo_id: k.split('|')[0], ubicacion_id: k.split('|')[1], cantidad: suma[k] }));
}

const DB = semilla();

/* Los ajustes de arranque llegan desde la prueba, como en el entorno real
   llegan de la tabla «ajustes». */
if (typeof window !== 'undefined' && window.__AJUSTES)
  Object.entries(window.__AJUSTES).forEach(([clave, valor]) =>
    DB.ajustes.push({ clave, valor, actualizado: ahora() }));

/* Cada prueba puede retocar la semilla antes de que arranque la aplicación. */
if (typeof window !== 'undefined' && typeof window.__PARCHE === 'function')
  window.__PARCHE(DB);

if (typeof window !== 'undefined') window.__DB = DB;

/* ---- Utilidades ---- */
const clonar = x => (x === undefined || x === null) ? x : JSON.parse(JSON.stringify(x));
const tabla = t => (DB[t] = DB[t] || []);

/* Constructor de consultas. Es «thenable»: al esperarlo resuelve {data,error}. */
class Consulta {
  constructor(t){
    this.t = t; this.op = 'select'; this.filtros = []; this.ord = null;
    this.lim = null; this.payload = null; this.devolver = false;
    this.uno = false; this.conflicto = null; this.contar = false;
  }
  /* --- operaciones --- */
  select(cols, opciones){
    if (this.op === 'select') this.cols = cols || '*';
    else this.devolver = true;
    if (opciones && opciones.count) this.contar = true;
    return this;
  }
  insert(o){ this.op = 'insert'; this.payload = o; return this; }
  update(o){ this.op = 'update'; this.payload = o; return this; }
  upsert(o, opciones){
    this.op = 'upsert'; this.payload = o;
    this.conflicto = (opciones && opciones.onConflict) || 'id';
    return this;
  }
  delete(){ this.op = 'delete'; return this; }
  /* --- filtros --- */
  eq(c, v){ this.filtros.push(x => String(x[c]) === String(v)); return this; }
  neq(c, v){ this.filtros.push(x => String(x[c]) !== String(v)); return this; }
  is(c, v){ this.filtros.push(x => (v === null ? (x[c] === null || x[c] === undefined) : x[c] === v)); return this; }
  not(c, op, v){ this.filtros.push(x => !(op === 'is' ? (x[c] === null || x[c] === undefined) : String(x[c]) === String(v))); return this; }
  in(c, arr){ this.filtros.push(x => arr.map(String).indexOf(String(x[c])) >= 0); return this; }
  gte(c, v){ this.filtros.push(x => x[c] >= v); return this; }
  lte(c, v){ this.filtros.push(x => x[c] <= v); return this; }
  gt(c, v){ this.filtros.push(x => x[c] > v); return this; }
  lt(c, v){ this.filtros.push(x => x[c] < v); return this; }
  like(c, v){ const r = new RegExp(String(v).replace(/%/g,'.*'), 'i'); this.filtros.push(x => r.test(x[c]||'')); return this; }
  ilike(c, v){ return this.like(c, v); }
  or(expr){
    /* Solo lo que usa la aplicación: "campo.eq.valor,campo2.eq.valor" */
    const partes = String(expr).split(',').map(p => p.split('.'));
    this.filtros.push(x => partes.some(([c, op, v]) =>
      op === 'eq' ? String(x[c]) === String(v) : op === 'is' ? (x[c] === null || x[c] === undefined) : false));
    return this;
  }
  order(c, o){ this.ord = { c, asc: !(o && o.ascending === false) }; return this; }
  limit(k){ this.lim = k; return this; }
  range(a, b){ this.desde = a; this.lim = (b - a + 1); return this; }
  single(){ this.uno = 'estricto'; return this; }
  maybeSingle(){ this.uno = 'quizas'; return this; }
  /* --- ejecución --- */
  _filas(){
    /* «existencias_material» no es una tabla: en Postgres es una vista que suma
       los movimientos. Aquí se calcula igual, para que el banco pruebe lo mismo
       que ocurre de verdad y no un número guardado a mano. */
    let f = this.t === 'existencias_material' ? existenciasCalculadas() : tabla(this.t);
    this.filtros.forEach(fn => { f = f.filter(fn); });
    return f;
  }
  _ejecutar(){
    const t = tabla(this.t);
    let data = null;
    try {
      if (this.op === 'select'){
        let f = this._filas().slice();
        if (this.ord) f.sort((a, b) => {
          const x = a[this.ord.c], y = b[this.ord.c];
          const r = (x === y) ? 0 : ((x === null || x === undefined) ? -1 :
                     (y === null || y === undefined) ? 1 : (x > y ? 1 : -1));
          return this.ord.asc ? r : -r;
        });
        if (this.desde) f = f.slice(this.desde);
        if (this.lim !== null) f = f.slice(0, this.lim);
        data = clonar(f);
      }
      else if (this.op === 'insert'){
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
        const nuevas = arr.map(o => Object.assign({ id: id(), creado: ahora() }, clonar(o)));
        nuevas.forEach(x => t.push(x));
        data = clonar(nuevas);
      }
      else if (this.op === 'update'){
        const f = this._filas();
        f.forEach(x => Object.assign(x, clonar(this.payload)));
        data = clonar(f);
      }
      else if (this.op === 'upsert'){
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
        const claves = String(this.conflicto).split(',').map(s => s.trim());
        const hechas = [];
        arr.forEach(o => {
          const ya = t.find(x => claves.every(k => String(x[k]) === String(o[k])));
          if (ya){ Object.assign(ya, clonar(o)); hechas.push(ya); }
          else { const nueva = Object.assign({ id: id(), creado: ahora() }, clonar(o));
                 t.push(nueva); hechas.push(nueva); }
        });
        data = clonar(hechas);
      }
      else if (this.op === 'delete'){
        const f = this._filas();
        f.forEach(x => { const i = t.indexOf(x); if (i >= 0) t.splice(i, 1); });
        data = clonar(f);
      }
    } catch(err){
      return { data:null, error:{ message: err.message } };
    }
    if (this.uno){
      const uno = Array.isArray(data) ? (data[0] || null) : data;
      if (this.uno === 'estricto' && !uno)
        return { data:null, error:{ message:'No se ha encontrado la fila' } };
      return { data: uno, error:null, count: Array.isArray(data) ? data.length : (data?1:0) };
    }
    if (this.op !== 'select' && !this.devolver) return { data:null, error:null };
    return { data, error:null, count: Array.isArray(data) ? data.length : 0 };
  }
  then(resolver, rechazar){
    try { return Promise.resolve(this._ejecutar()).then(resolver, rechazar); }
    catch(err){ return Promise.resolve({ data:null, error:{ message:err.message } }).then(resolver); }
  }
  catch(fn){ return this.then(x => x).catch(fn); }
  finally(fn){ return this.then(x => x).finally(fn); }
}

/* ---- Almacenamiento de ficheros ---- */
const FICHEROS = new Map();   // bucket/ruta -> { blob, tipo }
const PNG_VACIO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'+
                  'AAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
function almacen(bucket){
  return {
    async upload(ruta, blob, opciones){
      FICHEROS.set(bucket + '/' + ruta, { blob, tipo: (opciones||{}).contentType || '' });
      return { data:{ path: ruta }, error:null };
    },
    async remove(rutas){
      (rutas||[]).forEach(r => FICHEROS.delete(bucket + '/' + r));
      return { data:[], error:null };
    },
    async download(ruta){
      const x = FICHEROS.get(bucket + '/' + ruta);
      return x ? { data: x.blob, error:null }
               : { data:null, error:{ message:'No existe el fichero' } };
    },
    /* Listado por carpeta, como el de verdad: las carpetas vienen con id y
       metadata a null, y los ficheros con su tamaño. */
    async list(prefijo, opciones){
      const pre = prefijo ? String(prefijo).replace(/^\/+|\/+$/g, '') : '';
      const raiz = pre ? pre + '/' : '';
      const vistos = new Map();
      for (const clave of FICHEROS.keys()){
        if (!clave.startsWith(bucket + '/')) continue;
        const ruta = clave.slice(bucket.length + 1);
        if (raiz && !ruta.startsWith(raiz)) continue;
        const resto = ruta.slice(raiz.length);
        if (!resto) continue;
        const corte = resto.indexOf('/');
        if (corte < 0){
          const x = FICHEROS.get(clave);
          let tam = 0;
          try { tam = (x.blob && x.blob.size) || 0; } catch(_){}
          vistos.set(resto, { name: resto, id: 'f-'+resto,
                              metadata: { size: tam, mimetype: x.tipo || '' } });
        } else {
          const carpeta = resto.slice(0, corte);
          if (!vistos.has(carpeta))
            vistos.set(carpeta, { name: carpeta, id: null, metadata: null });
        }
      }
      return { data: [...vistos.values()], error: null };
    },
    async createSignedUrl(ruta){
      const x = FICHEROS.get(bucket + '/' + ruta);
      if (!x) return { data:null, error:{ message:'No existe el fichero' } };
      let url = PNG_VACIO;
      try { if (x.blob instanceof Blob) url = URL.createObjectURL(x.blob); } catch(_){}
      return { data:{ signedUrl: url }, error:null };
    },
    async createSignedUrls(rutas){
      const out = [];
      for (const r of (rutas||[])){
        const u = await this.createSignedUrl(r);
        out.push(u.data ? { path:r, signedUrl:u.data.signedUrl } : { path:r, error:'no existe' });
      }
      return { data: out, error:null };
    },
    getPublicUrl(ruta){ return { data:{ publicUrl: 'blob:'+bucket+'/'+ruta } }; },
  };
}

/* ---- Procedimientos ---- */
const RPC = {
  /* Enviar el parte al cliente. En la aplicación de verdad esto encola un correo
     en el servidor; aquí se apunta la llamada en DB.__partes para que el banco
     pueda comprobar que se ha pedido, a qué visita y a qué correo. */
  enviar_parte({ p_aviso }){
    const a = DB.avisos.find(x => String(x.id) === String(p_aviso));
    if (!a || !a.cerrado) return false;
    const pu = a.puerta_id ? DB.puertas.find(x => String(x.id) === String(a.puerta_id)) : null;
    const c1 = a.cliente_id ? DB.clientes.find(x => String(x.id) === String(a.cliente_id)) : null;
    const c2 = pu && pu.cliente_id ? DB.clientes.find(x => String(x.id) === String(pu.cliente_id)) : null;
    const mail = ((a.contacto_email||'').trim()) || ((c1&&c1.email||'').trim()) || ((c2&&c2.email||'').trim());
    if (!mail) return false;
    (DB.__partes = DB.__partes || []).push({ aviso_id: a.id, mail, cuando: ahora() });
    a.enviado_cliente = true;
    a.parte_enviado_el = ahora();
    return true;
  },
  crear_expediente({ p_puerta, p_situacion, p_familia, p_aviso }){
    const pu = DB.puertas.find(x => String(x.id) === String(p_puerta));
    if (!pu) return { ok:false, motivo:'sin_puerta' };
    const nro = DB.expedientes.length + 1;
    const referencia = 'EXP-2026-' + String(nro).padStart(4, '0');
    const fila = {
      id: id(), referencia, puerta_id: pu.id, cliente_id: pu.cliente_id,
      aviso_id: p_aviso || null, situacion: p_situacion || '', familia: p_familia || '',
      estado: 'borrador', datos: {}, fecha_puesta_servicio: null,
      autor: 'David Ariza Arana', creado: ahora(), actualizado: ahora(),
    };
    DB.expedientes.push(fila);
    return { ok:true, id: fila.id, referencia };
  },
  emitir_expediente({ p_exp, p_firmante, p_cargo }){
    if (!p_firmante) return { ok:false, motivo:'sin_firmante' };
    const e = DB.expedientes.find(x => String(x.id) === String(p_exp));
    if (!e) return { ok:false, motivo:'sin_expediente' };
    e.estado = 'emitido';
    e.firmante = p_firmante;
    e.firmante_cargo = p_cargo || '';
    e.fecha_emision = ahora().slice(0, 10);
    e.actualizado = ahora();
    return { ok:true, id: e.id, referencia: e.referencia };
  },
  siguiente_contrato(){ return 'CT-2026-' + String(DB.contratos.length + 1).padStart(3, '0'); },
  generar_preventivas(){ return { ok:true, creadas:0 }; },
  valorar_aviso(){ return { ok:true }; },
  archivar_asistencia(){ return { ok:true }; },
  borrar_asistencia({ p_aviso }){
    DB.avisos = DB.avisos.filter(x => String(x.id) !== String(p_aviso));
    return { ok:true };
  },
  reabrir_asistencia(){ return { ok:true }; },
  duplicar_asistencia(){ return { ok:true }; },
  anular_asistencia(){ return { ok:true }; },
  archivar_cliente(){ return { ok:true }; },
  borrar_cliente({ p_cliente }){
    DB.clientes = DB.clientes.filter(x => String(x.id) !== String(p_cliente));
    return { ok:true };
  },
  enviar_contrato(){ return { ok:true }; },
  contrato_publico(){ return { ok:false, motivo:'sin_token' }; },
  aviso_publico(){ return { ok:false, motivo:'sin_token' }; },
  /* Los dos procedimientos del presupuesto público. Imitan lo que hace el
     servidor: devuelven el documento SIN costes y solo dejan responder a lo que
     está enviado, en plazo y sin respuesta previa. */
  presupuesto_publico({ p_token }){
    const p = DB.presupuestos.find(x => x.token === p_token);
    if (!p) return { ok:false, motivo:'no_existe' };
    if (p.estado === 'borrador') return { ok:false, motivo:'no_enviado' };
    const cli = DB.clientes.find(c => c.id === p.cliente_id);
    const pu = DB.puertas.find(x => x.id === p.puerta_id);
    const hoyISO = new Date().toISOString().slice(0,10);
    /* Igual que en el servidor: cada apertura del enlace queda apuntada */
    DB.presupuesto_visitas.push({ id:'vis-'+DB.presupuesto_visitas.length,
      presupuesto_id:p.id, cuando: ahora() });
    return {
      ok:true, referencia:p.referencia, titulo:p.titulo,
      descripcion:p.descripcion,
      adjuntos: DB.presupuesto_adjuntos.filter(a => a.presupuesto_id === p.id && a.publico)
        .sort((x,y) => (x.orden||0)-(y.orden||0))
        .map(a => ({ nombre:a.nombre, descripcion:a.descripcion, ruta:a.ruta,
                     tipo:a.tipo, bytes:a.bytes })),
      estado:p.estado, fecha:p.fecha, valido_hasta:p.valido_hasta,
      caducado: !!(p.valido_hasta && p.valido_hasta < hoyISO &&
                   !['aceptado','convertido'].includes(p.estado)),
      cliente: cli ? cli.nombre : '', puerta: pu ? pu.codigo : '',
      materiales:p.materiales, mano_obra:p.mano_obra, desplazamiento:p.desplazamiento,
      descuento:p.descuento, base:p.base, tipo_iva:p.tipo_iva, iva:p.iva, total:p.total,
      condiciones:p.condiciones, anexos:p.anexos,
      aceptado_el:p.aceptado_el, aceptado_por:p.aceptado_por,
      rechazado_el:p.rechazado_el,
      lineas: DB.presupuesto_lineas.filter(l => l.presupuesto_id === p.id)
        .sort((a,b) => (a.orden||0)-(b.orden||0))
        .map(l => ({ descripcion:l.descripcion, nombre:l.nombre, referencia:l.referencia,
                     cantidad:l.cantidad, unidad:l.unidad,
                     precio:l.precio, importe:l.importe, tipo:l.tipo })),
    };
  },
  responder_presupuesto({ p_token, p_acepta, p_nombre, p_motivo }){
    const p = DB.presupuestos.find(x => x.token === p_token);
    if (!p) return { ok:false, motivo:'no_existe' };
    if (p.estado === 'borrador') return { ok:false, motivo:'no_enviado' };
    if (['aceptado','convertido'].includes(p.estado)) return { ok:false, motivo:'ya_aceptado' };
    if (p.estado === 'rechazado') return { ok:false, motivo:'ya_rechazado' };
    const hoyISO = new Date().toISOString().slice(0,10);
    if (p.valido_hasta && p.valido_hasta < hoyISO) return { ok:false, motivo:'caducado' };
    if (p_acepta && !String(p_nombre||'').trim()) return { ok:false, motivo:'sin_nombre' };
    if (p_acepta){ p.estado='aceptado'; p.aceptado_el=ahora(); p.aceptado_por=String(p_nombre).trim(); }
    else { p.estado='rechazado'; p.rechazado_el=ahora(); p.rechazado_motivo=p_motivo||null; }
    return { ok:true, estado:p.estado };
  },
  ficha_publica({ p_codigo }){
    const pu = DB.puertas.find(x => x.codigo === p_codigo);
    if (!pu) return { ok:false, motivo:'sin_puerta' };
    return { ok:true, puerta: clonar(pu) };
  },
};

/* ---- Cliente ---- */
export function createClient(){
  const sesion = {
    user: { id:'usuario-admin', email:'arizapuertasautomaticas@gmail.com' },
    access_token: 'prueba',
  };
  return {
    from: t => new Consulta(t),
    rpc: async (nombre, args) => {
      const fn = RPC[nombre];
      if (!fn) return { data:null, error:{ message:'Procedimiento no simulado: '+nombre } };
      try { return { data: fn(args || {}), error:null }; }
      catch(err){ return { data:null, error:{ message:err.message } }; }
    },
    auth: {
      async getSession(){ return { data:{ session: sesion }, error:null }; },
      async getUser(){ return { data:{ user: sesion.user }, error:null }; },
      onAuthStateChange(){ return { data:{ subscription:{ unsubscribe(){} } } }; },
      async signInWithPassword(){ return { data:{ session: sesion }, error:null }; },
      async signOut(){ return { error:null }; },
      async resetPasswordForEmail(){ return { data:{}, error:null }; },
      async updateUser(){ return { data:{ user: sesion.user }, error:null }; },
    },
    storage: { from: almacen },
    functions: { invoke: async () => ({ data:{ ok:true }, error:null }) },
    channel(){ return { on(){ return this; }, subscribe(){ return this; }, unsubscribe(){} }; },
    removeChannel(){},
  };
}
export default { createClient };
