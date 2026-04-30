<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios';

const ordenes = ref<any[]>([]);
const cargando = ref(true);

// Estado para el Modal de Detalles
const mostrarModal = ref(false);
const ordenDetalle = ref<any>(null);
const cargandoDetalle = ref(false);

const cargarOrdenes = async () => {
  cargando.value = true;
  try {
    const res = await api.get('/ordenes');
    ordenes.value = res.data;
  } catch (error) {
    console.error("Error al cargar las órdenes:", error);
  } finally {
    cargando.value = false;
  }
};

const abrirDetalles = async (id: number) => {
  mostrarModal.value = true;
  cargandoDetalle.value = true;
  ordenDetalle.value = null;
  try {
    const res = await api.get(`/ordenes/${id}`);
    ordenDetalle.value = res.data;
  } catch (error) {
    alert("Error al cargar los detalles de la OP.");
    mostrarModal.value = false;
  } finally {
    cargandoDetalle.value = false;
  }
};

const formatearFecha = (fecha: string) => {
  return new Date(fecha).toLocaleDateString('es-PE', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
};

// Función auxiliar para extraer el costeo de manera segura (sea array u objeto)
const obtenerCostoNeto = (costeo: any) => {
  if (!costeo) return 0;
  const data = Array.isArray(costeo) ? costeo[0] : costeo;
  return data?.costoTotalUnitarioNeto ? Number(data.costoTotalUnitarioNeto) : 0;
};

const obtenerPrecioVentaMayorista = (costeo: any) => {
  if (!costeo) return 0;
  const data = Array.isArray(costeo) ? costeo[0] : costeo;
  return data?.precioMayorista ? Number(data.precioMayorista) : 0;
};

onMounted(cargarOrdenes);
</script>

<template>
  <div class="space-y-6 relative">
    <!-- HEADER -->
    <div class="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Control de Órdenes (OP)</h2>
        <p class="text-gray-500 mt-1">Monitorea el estado, talleres y costos de tu producción.</p>
      </div>
      <button @click="cargarOrdenes" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2">
        <span>🔄</span> Actualizar Tablero
      </button>
    </div>

    <!-- TABLA PRINCIPAL -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div v-if="cargando" class="text-center py-12 text-gray-500 font-medium">
        <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
        <p>Cargando órdenes de producción...</p>
      </div>

      <table v-else class="w-full text-left text-sm">
        <thead class="bg-gray-900 text-white font-bold uppercase text-[10px] tracking-wider">
          <tr>
            <th class="p-4">Código OP</th>
            <th class="p-4">Fecha de Emisión</th>
            <th class="p-4">Modelo / Producto</th>
            <th class="p-4 text-center">Estado</th>
            <th class="p-4 text-right">Costo Unit.</th>
            <th class="p-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="ordenes.length === 0">
            <td colspan="6" class="p-8 text-center text-gray-400 italic">No hay órdenes registradas. Ve a "Lanzamiento" para crear una.</td>
          </tr>
          <tr v-for="op in ordenes" :key="op.id" class="hover:bg-blue-50/50 transition-colors">
            <td class="p-4 font-mono font-black text-blue-700 text-base">{{ op.codigoOp }}</td>
            <td class="p-4 text-gray-500 text-xs font-medium">{{ formatearFecha(op.fechaInicio) }}</td>
            <td class="p-4 font-bold text-gray-800">{{ op.producto?.nombre || 'Producto Desconocido' }}</td>
            <td class="p-4 text-center">
              <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                :class="op.estado === 'En Proceso' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : 'bg-green-100 text-green-700 border border-green-200'">
                {{ op.estado }}
              </span>
            </td>
            <td class="p-4 text-right font-black text-gray-700">
              S/ {{ obtenerCostoNeto(op.costeoFinal).toFixed(2) }}
            </td>
            <td class="p-4 text-center">
              <button @click="abrirDetalles(op.id)" class="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg font-bold text-xs transition border border-blue-200 hover:border-blue-600">
                Ver Detalles
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- MODAL DE DETALLES PROFUNDOS -->
    <div v-if="mostrarModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-end z-[100]">
      <!-- Panel Lateral Derecho -->
      <div class="bg-gray-50 h-full w-full max-w-2xl shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        <div class="bg-gray-900 p-6 flex justify-between items-center text-white">
          <div>
            <h3 class="text-2xl font-black tracking-widest text-blue-400">OP: {{ ordenDetalle?.codigoOp || 'Cargando...' }}</h3>
            <p class="text-xs text-gray-400 mt-1 uppercase">{{ ordenDetalle?.producto?.nombre }}</p>
          </div>
          <button @click="mostrarModal = false" class="text-gray-400 hover:text-white text-3xl font-light">&times;</button>
        </div>

        <div class="p-6 flex-1 overflow-y-auto space-y-6" v-if="!cargandoDetalle && ordenDetalle">
          
          <!-- RESUMEN FINANCIERO -->
          <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 grid grid-cols-2 gap-4">
            <div>
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Costo Unit. Real</p>
              <p class="text-3xl font-black text-gray-800">S/ {{ obtenerCostoNeto(ordenDetalle.costeoFinal).toFixed(2) }}</p>
            </div>
            <div class="text-right border-l border-gray-100 pl-4">
              <p class="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">Venta Sugerida (Mayor)</p>
              <p class="text-xl font-bold text-blue-700">S/ {{ (obtenerPrecioVentaMayorista(ordenDetalle.costeoFinal) * 1.18).toFixed(2) }}</p>
              <p class="text-[10px] text-gray-400">Inc. IGV</p>
            </div>
          </div>

          <!-- RUTA Y TALLERES -->
          <div>
            <h4 class="font-bold text-gray-800 mb-3 flex items-center gap-2"><span>🏭</span> Talleres Asignados (Ruta)</h4>
            <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div v-if="ordenDetalle.rutas?.length === 0" class="p-4 text-center text-sm text-gray-400">No hay talleres asignados.</div>
              <div v-for="(ruta, index) in ordenDetalle.rutas" :key="index" class="p-4 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <p class="font-bold text-gray-800 text-sm">{{ ruta.tipoServicio }}</p>
                  <p class="text-xs text-gray-500 font-medium mt-0.5">{{ ruta.taller?.razonSocial || 'Taller Eliminado' }}</p>
                </div>
                <div class="text-right">
                  <p class="text-[10px] text-gray-400 font-bold uppercase">Pago Pactado</p>
                  <p class="font-black text-blue-600">S/ {{ Number(ruta.costoUnitarioPactado).toFixed(2) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- MATRIZ DE CORTE -->
          <div>
            <h4 class="font-bold text-gray-800 mb-3 flex items-center gap-2"><span>✂️</span> Matriz de Corte Solicitada</h4>
            <div class="bg-white p-4 rounded-xl border border-gray-200 flex flex-wrap gap-2">
              <div v-for="detalle in ordenDetalle.detallesMatriz" :key="detalle.id" class="bg-gray-100 px-3 py-2 rounded-lg border border-gray-200 text-center min-w-[80px]">
                <p class="text-[10px] font-bold text-gray-500 uppercase">Talla / Color</p>
                <p class="font-black text-gray-800">{{ detalle.cantidadProgramada }} <span class="text-xs font-normal">und</span></p>
              </div>
            </div>
          </div>

        </div>

        <div v-else class="p-12 text-center text-gray-400">
          <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
          <p>Cargando información comercial y talleres...</p>
        </div>

      </div>
    </div>

  </div>
</template>