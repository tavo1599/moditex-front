<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import { useAuthStore } from './stores/auth' // <--- Importamos el almacén de seguridad
import { useUiStore } from './stores/ui'

const authStore = useAuthStore()
const ui = useUiStore()
const route = useRoute()

// El menú lateral es cajón hasta 1024px (ver Sidebar.vue), así que hasta ahí
// el contenido necesita aire arriba para no quedar debajo del botón ☰.
//
// Las rutas con meta.pantallaCompleta (la Caja Rápida) se dibujan solas, sin
// sidebar ni márgenes: el cajero solo debe ver la caja y no agobiarse con el
// resto del ERP.
const pantallaCompleta = computed(() => Boolean(route.meta?.pantallaCompleta))

const conChrome = computed(() => authStore.estaAutenticado && !pantallaCompleta.value)
</script>

<template>
  <div class="flex h-screen bg-gray-50 font-sans text-gray-800 overflow-hidden">

    <Sidebar v-if="conChrome" />

    <main
      class="flex-1 overflow-y-auto"
      :class="{
        'px-4 py-4 pt-20 lg:p-8': conChrome,
        'lg:pl-20': conChrome && ui.sidebarColapsado
      }"
    >
      <RouterView />
    </main>

  </div>
</template>
