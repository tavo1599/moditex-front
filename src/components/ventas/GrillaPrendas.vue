<script setup lang="ts">
import { ref, computed } from 'vue';
import { ordenarTallas } from '../../utils/tallas';

/**
 * 🎯 GRILLA TÁCTIL DE VENTA
 *
 * Reemplaza la dependencia de la pistola láser: cuando la etiqueta no lee (o ya
 * ni existe), el vendedor toca la prenda y después toca la celda de talla+color.
 * Dos toques, sin escribir nada, y el stock por variante sigue quedando exacto.
 *
 * Las celdas en cero también se pueden tocar a propósito: el sistema y el físico
 * se desfasan, y bloquear ahí era justo lo que hacía que la venta se apuntara en
 * papel. Al tocarla salta la confirmación de "vender igual" del composable.
 */

const props = defineProps<{
  inventario: any[];      // inventario con skuCalculado ya resuelto
  colores: any[];
  carrito: any[];
  bodegaId: number | '';
}>();

const emit = defineEmits<{ (e: 'agregar', prenda: any): void }>();

const prendaActiva = ref<string>('');
const busqueda = ref('');

const claveProducto = (item: any) =>
  String(item?.productoId ?? item?.producto?.id ?? item?.producto?.skuBase ?? item?.producto?.nombre ?? '—');

const getColorObj = (cod: string) => props.colores.find(c => c.codigo === cod || c.nombre === cod);
const nombreColor = (cod: string) => getColorObj(cod)?.nombre || cod || '—';
const hexColor = (cod: string) => {
  const c = getColorObj(cod);
  return c?.hex || c?.codigoHex || '#e5e7eb';
};

/** Solo el inventario de la bodega donde está parada la caja. */
const inventarioBodega = computed(() =>
  props.bodegaId === ''
    ? []
    : props.inventario.filter(i => Number(i.bodegaId) === Number(props.bodegaId))
);

/** Prendas disponibles, ordenadas por las que más stock tienen (las que más se venden). */
const prendas = computed(() => {
  const mapa = new Map<string, any>();
  inventarioBodega.value.forEach(item => {
    const clave = claveProducto(item);
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        clave,
        nombre: item.producto?.nombre || 'Producto',
        skuBase: item.producto?.skuBase || '',
        precio: Number(item.producto?.precioVenta) || 0,
        total: 0
      });
    }
    mapa.get(clave).total += Number(item.stock) || 0;
  });

  const q = busqueda.value.trim().toLowerCase();
  return Array.from(mapa.values())
    .filter(p => !q || `${p.nombre} ${p.skuBase}`.toLowerCase().includes(q))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
});

// Se resuelve contra el inventario y no contra `prendas`, porque esa lista está
// filtrada por el buscador y la prenda abierta podría quedar fuera del filtro.
const prendaSeleccionada = computed(() => {
  if (!prendaActiva.value) return null;
  const ref = inventarioBodega.value.find(i => claveProducto(i) === prendaActiva.value);
  return {
    nombre: ref?.producto?.nombre || 'Prenda',
    skuBase: ref?.producto?.skuBase || ''
  };
});

/** Cuántas unidades de esta variante ya están en el carrito (feedback inmediato del toque). */
const enCarrito = (item: any) => {
  const linea = props.carrito.find(
    c => Number(c.productoId) === Number(item.productoId ?? item.producto?.id)
      && c.color === item.color
      && c.talla === item.talla
  );
  return linea ? Number(linea.cantidad) : 0;
};

/** Matriz color (filas) × talla (columnas) de la prenda abierta. */
const matriz = computed(() => {
  if (!prendaActiva.value) return { tallas: [], filas: [] as any[] };

  const variantes = inventarioBodega.value.filter(i => claveProducto(i) === prendaActiva.value);
  const tallas = ordenarTallas(Array.from(new Set(variantes.map(v => String(v.talla ?? '—')))));

  const porColor = new Map<string, Record<string, any>>();
  variantes.forEach(v => {
    const color = String(v.color ?? '—');
    if (!porColor.has(color)) porColor.set(color, {});
    porColor.get(color)![String(v.talla ?? '—')] = v;
  });

  const filas = Array.from(porColor.entries())
    .map(([color, celdas]) => ({
      color,
      nombre: nombreColor(color),
      hex: hexColor(color),
      celdas,
      total: Object.values(celdas).reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0)
    }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));

  return { tallas, filas };
});

const tocarCelda = (variante: any) => {
  if (!variante) return;
  emit('agregar', variante);
};

const volver = () => { prendaActiva.value = ''; };
</script>

<template>
  <div class="h-full flex flex-col">

    <!-- Sin bodega no hay nada que mostrar -->
    <div v-if="bodegaId === ''" class="flex-1 flex items-center justify-center text-center p-6">
      <p class="font-bold text-gray-400 text-sm">Selecciona una bodega arriba para ver las prendas disponibles.</p>
    </div>

    <!-- PASO 1: elegir la prenda -->
    <template v-else-if="!prendaActiva">
      <div class="p-4 border-b border-gray-100 shrink-0">
        <input
          v-model="busqueda"
          type="text"
          placeholder="🔎 Filtrar prenda por nombre o SKU..."
          class="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-500"
        />
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="prendas.length === 0" class="h-full flex items-center justify-center">
          <p class="font-bold text-gray-400 text-sm text-center">No hay prendas con inventario en esta bodega.</p>
        </div>

        <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <button
            v-for="p in prendas"
            :key="p.clave"
            @click="prendaActiva = p.clave"
            class="text-left bg-white border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50/40 rounded-2xl p-4 transition-all active:scale-[0.97] flex flex-col justify-between min-h-[104px]"
          >
            <p class="font-black text-gray-800 text-sm leading-tight line-clamp-2">{{ p.nombre }}</p>
            <div class="flex items-end justify-between gap-2 mt-3">
              <span class="text-[9px] font-mono text-gray-400 truncate">{{ p.skuBase }}</span>
              <span
                class="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
                :class="p.total > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-gray-400 bg-gray-100'"
              >{{ p.total }} u.</span>
            </div>
          </button>
        </div>
      </div>
    </template>

    <!-- PASO 2: tocar la celda talla × color -->
    <template v-else>
      <div class="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
        <button
          @click="volver"
          class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs px-3 py-2.5 rounded-xl transition-colors shrink-0"
        >
          ← Prendas
        </button>
        <div class="min-w-0">
          <p class="font-black text-gray-800 text-sm truncate">{{ prendaSeleccionada?.nombre }}</p>
          <p class="text-[10px] font-bold text-gray-400">Toca una celda para agregar 1 unidad</p>
        </div>
      </div>

      <div class="flex-1 overflow-auto p-4">
        <table class="w-full border-separate border-spacing-1">
          <thead>
            <tr>
              <th class="sticky left-0 bg-white z-10 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest px-2 min-w-[110px]">Color</th>
              <th
                v-for="t in matriz.tallas"
                :key="t"
                class="text-center text-[11px] font-black text-gray-600 bg-gray-100 rounded-lg py-2 min-w-[62px]"
              >{{ t }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in matriz.filas" :key="f.color">
              <td class="sticky left-0 bg-white z-10 pr-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="w-3 h-3 rounded-full border border-gray-300 shrink-0" :style="{ backgroundColor: f.hex }"></span>
                  <span class="font-bold text-gray-700 text-xs truncate">{{ f.nombre }}</span>
                </div>
              </td>

              <td v-for="t in matriz.tallas" :key="t" class="p-0">
                <button
                  v-if="f.celdas[t]"
                  @click="tocarCelda(f.celdas[t])"
                  class="w-full h-14 rounded-lg font-black transition-all active:scale-90 relative border-2 flex flex-col items-center justify-center leading-none"
                  :class="Number(f.celdas[t].stock) > 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400'
                    : 'bg-gray-50 border-dashed border-gray-200 text-gray-300 hover:border-amber-400 hover:text-amber-600'"
                  :title="Number(f.celdas[t].stock) > 0
                    ? `${f.nombre} · Talla ${t} · ${f.celdas[t].stock} disponibles`
                    : `${f.nombre} · Talla ${t} · sin stock en el sistema`"
                >
                  <span class="text-base">{{ f.celdas[t].stock }}</span>
                  <span class="text-[8px] font-bold uppercase tracking-wider opacity-60">und</span>

                  <span
                    v-if="enCarrito(f.celdas[t]) > 0"
                    class="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md"
                  >{{ enCarrito(f.celdas[t]) }}</span>
                </button>

                <!-- Esa combinación de talla y color no existe para esta prenda -->
                <div v-else class="w-full h-14 rounded-lg bg-gray-50/60 border border-gray-100"></div>
              </td>
            </tr>
          </tbody>
        </table>

        <p class="text-[10px] font-bold text-gray-400 mt-4 px-1">
          Las celdas punteadas están en cero según el sistema. Si tienes la prenda físicamente puedes tocarlas igual: se pedirá confirmación y quedará marcada para revisar inventario.
        </p>
      </div>
    </template>
  </div>
</template>
