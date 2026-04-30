<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import api from '../api/axios';

const productos = ref<any[]>([]);
const insumos = ref<any[]>([]);
const productoId = ref('');
const receta = ref<any[]>([]);
const ruta = ref<any[]>([]);
const cargando = ref(true);

const cargarCatalogos = async () => {
  try {
    const [resP, resI] = await Promise.all([api.get('/productos'), api.get('/insumos')]);
    productos.value = resP.data;
    insumos.value = resI.data;
  } catch (error) {
    console.error("Error al cargar:", error);
  } finally {
    cargando.value = false;
  }
};

watch(productoId, async (id) => {
  if (!id) return;
  cargando.value = true;
  try {
    const res = await api.get(`/productos/${id}`);
    receta.value = res.data.boms || [];
    ruta.value = res.data.rutasBase || [];
  } catch (error) {
    console.error("Error al cargar ficha:", error);
  } finally {
    cargando.value = false;
  }
});

const guardar = async () => {
  if (!productoId.value) return alert("Selecciona un modelo.");
  try {
    await api.post(`/productos/${productoId.value}/ficha-tecnica`, {
      boms: receta.value,
      rutas: ruta.value
    });
    alert("✅ Ficha Técnica y Ruta guardadas correctamente. Lista para Producción.");
  } catch (e) { alert("Error al guardar la Ficha Técnica."); }
};

onMounted(cargarCatalogos);
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Ingeniería (Ficha Técnica)</h2>
        <p class="text-gray-500 mt-1">Configura la receta de materiales y la ruta de confección.</p>
      </div>
      <button @click="guardar" class="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-md transition-all flex items-center gap-2">
        <span>💾</span> Guardar Ficha Completa
      </button>
    </div>

    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <label class="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Seleccionar Modelo</label>
      <select v-model="productoId" class="w-full md:w-1/2 border border-gray-300 rounded-lg p-3 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-800 text-lg">
        <option value="" disabled>Elige un producto de tu catálogo...</option>
        <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.skuBase }} - {{ p.nombre }}</option>
      </select>
    </div>

    <div v-if="cargando && productoId" class="text-center py-12">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
    </div>

    <div v-else-if="productoId" class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
      
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
        <div class="bg-blue-900 p-4 flex justify-between items-center">
          <h3 class="font-bold text-white flex items-center gap-2"><span>📦</span> Materiales (BOM)</h3>
        </div>
        
        <div class="p-4 flex-1 overflow-x-auto bg-white space-y-3">
          <div v-if="receta.length === 0" class="text-center py-6 text-gray-400 italic text-sm border-2 border-dashed border-gray-100 rounded-lg">
            No hay materiales registrados.
          </div>
          <div v-for="(m, i) in receta" :key="i" class="flex gap-3 items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
            <select v-model="m.insumoId" class="flex-1 border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="" disabled>Seleccionar Insumo...</option>
              <option v-for="ins in insumos" :key="ins.id" :value="ins.id">{{ ins.nombre }}</option>
            </select>
            <div class="w-24">
              <input type="number" step="0.001" v-model="m.cantidadRequerida" class="w-full border border-gray-300 rounded p-2 text-center font-bold text-blue-700 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Cant.">
            </div>
            <button @click="receta.splice(i, 1)" class="text-red-400 hover:text-red-600 bg-white border border-gray-200 rounded p-2">✖</button>
          </div>
        </div>
        
        <div class="p-4 bg-gray-50 border-t border-gray-100">
          <button @click="receta.push({ insumoId: '', cantidadRequerida: 0 })" class="w-full bg-white border border-dashed border-gray-300 text-blue-600 py-2.5 rounded-lg font-bold hover:bg-blue-50 transition text-sm">
            + Agregar Material / Avío
          </button>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
        <div class="bg-gray-800 p-4 flex justify-between items-center">
          <h3 class="font-bold text-white flex items-center gap-2"><span>⚙️</span> Ruta de Operaciones (Talleres)</h3>
          <span class="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">Secuencia Lógica</span>
        </div>
        
        <div class="p-4 flex-1 bg-white space-y-3">
          <div v-if="ruta.length === 0" class="text-center py-6 text-gray-400 italic text-sm border-2 border-dashed border-gray-100 rounded-lg">
            No hay operaciones registradas.
          </div>
          <div v-for="(r, i) in ruta" :key="i" class="flex items-center gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
            <div class="bg-gray-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
              {{ i + 1 }}
            </div>
            <div class="flex-1">
              <select v-model="r.tipoServicio" class="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-gray-800 font-medium">
                <option value="" disabled>Seleccione Operación...</option>
                <option value="Corte">Corte</option>
                <option value="Confección">Confección</option>
                <option value="Ojal y Botón">Ojal y Botón</option>
                <option value="Atraque">Atraque</option>
                <option value="Lavandería">Lavandería</option>
                <option value="Planchado y Empaque">Planchado y Empaque</option>
                <option value="Control de Calidad">Control de Calidad</option>
                <option value="Serigrafiado">Serigrafiado</option>
              </select>
            </div>
            <button @click="ruta.splice(i, 1)" class="text-red-400 hover:text-red-600 bg-white border border-gray-200 rounded p-2">✖</button>
          </div>
        </div>
        
        <div class="p-4 bg-gray-50 border-t border-gray-100">
          <button @click="ruta.push({ tipoServicio: '' })" class="w-full bg-white border border-dashed border-gray-300 text-gray-700 py-2.5 rounded-lg font-bold hover:bg-gray-100 transition text-sm">
            + Agregar Paso a la Ruta
          </button>
        </div>
      </div>

    </div>
  </div>
</template>