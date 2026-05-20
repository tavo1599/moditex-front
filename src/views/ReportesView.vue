<template>
  <div class="min-h-screen bg-[#F8FAFC] p-6 lg:p-8 font-sans">
    
    <header class="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-black text-gray-900 tracking-tight">Dashboard Moditex</h1>
        <p class="text-sm text-gray-500 mt-1 font-medium">Control en tiempo real de ventas y almacén</p>
      </div>
      
      <button 
        @click="obtenerReportes" 
        :disabled="cargando"
        class="inline-flex items-center justify-center px-4 py-2 bg-black text-white text-sm font-bold rounded-lg shadow-md hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg v-if="cargando" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {{ cargando ? 'Actualizando...' : 'Actualizar Datos' }}
      </button>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <div class="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 flex items-center justify-between relative overflow-hidden group">
        <div class="absolute w-2 h-full bg-emerald-500 left-0 top-0"></div>
        <div class="pl-4">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ingresos de Hoy</p>
          <h2 class="text-3xl font-black text-gray-900">S/ {{ resumen.ventasHoy }}</h2>
        </div>
        <div class="p-3 bg-emerald-50 rounded-xl">
          <svg class="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 flex items-center justify-between relative overflow-hidden">
        <div class="absolute w-2 h-full bg-indigo-500 left-0 top-0"></div>
        <div class="pl-4">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Prendas Vendidas</p>
          <h2 class="text-3xl font-black text-gray-900">{{ resumen.prendasVendidas }} <span class="text-lg text-gray-500 font-bold">unds</span></h2>
        </div>
        <div class="p-3 bg-indigo-50 rounded-xl">
          <svg class="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 flex items-center justify-between relative overflow-hidden">
        <div class="absolute w-2 h-full bg-rose-500 left-0 top-0"></div>
        <div class="pl-4">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Stock Crítico</p>
          <h2 class="text-3xl font-black text-rose-600">{{ resumen.stockBajo }} <span class="text-lg text-rose-400 font-bold">SKUs</span></h2>
        </div>
        <div class="p-3 bg-rose-50 rounded-xl">
          <svg class="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden">
      <div class="px-6 py-5 border-b border-gray-100">
        <h3 class="text-lg font-bold text-gray-900">Últimas Transacciones</h3>
      </div>
      
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Código</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Fecha y Hora</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Método</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Almacén</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Total</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Estado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="cargando && ventas.length === 0">
              <td colspan="5" class="px-6 py-10 text-center text-gray-400 font-medium">
                Cargando datos del servidor...
              </td>
            </tr>
            
            <tr v-else-if="ventas.length === 0">
              <td colspan="5" class="px-6 py-10 text-center text-gray-400 font-medium">
                No hay ventas registradas aún.
              </td>
            </tr>

            <tr v-for="venta in ventas" :key="venta.id" class="hover:bg-gray-50/80 transition-colors duration-150">
              <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200 font-mono">
                  {{ venta.correlativo }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm font-medium text-gray-600">
                {{ formatearFecha(venta.createdAt) }}
              </td>
              <td class="px-6 py-4">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">{{ venta.metodoPago }}</span>
              </td>
              <td class="px-6 py-4">
  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
    {{ venta.almacen }}
  </span>
</td>
              <td class="px-6 py-4">
                <span class="text-sm font-black text-gray-900">S/ {{ parseFloat(venta.total).toFixed(2) }}</span>
              </td>
              <td class="px-6 py-4">
                <span :class="[
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold',
                  venta.estado === 'Completada' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                ]">
                  <span :class="['w-1.5 h-1.5 rounded-full', venta.estado === 'Completada' ? 'bg-emerald-500' : 'bg-amber-500']"></span>
                  {{ venta.estado }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../api/axios';

const ventas = ref([]);
const cargando = ref(false); // 🔥 Nuevo estado para mejorar UX
const resumen = ref({
  ventasHoy: '0.00',
  prendasVendidas: 0,
  stockBajo: 0
});

const obtenerReportes = async () => {
  cargando.value = true;
  try {
    const { data } = await api.get('/ventas/reporte-general');
    ventas.value = data.ultimasVentas || [];
    resumen.value = data.kpis || resumen.value;
  } catch (error) {
    console.error("Error cargando el dashboard:", error);
    // Podrías agregar aquí una alerta de error visible
  } finally {
    cargando.value = false;
  }
};

const formatearFecha = (fecha) => {
  if (!fecha) return '-';
  return new Date(fecha).toLocaleString('es-PE', { 
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
  });
};

onMounted(obtenerReportes);
</script>