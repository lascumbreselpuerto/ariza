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
      /* Dibuja un marco con la palabra QR, no un cuadrado blanco.
         Hasta el 10-11-2026 devolvía un rectángulo blanco, y en las capturas
         que se le mandan a David salía un hueco invisible: preguntó, con
         razón, por qué la etiqueta no llevaba QR. Un sustituto tiene que
         parecer un sustituto, no una ausencia. El QR de verdad lo genera la
         librería que la aplicación carga de internet. */
      createSvgTag(){
        return '<svg viewBox="0 0 21 21" width="21" height="21" xmlns="http://www.w3.org/2000/svg">'+
          '<rect width="21" height="21" fill="#fff"/>'+
          '<rect x="0.5" y="0.5" width="20" height="20" fill="none" stroke="#000" '+
            'stroke-width="0.6" stroke-dasharray="1.2 0.9"/>'+
          /* los tres ojos, para que se reconozca de un vistazo que es un QR */
          '<path d="M2 2h5v5H2z M14 2h5v5h-5z M2 14h5v5H2z" fill="none" stroke="#000" stroke-width="1"/>'+
          '<path d="M3.5 3.5h2v2h-2z M15.5 3.5h2v2h-2z M3.5 15.5h2v2h-2z" fill="#000"/>'+
          '<text x="10.5" y="11.6" text-anchor="middle" font-family="Arial" font-size="3.4" '+
            'font-weight="700" fill="#000">QR</text>'+
          '<text x="10.5" y="14.4" text-anchor="middle" font-family="Arial" font-size="1.5" '+
            'fill="#000">de prueba</text>'+
          '</svg>';
      },
      createASCII(){ return 'QR'; },
    };
  }
  qrcode.stringToBytes = s => Array.from(String(s)).map(c => c.charCodeAt(0));
  window.qrcode = qrcode;
})();
