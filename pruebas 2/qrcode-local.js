/* Sustituto del generador de QR para las pruebas. La aplicación solo necesita
   que exista qrcode(tipo, correccion) con make/createDataURL/createSvgTag. */
(function(){
  function qrcode(){
    const datos = [];
    return {
      addData(t){ datos.push(String(t)); },
      make(){},
      getModuleCount(){ return 21; },
      isDark(){ return false; },
      createDataURL(){ return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; },
      createImgTag(){ return '<img alt="QR de prueba" src="'+this.createDataURL()+'">'; },
      createSvgTag(){ return '<svg viewBox="0 0 21 21" width="21" height="21"><rect width="21" height="21" fill="#fff"/></svg>'; },
      createASCII(){ return 'QR'; },
    };
  }
  qrcode.stringToBytes = s => Array.from(String(s)).map(c => c.charCodeAt(0));
  window.qrcode = qrcode;
})();
