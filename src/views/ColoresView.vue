<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios';

const colores = ref<any[]>([]);
const cargando = ref(true);
const nuevoColor = ref({
  nombre: '',
  codigo: '',
  codigoHex: '#000000'
});

const cargarColores = async () => {
  cargando.value = true;
  try {
    const res = await api.get('/colores');
    colores.value = res.data;
  } catch (error) {
    console.error("Error al cargar colores:", error);
  } finally {
    cargando.value = false;
  }
};

const registrarColor = async () => {
  if (!nuevoColor.value.nombre || nuevoColor.value.codigo.length !== 3) {
    return alert("El nombre es obligatorio y el código debe tener exactamente 3 letras.");
  }
  try {
    await api.post('/colores', nuevoColor.value);
    nuevoColor.value = { nombre: '', codigo: '', codigoHex: '#000000' };
    await cargarColores();
    alert("Color registrado con éxito");
  } catch (error) {
    alert("Error al registrar: El nombre o código ya podrían existir.");
  }
};

onMounted(cargarColores);
</script>

<template>
  <div class="p-6 space-y-6 max-w-4xl mx-auto">
    <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-black text-gray-800 mb-2">🎨 Gestión de Colores</h2>
      <p class="text-gray-500 mb-6">Registra los colores oficiales para los códigos de barras (SKU).</p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nombre del Color</label>
          <input v-model="nuevoColor.nombre" type="text" placeholder="Ej: Azul Marino" class="w-full border-2 border-gray-100 p-3 rounded-xl focus:border-blue-500 outline-none font-bold">
        </div>
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Código SKU (3 Letras)</label>
          <input v-model="nuevoColor.codigo" type="text" maxlength="3" placeholder="Ej: AZM" class="w-full border-2 border-gray-100 p-3 rounded-xl focus:border-blue-500 outline-none font-bold uppercase text-center">
        </div>
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Muestra de Color (Hex)</label>
          <div class="flex gap-2">
            <input v-model="nuevoColor.codigoHex" type="color" class="h-12 w-12 border-none cursor-pointer">
            <input v-model="nuevoColor.codigoHex" type="text" class="flex-1 border-2 border-gray-100 p-3 rounded-xl font-mono text-sm uppercase">
          </div>
        </div>
      </div>

      <button @click="registrarColor" class="w-full mt-6 bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl transition-all shadow-lg">
        REGISTRAR COLOR EN BASE DE DATOS
      </button>
    </div>

    <!-- LISTADO -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left">
        <thead class="bg-gray-50 border-b border-gray-100">
          <tr>
            <th class="p-4 text-[10px] font-black text-gray-400 uppercase">Muestra</th>
            <th class="p-4 text-[10px] font-black text-gray-400 uppercase">Nombre</th>
            <th class="p-4 text-[10px] font-black text-gray-400 uppercase text-center">Código SKU</th>
            <th class="p-4 text-[10px] font-black text-gray-400 uppercase text-right">ID Prisma</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-for="color in colores" :key="color.id" class="hover:bg-gray-50/50">
            <td class="p-4">
              <div class="w-8 h-8 rounded-full border border-gray-200" :style="{ backgroundColor: color.codigoHex || '#eee' }"></div>
            </td>
            <td class="p-4 font-bold text-gray-700">{{ color.nombre }}</td>
            <td class="p-4 text-center">
              <span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg font-mono font-bold">{{ color.codigo }}</span>
            </td>
            <td class="p-4 text-right text-gray-400 font-mono text-xs">#{{ color.id }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>