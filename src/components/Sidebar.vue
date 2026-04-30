<script setup lang="ts">
import { RouterLink } from 'vue-router'

// Aquí están las 5 áreas maestras que definimos en nuestra arquitectura
const menuItems = [
  { name: 'Dashboard', path: '/', icon: '📊' },
  { name: 'Almacén', path: '/almacen', icon: '📦' },
  { name: 'Ingeniería', path: '/ingenieria', icon: '📐' },
  { name: 'Producción', path: '/produccion', icon: '🏭' },
  { name: 'Despachos', path: '/despachos', icon: '🚚' },
  { name: 'Talleres', path: '/talleres', icon: '🧵' },
  { name: 'Productos', path: '/productos', icon: '👕' },
  { name: 'Control de Ordenes', path: '/control-ordenes', icon: '📋' },
  { name: 'Almacen de terminados', path: '/almacen-terminados', icon: '🏬' },
  { name: 'Traslados', path: '/traslados', icon: '🔄' },
  { name: 'Punto de Venta', path: '/punto-venta', icon: '🛒' },
  { name: 'Config. Colores', path: '/config-colores', icon: '🎨' },
]
</script>

<template>
  <aside class="w-64 bg-gray-900 text-white flex flex-col shadow-2xl z-10">
    <div class="h-20 flex items-center justify-center border-b border-gray-800">
      <h1 class="text-2xl font-bold tracking-widest text-blue-400">MODITEX</h1>
    </div>

    <nav class="flex-1 px-4 py-6 space-y-2">
      <RouterLink
        v-for="item in menuItems"
        :key="item.name"
        :to="item.path"
        class="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:bg-gray-800 text-gray-300 hover:text-white"
        active-class="bg-blue-600 text-white shadow-md shadow-blue-900/50"
      >
        <span class="text-xl">{{ item.icon }}</span>
        <span class="font-medium">{{ item.name }}</span>
      </RouterLink>
    </nav>

    <div class="p-4 border-t border-gray-800 hover:bg-gray-800 transition-colors cursor-pointer">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center font-bold border border-blue-500">
          G
        </div>
        <div>
          <p class="text-sm font-medium">Gustavo</p>
          <p class="text-xs text-gray-400">Admin. del Sistema</p>
        </div>
      </div>
    </div>
  </aside>
</template>