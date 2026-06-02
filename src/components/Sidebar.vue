<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter, useRoute } from 'vue-router' // 🔥 Agregamos useRoute
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const route = useRoute() // 🔥 Instanciamos useRoute para leer la ruta actual
const authStore = useAuthStore()
const ui = useUiStore() // colapsar/mostrar sidebar en escritorio

// Estado del menú móvil (drawer). En escritorio el menú siempre está visible.
const menuAbierto = ref(false)

// Cada vez que cambia la ruta, cerramos el drawer en móvil
watch(() => route.path, () => { menuAbierto.value = false })

// Cada ítem declara qué roles pueden verlo.
// VENDEDOR ve solo lo operativo de venta; ADMIN ve todo.
const TODOS = ['ADMIN', 'VENDEDOR'];
const menuItems = [
  { name: 'Dashboard', path: '/', icon: '📊', roles: TODOS },
  { name: 'Almacén', path: '/almacen', icon: '📦', roles: ['ADMIN'] },
  { name: 'Ingeniería', path: '/ingenieria', icon: '📐', roles: ['ADMIN'] },
  { name: 'Producción', path: '/produccion', icon: '🏭', roles: ['ADMIN'] },
  { name: 'Recepción Taller', path: '/recepcion', icon: '📥', roles: ['ADMIN'] },
  { name: 'Despachos', path: '/despachos', icon: '🚚', roles: ['ADMIN'] },
  { name: 'Talleres', path: '/talleres', icon: '🧵', roles: ['ADMIN'] },
  { name: 'Productos', path: '/productos', icon: '👕', roles: ['ADMIN'] },
  { name: 'Control de Ordenes', path: '/control-ordenes', icon: '📋', roles: ['ADMIN'] },
  { name: 'Compras', path: '/compras', icon: '🛒', roles: ['ADMIN'] },
  { name: 'Liquidaciones', path: '/liquidaciones', icon: '💰', roles: ['ADMIN'] },
  { name: 'Almacen de terminados', path: '/almacen-terminados', icon: '🏬', roles: TODOS },
  { name: 'Traslados', path: '/traslados', icon: '🔄', roles: ['ADMIN'] },
  { name: 'Punto de Venta', path: '/punto-venta', icon: '🛒', roles: TODOS },
  { name: 'Config. Colores', path: '/config-colores', icon: '🎨', roles: ['ADMIN'] },
  { name: 'Reportes', path: '/reportes', icon: '📈', roles: ['ADMIN'] },
  { name: 'Cobranzas', path: '/cobranzas', icon: '💳', roles: TODOS },
  { name: 'Usuarios', path: '/usuarios', icon: '👥', roles: ['ADMIN'] },
]

// Solo mostramos los ítems permitidos para el rol del usuario logueado
const menuVisible = computed(() =>
  menuItems.filter((item) => item.roles.includes(authStore.rol))
)

// Inicial para el avatar
const inicial = computed(() => (authStore.nombre || 'U').charAt(0).toUpperCase())

// FUNCIÓN PARA CERRAR SESIÓN DE FORMA SEGURA
const cerrarSesion = () => {
  authStore.logout();
  router.push({ name: 'login' });
};
</script>

<template>
  <template v-if="!route.meta.hideLayout">
    <!-- Botón hamburguesa: solo visible en móvil -->
    <button
      @click="menuAbierto = true"
      class="md:hidden fixed top-4 left-4 z-50 bg-gray-900 text-white w-11 h-11 rounded-lg shadow-lg flex items-center justify-center text-xl"
      aria-label="Abrir menú"
    >
      ☰
    </button>

    <!-- Botón flotante para REABRIR el sidebar en escritorio (cuando está colapsado) -->
    <button
      v-if="ui.sidebarColapsado"
      @click="ui.setColapsado(false)"
      class="hidden md:flex fixed top-4 left-4 z-50 bg-gray-900 text-white w-11 h-11 rounded-lg shadow-lg items-center justify-center text-xl hover:bg-gray-800"
      aria-label="Mostrar menú"
    >
      ☰
    </button>

    <!-- Fondo oscuro detrás del drawer (solo móvil, al abrir) -->
    <div
      v-if="menuAbierto"
      @click="menuAbierto = false"
      class="md:hidden fixed inset-0 bg-black/50 z-40"
    ></div>

  <aside
    class="w-64 bg-gray-900 text-white flex flex-col shadow-2xl h-screen
           fixed top-0 left-0 z-50 transition-transform duration-300 md:static"
    :class="[
      menuAbierto ? 'translate-x-0' : '-translate-x-full',
      ui.sidebarColapsado ? 'md:hidden' : 'md:translate-x-0'
    ]"
  >
    <div class="h-20 flex items-center justify-center border-b border-gray-800 shrink-0 relative">
      <h1 class="text-2xl font-bold tracking-widest text-blue-400">MODITEX</h1>
      <!-- Botón cerrar (móvil) -->
      <button
        @click="menuAbierto = false"
        class="md:hidden absolute right-4 text-gray-400 hover:text-white text-2xl leading-none"
        aria-label="Cerrar menú"
      >
        &times;
      </button>
      <!-- Botón colapsar (escritorio) -->
      <button
        @click="ui.setColapsado(true)"
        class="hidden md:flex absolute right-4 text-gray-400 hover:text-white text-xl leading-none"
        aria-label="Ocultar menú"
        title="Ocultar menú"
      >
        «
      </button>
    </div>

    <nav class="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
      <RouterLink
        v-for="item in menuVisible"
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
          {{ inicial }}
        </div>
        <div>
          <p class="text-sm font-bold text-gray-100">{{ authStore.nombre }}</p>
          <p class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{{ authStore.rol === 'ADMIN' ? 'Admin. del Sistema' : 'Vendedor' }}</p>
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
</template>