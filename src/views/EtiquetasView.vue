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

// CÓDIGO DE BARRAS como SVG VECTORIAL. Antes era un PNG que el CSS encogía a 37mm:
// al reescalar un mapa de bits a un factor no entero las barras se fundían y la
// pistola no leía. El SVG se imprime nítido a cualquier DPI (203 de la térmica)
// sin interpolación. 'margin' amplio = zona de silencio (quiet zone) que la
// lectora necesita para enganchar el código.
const barcodeSvg = (sku: string): string => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, sku, { format: 'CODE128', width: 2, height: 40, displayValue: false, margin: 10 });
  // Convertimos el ancho/alto fijos que pone JsBarcode en un viewBox para poder
  // escalar el vector a la medida física exacta sin deformar las proporciones.
  const w = svg.getAttribute('width');
  const h = svg.getAttribute('height');
  if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('shape-rendering', 'crispEdges'); // bordes de barra sin antialias
  svg.setAttribute('style', 'width:38mm;height:9mm;display:block;');
  return svg.outerHTML;
};

// Lista plana de etiquetas (sin imagen) de la MATRIZ actual (una sola prenda)
const construirEtiquetasActuales = (): any[] => {
  if (!productoId.value) return [];
  const prodId = Number(productoId.value);
  const precio = precioGeneral.value ? Number(precioGeneral.value) : null;
  const nombreProd = nombreProducto(prodId);
  const marcaLote = marca.value;
  const out: any[] = [];
  for (const f of filas.value) {
    const cod = codigoColor(f.color);
    const nomColor = nombreColor(f.color);
    for (const t of tallas.value) {
      const cant = Number(f.cant[t]) || 0;
      if (cant < 1) continue;
      const sku = `PRD${prodId}-${cod}-${t}`;
      for (let k = 0; k < cant; k++) {
        out.push({ nombreProducto: nombreProd, nombreColor: nomColor, talla: t, precio, sku, marca: marcaLote });
      }
    }
  }
  return out;
};

// 🧺 COLA DE IMPRESIÓN: cada lote es una prenda ya lista (con su marca/precio/tallas)
const cola = ref<any[]>([]);
const totalCola = computed(() => cola.value.reduce((s, l) => s + l.etiquetas.length, 0));
const totalGeneral = computed(() => totalCola.value + totalEtiquetas.value);

const agregarACola = () => {
  const etiquetas = construirEtiquetasActuales();
  if (!etiquetas.length) return alert('Pon cantidades en al menos una talla/color antes de agregar a la cola.');
  cola.value.push({
    id: Date.now(),
    producto: nombreProducto(Number(productoId.value)),
    marca: marca.value,
    total: etiquetas.length,
    etiquetas,
  });
  vaciarCantidades(); // limpia los números pero conserva los colores para la siguiente prenda
};
const quitarLote = (i: number) => cola.value.splice(i, 1);

const imprimir = () => {
  // Junta las etiquetas de la COLA + las de la matriz actual (si tiene cantidades)
  const etiquetas: any[] = [...cola.value.flatMap((l) => l.etiquetas), ...construirEtiquetasActuales()];
  if (!etiquetas.length) return alert('No hay etiquetas para imprimir. Pon cantidades o agrega prendas a la cola.');

  // Generamos el código de barras (SVG) UNA vez por SKU (cache) y se lo asignamos a cada etiqueta
  const imgCache: Record<string, string> = {};
  for (const e of etiquetas) {
    if (!imgCache[e.sku]) imgCache[e.sku] = barcodeSvg(e.sku);
    e.img = imgCache[e.sku];
  }

  let cuerpo = '';
  for (let i = 0; i < etiquetas.length; i += 3) {
    cuerpo += '<div class="fila">';
    for (let j = 0; j < 3; j++) {
      const e = etiquetas[i + j];
      if (e) {
        cuerpo += `
          <div class="etiqueta">
            <div class="contenido">
              ${e.precio != null ? `<div class="precio">PRECIO S/ ${e.precio.toFixed(2)}</div>` : ''}
              <div class="marca">${e.marca}</div>
              <div class="tipo-prenda">${e.nombreProducto}</div>
              <div class="svg-container">${e.img}</div>
              <div class="sku-lectura">${e.sku}</div>
              <div class="footer-etiqueta">
                <span class="talla-gigante">${e.talla}</span>
                <span class="color-texto">${e.nombreColor}</span>
              </div>
            </div>
          </div>`;
      } else {
        cuerpo += '<div class="etiqueta"></div>';
      }
    }
    cuerpo += '</div>';
  }

  // 🔧 Alto real de cada "página" = etiqueta + gap del rollo. Empieza en 40 (sin gap).
  // Si al imprimir varias filas se van corriendo, sube este número de a poco (40.5, 41…)
  // midiendo el blanco entre una etiqueta y la de abajo. Ojo: valores grandes descuadran más.
  const PITCH = 40;

  const html = `
    <html><head><title>Etiquetas</title><style>
      @page { size: 100mm ${PITCH}mm; margin: 0 !important; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 100mm; background: #fff; font-family: Arial, sans-serif; }
      .fila { display: flex; flex-direction: row; width: 100mm; height: ${PITCH}mm; justify-content: space-around; align-items: flex-start; overflow: hidden; page-break-inside: avoid; page-break-after: always; }
      /* La etiqueta física es 30mm x 40mm. Adentro rotamos el contenido 90°
         para que el código de barras corra a lo LARGO de los 40mm. */
      /* SIN position:absolute (eso se encimaba entre páginas). Centramos con flex
         y rotamos el contenido; queda contenido en su propia página. */
      .etiqueta { width: 30mm; height: 40mm; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      .contenido {
        width: 40mm; height: 30mm; flex: 0 0 auto;  /* marco lógico horizontal */
        transform: rotate(-90deg);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 0.6mm;                                /* separación pareja entre líneas */
        padding: 1mm 1.5mm;
      }
      .precio { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; line-height: 1; }
      .marca { font-size: 14px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; line-height: 1.05; -webkit-text-stroke: 0.3px #000; }
      .tipo-prenda { font-size: 7.5px; font-weight: 600; letter-spacing: 0.2px; text-transform: uppercase; line-height: 1; width: 100%; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .svg-container { width: 100%; display: flex; justify-content: center; }
      .svg-container svg { shape-rendering: crispEdges; }
      .sku-lectura { font-family: monospace; font-size: 7px; font-weight: 600; letter-spacing: 0.5px; line-height: 1; }
      .footer-etiqueta { display: flex; justify-content: space-between; align-items: center; width: 100%; border-top: 1px dashed #000; padding-top: 1mm; margin-top: 0.4mm; }
      .talla-gigante { font-size: 16px; font-weight: 900; line-height: 0.85; }
      .color-texto { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; max-width: 20mm; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

// Vacía SOLO las cantidades (números), conservando los colores para reutilizarlos
const vaciarCantidades = () => { for (const f of filas.value) f.cant = {}; };
// Vacía los colores (filas). También limpia sus cantidades.
const vaciarColores = () => { filas.value = []; };

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
        <span class="text-sm font-black text-blue-600 mr-auto">{{ totalEtiquetas }} etiqueta(s) en esta prenda</span>
        <button @click="vaciarCantidades" :disabled="!totalEtiquetas" class="px-5 py-3 text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-xl font-bold text-sm disabled:opacity-40" title="Borra solo los números, conserva los colores">
          Vaciar cantidades
        </button>
        <button @click="vaciarColores" :disabled="!filas.length" class="px-5 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold text-sm disabled:opacity-40" title="Borra también los colores">
          Vaciar colores
        </button>
        <button @click="agregarACola" :disabled="!totalEtiquetas" class="bg-gray-900 text-white px-6 py-3 rounded-xl font-black hover:bg-black disabled:opacity-40 flex items-center gap-2">
          ➕ Agregar prenda a la cola
        </button>
      </div>
    </div>

    <!-- COLA DE IMPRESIÓN -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div class="flex flex-wrap justify-between items-center gap-3 mb-3">
        <h3 class="font-bold text-gray-700">🧺 Cola de impresión <span class="text-gray-400 font-normal text-sm">({{ cola.length }} prenda(s))</span></h3>
        <button
          @click="imprimir"
          :disabled="!totalGeneral"
          class="bg-blue-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2"
        >
          🖨️ Imprimir todo ({{ totalGeneral }})
        </button>
      </div>

      <div v-if="!cola.length" class="text-sm text-gray-400 py-4 text-center">
        Aún no agregas prendas a la cola. Arma una prenda arriba y pulsa "Agregar prenda a la cola". Puedes imprimir directo (solo la prenda actual) o juntar varias aquí.
      </div>
      <div v-else class="space-y-2">
        <div v-for="(l, i) in cola" :key="l.id" class="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
          <div>
            <span class="font-bold text-gray-800">{{ l.producto }}</span>
            <span class="text-xs text-gray-400 ml-2">· {{ l.marca }} · {{ l.total }} etiqueta(s)</span>
          </div>
          <button @click="quitarLote(i)" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">🗑️</button>
        </div>
        <p class="text-xs text-gray-500 pt-1">Total en la cola: <b>{{ totalCola }}</b> · Prenda actual sin agregar: <b>{{ totalEtiquetas }}</b> · "Imprimir todo" imprime ambas.</p>
      </div>
    </div>
  </div>
</template>
