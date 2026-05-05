<script setup lang="ts">
import { ref, computed } from 'vue';
import api from '../api/axios';

// ESTADOS OPERATIVOS
const busqueda = ref('');
const cargando = ref(false);
const ordenSeleccionada = ref<any>(null);
const enviando = ref(false);

// MATRIZ DE RECEPCIÓN (Aquí el usuario llena lo que llega)
const matrizRecepcion = ref<any[]>([]);

const buscarOrden = async () => {
  if (!busqueda.value) return;
  cargando.value = true;
  try {
    // Buscamos la OP por código (jalando sus detalles de matriz)
    const res = await api.get(`/ordenes/buscar/${busqueda.value}`);
    ordenSeleccionada.value = res.data;
    
    // Inicializamos la matriz de recepción basada en lo que se cortó originalmente
    matrizRecepcion.value = ordenSeleccionada.value.detallesMatriz.map((d: any) => ({
      detalleId: d.id,
      talla: d.talla,
      color: d.color,
      cantidadEnviada: d.cantidadProgramada,
      cantidadBuena: d.cantidadProgramada, // Por defecto asumimos que todo llega bien
      cantidadSucio: 0,
      cantidadFalla: 0,
      comentario: ''
    }));
  } catch (error) {
    alert("No se encontró la Orden de Producción o no está en proceso.");
    ordenSeleccionada.value = null;
  } finally {
    cargando.value = false;
  }
};

// CÁLCULOS EN TIEMPO REAL
const totales = computed(() => {
  return matrizRecepcion.value.reduce((acc, item) => {
    acc.enviado += item.cantidadEnviada;
    acc.recibido += (item.cantidadBuena + item.cantidadSucio + item.cantidadFalla);
    acc.diferencia = acc.recibido - acc.enviado;
    return acc;
  }, { enviado: 0, recibido: 0, diferencia: 0 });
});

const finalizarRecepcion = async () => {
  if (!confirm("¿Confirmar la recepción de mercadería? Esto actualizará el stock y costos.")) return;
  
  enviando.value = true;
  try {
    await api.post(`/produccion/recepcionar/${ordenSeleccionada.value.id}`, {
      items: matrizRecepcion.value
    });
    
    alert("🎉 Recepción registrada exitosamente. El inventario ha sido actualizado.");
    ordenSeleccionada.value = null;
    busqueda.value = '';
  } catch (error) {
    alert("Error al procesar la recepción.");
  } finally {
    enviando.value = false;
  }
};
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- HEADER Y BUSCADOR -->
    <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
      <div class="flex-1">
        <h2 class="text-3xl font-black text-gray-900 tracking-tight">Recepción de Taller 📥</h2>
        <p class="text-gray-500 mt-1 font-medium">Escanea el QR de la guía o ingresa el código OP para recibir prendas.</p>
      </div>
      
      <div class="w-full md:w-96 flex gap-2">
        <input 
          v-model="busqueda" 
          @keyup.enter="buscarOrden"
          type="text" 
          placeholder="Ej: OP-2026-8842 o escanea QR..." 
          class="flex-1 border-2 border-gray-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all"
        >
        <button @click="buscarOrden" :disabled="cargando" class="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all">
          {{ cargando ? '...' : 'Buscar' }}
        </button>
      </div>
    </div>

    <!-- PANEL DE RECEPCIÓN -->
    <div v-if="ordenSeleccionada" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      <!-- INFO DE LA ORDEN (Lado Izquierdo) -->
      <div class="lg:col-span-4 space-y-6">
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 class="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Resumen de Envío</h3>
          <div class="space-y-3">
            <div class="flex justify-between">
              <span class="text-gray-500">Producto:</span>
              <span class="font-bold text-gray-800">{{ ordenSeleccionada.producto.nombre }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Taller actual:</span>
              <span class="font-bold text-indigo-600">{{ ordenSeleccionada.rutas?.[0]?.taller?.razonSocial || 'No asignado' }}</span>
            </div>
            <hr class="border-gray-50">
            <div class="bg-indigo-50 p-4 rounded-xl">
              <p class="text-[10px] font-black text-indigo-400 uppercase">Total Enviado en Cortes</p>
              <p class="text-3xl font-black text-indigo-700">{{ totales.enviado }} <span class="text-sm font-normal">pzas</span></p>
            </div>
          </div>
        </div>

        <!-- Alerta de Diferencia -->
        <div v-if="totales.diferencia !== 0" class="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3">
          <span class="text-2xl">⚠️</span>
          <p class="text-xs text-amber-800 font-bold uppercase tracking-tight">
            Atención: Hay una diferencia de {{ totales.diferencia }} prendas respecto al corte original.
          </p>
        </div>
      </div>

      <!-- MATRIZ DE ENTRADA (Lado Derecho) -->
      <div class="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
            <tr>
              <th class="p-4">Color / Talla</th>
              <th class="p-4 text-center">Enviado</th>
              <th class="p-4 text-center bg-green-800">Buenas</th>
              <th class="p-4 text-center bg-blue-800">Para Lavado</th>
              <th class="p-4 text-center bg-red-800">Fallas</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(item, i) in matrizRecepcion" :key="i" class="hover:bg-gray-50 transition-colors">
              <td class="p-4">
                <p class="font-bold text-gray-800">{{ item.color }}</p>
                <p class="text-xs text-gray-500">Talla {{ item.talla }}</p>
              </td>
              <td class="p-4 text-center font-bold text-gray-400">{{ item.cantidadEnviada }}</td>
              <td class="p-4 text-center">
                <input type="number" v-model.number="item.cantidadBuena" class="w-20 text-center border-2 border-green-100 rounded-lg p-2 font-black text-green-700 focus:border-green-500 outline-none">
              </td>
              <td class="p-4 text-center">
                <input type="number" v-model.number="item.cantidadSucio" class="w-20 text-center border-2 border-blue-100 rounded-lg p-2 font-black text-blue-700 focus:border-blue-500 outline-none">
              </td>
              <td class="p-4 text-center">
                <input type="number" v-model.number="item.cantidadFalla" class="w-20 text-center border-2 border-red-100 rounded-lg p-2 font-black text-red-700 focus:border-red-500 outline-none">
              </td>
            </tr>
          </tbody>
        </table>

        <!-- BOTÓN DE ACCIÓN FINAL -->
        <div class="p-6 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <div>
            <p class="text-[10px] font-black text-gray-400 uppercase">Total Recibido (Suma de estados)</p>
            <p class="text-2xl font-black text-gray-800">{{ totales.recibido }} prendas</p>
          </div>
          <button 
            @click="finalizarRecepcion" 
            :disabled="enviando"
            class="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-2xl font-black text-lg shadow-xl shadow-indigo-500/20 transition-all flex items-center gap-3"
          >
            <span v-if="enviando">Procesando...</span>
            <span v-else>✅ Finalizar Recepción</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ESTADO VACÍO -->
    <div v-else class="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl py-20 text-center">
      <span class="text-6xl">🔍</span>
      <h3 class="text-xl font-bold text-gray-400 mt-4 tracking-tight">Esperando lectura de QR o Código OP</h3>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
/* Quitar flechas de input number */
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>