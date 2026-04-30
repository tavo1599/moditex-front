<script setup lang="ts">
import { RouterView } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import { useAuthStore } from './stores/auth' // <--- Importamos el almacén de seguridad

const authStore = useAuthStore()
</script>

<template>
  <div class="flex h-screen bg-gray-50 font-sans text-gray-800 overflow-hidden">
    
    <Sidebar v-if="authStore.estaAutenticado" />

    <main 
      class="flex-1 overflow-y-auto"
      :class="{ 'p-8': authStore.estaAutenticado }" 
    >
      <RouterView />
    </main>
    
  </div>
</template>

<style>
/* Un pequeño toque para que la barra de desplazamiento se vea moderna */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>