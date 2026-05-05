<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios'; // Ajusta la ruta si es necesario

// --- ESTADOS ---
const cargando = ref(true);
const ordenesTerminadas = ref<any[]>([]);

// --- ESTADOS DEL MODAL DE LIQUIDACIÓN ---
const modalVisible = ref(false);
const ordenSeleccionada = ref<any>(null);
const calculando = ref(false);

// Formulario que enviaremos a tu DTO en NestJS
const formLiquidacion = ref({
  costoServicioUnitario: 0,
  otrosCostosAdicionales: 0
});

// Respuesta financiera del backend
const reporteCosto = ref<any>(null);

// --- CARGAR ÓRDENES LISTAS PARA LIQUIDAR ---
const cargarOrdenes = async () => {
  cargando.value = true;
  try {
    // Jalamos las órdenes de producción. 
    // Lo ideal es que el backend solo mande las que están en estado "Terminada" o "En Almacén"
    const response = await api.get('/ordenes');
    // Filtramos temporalmente en el frontend si tu backend manda todas
    // Esto aceptará cualquier estado que contenga la palabra terminada o completada
ordenesTerminadas.value = response.data.filter((op: any) => 
  op.estado.toLowerCase().includes('termina') || 
  op.estado.toLowerCase().includes('completa')
);
  } catch (error) {
    console.error('Error al cargar OPs para liquidar:', error);
  } finally {
    cargando.value = false;
  }
};

// --- ABRIR LA CALCULADORA ---
const abrirLiquidacion = (orden: any) => {
  ordenSeleccionada.value = orden;
  formLiquidacion.value = { costoServicioUnitario: 0, otrosCostosAdicionales: 0 };
  reporteCosto.value = null; // Limpiamos si había un reporte anterior
  modalVisible.value = true;
};

// --- ENVIAR AL BACKEND (Tu LiquidacionesService) ---
const calcularCostoReal = async () => {
  if (formLiquidacion.value.costoServicioUnitario <= 0) {
    alert("Por favor ingresa cuánto te cobró el taller por prenda.");
    return;
  }

  calculando.value = true;
  try {
    // Llamamos al endpoint que conectará con tu LiquidacionesService
    const response = await api.post('/liquidaciones/costo-real', {
      ordenId: ordenSeleccionada.value.id,
      costoServicioUnitario: formLiquidacion.value.costoServicioUnitario,
      otrosCostosAdicionales: formLiquidacion.value.otrosCostosAdicionales
    });

    // Guardamos la respuesta mágica de tu backend
    reporteCosto.value = response.data;
  } catch (error: any) {
    alert("Error al calcular: " + (error.response?.data?.message || "Revisa la consola"));
  } finally {
    calculando.value = false;
  }
};

onMounted(cargarOrdenes);
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- HEADER -->
    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">Liquidación de Costos 💰</h1>
        <p class="text-gray-500 mt-1 font-medium">Calcula el costo real (Materia Prima + Servicio) de tus lotes terminados.</p>
      </div>
      <button @click="cargarOrdenes" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-bold transition flex items-center gap-2">
        ↻ Actualizar
      </button>
    </div>

    <!-- ESTADO: CARGANDO -->
    <div v-if="cargando" class="text-center py-12 text-gray-500 font-medium bg-white rounded-xl shadow-sm border border-gray-100">
      <div class="animate-spin inline-block w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
      <p>Buscando órdenes terminadas...</p>
    </div>

    <!-- ESTADO: VACÍO -->
    <div v-else-if="ordenesTerminadas.length === 0" class="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center">
      <span class="text-6xl mb-4 block">🏭</span>
      <h3 class="text-xl font-bold text-gray-700">No hay Órdenes Pendientes</h3>
      <p class="text-gray-500 mt-2">Cuando Producción termine una OP y la envíe al almacén, aparecerá aquí para su liquidación financiera.</p>
    </div>

    <!-- GRID DE ÓRDENES -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <div v-for="orden in ordenesTerminadas" :key="orden.id" class="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start">
            <span class="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Terminada</span>
            <span class="font-mono font-bold text-gray-400">Ref: {{ orden.id }}</span>
          </div>
          <!-- Asegúrate de que orden.producto.nombre venga en tu JSON, si no, usa el campo correcto -->
          <h3 class="text-xl font-black text-gray-900 mt-4">{{ orden.producto?.nombre || 'Producto sin nombre' }}</h3>
          <p class="text-sm text-gray-500 mt-1">Lote programado para liquidar.</p>
        </div>
        
        <button @click="abrirLiquidacion(orden)" class="mt-6 w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl shadow-md transition flex justify-center items-center gap-2">
          <span>📊</span> Liquidar Costos
        </button>
      </div>
    </div>

    <!-- MODAL DE LIQUIDACIÓN Y REPORTES -->
    <div v-if="modalVisible" class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col max-h-[90vh]">
        
        <!-- Modal Header -->
        <div class="bg-gray-900 p-6 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 class="text-2xl font-black flex items-center gap-2">
              <span>🧾</span> Liquidación de OP-{{ ordenSeleccionada?.id }}
            </h3>
            <p class="text-gray-400 text-sm mt-1">Cálculo de Costo Real Unitario</p>
          </div>
          <button @click="modalVisible = false" class="text-gray-400 hover:text-white bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition">✕</button>
        </div>

        <!-- Scrollable Body -->
        <div class="p-6 overflow-y-auto">
          
          <!-- PASO 1: INPUTS (Solo se muestran si aún no hay reporte) -->
          <div v-if="!reporteCosto" class="space-y-5">
            <div class="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6">
              <p class="text-sm text-blue-800 font-medium">
                💡 El sistema ya calculó el costo de la tela e insumos basándose en la Ficha Técnica y las mermas. Solo ingresa los costos externos.
              </p>
            </div>

            <div>
              <label class="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Costo de Servicio por Prenda (S/)</label>
              <div class="flex items-center relative">
                <span class="absolute left-4 font-bold text-gray-400">S/</span>
                <input type="number" v-model.number="formLiquidacion.costoServicioUnitario" placeholder="Ej: 5.50" class="w-full border-2 border-gray-200 bg-gray-50 py-3 pl-10 pr-4 rounded-xl font-black text-xl text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition">
              </div>
              <p class="text-[10px] text-gray-400 mt-1">¿Cuánto te cobró el taller de costura/lavandería por cada pantalón?</p>
            </div>

            <div>
              <label class="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Otros Gastos Globales (S/) - Opcional</label>
              <div class="flex items-center relative">
                <span class="absolute left-4 font-bold text-gray-400">S/</span>
                <input type="number" v-model.number="formLiquidacion.otrosCostosAdicionales" placeholder="Ej: 150.00" class="w-full border-2 border-gray-200 bg-gray-50 py-3 pl-10 pr-4 rounded-xl font-bold text-lg text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition">
              </div>
              <p class="text-[10px] text-gray-400 mt-1">Gastos de fletes, taxis, ploteos de molde. El sistema lo dividirá automáticamente entre todas las prendas.</p>
            </div>

            <button @click="calcularCostoReal" :disabled="calculando" class="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-black text-lg py-4 rounded-xl shadow-lg shadow-green-500/30 transition flex justify-center items-center gap-2">
              <span v-if="calculando" class="animate-spin border-2 border-white border-t-transparent rounded-full w-5 h-5"></span>
              {{ calculando ? 'Procesando Algoritmo...' : 'Generar Reporte Financiero' }}
            </button>
          </div>

          <!-- PASO 2: EL TICKET / REPORTE FINANCIERO (Magia pura) -->
          <div v-else class="animate-fade-in">
            <div class="bg-gray-50 border border-gray-200 rounded-2xl p-6 relative overflow-hidden">
              <div class="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-bl-full -mr-10 -mt-10"></div>
              
              <h4 class="text-center text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Resumen de Liquidación</h4>
              
              <div class="space-y-3 font-mono text-sm">
                <div class="flex justify-between pb-3 border-b border-gray-200 border-dashed">
                  <span class="text-gray-500">Unidades Fabricadas</span>
                  <span class="font-black text-gray-900">{{ reporteCosto.analisisCosto.totalUnidades }} und.</span>
                </div>
                <div class="flex justify-between pb-3 border-b border-gray-200 border-dashed">
                  <span class="text-gray-500">Materia Prima + Merma (Unit)</span>
                  <span class="font-bold text-gray-800">S/ {{ reporteCosto.analisisCosto.materiaPrimaUnitario }}</span>
                </div>
                <div class="flex justify-between pb-3 border-b border-gray-200 border-dashed">
                  <span class="text-gray-500">Servicio de Taller (Unit)</span>
                  <span class="font-bold text-gray-800">S/ {{ reporteCosto.analisisCosto.servicioTallerUnitario }}</span>
                </div>
                <div class="flex justify-between pb-3 border-b border-gray-200 border-dashed">
                  <span class="text-gray-500">Prorrateo de Extras (Unit)</span>
                  <span class="font-bold text-gray-800">S/ {{ reporteCosto.analisisCosto.gastosAdicionalesUnitario }}</span>
                </div>
              </div>

              <div class="mt-6 bg-green-50 border-2 border-green-500 rounded-xl p-4 text-center transform scale-105 shadow-sm">
                <p class="text-green-800 text-xs font-black uppercase tracking-widest mb-1">Costo Real Unitario Final</p>
                <p class="text-4xl font-black text-green-600">S/ {{ reporteCosto.analisisCosto.COSTO_TOTAL_UNITARIO }}</p>
              </div>

              <div class="mt-6 text-center">
                <p class="text-xs text-gray-400 uppercase tracking-widest">Inversión Total en este Lote</p>
                <p class="text-xl font-bold text-gray-800">S/ {{ reporteCosto.inversionTotalLote }}</p>
              </div>
            </div>

            <button @click="modalVisible = false" class="w-full mt-6 bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-md transition">
              Cerrar y Finalizar
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
/* Ocultar flechas del input number */
input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none; margin: 0;
}
input[type="number"] { -moz-appearance: textfield; }
</style>