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

// ==========================================
// NUEVO: CALCULADORA DE COSTOS EN TIEMPO REAL
// ==========================================
const costoTotalReceta = computed(() => {
  return receta.value.reduce((total, item) => {
    if (!item.insumoId || !item.cantidadRequerida) return total;
    const insumoReal = insumos.value.find(i => i.id === item.insumoId);
    if (insumoReal) {
      return total + (Number(item.cantidadRequerida) * Number(insumoReal.costoUnitario));
    }
    return total;
  }, 0);
});

const obtenerInfoInsumo = (id: number) => {
  return insumos.value.find(i => i.id === id) || null;
};

const guardar = async () => {
  if (!productoId.value) return alert("Selecciona un modelo.");
  
  // Validación básica
  const recetaValida = receta.value.every(r => r.insumoId && r.cantidadRequerida > 0);
  const rutaValida = ruta.value.every(r => r.tipoServicio !== '');
  
  if (!recetaValida || !rutaValida) {
    return alert("⚠️ Asegúrate de que todos los materiales tengan cantidad mayor a 0 y todas las rutas tengan un servicio seleccionado.");
  }

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
    <!-- CABECERA -->
    <div class="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Ingeniería (Ficha Técnica)</h2>
        <p class="text-gray-500 mt-1">Configura la receta de materiales y calcula el costo base.</p>
      </div>
      <button @click="guardar" class="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-md transition-all flex items-center gap-2">
        <span>💾</span> Guardar Ficha Completa
      </button>
    </div>

    <!-- SELECCIÓN DE PRODUCTO -->
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
      <div class="w-full md:w-1/2">
        <label class="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Seleccionar Modelo a Diseñar</label>
        <select v-model="productoId" class="w-full border-2 border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 font-black text-blue-800 text-lg shadow-sm">
          <option value="" disabled>Elige un producto de tu catálogo...</option>
          <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.skuBase }} - {{ p.nombre }}</option>
        </select>
      </div>

      <!-- RESUMEN DE COSTO (Aparece solo si hay producto) -->
      <div v-if="productoId" class="hidden md:block text-right">
        <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Costo Materiales</p>
        <p class="text-4xl font-black text-gray-800">S/ {{ costoTotalReceta.toFixed(2) }}</p>
      </div>
    </div>

    <div v-if="cargando && productoId" class="text-center py-12">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
    </div>

    <!-- PANELES DE INGENIERÍA -->
    <div v-else-if="productoId" class="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in duration-300">
      
      <!-- PANEL 1: LISTA DE MATERIALES (BOM) -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
        <div class="bg-blue-900 p-4 flex justify-between items-center">
          <h3 class="font-bold text-white flex items-center gap-2"><span>📦</span> Lista de Materiales (BOM)</h3>
          <span class="bg-blue-800 text-blue-100 text-xs px-2 py-1 rounded font-bold">Total: S/ {{ costoTotalReceta.toFixed(2) }}</span>
        </div>
        
        <div class="p-4 flex-1 bg-white space-y-3">
          <div v-if="receta.length === 0" class="text-center py-6 text-gray-400 italic text-sm border-2 border-dashed border-gray-100 rounded-lg">
            Aún no hay materiales en la receta.
          </div>
          
          <!-- FILA DE MATERIAL -->
          <div v-for="(m, i) in receta" :key="i" class="flex flex-col sm:flex-row gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 relative group transition-all hover:border-blue-300 hover:shadow-sm">
            
            <!-- Selector de Insumo -->
            <div class="flex-1">
              <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Materia Prima / Avío</label>
              <select v-model="m.insumoId" class="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium">
                <option value="" disabled>Seleccionar...</option>
                <option v-for="ins in insumos" :key="ins.id" :value="ins.id">{{ ins.codigo }} - {{ ins.nombre }}</option>
              </select>
            </div>
            
            <!-- Cantidad -->
            <div class="w-full sm:w-28">
              <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                Cant. <span v-if="m.insumoId" class="text-blue-600">({{ obtenerInfoInsumo(m.insumoId)?.unidadMedida }})</span>
              </label>
              <input type="number" step="0.001" min="0" v-model="m.cantidadRequerida" class="w-full border border-gray-300 rounded-lg p-2 text-center font-black text-blue-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            </div>

            <!-- Subtotal Calculado (Solo lectura) -->
            <div class="w-full sm:w-24 text-right sm:text-left flex flex-col justify-end">
              <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Subtotal</label>
              <p class="font-bold text-gray-700 text-sm py-2">
                S/ <span v-if="m.insumoId">{{ (Number(m.cantidadRequerida || 0) * Number(obtenerInfoInsumo(m.insumoId)?.costoUnitario || 0)).toFixed(2) }}</span>
                <span v-else>0.00</span>
              </p>
            </div>

            <!-- Botón Eliminar -->
            <button @click="receta.splice(i, 1)" class="absolute top-2 right-2 sm:static sm:mt-5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg p-2 transition" title="Quitar material">
              ✖
            </button>
          </div>
        </div>
        
        <div class="p-4 bg-gray-50 border-t border-gray-100">
          <button @click="receta.push({ insumoId: '', cantidadRequerida: 0 })" class="w-full bg-white border border-dashed border-gray-300 text-blue-600 py-3 rounded-xl font-black hover:bg-blue-50 hover:border-blue-400 transition text-sm shadow-sm">
            + Agregar Material o Avío
          </button>
        </div>
      </div>

      <!-- PANEL 2: RUTA DE TALLERES -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
        <div class="bg-gray-800 p-4 flex justify-between items-center">
          <h3 class="font-bold text-white flex items-center gap-2"><span>⚙️</span> Ruta de Fabricación</h3>
          <span class="text-xs text-gray-300 bg-gray-700 px-2 py-1 rounded font-bold">Secuencia de Talleres</span>
        </div>
        
        <div class="p-4 flex-1 bg-white space-y-3">
          <div v-if="ruta.length === 0" class="text-center py-6 text-gray-400 italic text-sm border-2 border-dashed border-gray-100 rounded-lg">
            No hay operaciones en la ruta.
          </div>
          
          <div v-for="(r, i) in ruta" :key="i" class="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
            <div class="bg-gray-800 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 shadow-md">
              {{ i + 1 }}
            </div>
            <div class="flex-1">
              <select v-model="r.tipoServicio" class="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-gray-800 font-bold text-gray-700">
                <option value="" disabled>Seleccione Operación...</option>
                <option value="Corte">✂️ Corte</option>
                <option value="Confección">🧵 Confección</option>
                <option value="Ojal y Botón">🔘 Ojal y Botón</option>
                <option value="Atraque">📍 Atraque</option>
                <option value="Lavandería">🫧 Lavandería</option>
                <option value="Estampado / Serigrafía">🎨 Estampado / Serigrafía</option>
                <option value="Control de Calidad">🔎 Control de Calidad</option>
                <option value="Planchado y Empaque">📦 Planchado y Empaque</option>
              </select>
            </div>
            <button @click="ruta.splice(i, 1)" class="text-gray-400 hover:text-red-500 hover:bg-red-50 bg-white border border-gray-200 rounded-lg p-2 transition">
              ✖
            </button>
          </div>
        </div>
        
        <div class="p-4 bg-gray-50 border-t border-gray-100">
          <button @click="ruta.push({ tipoServicio: '' })" class="w-full bg-white border border-dashed border-gray-300 text-gray-700 py-3 rounded-xl font-black hover:bg-gray-100 transition text-sm shadow-sm">
            + Agregar Paso a la Ruta
          </button>
        </div>
      </div>

    </div>
  </div>
</template>