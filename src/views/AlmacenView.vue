<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import api from '../api/axios';

const insumos = ref<any[]>([]);
const cargando = ref(true);

// ==========================================
// ESTADOS: BUSCADOR Y PAGINACIÓN
// ==========================================
const busqueda = ref('');
const paginaActual = ref(1);
const itemsPorPagina = 10;

// Filtrar por búsqueda
const insumosFiltrados = computed(() => {
  if (!busqueda.value) return insumos.value;
  const q = busqueda.value.toLowerCase();
  return insumos.value.filter(i => 
    i.nombre.toLowerCase().includes(q) || 
    i.codigo.toLowerCase().includes(q)
  );
});

// Calcular total de páginas
const totalPaginas = computed(() => {
  return Math.ceil(insumosFiltrados.value.length / itemsPorPagina) || 1;
});

// Obtener solo los ítems de la página actual
const insumosPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina;
  const fin = inicio + itemsPorPagina;
  return insumosFiltrados.value.slice(inicio, fin);
});

// Si el usuario busca algo, lo regresamos a la página 1
watch(busqueda, () => {
  paginaActual.value = 1;
});

// ==========================================
// ESTADOS: MODAL CREAR/EDITAR
// ==========================================
const mostrarModal = ref(false);
const modoEdicion = ref(false);
const idEdicion = ref<number | null>(null);

const form = ref({
  codigo: '',
  nombre: '',
  tipo: 'Tela',
  unidadMedida: 'Kilos',
  stockActual: 0,
  costoTotalFactura: 0, 
  costoUnitario: 0 
});

// Vigilante para la "Calculadora Mágica" de Creación
watch([() => form.value.stockActual, () => form.value.costoTotalFactura], ([stock, total]) => {
  if (stock > 0 && total > 0) {
    form.value.costoUnitario = Number((total / stock).toFixed(4));
  } else {
    form.value.costoUnitario = 0;
  }
});

// ==========================================
// FUNCIONES CRUD
// ==========================================
const cargarInsumos = async () => {
  cargando.value = true;
  try {
    const res = await api.get('/insumos');
    insumos.value = res.data;
  } catch (error) {
    console.error("Error al cargar insumos:", error);
  } finally {
    cargando.value = false;
  }
};

const abrirModalNuevo = () => {
  modoEdicion.value = false;
  idEdicion.value = null;
  form.value = { codigo: '', nombre: '', tipo: 'Tela', unidadMedida: 'Kilos', stockActual: 0, costoTotalFactura: 0, costoUnitario: 0 };
  mostrarModal.value = true;
};

const abrirModalEditar = (insumo: any) => {
  modoEdicion.value = true;
  idEdicion.value = insumo.id;
  const totalFacturaCalculado = Number(insumo.stockActual) * Number(insumo.costoUnitario);
  form.value = {
    codigo: insumo.codigo,
    nombre: insumo.nombre,
    tipo: insumo.tipo,
    unidadMedida: insumo.unidadMedida,
    stockActual: Number(insumo.stockActual),
    costoTotalFactura: totalFacturaCalculado,
    costoUnitario: Number(insumo.costoUnitario)
  };
  mostrarModal.value = true;
};

const guardarInsumo = async () => {
  if (!form.value.codigo || !form.value.nombre) return alert("Código y Nombre son obligatorios");
  try {
    if (modoEdicion.value && idEdicion.value) {
      await api.put(`/insumos/${idEdicion.value}`, form.value);
    } else {
      await api.post('/insumos', form.value);
    }
    mostrarModal.value = false;
    cargarInsumos();
  } catch (error: any) {
    const msj = error.response?.data?.message || "Error al guardar el insumo.";
    alert("❌ Error: " + msj);
  }
};

// ==========================================
// HISTORIAL / KARDEX DE INSUMO
// ==========================================
const mostrarModalHistorial = ref(false);
const cargandoHistorial = ref(false);
const insumoHistorial = ref<any>(null);
const movimientos = ref<any[]>([]);

const abrirHistorial = async (insumo: any) => {
  insumoHistorial.value = insumo;
  movimientos.value = [];
  mostrarModalHistorial.value = true;
  cargandoHistorial.value = true;
  try {
    const res = await api.get(`/insumos/${insumo.id}/historial`);
    // Mostramos lo más reciente primero
    movimientos.value = [...res.data].reverse();
  } catch (error) {
    console.error("Error al cargar el historial del insumo:", error);
  } finally {
    cargandoHistorial.value = false;
  }
};

const eliminarInsumo = async (id: number, nombre: string) => {
  if (!confirm(`⚠️ ¿Estás seguro de eliminar el insumo "${nombre}"?\nSi ya se usó, el sistema bloqueará el borrado.`)) return;
  try {
    await api.delete(`/insumos/${id}`);
    cargarInsumos();
  } catch (error) { 
    alert("❌ No se puede eliminar. Está asociado a una Ficha Técnica o Producción."); 
  }
};

const esStockCritico = (stock: number, tipo: string) => {
  const cant = Number(stock);
  if (tipo === 'Tela' && cant <= 10) return true; 
  if (tipo !== 'Tela' && cant <= 50) return true; 
  return false;
};

onMounted(() => cargarInsumos());
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Almacén de Insumos</h2>
        <p class="text-gray-500 mt-1">Gestiona telas, avíos, etiquetas y su costo promedio.</p>
      </div>
      <div class="flex flex-col md:flex-row gap-3 w-full md:w-auto">
        <div class="relative w-full md:w-64">
          <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
          <input 
            type="text" 
            v-model="busqueda" 
            placeholder="Buscar por código o nombre..." 
            class="w-full border border-gray-300 rounded-xl py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
        </div>
        <button @click="abrirModalNuevo" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all whitespace-nowrap">
          + Registrar Nuevo Material
        </button>
      </div>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500 font-medium">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
      <p>Cargando inventario...</p>
    </div>

    <div v-else class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-gray-800 text-white font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th class="p-4">Código</th>
              <th class="p-4">Descripción</th>
              <th class="p-4 text-center">Stock Actual</th>
              <th class="p-4 text-right">Costo Unit. Promedio</th>
              <th class="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="insumosPaginados.length === 0">
              <td colspan="5" class="p-8 text-center text-gray-400 font-bold">No se encontraron insumos.</td>
            </tr>
            <tr v-for="insumo in insumosPaginados" :key="insumo.id" class="hover:bg-blue-50/50 transition-colors even:bg-slate-50">
              <td class="p-4 font-mono font-bold text-gray-700">{{ insumo.codigo }}</td>
              <td class="p-4 font-medium text-gray-800">
                {{ insumo.nombre }} <span class="ml-2 px-2 py-0.5 rounded bg-white border border-gray-200 shadow-sm text-gray-500 text-[10px]">{{ insumo.tipo }}</span>
              </td>
              
              <td class="p-4 text-center">
                <div class="inline-flex items-center gap-1 font-black" :class="esStockCritico(insumo.stockActual, insumo.tipo) ? 'text-red-500 bg-red-50 px-2 py-1 rounded-md' : 'text-green-600'">
                  {{ Number(insumo.stockActual).toFixed(2) }} <span class="text-[10px] uppercase">{{ insumo.unidadMedida }}</span>
                  <span v-if="esStockCritico(insumo.stockActual, insumo.tipo)" title="Stock Crítico">🚨</span>
                </div>
              </td>

              <td class="p-4 text-right font-black text-gray-700">S/ {{ Number(insumo.costoUnitario).toFixed(4) }}</td>
              
              <td class="p-4 text-center">
                <div class="flex justify-center gap-2">
                  <button @click="abrirHistorial(insumo)" class="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-bold text-xs transition shadow-sm border border-slate-200">
                    📋 Historial
                  </button>
                  <button @click="abrirModalEditar(insumo)" class="text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1.5 rounded-lg font-bold text-xs transition">✏️ Editar</button>
                  <button @click="eliminarInsumo(insumo.id, insumo.nombre)" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg font-bold text-xs transition">🗑️</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPaginas > 1" class="bg-gray-50 p-4 border-t border-gray-100 flex justify-between items-center">
        <p class="text-xs text-gray-500 font-bold">
          Mostrando {{ (paginaActual - 1) * itemsPorPagina + 1 }} - {{ Math.min(paginaActual * itemsPorPagina, insumosFiltrados.length) }} de {{ insumosFiltrados.length }} insumos
        </p>
        <div class="flex gap-1">
          <button @click="paginaActual--" :disabled="paginaActual === 1" class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100">
            Anterior
          </button>
          <span class="px-3 py-1.5 text-sm font-bold text-gray-700">Pág. {{ paginaActual }} de {{ totalPaginas }}</span>
          <button @click="paginaActual++" :disabled="paginaActual === totalPaginas" class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100">
            Siguiente
          </button>
        </div>
      </div>
    </div>

    <div v-if="mostrarModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-200">
        <div class="bg-gray-900 p-5 flex justify-between items-center text-white">
          <h3 class="text-lg font-bold">{{ modoEdicion ? '✏️ Editar Material' : '➕ Nuevo Material' }}</h3>
          <button @click="mostrarModal = false" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Código Único</label>
              <input type="text" v-model="form.codigo" placeholder="Ej. TELA-DENIM-01" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Categoría</label>
              <select v-model="form.tipo" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm">
                <option value="Tela">Tela</option>
                <option value="Avio">Avío (Botones, Cierres)</option>
                <option value="Empaque">Empaque (Bolsas, Cajas)</option>
                <option value="Etiqueta">Etiqueta</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre / Descripción</label>
            <input type="text" v-model="form.nombre" placeholder="Ej. Tela Denim 14oz Rígido" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm">
          </div>

          <div class="grid grid-cols-3 gap-4" v-if="!modoEdicion">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Unidad</label>
              <select v-model="form.unidadMedida" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-700 text-sm bg-white">
                <option value="Kilos">Kilos (kg)</option>
                <option value="Unidad">Unidad (und)</option>
                <option value="Conos">Conos</option>
                <option value="Paquetes">Paquetes</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Stock Inicial</label>
              <input type="number" :step="form.unidadMedida === 'Unidad' || form.unidadMedida === 'Conos' ? '1' : '0.01'" v-model.number="form.stockActual" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-right font-bold text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Costo Total (S/)</label>
              <input type="number" step="0.01" v-model.number="form.costoTotalFactura" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-right font-bold text-blue-700 text-sm">
            </div>
          </div>

          <div v-if="!modoEdicion" class="mt-4 bg-blue-50 p-4 rounded-xl border border-dashed border-blue-200 flex justify-between items-center">
            <div>
              <label class="block text-xs font-bold text-blue-800 uppercase mb-1">Costo Unitario Calculado</label>
              <p class="text-[10px] text-blue-600">Este será el costo base para tus fichas técnicas.</p>
            </div>
            <p class="text-2xl font-black text-gray-800">S/ {{ form.costoUnitario.toFixed(4) }}</p>
          </div>
          
          <div v-else class="mt-4 bg-orange-50 p-4 rounded-xl border border-dashed border-orange-200">
             <p class="text-xs font-bold text-orange-800 text-center">Para ingresar más stock y recalcular costos, usa el botón "🛒 Comprar" en la tabla principal.</p>
          </div>
        </div>

        <div class="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
          <button @click="mostrarModal = false" class="px-5 py-2.5 rounded-lg font-bold text-gray-600 hover:bg-gray-200 transition">Cancelar</button>
          <button @click="guardarInsumo" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition">
            {{ modoEdicion ? 'Actualizar Datos' : 'Guardar Insumo' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="mostrarModalHistorial" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[85vh]">
        <div class="bg-slate-800 p-5 flex justify-between items-center text-white">
          <div>
            <h3 class="text-lg font-bold">📋 Kardex de Insumo</h3>
            <p class="text-xs text-slate-300">{{ insumoHistorial?.nombre }} ({{ insumoHistorial?.codigo }})</p>
          </div>
          <button @click="mostrarModalHistorial = false" class="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div class="overflow-y-auto flex-1">
          <div v-if="cargandoHistorial" class="text-center py-12 text-gray-500 font-medium">
            <div class="animate-spin inline-block w-8 h-8 border-4 border-slate-600 border-t-transparent rounded-full mb-4"></div>
            <p>Cargando movimientos...</p>
          </div>

          <table v-else class="w-full text-left text-sm">
            <thead class="bg-gray-100 text-gray-600 font-bold uppercase text-[10px] tracking-wider sticky top-0">
              <tr>
                <th class="p-3">Fecha</th>
                <th class="p-3">Tipo</th>
                <th class="p-3">Motivo</th>
                <th class="p-3 text-right">Cantidad</th>
                <th class="p-3 text-right">Costo Unit.</th>
                <th class="p-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-if="movimientos.length === 0">
                <td colspan="6" class="p-8 text-center text-gray-400 font-bold">Aún no hay movimientos registrados para este insumo.</td>
              </tr>
              <tr v-for="mov in movimientos" :key="mov.id" class="hover:bg-slate-50">
                <td class="p-3 text-gray-500 text-xs whitespace-nowrap">{{ new Date(mov.fecha).toLocaleString('es-PE') }}</td>
                <td class="p-3">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold"
                    :class="Number(mov.cantidad) >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                    {{ mov.tipoMovimiento }}
                  </span>
                </td>
                <td class="p-3 text-gray-700 text-xs">{{ mov.motivo }}</td>
                <td class="p-3 text-right font-bold" :class="Number(mov.cantidad) >= 0 ? 'text-green-600' : 'text-red-500'">
                  {{ Number(mov.cantidad) >= 0 ? '+' : '' }}{{ Number(mov.cantidad).toFixed(2) }}
                </td>
                <td class="p-3 text-right text-gray-600">S/ {{ Number(mov.costoUnitario).toFixed(4) }}</td>
                <td class="p-3 text-right font-black text-gray-800">{{ Number(mov.saldoResultante).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bg-gray-50 p-4 border-t border-gray-100 flex justify-end">
          <button @click="mostrarModalHistorial = false" class="px-5 py-2.5 font-bold text-gray-600 hover:bg-gray-200 rounded-lg transition">Cerrar</button>
        </div>
      </div>
    </div>

  </div>
</template>