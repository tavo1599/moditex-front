<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import api from '../api/axios';

const colores = ref<any[]>([]);
const cargando = ref(true);

// Estados para el CRUD
const modoEdicion = ref(false);
const idEdicion = ref<number | null>(null);

const formColor = ref({
  nombre: '',
  codigo: '',
  codigoHex: '#000000'
});

const inputNombre = ref<HTMLElement | null>(null);

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

const guardarColor = async () => {
  if (!formColor.value.nombre || formColor.value.codigo.length !== 3) {
    return alert("El nombre es obligatorio y el código debe tener exactamente 3 letras.");
  }
  
  try {
    if (modoEdicion.value && idEdicion.value) {
      // 🟢 RUTA PUT PARA ACTUALIZAR
      await api.put(`/colores/${idEdicion.value}`, formColor.value);
    } else {
      // 🔵 RUTA POST PARA CREAR NUEVO
      await api.post('/colores', formColor.value);
    }
    
    cancelarEdicion();
    await cargarColores();
  } catch (error: any) {
    alert("Error al guardar: " + (error.response?.data?.message || "Revisa que el código o nombre no estén duplicados."));
  }
};

const prepararEdicion = (color: any) => {
  modoEdicion.value = true;
  idEdicion.value = color.id;
  formColor.value = { 
    nombre: color.nombre, 
    codigo: color.codigo, 
    codigoHex: color.codigoHex || '#000000' 
  };
  
  // Mueve la vista hacia arriba y hace focus
  window.scrollTo({ top: 0, behavior: 'smooth' });
  nextTick(() => inputNombre.value?.focus());
};

const cancelarEdicion = () => {
  modoEdicion.value = false;
  idEdicion.value = null;
  formColor.value = { nombre: '', codigo: '', codigoHex: '#000000' };
};

const eliminarColor = async (id: number) => {
  const confirmacion = confirm("¿Estás seguro de eliminar este color? (Si ya hay prendas en el almacén con este color, el sistema no te dejará borrarlo por seguridad).");
  if (!confirmacion) return;
  
  try {
    // 🔴 RUTA DELETE PARA ELIMINAR
    await api.delete(`/colores/${id}`);
    await cargarColores();
  } catch (error: any) {
    alert("❌ No se puede eliminar. Es probable que este color ya esté siendo usado en prendas del almacén o en fichas técnicas.");
  }
};

onMounted(cargarColores);
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    
    <!-- FORMULARIO DE REGISTRO / EDICIÓN -->
    <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 transition-all duration-300" :class="modoEdicion ? 'ring-4 ring-blue-100 border-blue-300' : ''">
      
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-3xl font-black text-gray-800 flex items-center gap-2">
            <span>🎨</span> {{ modoEdicion ? 'Editando Color' : 'Gestión de Colores' }}
          </h2>
          <p class="text-gray-500 mt-1" v-if="!modoEdicion">Registra los colores oficiales para los códigos de barras (SKU).</p>
          <p class="text-blue-500 font-bold mt-1" v-else>Modificando los datos del color seleccionado.</p>
        </div>
        
        <button v-if="modoEdicion" @click="cancelarEdicion" class="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg font-bold transition">
          Cancelar Edición
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nombre del Color</label>
          <input ref="inputNombre" v-model="formColor.nombre" type="text" placeholder="Ej: Azul Marino" class="w-full border-2 border-gray-100 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-800">
        </div>
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Código SKU (3 Letras)</label>
          <input v-model="formColor.codigo" type="text" maxlength="3" placeholder="Ej: AZM" class="w-full border-2 border-gray-100 p-3 rounded-xl focus:border-blue-500 outline-none font-bold uppercase text-center tracking-widest">
        </div>
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Muestra de Color (Hex)</label>
          <div class="flex gap-2">
            <input v-model="formColor.codigoHex" type="color" class="h-[52px] w-14 rounded-xl cursor-pointer border-2 border-gray-100">
            <input v-model="formColor.codigoHex" type="text" class="flex-1 border-2 border-gray-100 p-3 rounded-xl font-mono text-sm uppercase font-bold text-gray-600">
          </div>
        </div>
      </div>

      <button @click="guardarColor" class="w-full mt-6 text-white font-black py-4 rounded-xl transition-all shadow-lg uppercase tracking-widest" :class="modoEdicion ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30' : 'bg-gray-900 hover:bg-black shadow-gray-900/20'">
        {{ modoEdicion ? '💾 ACTUALIZAR COLOR' : '➕ REGISTRAR COLOR EN BASE DE DATOS' }}
      </button>
    </div>

    <!-- TABLA DE LISTADO -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div v-if="cargando" class="p-10 text-center text-gray-400 font-bold">Cargando colores...</div>
      
      <table v-else class="w-full text-left">
        <thead class="bg-gray-50 border-b border-gray-100">
          <tr>
            <th class="p-4 text-[10px] font-black text-gray-400 uppercase w-16 text-center">Muestra</th>
            <th class="p-4 text-[10px] font-black text-gray-400 uppercase">Nombre del Color</th>
            <th class="p-4 text-[10px] font-black text-gray-400 uppercase text-center">Código (SKU)</th>
            <th class="p-4 text-[10px] font-black text-gray-400 uppercase text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-if="colores.length === 0">
            <td colspan="4" class="p-8 text-center text-gray-400 italic">No hay colores registrados. Comienza agregando uno arriba.</td>
          </tr>
          <tr v-for="color in colores" :key="color.id" class="hover:bg-gray-50/50 transition-colors">
            <td class="p-4 flex justify-center">
              <div class="w-8 h-8 rounded-full border border-gray-200 shadow-sm" :style="{ backgroundColor: color.codigoHex || '#eee' }"></div>
            </td>
            <td class="p-4 font-bold text-gray-800">{{ color.nombre }}</td>
            <td class="p-4 text-center">
              <span class="bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-mono font-bold tracking-widest">
                {{ color.codigo }}
              </span>
            </td>
            <td class="p-4 text-right">
              <div class="flex justify-end gap-2">
                <button @click="prepararEdicion(color)" class="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 px-3 py-1.5 rounded-lg font-bold text-xs transition">
                  ✏️ Editar
                </button>
                <button @click="eliminarColor(color.id)" class="bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 px-3 py-1.5 rounded-lg font-bold text-xs transition">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>