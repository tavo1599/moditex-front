<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import JsBarcode from 'jsbarcode';

const props = defineProps<{
  item: any;
  colores: any[];
}>();

const emit = defineEmits(['cerrar']);

// Estados locales del modal
const cantidadEtiquetas = ref(1);
const codigoGenerado = ref('');
const marcaEtiqueta = ref('WEST');
const precioEtiqueta = ref('');

// Función auxiliar para el color (copiada del padre para uso local)
const getNombreColor = (codigoColor: string) => {
  const colorObj = props.colores.find(c => c.codigo === codigoColor || c.nombre === codigoColor);
  return colorObj ? `${colorObj.nombre}` : codigoColor;
};

// Generar el código de barras apenas se abre el modal
onMounted(async () => {
  cantidadEtiquetas.value = props.item.stock > 0 ? props.item.stock : 1; 
  precioEtiqueta.value = ''; 
  
  const colorEncontrado = props.colores.find(c => c.codigo === props.item.color || c.nombre === props.item.color);
  const codigoColor = colorEncontrado ? colorEncontrado.codigo : props.item.color.substring(0, 3).toUpperCase();

  codigoGenerado.value = `PRD${props.item.producto.id}-${codigoColor}-${props.item.talla}`;

  await nextTick();
  
  JsBarcode("#barcode-svg", codigoGenerado.value, {
    format: "CODE128", 
    lineColor: "#000",
    width: 2,         
    height: 55,       
    displayValue: false, 
    margin: 2         
  });
});

// Lógica de impresión
const imprimirEtiquetas = () => {
  const svgContenedor = document.getElementById('contenedor-barcode')?.innerHTML || '';
  const nombrePrenda = props.item.producto.nombre;
  const nombreColor = getNombreColor(props.item.color); 
  
  const precioMostrar = precioEtiqueta.value ? `PRECIO S/ ${Number(precioEtiqueta.value).toFixed(2)}` : '';
  const marcaMostrar = marcaEtiqueta.value;

  const ventana = window.open('', 'PRINT', 'height=600,width=800');
  
  const frasesChillAmigos = [
    "Tienes mucho flow... súbele el nivel.",
    "Estás re-chill... pero con esto estás top.",
    "Buena vibra, ¿no? ¡Dale un toque!",
    "Eres tú... pero versión premium.",
    "¡Dale caña! Con esto no hay quien te pare.",
    "Todo bien... pero esto lo hace increíble.",
    "Sube la apuesta... dale ese toque extra.",
    "¡Chingón! Tu look ahora es otro nivel."
  ];

  const fraseAleatoria = frasesChillAmigos[Math.floor(Math.random() * frasesChillAmigos.length)];
  const urlConejo = window.location.origin + '/conejo-chill.png';

  ventana!.document.write(`
    <html><head><title>Etiquetas Moditex</title>
    <style>
      @page { size: 101.6mm 38.1mm; margin: 0 !important; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 101.6mm; background: white; font-family: Arial, sans-serif; }
      
      .fila { display: flex; flex-direction: row; width: 101.6mm; height: 37mm; justify-content: space-between; align-items: center; overflow: hidden; page-break-inside: avoid; page-break-after: always; }
      .etiqueta { width: 50.8mm; height: 37mm; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; overflow: hidden; padding-top: 1mm; }
      .etiqueta:nth-child(odd) { padding-right: 2mm; padding-left: 1mm; } 
      .etiqueta:nth-child(even) { padding-left: 2mm; padding-right: 1mm; } 

      .precio { font-size: 10px; font-weight: 900; margin-bottom: 1px; line-height: 1; }
      .marca { font-size: 16px; font-weight: 900; letter-spacing: 1px; margin-bottom: 2px; text-transform: uppercase; line-height: 1; }
      .tipo-prenda { font-size: 8px; font-weight: bold; text-transform: uppercase; line-height: 1; width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
      
      .svg-container { width: 100%; display: flex; justify-content: center; margin: 2px 0; }
      .svg-container svg { max-width: 44mm; height: auto; } 
      .sku-lectura { font-family: monospace; font-size: 8px; font-weight: bold; margin-bottom: 2px; line-height: 1; }
      
      .footer-etiqueta { display: flex; justify-content: space-between; align-items: baseline; width: 95%; border-top: 1px dashed #000; padding-top: 3px; margin-top: 1px; }
      .talla-gigante { font-size: 22px; font-weight: 900; line-height: 0.8; }
      .color-texto { font-size: 9px; font-weight: bold; text-transform: uppercase; }

      .etiqueta-chill { position: relative; width: 100%; height: 100%; overflow: hidden; }
      .conejo-chill-image { position: absolute; bottom: 0; left: 1.5mm; height: 100%; width: 43mm; object-fit: contain; object-position: bottom left; z-index: 1; }
      .frase-globo { position: absolute; top: 4.5mm; right: 6mm; background: #fff; color: #000; border: 1px solid #000; border-radius: 6px; padding: 3px 4px; font-size: 7px; font-weight: bold; line-height: 1.1; width: 16mm; text-align: center; z-index: 2; }
      .frase-globo::after { content: ''; position: absolute; bottom: -3px; left: 2px; border-width: 3px 3px 0 0; border-style: solid; border-color: #000 transparent transparent transparent; }
      .frase-globo::before { content: ''; position: absolute; bottom: -1.5px; left: 3px; border-width: 2px 2px 0 0; border-style: solid; border-color: #fff transparent transparent transparent; z-index: 1; }
    </style></head><body>
  `);

  for (let i = 0; i < cantidadEtiquetas.value; i += 2) {
    ventana!.document.write('<div class="fila">');
    for (let j = 0; j < 2; j++) {
      if (i + j < cantidadEtiquetas.value) {
        ventana!.document.write(`
          <div class="etiqueta">
            ${precioMostrar ? `<div class="precio">${precioMostrar}</div>` : ''}
            <div class="marca">${marcaMostrar}</div>
            <div class="tipo-prenda">${nombrePrenda}</div>
            <div class="svg-container">${svgContenedor}</div>
            <div class="sku-lectura">${codigoGenerado.value}</div>
            <div class="footer-etiqueta">
              <span class="talla-gigante">${props.item.talla}</span>
              <span class="color-texto">${nombreColor}</span>
            </div>
          </div>
        `);
      } else {
        ventana!.document.write(`
          <div class="etiqueta">
            <div class="etiqueta-chill">
              <img src="${urlConejo}" class="conejo-chill-image">
              <div class="frase-globo">${fraseAleatoria}</div>
            </div>
          </div>
        `);
      }
    }
    ventana!.document.write('</div>');
  }

  ventana!.document.write('</body></html>');
  ventana!.document.close();
  ventana!.focus();
  setTimeout(() => { ventana!.print(); ventana!.close(); }, 800);
};
</script>

<template>
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
    <div class="bg-white rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 overflow-hidden">
      <div class="bg-gray-900 p-6 text-center">
        <h3 class="text-xl font-black text-white mb-1">Centro de Impresión</h3>
        <p class="text-xs text-gray-400">{{ item?.producto.nombre }}</p>
      </div>
      <div class="p-8 flex flex-col items-center">
        <div class="bg-white p-4 border-2 border-dashed border-gray-300 rounded-xl mb-6 flex flex-col items-center w-full shadow-sm">
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Vista Previa</p>
          <div id="contenedor-barcode" class="flex justify-center w-full">
            <svg id="barcode-svg" class="w-full max-w-[200px]"></svg>
          </div>
          <p class="text-xs font-bold text-gray-800 mt-2">Talla: {{ item?.talla }} | Col: {{ getNombreColor(item?.color) }}</p>
        </div>
        
        <div class="w-full space-y-4 text-left">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Precio (Opcional)</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">S/</span>
                <input type="number" v-model="precioEtiqueta" placeholder="0.00" class="w-full border-2 border-gray-200 p-2 pl-8 rounded-xl font-bold text-gray-800 outline-none focus:border-blue-500">
              </div>
            </div>
            <div>
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Marca</label>
              <select v-model="marcaEtiqueta" class="w-full border-2 border-gray-200 p-2 rounded-xl font-bold text-gray-800 outline-none focus:border-blue-500">
                <option value="WEST">WEST</option>
                <option value="TENSOЯ">TENSOЯ</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">¿Cuántas etiquetas necesitas?</label>
            <input type="number" v-model.number="cantidadEtiquetas" min="1" class="w-full border-2 border-gray-200 p-3 rounded-xl text-2xl text-center font-black text-gray-800 outline-none focus:border-blue-500">
          </div>
        </div>
      </div>
      <div class="bg-gray-50 p-6 border-t border-gray-100 flex gap-3">
        <button @click="emit('cerrar')" class="flex-1 py-3 text-gray-500 hover:bg-gray-200 rounded-xl font-bold transition">Cancelar</button>
        <button @click="imprimirEtiquetas" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition flex items-center justify-center gap-2">
          <span>🖨️</span> Imprimir
        </button>
      </div>
    </div>
  </div>
</template>