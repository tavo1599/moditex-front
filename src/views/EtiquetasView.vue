<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../api/axios';
import JsBarcode from 'jsbarcode';

const productos = ref<any[]>([]);
const colores = ref<any[]>([]);
const cargando = ref(true);
const marca = ref('WEST');

const form = ref({ productoId: '', color: '', talla: '', precio: '', cantidad: 50 });
const carrito = ref<any[]>([]);

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

const agregar = () => {
  if (!form.value.productoId) return alert('Selecciona un producto.');
  if (!form.value.color) return alert('Selecciona un color.');
  if (!form.value.talla) return alert('Ingresa la talla.');
  const cant = Number(form.value.cantidad);
  if (!cant || cant < 1) return alert('Cantidad inválida.');

  const prodId = Number(form.value.productoId);
  const cod = codigoColor(form.value.color);
  const sku = `PRD${prodId}-${cod}-${String(form.value.talla).toUpperCase()}`;

  carrito.value.push({
    productoId: prodId,
    nombreProducto: nombreProducto(prodId),
    color: form.value.color,
    nombreColor: nombreColor(form.value.color),
    talla: String(form.value.talla).toUpperCase(),
    precio: form.value.precio ? Number(form.value.precio) : null,
    cantidad: cant,
    sku,
  });
  
  form.value.color = '';
  form.value.talla = '';
};

const quitar = (i: number) => carrito.value.splice(i, 1);
const limpiar = () => { carrito.value = []; };

const totalEtiquetas = computed(() => carrito.value.reduce((s, l) => s + l.cantidad, 0));

// CÓDIGO DE BARRAS como imagen PNG (canvas), a su resolución natural y SIN estirar.
// Esta es la forma que SÍ lee la lectora (horizontal, sin rotar, aspecto intacto).
const barcodeDataUrl = (sku: string): string => {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, sku, { format: 'CODE128', width: 2, height: 55, displayValue: false, margin: 2 });
  return canvas.toDataURL('image/png');
};

const imprimir = () => {
  if (!carrito.value.length) return alert('Agrega al menos una etiqueta al carrito.');

  // Expandimos a una lista plana de etiquetas (cada variante repetida por su cantidad)
  const etiquetas: any[] = [];
  for (const linea of carrito.value) {
    const img = barcodeDataUrl(linea.sku);
    for (let i = 0; i < linea.cantidad; i++) {
      etiquetas.push({ ...linea, img });
    }
  }

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
      /* Rollo: papel 100mm (10cm), 3 etiquetas de 30mm (3cm) c/u */
      @page { size: 100mm 40mm; margin: 0 !important; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 100mm; background: #fff; font-family: Arial, sans-serif; }
      .fila { display: flex; flex-direction: row; width: 100mm; height: 40mm; justify-content: space-around; align-items: center; overflow: hidden; page-break-inside: avoid; page-break-after: always; }
      .etiqueta { width: 30mm; height: 40mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; padding: 1.8mm 1mm; }
      .precio { font-size: 10px; font-weight: 900; line-height: 1; }
      .marca { font-size: 15px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; line-height: 1; }
      .tipo-prenda { font-size: 8px; font-weight: bold; text-transform: uppercase; line-height: 1; width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .svg-container { width: 100%; display: flex; justify-content: center; }
      .sku-lectura { font-family: monospace; font-size: 8px; font-weight: bold; line-height: 1; }
      .footer-etiqueta { display: flex; justify-content: space-between; align-items: baseline; width: 100%; border-top: 1px dashed #000; padding-top: 3px; }
      .talla-gigante { font-size: 20px; font-weight: 900; line-height: 0.8; }
      .color-texto { font-size: 9px; font-weight: bold; text-transform: uppercase; }
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

onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">🏷️ Impresión de Etiquetas</h2>
      <p class="text-gray-500 mt-1">Arma un lote de etiquetas (talla, color, precio, cantidad) e imprime todas con su código de barras. Papel 100mm (10cm), 3 etiquetas de 30mm por fila.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 h-fit">
        <h3 class="font-bold text-gray-700">Agregar al lote</h3>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Producto</label>
          <select v-model="form.productoId" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
            <option value="">Selecciona...</option>
            <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Color</label>
            <select v-model="form.color" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
              <option value="">...</option>
              <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Talla</label>
            <input v-model="form.talla" placeholder="S, M, 30..." class="w-full border border-gray-300 rounded-lg p-2.5 text-sm uppercase outline-none focus:border-blue-500">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Precio (opcional)</label>
            <input v-model="form.precio" type="number" step="0.10" placeholder="0.00" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-right outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cantidad</label>
            <input v-model.number="form.cantidad" type="number" min="1" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-center font-bold outline-none focus:border-blue-500">
          </div>
        </div>
        <button @click="agregar" class="w-full bg-gray-900 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-black">+ Agregar al lote</button>

        <div class="pt-2 border-t border-gray-100">
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Marca (en todas)</label>
          <select v-model="marca" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
            <option value="WEST">WEST</option>
            <option value="TENSOЯ">TENSOЯ</option>
          </select>
        </div>
      </div>

      <div class="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div class="p-4 border-b border-gray-100 flex justify-between items-center">
          <h3 class="font-bold text-gray-700">Lote de etiquetas</h3>
          <span class="text-sm font-black text-blue-600">{{ totalEtiquetas }} etiqueta(s)</span>
        </div>

        <div v-if="!carrito.length" class="flex-1 flex items-center justify-center py-16 text-gray-400 text-sm">
          Agrega variantes al lote para imprimir
        </div>
        <table v-else class="w-full text-left text-sm">
          <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th class="p-3">Producto</th>
              <th class="p-3">Color / Talla</th>
              <th class="p-3 text-right">Precio</th>
              <th class="p-3 text-center">Cant.</th>
              <th class="p-3 text-center"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(l, i) in carrito" :key="i" class="hover:bg-gray-50">
              <td class="p-3">
                <p class="font-bold text-gray-800">{{ l.nombreProducto }}</p>
                <p class="text-[10px] font-mono text-gray-400">{{ l.sku }}</p>
              </td>
              <td class="p-3 text-gray-600">{{ l.nombreColor }} · {{ l.talla }}</td>
              <td class="p-3 text-right">{{ l.precio != null ? 'S/ ' + l.precio.toFixed(2) : '—' }}</td>
              <td class="p-3 text-center font-bold">{{ l.cantidad }}</td>
              <td class="p-3 text-center"><button @click="quitar(i)" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">🗑️</button></td>
            </tr>
          </tbody>
        </table>

        <div class="p-4 border-t border-gray-100 flex gap-3 mt-auto">
          <button @click="limpiar" :disabled="!carrito.length" class="px-5 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold text-sm disabled:opacity-40">Vaciar</button>
          <button @click="imprimir" :disabled="!carrito.length" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
            🖨️ Imprimir {{ totalEtiquetas }} etiquetas
          </button>
        </div>
      </div>
    </div>
  </div>
</template>