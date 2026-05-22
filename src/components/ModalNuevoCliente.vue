<script setup lang="ts">
import { ref } from 'vue';
import api from '../api/axios'; // Ajusta la ruta si es necesario

// Definimos qué recibe (props) y qué avisa hacia afuera (emits)
const props = defineProps({
  show: Boolean
});

const emit = defineEmits(['close', 'cliente-registrado']);

// Variables locales solo para este modal
const procesandoCliente = ref(false);
const formCliente = ref({ nombre: '', documento: '', limiteCredito: 1000 });

const registrarNuevoCliente = async () => {
  if (!formCliente.value.nombre.trim()) return alert("El nombre o Razón Social es obligatorio.");
  
  procesandoCliente.value = true;
  try {
    const res = await api.post('/clientes', formCliente.value);
    
    // Le enviamos el nuevo cliente a la pantalla principal
    emit('cliente-registrado', res.data);
    
    // Limpiamos el formulario interno
    formCliente.value = { nombre: '', documento: '', limiteCredito: 1000 };
  } catch (error) {
    alert("Error al registrar cliente.");
  } finally {
    procesandoCliente.value = false;
  }
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
    <div class="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-[zoomIn_0.3s_ease-out]">
      <div class="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 class="text-lg font-black text-gray-800 flex items-center gap-2"><span>👤</span> Alta de Mayorista</h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-red-500 font-bold text-xl">✕</button>
      </div>
      
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Nombre o Razón Social</label>
          <input v-model="formCliente.nombre" type="text" placeholder="Ej: Comercial Los Andes" class="w-full bg-white border border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500" />
        </div>
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">DNI / RUC (Opcional)</label>
          <input v-model="formCliente.documento" type="text" placeholder="1045..." class="w-full bg-white border border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500" />
        </div>
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Límite de Crédito (S/)</label>
          <input v-model.number="formCliente.limiteCredito" type="number" class="w-full bg-white border border-gray-200 p-3 rounded-xl font-black text-blue-600 outline-none focus:border-blue-500 text-lg" />
          <p class="text-[9px] text-gray-400 font-bold mt-1 uppercase">Monto máximo que el sistema le permitirá deber.</p>
        </div>
      </div>

      <div class="p-6 border-t border-gray-100 bg-gray-50">
        <button @click="registrarNuevoCliente" :disabled="procesandoCliente" class="w-full bg-blue-600 disabled:bg-gray-300 text-white font-black py-4 rounded-xl hover:bg-blue-700 transition-colors flex justify-center items-center gap-2">
          <span v-if="procesandoCliente" class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <span v-else>💾 GUARDAR Y SELECCIONAR</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes zoomIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  -moz-appearance: textfield;
}
</style>