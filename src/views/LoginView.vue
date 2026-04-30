<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref(false);

const handleLogin = async () => {
  try {
    // AQUÍ ESTÁ LA MAGIA: Cambiamos 'email' por 'codigo' y 'password' por 'pass'
    // para que coincida exactamente con lo que espera tu LoginDto en NestJS
    const success = await authStore.login({ 
      codigo: email.value, 
      pass: password.value 
    });
    
    if (success) router.push('/'); // Si entra, lo mandamos al Dashboard
  } catch (err) {
    error.value = true;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-900 px-4">
    <div class="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div class="p-8">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-800 tracking-tight">MODITEX</h1>
          <p class="text-gray-500 mt-2">Ingresa tus credenciales de acceso</p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-6">
          <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center font-medium">
            ⚠️ Correo o contraseña incorrectos
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
            <input v-model="email" type="email" required class="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input v-model="password" type="password" required class="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-blue-200">
            Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  </div>
</template>