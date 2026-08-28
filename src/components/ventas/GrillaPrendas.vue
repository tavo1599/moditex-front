<script setup lang="ts">
import { ref, computed } from 'vue';
import { ordenarTallas } from '../../utils/tallas';

/**
 * 🎯 GRILLA TÁCTIL DE VENTA
 *
 * Reemplaza la dependencia de la pistola láser: cuando la etiqueta no lee (o ya
 * ni existe), el vendedor toca la prenda y después toca la talla. Dos toques,
 * sin escribir nada.
 *
 * 🎨 SIN COLOR: elegir el color en el mostrador era lo que frenaba la venta, así
 * que la grilla muestra el stock de cada talla SUMANDO todos sus colores. De qué
 * color sale cada unidad lo reparte el sistema al cobrar (`construirDetalles` en
 * useVentas), empezando por el color con más stock. El almacén sigue viendo el
 * detalle por color; lo estimado se corrige con el conteo físico.
 *
 * Las tallas en cero también se pueden tocar a propósito: el sistema y el físico
 * se desfasan, y bloquear ahí era justo lo que hacía que la venta se apuntara en
 * papel. Al tocarla queda avisada para revisar inventario, sin frenar la venta.
 */

const props = defineProps<{
  inventario: any[];      // inventario con skuCalculado ya resuelto
  carrito: any[];
  bodegaId: number | '';
  listaPrecio: string;    // 'MINORISTA' | 'MAYORISTA'
}>();

/** Precio que vería el vendedor con la lista activa (cae a la otra si está en cero). */
const precioVisible = (producto: any): number => {
  const mayorista = Number(producto?.precioMayorista) || 0;
  const minorista = Number(producto?.precioMinorista) || 0;
  const elegido = props.listaPrecio === 'MAYORISTA' ? mayorista : minorista;
  return elegido || minorista || mayorista || 0;
};

const emit = defineEmits<{ (e: 'agregar', prenda: any): void }>();

const prendaActiva = ref<string>('');
const busqueda = ref('');

const claveProducto = (item: any) =>
  String(item?.productoId ?? item?.producto?.id ?? item?.producto?.skuBase ?? item?.producto?.nombre ?? '—');

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
        precio: precioVisible(item.producto),
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

/** Cuántas unidades de esta talla ya están en el carrito (feedback inmediato del toque). */
const enCarrito = (item: any) => {
  const linea = props.carrito.find(
    c => Number(c.productoId) === Number(item.productoId)
      && String(c.talla) === String(item.talla)
  );
  return linea ? Number(linea.cantidad) : 0;
};

/**
 * Tallas de la prenda abierta, con el stock sumado de TODOS sus colores.
 * `coloresDistintos` es solo informativo (va en el tooltip): sirve para que el
 * vendedor sepa que esa talla viene en varios colores, no para elegir uno.
 */
const tallasPrenda = computed(() => {
  if (!prendaActiva.value) return [] as any[];

  const variantes = inventarioBodega.value.filter(i => claveProducto(i) === prendaActiva.value);

  const porTalla = new Map<string, any>();
  variantes.forEach(v => {
    const talla = String(v.talla ?? '—');
    if (!porTalla.has(talla)) {
      porTalla.set(talla, {
        talla,
        stock: 0,
        coloresDistintos: 0,
        productoId: Number(v.productoId ?? v.producto?.id),
        producto: v.producto
      });
    }
    const fila = porTalla.get(talla);
    fila.stock += Number(v.stock) || 0;
    if (Number(v.stock) > 0) fila.coloresDistintos += 1;
  });

  return ordenarTallas(Array.from(porTalla.keys())).map(t => porTalla.get(t));
});

const tocarTalla = (talla: any) => {
  if (!talla) return;
  emit('agregar', talla);
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
              <span
                class="text-[11px] font-black shrink-0"
                :class="p.precio > 0 ? 'text-gray-700' : 'text-amber-600'"
                :title="p.precio > 0 ? `Precio ${listaPrecio.toLowerCase()}` : 'Sin precio configurado en la lista de precios'"
              >{{ p.precio > 0 ? `S/ ${p.precio.toFixed(2)}` : 'S/ —' }}</span>
              <span
                class="text-[11px] font-black px-2 py-0.5 rounded shrink-0"
                :class="p.total > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-gray-400 bg-gray-100'"
              >{{ p.total }} u.</span>
            </div>
          </button>
        </div>
      </div>
    </template>

    <!-- PASO 2: tocar la talla -->
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
          <p class="text-[10px] font-bold text-gray-400">Toca una talla para agregar 1 unidad</p>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="tallasPrenda.length === 0" class="h-full flex items-center justify-center">
          <p class="font-bold text-gray-400 text-sm text-center">Esta prenda no tiene tallas en esta bodega.</p>
        </div>

        <div v-else class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
          <button
            v-for="t in tallasPrenda"
            :key="t.talla"
            @click="tocarTalla(t)"
            class="h-24 rounded-2xl font-black transition-all active:scale-95 relative border-2 flex flex-col items-center justify-center gap-1 leading-none"
            :class="t.stock > 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400'
              : 'bg-gray-50 border-dashed border-gray-200 text-gray-400 hover:border-amber-400 hover:text-amber-600'"
            :title="t.stock > 0
              ? `Talla ${t.talla} · ${t.stock} disponibles en ${t.coloresDistintos} color(es)`
              : `Talla ${t.talla} · sin stock en el sistema`"
          >
            <span class="text-2xl">{{ t.talla }}</span>
            <span class="text-xs font-black opacity-80">{{ t.stock }} und</span>

            <span
              v-if="enCarrito(t) > 0"
              class="absolute -top-2 -right-2 bg-blue-600 text-white text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md"
            >{{ enCarrito(t) }}</span>
          </button>
        </div>

        <p class="text-[10px] font-bold text-gray-400 mt-4 px-1">
          El stock mostrado suma todos los colores de la talla. El color se asigna solo al cobrar, empezando por el que más stock tiene. Las tallas punteadas están en cero según el sistema: si tienes la prenda físicamente puedes tocarlas igual y quedará marcada para revisar inventario.
        </p>
      </div>
    </template>
  </div>
</template>
