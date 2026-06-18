<script setup lang="ts">
import { ref } from 'vue';
import api from '../../api/axios';

// Recibimos la lista de bodegas desde el componente padre
const props = defineProps<{
  bodegas: any[];
}>();

// Avisamos al padre cuando haya que recargar datos o abrir un ingreso
const emit = defineEmits(['recargar-datos', 'abrir-ingreso']);

// Estados propios de este componente
const modalBodega = ref(false);
const modoEdicionBodega = ref(false);
const idEdicionBodega = ref<number | null>(null);
const formBodega = ref({ nombre: '', tipo: 'Venta', direccion: '', estado: true });

const abrirNuevaBodega = () => { 
  modoEdicionBodega.value = false; 
  idEdicionBodega.value = null; 
  formBodega.value = { nombre: '', tipo: 'Venta', direccion: '', estado: true }; 
  modalBodega.value = true; 
};

const abrirEditarBodega = (bodega: any) => { 
  modoEdicionBodega.value = true; 
  idEdicionBodega.value = bodega.id; 
  formBodega.value = { nombre: bodega.nombre, tipo: bodega.tipo, direccion: bodega.direccion || '', estado: bodega.estado }; 
  modalBodega.value = true; 
};

const guardarBodega = async () => {
  if (!formBodega.value.nombre) return alert('Ponle un nombre a la bodega');
  try {
    if (modoEdicionBodega.value && idEdicionBodega.value) {
      await api.put(`/almacen-terminados/bodegas/${idEdicionBodega.value}`, formBodega.value);
    } else {
      await api.post('/almacen-terminados/bodegas', formBodega.value);
    }
    modalBodega.value = false;
    emit('recargar-datos'); // Le pedimos al padre que vuelva a consultar el backend
  } catch (error) { 
    alert('Error al guardar bodega'); 
  }
};
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in duration-300">
    <div @click="abrirNuevaBodega" class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-8 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:border-gray-400 cursor-pointer transition-all min-h-[200px]">
      <span class="text-4xl mb-2">+</span><span class="font-bold">Crear Nueva Bodega</span>
    </div>
    
    <div v-for="bodega in bodegas" :key="bodega.id" class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col" :class="bodega.estado ? '' : 'opacity-60 bg-gray-50'">
      <div class="absolute top-0 right-0 p-3 flex items-center gap-2">
        <span v-if="!bodega.estado" class="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-gray-200 text-gray-600">Inactivo</span>
        <span v-else class="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-blue-100 text-blue-700">{{ bodega.tipo }}</span>
        <button @click.stop="abrirEditarBodega(bodega)" class="text-gray-400 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 p-1.5 rounded-md transition" title="Editar Bodega">✏️</button>
      </div>
      <div class="mb-4 mt-2">
        <span class="text-3xl mb-2 block">🏬</span>
        <h3 class="text-xl font-black text-gray-800" :class="!bodega.estado && 'line-through'">{{ bodega.nombre }}</h3>
        <p class="text-xs text-gray-400 mt-1 uppercase">{{ bodega.direccion || 'Sin dirección registrada' }}</p>
      </div>
      <div class="pt-4 border-t border-gray-100 mt-auto">
        <button v-if="bodega.estado" @click="emit('abrir-ingreso', bodega.id)" class="w-full bg-gray-900 hover:bg-black text-white font-bold py-2.5 rounded-lg text-sm transition shadow-md flex items-center justify-center gap-2">
          <span>📥</span> Ingresar a esta Bodega
        </button>
      </div>
    </div>

    <div v-if="modalBodega" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
        <h3 class="text-2xl font-black text-gray-800 mb-6">{{ modoEdicionBodega ? 'Editar Bodega' : 'Nueva Bodega' }}</h3>
        <div class="space-y-4">
          <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nombre Corto</label><input type="text" v-model="formBodega.nombre" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500"></div>
          <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Bodega</label><select v-model="formBodega.tipo" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500"><option value="Principal">🌐 Principal (abastece la tienda web)</option><option value="Venta">Bodega Comercial</option><option value="Transito">Tránsito</option><option value="Merma">Merma</option></select><p class="text-[10px] text-gray-400 mt-1 font-bold">La tienda web vende solo del almacén “Principal”. Usa este tipo en uno solo.</p></div>
          <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Dirección (Opcional)</label><input type="text" v-model="formBodega.direccion" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500"></div>
          <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estado</label><select v-model="formBodega.estado" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500"><option :value="true">🟢 Operativa</option><option :value="false">🔴 Clausurada</option></select></div>
          <div class="flex gap-3 pt-6 border-t border-gray-100">
            <button @click="modalBodega = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold">Cancelar</button>
            <button @click="guardarBodega" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>