<script setup lang="ts">
import { ref, watch } from 'vue';
import api from '../../api/axios';

const props = defineProps<{
  item: any;
  colores: any[];
}>();

const emit = defineEmits(['cerrar']);

const movimientos = ref<any[]>([]);
const cargando = ref(false);

const getNombreColor = (codigoColor: string) => {
  const colorObj = props.colores.find(c => c.codigo === codigoColor || c.nombre === codigoColor);
  return colorObj ? `${colorObj.nombre}` : codigoColor;
};

// Función para cargar los movimientos de esta variante exacta
const cargarHistorial = async () => {
  if (!props.item) return;
  
  cargando.value = true;
  try {
    // ⚠️ Importante: Ajustaremos esta URL dependiendo de cómo la llames en NestJS
    const response = await api.get('/almacen-terminados/movimientos', {
      params: {
        productoId: props.item.productoId,
        bodegaId: props.item.bodegaId,
        color: props.item.color,
        talla: props.item.talla
      }
    });
    movimientos.value = response.data;
  } catch (error) {
    console.error("Error al cargar historial:", error);
  } finally {
    cargando.value = false;
  }
};

// Cargar datos cuando el modal se abra y reciba el item
watch(() => props.item, cargarHistorial, { immediate: true });

const formatearFecha = (fecha: string) => {
  return new Date(fecha).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};
</script>

<template>
  <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
    <div class="bg-white rounded-[2rem] w-full max-w-3xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[85vh]">
      
      <div class="bg-gray-900 p-6 flex justify-between items-center text-white shrink-0">
        <div>
          <h3 class="text-xl font-black flex items-center gap-2">📊 Historial de Kardex</h3>
          <p class="text-xs text-gray-400 mt-1">
            {{ item?.producto.nombre }} • Talla {{ item?.talla }} • Color: {{ getNombreColor(item?.color) }}
          </p>
        </div>
        <button @click="emit('cerrar')" class="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full p-2 transition">
          ✕
        </button>
      </div>

      <div class="p-6 overflow-y-auto flex-1 bg-gray-50">
        <div v-if="cargando" class="flex justify-center py-10">
          <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
        
        <div v-else-if="movimientos.length === 0" class="text-center py-10 text-gray-400">
          <span class="text-5xl block mb-3 opacity-30">📭</span>
          <p class="font-bold">No hay movimientos registrados para esta variante.</p>
        </div>

        <div v-else class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-100 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
              <tr>
                <th class="p-4">Fecha y Hora</th>
                <th class="p-4">Tipo</th>
                <th class="p-4">Motivo / Ref</th>
                <th class="p-4 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="mov in movimientos" :key="mov.id" class="hover:bg-gray-50 transition-colors">
                <td class="p-4 font-medium text-gray-600 text-xs">{{ formatearFecha(mov.fecha) }}</td>
                <td class="p-4">
                  <span class="px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase"
                    :class="{
                      'bg-green-100 text-green-700': mov.tipoMovimiento === 'INGRESO',
                      'bg-red-100 text-red-700': mov.tipoMovimiento === 'SALIDA',
                      'bg-yellow-100 text-yellow-700': mov.tipoMovimiento === 'AJUSTE'
                    }">
                    {{ mov.tipoMovimiento }}
                  </span>
                </td>
                <td class="p-4 text-gray-700 text-xs font-bold">{{ mov.motivo }}</td>
                <td class="p-4 text-right font-black text-base"
                    :class="mov.cantidad > 0 ? 'text-green-600' : 'text-red-600'">
                  {{ mov.cantidad > 0 ? '+' : '' }}{{ mov.cantidad }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="p-6 border-t border-gray-100 bg-white shrink-0">
        <div class="flex justify-between items-center">
          <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Stock Actual:</span>
          <span class="text-2xl font-black text-gray-900">{{ item?.stock }} und</span>
        </div>
      </div>
    </div>
  </div>
</template>