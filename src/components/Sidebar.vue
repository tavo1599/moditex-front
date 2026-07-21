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

// Cada ítem declara qué roles pueden verlo y a qué sección pertenece.
// seccion 'produccion' = ERP; seccion 'web' = gestión de la tienda online.
// VENDEDOR ve solo lo operativo de venta; ADMIN ve todo.
const TODOS = ['ADMIN', 'VENDEDOR'];
const menuItems = [
  // --- PRODUCCIÓN (ERP) ---
  { name: 'Dashboard', path: '/', icon: '📊', roles: TODOS, seccion: 'produccion' },
  { name: 'Almacén', path: '/almacen', icon: '📦', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Ingeniería', path: '/ingenieria', icon: '📐', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Producción', path: '/produccion', icon: '🏭', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Recepción Taller', path: '/recepcion', icon: '📥', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Etiquetas', path: '/etiquetas', icon: '🏷️', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Despachos', path: '/despachos', icon: '🚚', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Talleres', path: '/talleres', icon: '🧵', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Productos', path: '/productos', icon: '👕', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Control de Ordenes', path: '/control-ordenes', icon: '📋', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Compras', path: '/compras', icon: '🛒', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Liquidaciones', path: '/liquidaciones', icon: '💰', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Almacen de terminados', path: '/almacen-terminados', icon: '🏬', roles: TODOS, seccion: 'produccion' },
  { name: 'Conteo de Inventario', path: '/conteo-inventario', icon: '📋', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Traslados', path: '/traslados', icon: '🔄', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Punto de Venta', path: '/punto-venta', icon: '🛒', roles: TODOS, seccion: 'produccion' },
  { name: 'Config. Colores', path: '/config-colores', icon: '🎨', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Reportes', path: '/reportes', icon: '📈', roles: ['ADMIN'], seccion: 'produccion' },
  { name: 'Cobranzas', path: '/cobranzas', icon: '💳', roles: TODOS, seccion: 'produccion' },
  { name: 'Devoluciones', path: '/devoluciones', icon: '🔄', roles: TODOS, seccion: 'produccion' },
  { name: 'Cierre de Caja', path: '/cierre-caja', icon: '🧾', roles: TODOS, seccion: 'produccion' },
  { name: 'Usuarios', path: '/usuarios', icon: '👥', roles: ['ADMIN'], seccion: 'produccion' },
  // --- TIENDA WEB ---
  { name: 'Productos Web', path: '/web/productos', icon: '🛍️', roles: ['ADMIN'], seccion: 'web' },
  { name: 'Pedidos Web', path: '/web/pedidos', icon: '📦', roles: ['ADMIN'], seccion: 'web' },
  { name: 'Portada / Carrusel', path: '/web/portada', icon: '🖼️', roles: ['ADMIN'], seccion: 'web' },
  { name: 'Publicaciones', path: '/web/publicaciones', icon: '📸', roles: ['ADMIN'], seccion: 'web' },
  { name: 'Reseñas', path: '/web/resenas', icon: '⭐', roles: ['ADMIN'], seccion: 'web' },
  { name: 'Códigos Promo', path: '/web/cupones', icon: '🎟️', roles: ['ADMIN'], seccion: 'web' },
  { name: 'Reclamaciones', path: '/web/reclamaciones', icon: '📕', roles: ['ADMIN'], seccion: 'web' },
  { name: 'Ajustes Web', path: '/web/ajustes', icon: '⚙️', roles: ['ADMIN'], seccion: 'web' },
]

// Mostramos solo los ítems del modo actual y permitidos para el rol
const menuVisible = computed(() =>
  menuItems.filter(
    (item) => item.roles.includes(authStore.rol) && item.seccion === ui.modo,
  ),
)

// El switch de modo Web solo lo ve el ADMIN
const puedeVerWeb = computed(() => authStore.rol === 'ADMIN')

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

    <!-- SWITCH Producción ⇄ Web (solo ADMIN) -->
    <div v-if="puedeVerWeb" class="px-4 pt-4 shrink-0">
      <div class="grid grid-cols-2 gap-1 bg-gray-800 rounded-xl p-1">
        <button
          @click="ui.setModo('produccion')"
          class="py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
          :class="ui.modo === 'produccion' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'"
        >🏭 Producción</button>
        <button
          @click="ui.setModo('web')"
          class="py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
          :class="ui.modo === 'web' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'"
        >🌐 Web</button>
      </div>
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