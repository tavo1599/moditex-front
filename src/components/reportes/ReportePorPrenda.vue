<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import api from '../../api/axios';
import { ordenarTallas } from '../../utils/tallas';

const inventario = ref<any[]>([]);
const bodegas = ref<any[]>([]);
const colores = ref<any[]>([]);
const cargando = ref(false);

const prendaSeleccionada = ref<string>('');
const bodegaFiltro = ref<number | ''>('');
const soloConStock = ref(true);

const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resInv, resBod, resCol] = await Promise.all([
      api.get('/almacen-terminados/inventario'),
      api.get('/almacen-terminados/bodegas'),
      api.get('/colores')
    ]);
    inventario.value = resInv.data || [];
    bodegas.value = resBod.data || [];
    colores.value = resCol.data || [];
  } catch (e) {
    console.error('Error cargando el reporte por prenda:', e);
  } finally {
    cargando.value = false;
  }
};

// --- Helpers ---
const claveProducto = (item: any) =>
  String(item?.producto?.id ?? item?.producto?.skuBase ?? item?.producto?.nombre ?? '—');

const getColorObj = (cod: string) =>
  colores.value.find(c => c.codigo === cod || c.nombre === cod);

const getNombreColor = (cod: string) => getColorObj(cod)?.nombre || cod || '—';
const getHexColor = (cod: string) => {
  const c = getColorObj(cod);
  return c?.hex || c?.codigoHex || '#e5e7eb';
};

// --- Listado de prendas disponibles ---
const prendas = computed(() => {
  const mapa = new Map<string, any>();
  inventario.value.forEach(item => {
    const k = claveProducto(item);
    if (!mapa.has(k)) {
      mapa.set(k, {
        clave: k,
        nombre: item?.producto?.nombre || '—',
        skuBase: item?.producto?.skuBase || '',
        total: 0
      });
    }
    mapa.get(k).total += Number(item.stock) || 0;
  });
  return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
});

// --- Filas del inventario que entran al reporte ---
const filas = computed(() => {
  if (!prendaSeleccionada.value) return [];
  return inventario.value.filter(item => {
    if (claveProducto(item) !== prendaSeleccionada.value) return false;
    if (bodegaFiltro.value !== '' && Number(item.bodegaId ?? item.bodega?.id) !== Number(bodegaFiltro.value)) return false;
    return true;
  });
});

const prendaActual = computed(() => prendas.value.find(p => p.clave === prendaSeleccionada.value));

// --- Matriz Color x Talla ---
const matriz = computed(() => {
  const tallasSet = new Set<string>();
  const coloresMap = new Map<string, Record<string, number>>();

  filas.value.forEach(item => {
    const talla = String(item.talla ?? '—');
    const color = String(item.color ?? '—');
    const stock = Number(item.stock) || 0;

    tallasSet.add(talla);
    if (!coloresMap.has(color)) coloresMap.set(color, {});
    const fila = coloresMap.get(color)!;
    fila[talla] = (fila[talla] || 0) + stock;
  });

  let tallas = ordenarTallas(Array.from(tallasSet));

  let filasColor = Array.from(coloresMap.entries()).map(([color, porTalla]) => {
    const total = Object.values(porTalla).reduce((a, b) => a + b, 0);
    return { color, nombre: getNombreColor(color), hex: getHexColor(color), porTalla, total };
  });

  if (soloConStock.value) {
    filasColor = filasColor.filter(f => f.total > 0);
    tallas = tallas.filter(t => filasColor.some(f => (f.porTalla[t] || 0) > 0));
  }

  filasColor.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));

  const totalPorTalla: Record<string, number> = {};
  tallas.forEach(t => {
    totalPorTalla[t] = filasColor.reduce((acc, f) => acc + (f.porTalla[t] || 0), 0);
  });

  const totalGeneral = filasColor.reduce((acc, f) => acc + f.total, 0);

  return { tallas, filasColor, totalPorTalla, totalGeneral };
});

// --- Resumen por bodega ---
const porBodega = computed(() => {
  const mapa = new Map<string, number>();
  filas.value.forEach(item => {
    const nombre = item.bodega?.nombre || '—';
    mapa.set(nombre, (mapa.get(nombre) || 0) + (Number(item.stock) || 0));
  });
  return Array.from(mapa.entries())
    .map(([nombre, total]) => ({ nombre, total }))
    .filter(b => !soloConStock.value || b.total > 0)
    .sort((a, b) => b.total - a.total);
});

const kpis = computed(() => {
  const conStock = filas.value.filter(f => (Number(f.stock) || 0) > 0);
  return {
    total: matriz.value.totalGeneral,
    variantes: conStock.length,
    colores: matriz.value.filasColor.length,
    tallas: matriz.value.tallas.length
  };
});

// --- Exportar CSV ---
const exportarCSV = () => {
  const { tallas, filasColor, totalPorTalla, totalGeneral } = matriz.value;
  const nombre = prendaActual.value?.nombre || 'prenda';
  const sep = ';';
  const lineas: string[] = [];

  lineas.push(`Reporte de stock por prenda${sep}${nombre}`);
  lineas.push(`SKU base${sep}${prendaActual.value?.skuBase || ''}`);
  lineas.push(`Almacén${sep}${bodegaFiltro.value === '' ? 'Todos' : (bodegas.value.find(b => b.id === bodegaFiltro.value)?.nombre || '')}`);
  lineas.push('');
  lineas.push(['Color', ...tallas, 'Total'].join(sep));

  filasColor.forEach(f => {
    lineas.push([f.nombre, ...tallas.map(t => f.porTalla[t] || 0), f.total].join(sep));
  });

  lineas.push(['TOTAL', ...tallas.map(t => totalPorTalla[t] || 0), totalGeneral].join(sep));

  const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock-${nombre.replace(/\s+/g, '-').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const imprimir = () => window.print();

onMounted(cargarDatos);
</script>

<template>
  <div class="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden">

    <div class="px-6 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-lg font-bold text-gray-900">Reporte por Prenda</h3>
        <p class="text-xs text-gray-500 font-medium">Stock total de un modelo, desglosado por talla y color</p>
      </div>
      <div class="flex items-center gap-2 print:hidden">
        <button
          @click="cargarDatos"
          :disabled="cargando"
          class="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg font-bold text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          {{ cargando ? 'Cargando...' : '↻ Actualizar' }}
        </button>
        <button
          v-if="prendaSeleccionada"
          @click="exportarCSV"
          class="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg font-bold text-xs hover:bg-gray-50"
        >
          ⬇ CSV
        </button>
        <button
          v-if="prendaSeleccionada"
          @click="imprimir"
          class="bg-black text-white px-3 py-2 rounded-lg font-bold text-xs hover:bg-gray-800"
        >
          🖨️ Imprimir
        </button>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="px-6 py-4 border-b border-gray-100 flex flex-wrap items-end gap-4 print:hidden">
      <div class="flex flex-col min-w-[260px] flex-1">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Prenda</label>
        <select
          v-model="prendaSeleccionada"
          class="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
        >
          <option value="">— Selecciona una prenda —</option>
          <option v-for="p in prendas" :key="p.clave" :value="p.clave">
            {{ p.nombre }}{{ p.skuBase ? ` (${p.skuBase})` : '' }} · {{ p.total }} und
          </option>
        </select>
      </div>

      <div class="flex flex-col">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Almacén</label>
        <select
          v-model="bodegaFiltro"
          class="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[150px]"
        >
          <option value="">Todos</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
      </div>

      <label class="flex items-center gap-2 mb-2 cursor-pointer select-none">
        <input type="checkbox" v-model="soloConStock" class="w-4 h-4 accent-blue-600" />
        <span class="text-xs font-bold text-gray-600">Ocultar tallas/colores en cero</span>
      </label>
    </div>

    <!-- ESTADOS VACÍOS -->
    <div v-if="cargando && inventario.length === 0" class="py-16 text-center text-gray-400 font-medium">
      Cargando inventario...
    </div>

    <div v-else-if="!prendaSeleccionada" class="py-16 text-center text-gray-400 font-medium">
      Selecciona una prenda para ver su cuadro de tallas y colores.
    </div>

    <div v-else-if="matriz.totalGeneral === 0 && matriz.filasColor.length === 0" class="py-16 text-center text-gray-400 font-medium">
      Esta prenda no tiene stock registrado con los filtros actuales.
    </div>

    <div v-else class="p-6 space-y-6">

      <!-- ENCABEZADO DEL REPORTE -->
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 class="text-2xl font-black text-gray-900">{{ prendaActual?.nombre }}</h4>
          <p v-if="prendaActual?.skuBase" class="text-xs font-mono text-gray-400">{{ prendaActual?.skuBase }}</p>
        </div>
        <div class="bg-gray-900 text-white rounded-2xl px-6 py-3 text-center">
          <p class="text-[10px] text-gray-400 font-black uppercase tracking-wider">Total en stock</p>
          <p class="text-3xl font-black">{{ kpis.total }} <span class="text-base font-bold text-gray-400">und</span></p>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Unidades</p>
          <p class="text-2xl font-black text-gray-900">{{ kpis.total }}</p>
        </div>
        <div class="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Colores</p>
          <p class="text-2xl font-black text-gray-900">{{ kpis.colores }}</p>
        </div>
        <div class="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Tallas</p>
          <p class="text-2xl font-black text-gray-900">{{ kpis.tallas }}</p>
        </div>
        <div class="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Variantes</p>
          <p class="text-2xl font-black text-gray-900">{{ kpis.variantes }}</p>
        </div>
      </div>

      <!-- MATRIZ COLOR x TALLA -->
      <div>
        <h5 class="font-black text-gray-700 mb-2 text-xs uppercase tracking-wider">Cuadro de tallas y colores</h5>
        <div class="border border-gray-100 rounded-xl overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold">
                <th class="p-3 text-left sticky left-0 bg-gray-50 min-w-[170px]">Color</th>
                <th v-for="t in matriz.tallas" :key="t" class="p-3 text-center min-w-[64px]">{{ t }}</th>
                <th class="p-3 text-right bg-gray-100 min-w-[80px]">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="f in matriz.filasColor" :key="f.color" class="hover:bg-gray-50/70 transition-colors">
                <td class="p-3 sticky left-0 bg-white">
                  <div class="flex items-center gap-2">
                    <span class="w-3.5 h-3.5 rounded-full border border-gray-300 shadow-sm inline-block shrink-0" :style="{ backgroundColor: f.hex }"></span>
                    <span class="font-bold text-gray-800">{{ f.nombre }}</span>
                    <span v-if="f.color !== f.nombre" class="text-[10px] text-gray-400 bg-gray-100 px-1.5 rounded font-mono">{{ f.color }}</span>
                  </div>
                </td>
                <td
                  v-for="t in matriz.tallas"
                  :key="t"
                  class="p-3 text-center font-bold tabular-nums"
                  :class="(f.porTalla[t] || 0) === 0 ? 'text-gray-200' : 'text-gray-800'"
                >
                  {{ f.porTalla[t] || 0 }}
                </td>
                <td class="p-3 text-right font-black text-blue-700 bg-blue-50/40 tabular-nums">{{ f.total }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-gray-900 text-white">
                <td class="p-3 font-black text-[11px] uppercase tracking-wider sticky left-0 bg-gray-900">Total por talla</td>
                <td v-for="t in matriz.tallas" :key="t" class="p-3 text-center font-black tabular-nums">
                  {{ matriz.totalPorTalla[t] || 0 }}
                </td>
                <td class="p-3 text-right font-black text-lg tabular-nums">{{ matriz.totalGeneral }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- DESGLOSES SIMPLES -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <h5 class="font-black text-gray-700 mb-2 text-xs uppercase tracking-wider">Total por talla</h5>
          <div class="border border-gray-100 rounded-xl overflow-hidden">
            <table class="w-full text-sm">
              <tbody class="divide-y divide-gray-100">
                <tr v-for="t in matriz.tallas" :key="t">
                  <td class="p-2.5 font-bold text-gray-700">{{ t }}</td>
                  <td class="p-2.5 text-right font-black text-gray-900 tabular-nums">{{ matriz.totalPorTalla[t] || 0 }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h5 class="font-black text-gray-700 mb-2 text-xs uppercase tracking-wider">Total por color</h5>
          <div class="border border-gray-100 rounded-xl overflow-hidden">
            <table class="w-full text-sm">
              <tbody class="divide-y divide-gray-100">
                <tr v-for="f in matriz.filasColor" :key="f.color">
                  <td class="p-2.5">
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-full border border-gray-300 inline-block shrink-0" :style="{ backgroundColor: f.hex }"></span>
                      <span class="font-bold text-gray-700">{{ f.nombre }}</span>
                    </div>
                  </td>
                  <td class="p-2.5 text-right font-black text-gray-900 tabular-nums">{{ f.total }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h5 class="font-black text-gray-700 mb-2 text-xs uppercase tracking-wider">Total por almacén</h5>
          <div class="border border-gray-100 rounded-xl overflow-hidden">
            <table class="w-full text-sm">
              <tbody class="divide-y divide-gray-100">
                <tr v-for="b in porBodega" :key="b.nombre">
                  <td class="p-2.5 font-bold text-gray-700">{{ b.nombre }}</td>
                  <td class="p-2.5 text-right font-black text-gray-900 tabular-nums">{{ b.total }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
