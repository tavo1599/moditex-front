<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios';

// 🚀 IMPORTACIÓN DE NUESTROS NUEVOS COMPONENTES LIMPIOS
import GestionBodegas from '../components/almacen/GestionBodegas.vue';
import ModalIngresoLibre from '../components/almacen/ModalIngresoLibre.vue';
import ModalEtiquetas from '../components/almacen/ModalEtiquetas.vue';
import TableroKardex from '../components/almacen/TableroKardex.vue';
import ModalHistorialKardex from '../components/almacen/ModalHistorialKardex.vue';

// ==========================================
// ESTADOS PRINCIPALES DEL SISTEMA
// ==========================================
const vistaActiva = ref('kardex'); 
const inventario = ref<any[]>([]);
const bodegas = ref<any[]>([]);
const productos = ref<any[]>([]);
const colores = ref<any[]>([]); 
const cargando = ref(true);
const modalHistorial = ref(false);
const itemHistorial = ref<any>(null);

// Controladores de los componentes modales
const modalIngreso = ref(false);
const bodegaPredefinida = ref<number | ''>('');

const modalEtiquetas = ref(false);
const itemEtiqueta = ref<any>(null);

// Estados del Modal de Ajuste (Aún lo conservamos aquí por su simplicidad)
const modalAjuste = ref(false);
const ajustando = ref(false);
const formAjuste = ref({
  id: null as number | null,
  productoNombre: '',
  varianteDetalle: '',
  stockActual: 0,
  stockNuevo: 0,
  motivo: ''
});

const abrirHistorial = (item: any) => {
  itemHistorial.value = item;
  modalHistorial.value = true;
};

// ==========================================
// FUNCIONES BASE
// ==========================================
const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resInv, resBodegas, resProd, resColores] = await Promise.all([
      api.get('/almacen-terminados/inventario'),
      api.get('/almacen-terminados/bodegas'),
      api.get('/productos'),
      api.get('/colores')
    ]);
    inventario.value = resInv.data;
    bodegas.value = resBodegas.data;
    productos.value = resProd.data;
    colores.value = resColores.data;
  } catch (error) {
    console.error("Error cargando datos:", error);
  } finally {
    cargando.value = false;
  }
};

const getNombreColor = (codigoColor: string) => {
  const colorObj = colores.value.find(c => c.codigo === codigoColor || c.nombre === codigoColor);
  return colorObj ? `${colorObj.nombre}` : codigoColor;
};

// ==========================================
// APERTURA DE MODALES HIJOS
// ==========================================
const abrirIngreso = (id: number | '' = '') => {
  bodegaPredefinida.value = id;
  modalIngreso.value = true;
};

const abrirEtiquetas = (item: any) => {
  itemEtiqueta.value = item;
  modalEtiquetas.value = true;
};

// ==========================================
// LÓGICA DEL AJUSTE MANUAL
// ==========================================
const abrirAjuste = (item: any) => {
  formAjuste.value = {
    id: item.id,
    productoNombre: item.producto.nombre,
    varianteDetalle: `Talla: ${item.talla} | Color: ${getNombreColor(item.color)}`,
    stockActual: item.stock,
    stockNuevo: item.stock,
    motivo: ''
  };
  modalAjuste.value = true;
};

const guardarAjuste = async () => {
  if (!formAjuste.value.motivo || formAjuste.value.motivo.length < 5) {
    return alert("⚠️ Debes ingresar un motivo válido para la auditoría (mín. 5 caracteres).");
  }
  if (!confirm(`¿Confirmas el ajuste manual de stock a ${formAjuste.value.stockNuevo}? Esto quedará registrado.`)) return;

  ajustando.value = true;
  try {
    await api.post('/almacen-terminados/ajustar-stock', {
      inventarioId: formAjuste.value.id,
      nuevoStock: formAjuste.value.stockNuevo,
      motivo: formAjuste.value.motivo
    });
    alert("✅ Stock ajustado correctamente.");
    modalAjuste.value = false;
    cargarDatos(); // Recargamos para ver los cambios
  } catch (error) {
    alert("Error al ajustar el stock.");
  } finally {
    ajustando.value = false;
  }
};

onMounted(cargarDatos);
</script>

<template>
  <div class="space-y-6">
    
    <div class="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Productos Terminados</h2>
        <p class="text-gray-500 mt-1">Controla tu stock real por bodega, talla y color.</p>
      </div>
      <div class="flex gap-3">
        <button @click="vistaActiva = 'bodegas'" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2 text-sm border border-gray-200">
          <span>🏢</span> Gestionar Bodegas
        </button>
        <button @click="abrirIngreso('')" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-all flex items-center gap-2 text-sm">
          <span>📦</span> Ingreso Libre
        </button>
      </div>
    </div>

    <div class="flex gap-6 border-b border-gray-200 px-2">
      <button @click="vistaActiva = 'kardex'" class="pb-3 text-sm font-bold tracking-wide transition-colors border-b-2" :class="vistaActiva === 'kardex' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'">
        📑 KARDEX GENERAL
      </button>
      <button @click="vistaActiva = 'bodegas'" class="pb-3 text-sm font-bold tracking-wide transition-colors border-b-2" :class="vistaActiva === 'bodegas' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'">
        🏢 GESTIÓN DE BODEGAS
      </button>
    </div>

    <div v-if="cargando" class="flex justify-center items-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>

    <TableroKardex 
      v-if="!cargando && vistaActiva === 'kardex'"
      :inventario="inventario"
      :bodegas="bodegas"
      :colores="colores"
      @abrir-etiquetas="abrirEtiquetas"
      @abrir-ajuste="abrirAjuste"
      @abrir-historial="abrirHistorial"
    />
    
    <GestionBodegas 
      v-if="!cargando && vistaActiva === 'bodegas'" 
      :bodegas="bodegas" 
      @recargar-datos="cargarDatos" 
      @abrir-ingreso="abrirIngreso" 
    />

    <ModalIngresoLibre 
      v-if="modalIngreso" 
      :bodegas="bodegas"
      :productos="productos"
      :colores="colores"
      :bodegaPredefinida="bodegaPredefinida"
      @cerrar="modalIngreso = false"
      @recargar-datos="cargarDatos"
    />

    <ModalEtiquetas 
      v-if="modalEtiquetas" 
      :item="itemEtiqueta"
      :colores="colores"
      @cerrar="modalEtiquetas = false"
    />

    <ModalHistorialKardex 
      v-if="modalHistorial"
      :item="itemHistorial"
      :colores="colores"
      @cerrar="modalHistorial = false"
    />

    <div v-if="modalAjuste" class="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
        <div class="bg-yellow-500 p-6 text-white text-center relative">
          <div class="absolute inset-0 bg-yellow-600 opacity-20 pattern-diagonal-lines"></div>
          <h3 class="text-xl font-black relative z-10 flex items-center justify-center gap-2">⚙️ Ajuste de Inventario</h3>
          <p class="text-xs font-medium text-yellow-100 mt-1 relative z-10">{{ formAjuste.productoNombre }}</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="text-center bg-gray-50 p-3 rounded-xl border border-gray-100">
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Variante a modificar</p>
            <p class="font-bold text-gray-800 text-sm mt-1">{{ formAjuste.varianteDetalle }}</p>
          </div>
          
          <div class="grid grid-cols-2 gap-4 items-center">
            <div class="text-center">
              <p class="text-[10px] text-gray-400 font-bold uppercase">Stock Actual</p>
              <p class="text-3xl font-black text-gray-300">{{ formAjuste.stockActual }}</p>
            </div>
            <div class="text-center">
              <p class="text-[10px] text-yellow-600 font-bold uppercase">Stock Real</p>
              <input type="number" v-model.number="formAjuste.stockNuevo" min="0" class="w-full border-b-4 border-yellow-400 bg-yellow-50 text-3xl font-black text-center text-gray-800 py-2 outline-none focus:bg-yellow-100 rounded-t-lg transition-colors">
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 mt-2">Motivo del Ajuste (Obligatorio)</label>
            <textarea v-model="formAjuste.motivo" placeholder="Ej: Error de digitación anterior..." rows="2" class="w-full border border-gray-200 rounded-xl p-3 text-sm font-medium text-gray-700 outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 resize-none"></textarea>
          </div>
        </div>
        
        <div class="bg-gray-50 p-6 flex gap-3 border-t border-gray-100">
          <button @click="modalAjuste = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-200 rounded-xl font-bold transition">Cancelar</button>
          <button @click="guardarAjuste" :disabled="ajustando" class="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-black shadow-lg shadow-yellow-500/30 hover:bg-yellow-600 transition flex items-center justify-center gap-2">
            {{ ajustando ? 'Guardando...' : 'Confirmar Ajuste' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>