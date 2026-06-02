<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  inventario: any[];
  bodegas: any[];
  colores: any[];
  puedeAjustar?: boolean; // solo ADMIN puede ver el botón de ajuste de stock
}>();

const emit = defineEmits(['abrir-etiquetas', 'abrir-ajuste', 'abrir-historial']);

// Estados para Filtros y Acordeón
const filtroStock = ref('con_stock');
const filasExpandidas = ref<Record<string, boolean>>({});

// Filtros Avanzados de Kardex
const filtroKardexTalla = ref('');
const filtroKardexColor = ref('');
const filtroKardexAlmacen = ref<number | ''>('');

// Computados extraídos
const tallasDisponiblesKardex = computed(() => {
  const tallas = new Set(props.inventario.map(item => item.talla).filter(Boolean));
  return Array.from(tallas).sort();
});

const inventarioFiltrado = computed(() => {
  let resultado = props.inventario;

  if (filtroStock.value === 'con_stock') resultado = resultado.filter(item => item.stock > 0);
  else if (filtroStock.value === 'critico') resultado = resultado.filter(item => item.stock > 0 && item.stock <= 5);
  else if (filtroStock.value === 'agotados') resultado = resultado.filter(item => item.stock === 0);

  if (filtroKardexTalla.value) resultado = resultado.filter(item => item.talla === filtroKardexTalla.value);
  if (filtroKardexColor.value) resultado = resultado.filter(item => item.color === filtroKardexColor.value);
  if (filtroKardexAlmacen.value) resultado = resultado.filter(item => Number(item.bodegaId) === Number(filtroKardexAlmacen.value));

  return resultado;
});

const inventarioAgrupado = computed(() => {
  const grupos: Record<string, any> = {};
  inventarioFiltrado.value.forEach(item => {
    const nombreProd = item.producto.nombre;
    if (!grupos[nombreProd]) {
      grupos[nombreProd] = { nombre: nombreProd, skuBase: item.producto.skuBase, totalStock: 0, tieneCritico: false, variantes: [] };
    }
    grupos[nombreProd].totalStock += item.stock;
    if (item.stock > 0 && item.stock <= 5) grupos[nombreProd].tieneCritico = true;
    grupos[nombreProd].variantes.push(item);
  });
  return grupos;
});

const toggleFila = (nombre: string) => filasExpandidas.value[nombre] = !filasExpandidas.value[nombre];

const getNombreColor = (codigoColor: string) => {
  const colorObj = props.colores.find(c => c.codigo === codigoColor || c.nombre === codigoColor);
  return colorObj ? `${colorObj.nombre}` : codigoColor;
};
</script>

<template>
  <div class="space-y-4 animate-in fade-in duration-300">
    <div class="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
      
      <div class="flex gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
        <button @click="filtroStock = 'con_stock'" class="px-3 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition" :class="filtroStock === 'con_stock' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'">🟢 Disponibles</button>
        <button @click="filtroStock = 'critico'" class="px-3 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition" :class="filtroStock === 'critico' ? 'bg-red-100 text-red-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'">🔴 Crítico 🚨</button>
        <button @click="filtroStock = 'agotados'" class="px-3 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition" :class="filtroStock === 'agotados' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'">⚫ Agotados</button>
      </div>

      <div class="h-8 w-px bg-gray-200 hidden md:block"></div> <div class="flex flex-wrap gap-3 items-end">
        <div class="flex flex-col">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Filtro Almacén</label>
          <select v-model="filtroKardexAlmacen" class="border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[140px]">
            <option value="">Todos</option>
            <option v-for="bodega in bodegas" :key="bodega.id" :value="bodega.id">{{ bodega.nombre }}</option>
          </select>
        </div>

        <div class="flex flex-col">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Filtro Talla</label>
          <select v-model="filtroKardexTalla" class="border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[100px]">
            <option value="">Todas</option>
            <option v-for="talla in tallasDisponiblesKardex" :key="talla" :value="talla">{{ talla }}</option>
          </select>
        </div>

        <div class="flex flex-col">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Filtro Color</label>
          <select v-model="filtroKardexColor" class="border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[140px]">
            <option value="">Todos</option>
            <option v-for="color in colores" :key="color.codigo" :value="color.codigo">{{ color.nombre }}</option>
          </select>
        </div>

        <button v-if="filtroKardexTalla || filtroKardexColor || filtroKardexAlmacen !== ''" 
                @click="filtroKardexTalla = ''; filtroKardexColor = ''; filtroKardexAlmacen = ''" 
                class="mb-1.5 ml-2 text-xs font-bold text-red-500 hover:text-red-700 hover:underline transition-colors flex items-center gap-1">
          <span>✕</span> Limpiar
        </button>
      </div>
    </div>
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
          <tr>
            <th class="p-4 w-10"></th><th class="p-4">Modelo de Prenda</th><th class="p-4">Bodega / Ubicación</th><th class="p-4">Color</th><th class="p-4 text-center">Talla</th><th class="p-4 text-right">Stock</th><th class="p-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <template v-for="(grupo, nombre) in inventarioAgrupado" :key="nombre">
            <tr @click="toggleFila(String(nombre))" class="cursor-pointer transition-colors" :class="filasExpandidas[String(nombre)] ? 'bg-blue-50/50' : 'hover:bg-gray-50'">
              <td class="p-4 text-center text-gray-400 font-black">{{ filasExpandidas[String(nombre)] ? '▼' : '▶' }}</td>
              <td class="p-4 font-black text-gray-800 text-base">{{ nombre }} <span class="ml-2 text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{{ grupo.skuBase }}</span></td>
              <td colspan="3" class="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">{{ grupo.variantes.length }} Variantes</td>
              <td class="p-4 text-right font-black text-lg text-blue-700">{{ grupo.totalStock }}</td>
              <td class="p-4 text-center"></td>
            </tr>

            <tr v-if="filasExpandidas[String(nombre)]" v-for="item in grupo.variantes" :key="item.id" class="bg-gray-50/30 hover:bg-white transition-colors">
              <td class="p-3"></td> <td class="p-3 text-xs font-bold text-gray-500 pl-8">↳ Variante</td>
              <td class="p-3"><span class="font-bold text-gray-700">{{ item.bodega.nombre }}</span></td>
              
              <td class="p-3 text-gray-700 font-bold flex items-center gap-2">
                <span class="w-3 h-3 rounded-full border border-gray-300 shadow-sm inline-block" 
                      :style="{ backgroundColor: colores.find(c => c.codigo === item.color || c.nombre === item.color)?.hex || colores.find(c => c.codigo === item.color || c.nombre === item.color)?.codigoHex || '#e5e7eb' }">
                </span>
                {{ getNombreColor(item.color) }} <span class="text-[10px] text-gray-400 bg-gray-200 px-1.5 rounded font-mono">{{ item.color }}</span>
              </td>
              
              <td class="p-3 text-center font-black text-gray-900">{{ item.talla }}</td>
              <td class="p-3 text-right font-black text-base" :class="item.stock === 0 ? 'text-gray-300' : 'text-green-600'">{{ item.stock }} und</td>
                <td class="p-3 flex justify-center gap-2">
                <button v-if="item.stock > 0" @click="emit('abrir-etiquetas', item)" class="bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow-sm">🖨️ SKU</button>
                <button @click="emit('abrir-historial', item)" title="Historial Kardex" class="bg-white border border-gray-200 hover:bg-blue-50 text-gray-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg text-sm transition-all shadow-sm">📊</button>
                <button v-if="puedeAjustar" @click="emit('abrir-ajuste', item)" title="Ajuste Manual" class="bg-white border border-gray-200 hover:bg-yellow-50 text-gray-600 hover:text-yellow-600 px-2.5 py-1.5 rounded-lg text-sm transition-all shadow-sm">⚙️</button>
                </td>
            </tr>
          </template>
          
          <tr v-if="Object.keys(inventarioAgrupado).length === 0">
            <td colspan="7" class="p-8 text-center text-gray-400 font-bold">
              No se encontraron productos con la combinación de filtros seleccionada.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>