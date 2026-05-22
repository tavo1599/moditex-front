<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios';

const cargando = ref(true);

const kpis = ref({
  ingresosMes: 0,
  crecimientoIngresos: 0,
  cuentasPorCobrar: 0,
  clientesConDeuda: 0,
  despachosPendientes: 0,
  prendasVendidasMes: 0,
  insumosCriticos: 0
});

const productosTop = ref<any[]>([]);
const ultimosMovimientos = ref<any[]>([]);

const cargarDashboard = async () => {
  cargando.value = true;
  try {
    const res = await api.get('/dashboard/directivo');
    kpis.value = res.data.kpis;
    productosTop.value = res.data.topVentas;
    ultimosMovimientos.value = res.data.ultimosMovimientos;
  } catch (error) {
    console.error("Error al cargar el dashboard directivo", error);
  } finally {
    cargando.value = false;
  }
};

const formatearFecha = (fechaISO: string) => {
  return new Date(fechaISO).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

onMounted(() => {
  cargarDashboard();
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 p-4 md:p-8 font-urbanist space-y-8">
    
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">Centro de Comando</h1>
        <p class="text-sm md:text-base text-slate-500 font-medium mt-1">Visión global de MODITEX: Finanzas, Ventas y Operaciones.</p>
      </div>
      <button @click="cargarDashboard" :disabled="cargando" class="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50">
        <span :class="{'animate-spin': cargando}">🔄</span> {{ cargando ? 'Calculando...' : 'Actualizar Data' }}
      </button>
    </header>

    <div v-if="!cargando" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-[fadeIn_0.3s_ease-out]">
      
      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ingresos del Mes</p>
        <h3 class="text-3xl font-black text-slate-800">S/ {{ kpis.ingresosMes.toFixed(2) }}</h3>
        <p class="text-xs font-bold mt-2 flex items-center gap-1" :class="kpis.crecimientoIngresos >= 0 ? 'text-emerald-500' : 'text-red-500'">
          <span>{{ kpis.crecimientoIngresos >= 0 ? '↗ +' : '↘ ' }}{{ kpis.crecimientoIngresos.toFixed(1) }}%</span> 
          <span class="text-slate-400 font-medium">vs mes anterior</span>
        </p>
      </div>

      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Dinero en la Calle</p>
        <h3 class="text-3xl font-black text-slate-800">S/ {{ kpis.cuentasPorCobrar.toFixed(2) }}</h3>
        <p class="text-xs font-bold text-red-500 mt-2 flex items-center gap-1">
          <span>⚠️ {{ kpis.clientesConDeuda }} clientes</span> <span class="text-slate-400 font-medium">con deuda activa</span>
        </p>
      </div>

      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Despachos Pendientes</p>
        <h3 class="text-3xl font-black text-slate-800">{{ kpis.despachosPendientes }}</h3>
        <p class="text-xs font-bold text-blue-500 mt-2 flex items-center gap-1">
          <span>📦 {{ kpis.prendasVendidasMes }} prendas</span> <span class="text-slate-400 font-medium">vendidas este mes</span>
        </p>
      </div>

      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Riesgo de Quiebre</p>
        <h3 class="text-3xl font-black text-slate-800">{{ kpis.insumosCriticos }} <span class="text-lg text-slate-400">SKUs</span></h3>
        <p class="text-xs font-bold text-orange-500 mt-2 flex items-center gap-1">
          <span>📉 Stock Crítico</span> <span class="text-slate-400 font-medium">requiere atención</span>
        </p>
      </div>
    </div>

    <div v-if="cargando" class="flex justify-center py-10">
      <div class="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    </div>

    <div v-if="!cargando" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <div class="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
        <div class="flex justify-between items-center mb-6">
          <h3 class="font-black text-slate-800 uppercase tracking-wider text-sm">📈 Evolución de Ventas (Últimos 7 días)</h3>
        </div>
        <div class="flex-1 min-h-[250px] bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center relative overflow-hidden">
          <div class="text-center z-10">
            <span class="text-4xl block mb-2">📊</span>
            <p class="font-bold text-slate-400 text-sm">Listo para instalar gráfica (Chart.js)</p>
          </div>
          <div class="absolute bottom-0 left-10 w-12 h-[40%] bg-emerald-100 rounded-t-lg"></div>
          <div class="absolute bottom-0 left-28 w-12 h-[60%] bg-emerald-200 rounded-t-lg"></div>
          <div class="absolute bottom-0 left-46 w-12 h-[35%] bg-emerald-100 rounded-t-lg"></div>
          <div class="absolute bottom-0 left-64 w-12 h-[80%] bg-emerald-400 rounded-t-lg"></div>
        </div>
      </div>

      <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <h3 class="font-black text-slate-800 uppercase tracking-wider text-sm mb-6 flex items-center gap-2"><span>⭐</span> Top 3 Rentabilidad (Mes)</h3>
        
        <div v-if="productosTop.length === 0" class="text-center text-slate-400 py-10 text-sm font-bold">
          No hay ventas registradas este mes.
        </div>
        
        <div class="space-y-4">
          <div v-for="(prod, index) in productosTop" :key="prod.id" class="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
            <div class="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0"
                 :class="index === 0 ? 'bg-yellow-200 text-yellow-700' : index === 1 ? 'bg-slate-200 text-slate-600' : 'bg-orange-200 text-orange-700'">
              {{ index + 1 }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-bold text-slate-800 text-sm truncate" :title="prod.nombre">{{ prod.nombre }}</p>
              <p class="text-[10px] text-slate-400 font-bold uppercase">{{ prod.ventas }} unds</p>
            </div>
            <div class="text-right shrink-0">
              <p class="font-black text-emerald-600 text-sm">S/ {{ prod.ingreso.toFixed(2) }}</p>
            </div>
          </div>
        </div>
      </div>

    </div>

    <div v-if="!cargando" class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div class="p-6 border-b border-slate-100 bg-slate-50/50">
        <h3 class="font-black text-slate-800 uppercase tracking-wider text-sm">⚡ Auditoría en Vivo (Kardex)</h3>
      </div>
      
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-white">
              <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Fecha</th>
              <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Movimiento</th>
              <th class="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">Motivo</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-if="ultimosMovimientos.length === 0">
               <td colspan="3" class="px-6 py-10 text-center text-slate-400 font-bold">Sin actividad reciente.</td>
            </tr>
            <tr v-for="mov in ultimosMovimientos" :key="mov.id" class="hover:bg-slate-50 transition-colors">
              <td class="px-6 py-4 text-xs font-bold text-slate-500">{{ formatearFecha(mov.fecha) }}</td>
              <td class="px-6 py-4">
                <span :class="mov.tipoMovimiento === 'INGRESO' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'" class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                  {{ mov.cantidad > 0 ? '+' : '' }}{{ mov.cantidad }} Unds
                </span>
              </td>
              <td class="px-6 py-4 text-xs font-bold text-slate-700">{{ mov.motivo }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>