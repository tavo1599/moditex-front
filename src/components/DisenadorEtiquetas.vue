<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import JsBarcode from 'jsbarcode';

// ============================================================
// DISEÑADOR LIBRE DE ETIQUETAS (arrastrar y soltar)
// Todo se maneja en MILÍMETROS: en pantalla se multiplica por SCALE (px/mm) y al
// imprimir se usan los mm tal cual → lo que ves es idéntico a lo que sale.
// El código de barras es SOLO DECORATIVO (no lleva información real).
// ============================================================

type Tipo = 'texto' | 'codigo' | 'linea' | 'marco';
interface Elemento {
  id: number;
  tipo: Tipo;
  x: number; // mm desde el borde izquierdo
  y: number; // mm desde el borde superior
  w: number; // mm de ancho
  h: number; // mm de alto (grosor en 'linea')
  texto?: string;
  fontMM?: number; // alto de letra en mm
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
}

const SCALE = 9; // px por mm en pantalla
const KEY = 'etq_disenador_v1';

const anchoMM = ref(30);
const altoMM = ref(40);
const columnas = ref(3); // etiquetas por fila al imprimir (rollo de 100mm ≈ 3 de 30mm)
const cantidad = ref(3); // cuántas copias imprimir
const elementos = ref<Elemento[]>([]);
const seleccionadoId = ref<number | null>(null);

let seqId = 1;
const nuevoId = () => seqId++;

const seleccionado = computed(() => elementos.value.find((e) => e.id === seleccionadoId.value) || null);

// ---- Código de barras decorativo (una sola imagen reutilizada) ----
const barcodeImg = ref('');
const generarBarcode = () => {
  try {
    const c = document.createElement('canvas');
    JsBarcode(c, 'ESSENTIALWEST', { format: 'CODE128', width: 2, height: 60, displayValue: false, margin: 0 });
    barcodeImg.value = c.toDataURL('image/png');
  } catch { /* noop */ }
};

// ---- Persistencia ----
const guardar = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      anchoMM: anchoMM.value, altoMM: altoMM.value,
      columnas: columnas.value, cantidad: cantidad.value,
      elementos: elementos.value,
    }));
  } catch { /* sin storage */ }
};

const disenoPorDefecto = (): Elemento[] => ([
  { id: nuevoId(), tipo: 'texto', x: 2, y: 2.5, w: 26, h: 5, texto: 'ESSENTIAL WEST', fontMM: 3.6, bold: true, align: 'center', color: '#000' },
  { id: nuevoId(), tipo: 'texto', x: 2, y: 7, w: 26, h: 4, texto: 'Polo Algodón Pima', fontMM: 2.4, bold: false, align: 'center', color: '#000' },
  { id: nuevoId(), tipo: 'linea', x: 2, y: 11.5, w: 26, h: 0.4, color: '#000' },
  { id: nuevoId(), tipo: 'codigo', x: 3, y: 14, w: 24, h: 9 },
  { id: nuevoId(), tipo: 'texto', x: 2, y: 24, w: 26, h: 3, texto: 'S/ 49.90', fontMM: 2.6, bold: true, align: 'center', color: '#000' },
  { id: nuevoId(), tipo: 'texto', x: 2, y: 31, w: 12, h: 6, texto: 'M', fontMM: 5, bold: true, align: 'left', color: '#000' },
  { id: nuevoId(), tipo: 'texto', x: 14, y: 33, w: 14, h: 4, texto: 'AZUL', fontMM: 2.4, bold: true, align: 'right', color: '#000' },
]);

const cargarDiseno = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      anchoMM.value = d.anchoMM || 30;
      altoMM.value = d.altoMM || 40;
      columnas.value = d.columnas || 3;
      cantidad.value = d.cantidad || 3;
      elementos.value = Array.isArray(d.elementos) ? d.elementos : [];
      seqId = elementos.value.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    } else {
      elementos.value = disenoPorDefecto();
    }
  } catch {
    elementos.value = disenoPorDefecto();
  }
};

// ---- Agregar / quitar / duplicar ----
const agregarTexto = () => {
  const e: Elemento = { id: nuevoId(), tipo: 'texto', x: 3, y: 3, w: 24, h: 4, texto: 'Texto', fontMM: 3, bold: true, align: 'center', color: '#000' };
  elementos.value.push(e); seleccionadoId.value = e.id; guardar();
};
const agregarCodigo = () => {
  const e: Elemento = { id: nuevoId(), tipo: 'codigo', x: 3, y: 15, w: 24, h: 9 };
  elementos.value.push(e); seleccionadoId.value = e.id; guardar();
};
const agregarLinea = () => {
  const e: Elemento = { id: nuevoId(), tipo: 'linea', x: 3, y: 20, w: 24, h: 0.4, color: '#000' };
  elementos.value.push(e); seleccionadoId.value = e.id; guardar();
};
const agregarMarco = () => {
  const e: Elemento = { id: nuevoId(), tipo: 'marco', x: 1, y: 1, w: anchoMM.value - 2, h: altoMM.value - 2, color: '#000' };
  elementos.value.unshift(e); seleccionadoId.value = e.id; guardar();
};
const eliminar = () => {
  if (seleccionadoId.value == null) return;
  elementos.value = elementos.value.filter((e) => e.id !== seleccionadoId.value);
  seleccionadoId.value = null; guardar();
};
const duplicar = () => {
  const s = seleccionado.value; if (!s) return;
  const copia: Elemento = { ...s, id: nuevoId(), x: s.x + 2, y: s.y + 2 };
  elementos.value.push(copia); seleccionadoId.value = copia.id; guardar();
};
const restablecer = () => {
  if (!confirm('¿Volver al diseño de ejemplo? Se perderá el diseño actual.')) return;
  elementos.value = disenoPorDefecto(); seleccionadoId.value = null; guardar();
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// ---- Arrastrar y redimensionar (pointer events) ----
let drag: null | { id: number; mode: 'move' | 'resize'; px: number; py: number; ox: number; oy: number; ow: number; oh: number } = null;

const onPointerDownEl = (e: PointerEvent, el: Elemento) => {
  e.stopPropagation();
  seleccionadoId.value = el.id;
  drag = { id: el.id, mode: 'move', px: e.clientX, py: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};
const onPointerDownResize = (e: PointerEvent, el: Elemento) => {
  e.stopPropagation();
  seleccionadoId.value = el.id;
  drag = { id: el.id, mode: 'resize', px: e.clientX, py: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};
const onPointerMove = (e: PointerEvent) => {
  if (!drag) return;
  const el = elementos.value.find((x) => x.id === drag!.id);
  if (!el) return;
  const dxmm = (e.clientX - drag.px) / SCALE;
  const dymm = (e.clientY - drag.py) / SCALE;
  if (drag.mode === 'move') {
    el.x = clamp(drag.ox + dxmm, 0, Math.max(0, anchoMM.value - 1));
    el.y = clamp(drag.oy + dymm, 0, Math.max(0, altoMM.value - 1));
  } else {
    el.w = Math.max(2, drag.ow + dxmm);
    if (el.tipo === 'codigo' || el.tipo === 'marco') el.h = Math.max(2, drag.oh + dymm);
    else if (el.tipo === 'texto') el.h = Math.max(2, drag.oh + dymm);
  }
};
const onPointerUp = () => {
  drag = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  guardar();
};

// ---- Estilos en pantalla (px) ----
const estiloPantalla = (el: Elemento) => {
  const base: Record<string, string> = {
    left: el.x * SCALE + 'px',
    top: el.y * SCALE + 'px',
    width: el.w * SCALE + 'px',
  };
  if (el.tipo === 'linea') {
    base.height = Math.max(1, el.h * SCALE) + 'px';
    base.background = el.color || '#000';
  } else if (el.tipo === 'marco') {
    base.height = el.h * SCALE + 'px';
    base.border = '1px solid ' + (el.color || '#000');
    base.background = 'transparent';
  } else if (el.tipo === 'texto') {
    base.fontSize = (el.fontMM || 3) * SCALE + 'px';
    base.fontWeight = el.bold ? '800' : '400';
    base.fontStyle = el.italic ? 'italic' : 'normal';
    base.textAlign = el.align || 'center';
    base.color = el.color || '#000';
    base.lineHeight = '1';
    base.overflow = 'hidden';
  } else if (el.tipo === 'codigo') {
    base.height = el.h * SCALE + 'px';
  }
  return base;
};

// ---- Imprimir ----
const construirLabelHTML = () => {
  let html = `<div class="label">`;
  for (const el of elementos.value) {
    const pos = `position:absolute;left:${el.x}mm;top:${el.y}mm;`;
    if (el.tipo === 'texto') {
      html += `<div style="${pos}width:${el.w}mm;font-size:${el.fontMM || 3}mm;font-weight:${el.bold ? 800 : 400};font-style:${el.italic ? 'italic' : 'normal'};text-align:${el.align || 'center'};color:${el.color || '#000'};line-height:1;overflow:hidden;">${(el.texto || '').replace(/</g, '&lt;')}</div>`;
    } else if (el.tipo === 'linea') {
      html += `<div style="${pos}width:${el.w}mm;height:${el.h}mm;background:${el.color || '#000'};"></div>`;
    } else if (el.tipo === 'marco') {
      html += `<div style="${pos}width:${el.w}mm;height:${el.h}mm;border:0.3mm solid ${el.color || '#000'};box-sizing:border-box;"></div>`;
    } else if (el.tipo === 'codigo') {
      html += `<div style="${pos}width:${el.w}mm;height:${el.h}mm;"><img src="${barcodeImg.value}" style="width:100%;height:100%;image-rendering:crisp-edges;"></div>`;
    }
  }
  html += `</div>`;
  return html;
};

const imprimir = () => {
  if (!elementos.value.length) return alert('El diseño está vacío. Agrega al menos un elemento.');
  const total = Math.max(1, Number(cantidad.value) || 1);
  const cols = Math.max(1, Number(columnas.value) || 1);
  const labelHTML = construirLabelHTML();
  const anchoFila = cols * anchoMM.value;

  let cuerpo = '';
  for (let i = 0; i < total; i += cols) {
    cuerpo += `<div class="fila">`;
    for (let j = 0; j < cols; j++) {
      cuerpo += (i + j < total) ? labelHTML : `<div class="label"></div>`;
    }
    cuerpo += `</div>`;
  }

  const doc = `
    <html><head><meta charset="utf-8"><style>
      @page { size: ${anchoFila}mm ${altoMM.value}mm; margin: 0 !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
      .fila { display: flex; flex-direction: row; width: ${anchoFila}mm; height: ${altoMM.value}mm; page-break-after: always; }
      .label { position: relative; width: ${anchoMM.value}mm; height: ${altoMM.value}mm; overflow: hidden; box-sizing: border-box; }
    </style></head><body>${cuerpo}</body></html>`;

  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const w = iframe.contentWindow!;
  w.document.open(); w.document.write(doc); w.document.close();
  setTimeout(() => {
    w.focus(); w.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 400);
};

const onCanvasClick = () => { seleccionadoId.value = null; };

onMounted(() => { generarBarcode(); cargarDiseno(); });
onBeforeUnmount(() => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); });
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
    <!-- LIENZO -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <!-- Barra de herramientas -->
      <div class="flex flex-wrap items-center gap-2 mb-5">
        <button @click="agregarTexto" class="bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-black">＋ Texto</button>
        <button @click="agregarCodigo" class="bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-black">＋ Código</button>
        <button @click="agregarLinea" class="bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-black">＋ Línea</button>
        <button @click="agregarMarco" class="bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-black">＋ Marco</button>
        <span class="w-px h-6 bg-gray-200 mx-1"></span>
        <button @click="duplicar" :disabled="!seleccionado" class="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-40">⧉ Duplicar</button>
        <button @click="eliminar" :disabled="!seleccionado" class="border border-red-200 text-red-500 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-50 disabled:opacity-40">🗑 Eliminar</button>
        <button @click="restablecer" class="border border-gray-300 text-gray-500 px-3 py-2 rounded-lg text-xs font-bold hover:bg-gray-50 ml-auto">↺ Ejemplo</button>
      </div>

      <!-- Área del lienzo -->
      <div class="flex justify-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200 overflow-auto">
        <div
          class="relative bg-white shadow-md select-none"
          :style="{ width: anchoMM * SCALE + 'px', height: altoMM * SCALE + 'px' }"
          @click="onCanvasClick"
        >
          <template v-for="el in elementos" :key="el.id">
            <div
              class="absolute cursor-move"
              :class="seleccionadoId === el.id ? 'outline outline-2 outline-blue-500' : 'hover:outline hover:outline-1 hover:outline-blue-300'"
              :style="estiloPantalla(el)"
              @pointerdown="onPointerDownEl($event, el)"
            >
              <template v-if="el.tipo === 'texto'">{{ el.texto }}</template>
              <img v-else-if="el.tipo === 'codigo'" :src="barcodeImg" class="w-full h-full pointer-events-none" style="image-rendering:crisp-edges" draggable="false" />
              <!-- linea y marco se pintan con el propio estilo -->

              <!-- Manija de redimensionar (no para 'linea', que solo cambia de largo con la manija también) -->
              <span
                v-if="seleccionadoId === el.id"
                class="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-blue-500 border border-white rounded-sm cursor-nwse-resize"
                @pointerdown="onPointerDownResize($event, el)"
              ></span>
            </div>
          </template>
        </div>
      </div>

      <p class="text-center text-xs text-gray-400 mt-3">
        Etiqueta {{ anchoMM }} × {{ altoMM }} mm · Arrastra los elementos · Toca uno para editarlo a la derecha
      </p>
    </div>

    <!-- PANEL LATERAL -->
    <div class="space-y-4">
      <!-- Tamaño de etiqueta + impresión -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h3 class="font-bold text-gray-700 text-sm">📐 Etiqueta e impresión</h3>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-[10px] font-bold text-gray-500 uppercase">Ancho (mm)
            <input v-model.number="anchoMM" @change="guardar" type="number" min="10" class="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm">
          </label>
          <label class="text-[10px] font-bold text-gray-500 uppercase">Alto (mm)
            <input v-model.number="altoMM" @change="guardar" type="number" min="10" class="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm">
          </label>
          <label class="text-[10px] font-bold text-gray-500 uppercase">Por fila
            <input v-model.number="columnas" @change="guardar" type="number" min="1" class="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm">
          </label>
          <label class="text-[10px] font-bold text-gray-500 uppercase">Cantidad
            <input v-model.number="cantidad" @change="guardar" type="number" min="1" class="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm">
          </label>
        </div>
        <button @click="imprimir" class="w-full bg-blue-600 text-white py-3 rounded-xl font-black hover:bg-blue-700 shadow-lg shadow-blue-500/20">🖨️ Imprimir ({{ cantidad }})</button>
      </div>

      <!-- Propiedades del elemento seleccionado -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h3 class="font-bold text-gray-700 text-sm">🎛️ Elemento seleccionado</h3>
        <div v-if="!seleccionado" class="text-xs text-gray-400 py-4 text-center">Toca un elemento del lienzo para editarlo.</div>
        <div v-else class="space-y-3">
          <div class="text-[10px] font-bold uppercase tracking-wider text-blue-600">{{ seleccionado.tipo }}</div>

          <!-- TEXTO -->
          <template v-if="seleccionado.tipo === 'texto'">
            <label class="block text-[10px] font-bold text-gray-500 uppercase">Contenido
              <textarea v-model="seleccionado.texto" @input="guardar" rows="2" class="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm resize-none"></textarea>
            </label>
            <label class="block text-[10px] font-bold text-gray-500 uppercase">Tamaño de letra ({{ seleccionado.fontMM?.toFixed(1) }} mm)
              <input v-model.number="seleccionado.fontMM" @input="guardar" type="range" min="1.5" max="10" step="0.1" class="mt-1 w-full">
            </label>
            <div class="flex gap-2">
              <button @click="seleccionado.bold = !seleccionado.bold; guardar()" :class="seleccionado.bold ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'" class="flex-1 py-2 rounded-lg text-xs font-black">N</button>
              <button @click="seleccionado.italic = !seleccionado.italic; guardar()" :class="seleccionado.italic ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'" class="flex-1 py-2 rounded-lg text-xs italic font-bold">i</button>
              <button @click="seleccionado.align = 'left'; guardar()" :class="seleccionado.align === 'left' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'" class="flex-1 py-2 rounded-lg text-xs">⬅</button>
              <button @click="seleccionado.align = 'center'; guardar()" :class="seleccionado.align === 'center' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'" class="flex-1 py-2 rounded-lg text-xs">▬</button>
              <button @click="seleccionado.align = 'right'; guardar()" :class="seleccionado.align === 'right' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'" class="flex-1 py-2 rounded-lg text-xs">➡</button>
            </div>
          </template>

          <!-- CODIGO -->
          <template v-else-if="seleccionado.tipo === 'codigo'">
            <p class="text-[11px] text-gray-400">Código de barras decorativo (sin información real).</p>
            <label class="block text-[10px] font-bold text-gray-500 uppercase">Ancho ({{ seleccionado.w.toFixed(0) }} mm)
              <input v-model.number="seleccionado.w" @input="guardar" type="range" min="5" max="40" step="0.5" class="mt-1 w-full">
            </label>
            <label class="block text-[10px] font-bold text-gray-500 uppercase">Alto ({{ seleccionado.h.toFixed(0) }} mm)
              <input v-model.number="seleccionado.h" @input="guardar" type="range" min="3" max="25" step="0.5" class="mt-1 w-full">
            </label>
          </template>

          <!-- LINEA -->
          <template v-else-if="seleccionado.tipo === 'linea'">
            <label class="block text-[10px] font-bold text-gray-500 uppercase">Largo ({{ seleccionado.w.toFixed(0) }} mm)
              <input v-model.number="seleccionado.w" @input="guardar" type="range" min="2" max="40" step="0.5" class="mt-1 w-full">
            </label>
            <label class="block text-[10px] font-bold text-gray-500 uppercase">Grosor ({{ seleccionado.h.toFixed(1) }} mm)
              <input v-model.number="seleccionado.h" @input="guardar" type="range" min="0.2" max="3" step="0.1" class="mt-1 w-full">
            </label>
          </template>

          <!-- MARCO -->
          <template v-else-if="seleccionado.tipo === 'marco'">
            <label class="block text-[10px] font-bold text-gray-500 uppercase">Ancho ({{ seleccionado.w.toFixed(0) }} mm)
              <input v-model.number="seleccionado.w" @input="guardar" type="range" min="5" :max="anchoMM" step="0.5" class="mt-1 w-full">
            </label>
            <label class="block text-[10px] font-bold text-gray-500 uppercase">Alto ({{ seleccionado.h.toFixed(0) }} mm)
              <input v-model.number="seleccionado.h" @input="guardar" type="range" min="5" :max="altoMM" step="0.5" class="mt-1 w-full">
            </label>
          </template>

          <!-- POSICIÓN (común) -->
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
            <label class="text-[10px] font-bold text-gray-500 uppercase">X (mm)
              <input v-model.number="seleccionado.x" @input="guardar" type="number" step="0.5" class="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm">
            </label>
            <label class="text-[10px] font-bold text-gray-500 uppercase">Y (mm)
              <input v-model.number="seleccionado.y" @input="guardar" type="number" step="0.5" class="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm">
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
