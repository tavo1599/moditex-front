<script setup lang="ts">
import { RouterLink, useRouter, useRoute } from 'vue-router' // 🔥 Agregamos useRoute
import { useAuthStore } from '../stores/auth' 

const router = useRouter()
const route = useRoute() // 🔥 Instanciamos useRoute para leer la ruta actual
const authStore = useAuthStore()

// Aquí están las áreas maestras que definimos en nuestra arquitectura
const menuItems = [
  { name: 'Dashboard', path: '/', icon: '📊' },
  { name: 'Almacén', path: '/almacen', icon: '📦' },
  { name: 'Ingeniería', path: '/ingenieria', icon: '📐' },
  { name: 'Producción', path: '/produccion', icon: '🏭' },
  { name: 'Despachos', path: '/despachos', icon: '🚚' },
  { name: 'Talleres', path: '/talleres', icon: '🧵' },
  { name: 'Productos', path: '/productos', icon: '👕' },
  { name: 'Control de Ordenes', path: '/control-ordenes', icon: '📋' },
  { name: 'Liquidaciones', path: '/liquidaciones', icon: '💰' },
  { name: 'Almacen de terminados', path: '/almacen-terminados', icon: '🏬' },
  { name: 'Traslados', path: '/traslados', icon: '🔄' },
  { name: 'Punto de Venta', path: '/punto-venta', icon: '🛒' },
  { name: 'Config. Colores', path: '/config-colores', icon: '🎨' },
]

// FUNCIÓN PARA CERRAR SESIÓN DE FORMA SEGURA
const cerrarSesion = () => {
  authStore.logout();
  router.push({ name: 'login' });
};
</script>

<template>
  <aside 
    v-if="!route.meta.hideLayout" 
    class="w-64 bg-gray-900 text-white flex flex-col shadow-2xl z-10 h-screen sticky top-0"
  >
    <div class="h-20 flex items-center justify-center border-b border-gray-800 shrink-0">
      <h1 class="text-2xl font-bold tracking-widest text-blue-400">MODITEX</h1>
    </div>

    <nav class="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
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

    <div class="p-4 border-t border-gray-800 mt-auto shrink-0 bg-gray-900/50">
      <div class="flex items-center gap-3 mb-4 px-2">
        <div class="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center font-bold border border-blue-500 shadow-inner">
          G
        </div>
        <div>
          <p class="text-sm font-bold text-gray-100">Gustavo</p>
          <p class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Admin. del Sistema</p>
        </div>
      </div>

      <button 
        @click="cerrarSesion" 
        class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg font-bold transition-all duration-200 border border-transparent hover:border-red-500/30"
      >
        <span class="text-lg">🚪</span> Cerrar Sesión
      </button>
    </div>
  </aside>
</template>