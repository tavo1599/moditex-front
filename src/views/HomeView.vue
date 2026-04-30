<script setup lang="ts">
// Aquí luego conectaremos los datos reales del backend
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-3xl font-bold text-gray-800">Panel de Control</h2>
      <p class="text-gray-500 mt-1">Resumen de operaciones de MODITEX al día de hoy.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 border-l-4 border-l-blue-500">
        <div class="p-3 bg-blue-50 text-blue-600 rounded-lg text-2xl">
          🏭
        </div>
        <div>
          <p class="text-sm font-medium text-gray-500">Órdenes Activas</p>
          <p class="text-2xl font-bold text-gray-800">12</p>
        </div>
      </div>

      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 border-l-4 border-l-orange-500">
        <div class="p-3 bg-orange-50 text-orange-600 rounded-lg text-2xl">
          ⚠️
        </div>
        <div>
          <p class="text-sm font-medium text-gray-500">Insumos con Bajo Stock</p>
          <p class="text-2xl font-bold text-gray-800">3</p>
        </div>
      </div>

      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 border-l-4 border-l-green-500">
        <div class="p-3 bg-green-50 text-green-600 rounded-lg text-2xl">
          📦
        </div>
        <div>
          <p class="text-sm font-medium text-gray-500">Prendas Terminadas (Mes)</p>
          <p class="text-2xl font-bold text-gray-800">1,450</p>
        </div>
      </div>

    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-8">
      <h3 class="text-lg font-bold text-gray-800 mb-4">Últimos Movimientos</h3>
      <div class="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
        Aquí cargaremos la tabla con las últimas órdenes de producción...
      </div>
    </div>
  </div>
</template>