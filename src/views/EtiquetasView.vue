<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../api/axios';
import JsBarcode from 'jsbarcode';

const productos = ref<any[]>([]);
const colores = ref<any[]>([]);
const cargando = ref(true);

// Datos generales (aplican a todas las etiquetas)
const marca = ref('WEST');
const productoId = ref('');
const precioGeneral = ref('');

// Tallas = columnas (editables)
const tallas = ref<string[]>(['S', 'M', 'L', 'XL', 'XXL']);
const nuevaTalla = ref('');

// Filas por color: [{ color, cant: { [talla]: number } }]
const filas = ref<any[]>([]);
const colorNuevo = ref('');

const cargar = async () => {
  cargando.value = true;
  try {
    const [resP, resC] = await Promise.all([api.get('/productos'), api.get('/colores')]);
    productos.value = resP.data;
    colores.value = resC.data;
  } catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const codigoColor = (nombreOCodigo: string) => {
  const c = colores.value.find((x) => x.codigo === nombreOCodigo || x.nombre === nombreOCodigo);
  return (c ? c.codigo : String(nombreOCodigo).substring(0, 3)).toUpperCase();
};
const nombreColor = (val: string) => {
  const c = colores.value.find((x) => x.codigo === val || x.nombre === val);
  return c ? c.nombre : val;
};
const nombreProducto = (id: any) => productos.value.find((p) => p.id === Number(id))?.nombre || '';

// --- Colores (filas) ---
const agregarColor = () => {
  if (!colorNuevo.value) return;
  if (filas.value.some((f) => f.color === colorNuevo.value)) { colorNuevo.value = ''; return; }
  filas.value.push({ color: colorNuevo.value, cant: {} });
  colorNuevo.value = '';
};
const quitarColor = (i: number) => filas.value.splice(i, 1);

// --- Tallas (columnas) ---
const agregarTalla = () => {
  const t = nuevaTalla.value.trim().toUpperCase();
  if (!t) return;
  if (!tallas.value.includes(t)) tallas.value.push(t);
  nuevaTalla.value = '';
};
const quitarTalla = (t: string) => {
  tallas.value = tallas.value.filter((x) => x !== t);
  for (const f of filas.value) delete f.cant[t];
};

const totalEtiquetas = computed(() => {
  let s = 0;
  for (const f of filas.value) for (const t of tallas.value) s += Number(f.cant[t]) || 0;
  return s;
});

// CÓDIGO DE BARRAS como imagen PNG (canvas), a resolución natural y SIN estirar.
const barcodeDataUrl = (sku: string): string => {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, sku, { format: 'CODE128', width: 2, height: 55, displayValue: false, margin: 2 });
  return canvas.toDataURL('image/png');
};

const imprimir = () => {
  if (!productoId.value) return alert('Selecciona un producto.');
  const prodId = Number(productoId.value);
  const precio = precioGeneral.value ? Number(precioGeneral.value) : null;
  const nombreProd = nombreProducto(prodId);

  // Expandimos la matriz a una lista plana de etiquetas (repetidas por cantidad)
  const etiquetas: any[] = [];
  for (const f of filas.value) {
    const cod = codigoColor(f.color);
    const nomColor = nombreColor(f.color);
    for (const t of tallas.value) {
      const cant = Number(f.cant[t]) || 0;
      if (cant < 1) continue;
      const sku = `PRD${prodId}-${cod}-${t}`;
      const img = barcodeDataUrl(sku);
      for (let k = 0; k < cant; k++) {
        etiquetas.push({ nombreProducto: nombreProd, nombreColor: nomColor, talla: t, precio, sku, img });
      }
    }
  }
  if (!etiquetas.length) return alert('Pon cantidades en al menos una talla/color.');

  let cuerpo = '';
  for (let i = 0; i < etiquetas.length; i += 3) {
    cuerpo += '<div class="fila">';
    for (let j = 0; j < 3; j++) {
      const e = etiquetas[i + j];
      if (e) {
        cuerpo += `
          <div class="etiqueta">
            ${e.precio != null ? `<div class="precio">PRECIO S/ ${e.precio.toFixed(2)}</div>` : ''}
            <div class="marca">${marca.value}</div>
            <div class="tipo-prenda">${e.nombreProducto}</div>
            <div class="svg-container"><img src="${e.img}" style="width:29mm;height:auto;"></div>
            <div class="sku-lectura">${e.sku}</div>
            <div class="footer-etiqueta">
              <span class="talla-gigante">${e.talla}</span>
              <span class="color-texto">${e.nombreColor}</span>
            </div>
          </div>`;
      } else {
        cuerpo += '<div class="etiqueta"></div>';
      }
    }
    cuerpo += '</div>';
  }

  const html = `
    <html><head><title>Etiquetas</title><style>
      @page { size: 100mm 40mm; margin: 0 !important; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 100mm; background: #fff; font-family: Arial, sans-serif; }
      .fila { display: flex; flex-direction: row; width: 100mm; height: 40mm; justify-content: space-around; align-items: center; overflow: hidden; page-break-inside: avoid; page-break-after: always; }
      .etiqueta { width: 30mm; height: 40mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; padding: 1.8mm 1mm; }
      .precio { font-size: 10px; font-weight: 600; line-height: 1; }
      .marca { font-size: 15px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; line-height: 1; -webkit-text-stroke: 0.3px #000; }
      .tipo-prenda { font-size: 8px; font-weight: 500; text-transform: uppercase; line-height: 1; width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .svg-container { width: 100%; display: flex; justify-content: center; }
      .sku-lectura { font-family: monospace; font-size: 8px; font-weight: 500; line-height: 1; }
      .footer-etiqueta { display: flex; justify-content: space-between; align-items: baseline; width: 100%; border-top: 1px dashed #000; padding-top: 3px; }
      .talla-gigante { font-size: 20px; font-weight: 900; line-height: 0.8; }
      .color-texto { font-size: 9px; font-weight: 900; text-transform: uppercase; -webkit-text-stroke: 0.2px #000; }
    </style></head><body>${cuerpo}</body></html>`;

  try {
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error('sin documento');
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      catch { alert('No se pudo abrir el diálogo de impresión.'); }
      setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1500);
    }, 500);
  } catch {
    const v = window.open('', 'PRINT', 'height=600,width=800');
    if (!v) { alert('Permite ventanas emergentes para imprimir.'); return; }
    v.document.write(html); v.document.close(); v.focus();
    setTimeout(() => { v.print(); v.close(); }, 800);
  }
};

const limpiar = () => { filas.value = []; };

onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">🏷️ Impresión de Etiquetas</h2>
      <p class="text-gray-500 mt-1">Elige producto, marca y precio; agrega colores y pon las cantidades por talla en la tabla. Papel 100mm, 3 etiquetas de 30mm por fila.</p>
    </div>

    <!-- CONFIGURACIÓN GENERAL -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Producto</label>
        <select v-model="productoId" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
          <option value="">Selecciona...</option>
          <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Precio general (opcional)</label>
        <input v-model="precioGeneral" type="number" step="0.10" placeholder="0.00" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-right outline-none focus:border-blue-500">
      </div>
      <div>
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Marca (en todas)</label>
        <select v-model="marca" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
          <option value="WEST">WEST</option>
          <option value="TENSOЯ">TENSOЯ</option>
        </select>
      </div>
    </div>

    <!-- TALLAS (COLUMNAS) -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-2">
      <span class="text-[10px] font-bold text-gray-500 uppercase mr-1">Tallas:</span>
      <span v-for="t in tallas" :key="t" class="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1 text-sm font-bold text-gray-700">
        {{ t }}
        <button @click="quitarTalla(t)" class="text-gray-400 hover:text-red-500 leading-none">&times;</button>
      </span>
      <input v-model="nuevaTalla" @keyup.enter="agregarTalla" placeholder="+ talla" class="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm uppercase outline-none focus:border-blue-500">
      <button @click="agregarTalla" class="text-sm font-bold text-blue-600 hover:text-blue-800">Agregar</button>
    </div>

    <!-- MATRIZ COLOR x TALLA -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3">
        <h3 class="font-bold text-gray-700">Cantidades por color y talla</h3>
        <div class="flex items-center gap-2">
          <select v-model="colorNuevo" class="border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:border-blue-500">
            <option value="">+ Agregar color...</option>
            <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
          </select>
          <button @click="agregarColor" class="bg-gray-900 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-black">Agregar</button>
        </div>
      </div>

      <div v-if="!filas.length" class="py-16 text-center text-gray-400 text-sm">
        Agrega un color para empezar a poner cantidades
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th class="p-3 text-left sticky left-0 bg-gray-50">Color</th>
              <th v-for="t in tallas" :key="t" class="p-3 text-center min-w-[64px]">{{ t }}</th>
              <th class="p-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(f, i) in filas" :key="f.color" class="hover:bg-gray-50">
              <td class="p-3 font-bold text-gray-800 sticky left-0 bg-white">{{ nombreColor(f.color) }}</td>
              <td v-for="t in tallas" :key="t" class="p-2 text-center">
                <input
                  v-model.number="f.cant[t]"
                  type="number"
                  min="0"
                  placeholder="0"
                  class="w-16 border border-gray-200 rounded-lg text-center py-1.5 outline-none focus:border-blue-500 font-bold"
                >
              </td>
              <td class="p-2 text-center">
                <button @click="quitarColor(i)" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">🗑️</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="p-4 border-t border-gray-100 flex flex-wrap gap-3 items-center">
        <span class="text-sm font-black text-blue-600 mr-auto">{{ totalEtiquetas }} etiqueta(s)</span>
        <button @click="limpiar" :disabled="!filas.length" class="px-5 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold text-sm disabled:opacity-40">Vaciar</button>
        <button @click="imprimir" :disabled="!totalEtiquetas" class="bg-blue-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
          🖨️ Imprimir {{ totalEtiquetas }} etiquetas
        </button>
      </div>
    </div>
  </div>
</template>
