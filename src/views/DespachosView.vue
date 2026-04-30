<script setup lang="ts">
import { ref } from 'vue';

// Datos simulados de lotes que ya salieron de producción y están listos para enviar
const enviosPendientes = ref([
  { id: 'GR-001', cliente: 'Boutique Lima Centro', prendas: 150, estado: 'Listo para Empaque' },
  { id: 'GR-002', cliente: 'Distribuidora Norte', prendas: 500, estado: 'Esperando Etiquetas' }
]);
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Despachos y Logística</h2>
        <p class="text-gray-500 mt-1">Genera Guías de Remisión (QR) y Etiquetas de Producto (SKU).</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      <div v-for="envio in enviosPendientes" :key="envio.id" class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
        
        <div class="flex justify-between items-start mb-4">
          <div>
            <span class="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              {{ envio.estado }}
            </span>
            <h3 class="text-xl font-bold text-gray-800 mt-3">{{ envio.cliente }}</h3>
            <p class="text-gray-500 text-sm">Lote de {{ envio.prendas }} prendas terminadas</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-400 font-mono">Doc. Ref</p>
            <p class="font-bold text-gray-700">{{ envio.id }}</p>
          </div>
        </div>

        <div class="flex gap-3 mt-6 pt-4 border-t border-gray-100">
          <button class="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-lg text-sm font-medium transition shadow-sm flex items-center justify-center gap-2">
            <span>📄</span> Guía + QR
          </button>
          
          <button class="flex-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
            <span>🏷️</span> Imprimir SKUs
          </button>
        </div>

      </div>

    </div>
  </div>
</template>