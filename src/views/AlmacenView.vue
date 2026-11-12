<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import api from '../api/axios';

const insumos = ref<any[]>([]);
const cargando = ref(true);

// Catálogos para los desplegables del formulario. El color y el proveedor son
// datos del ingreso físico: dicen QUÉ tela tengo y de QUIÉN vino.
const colores = ref<any[]>([]);
const proveedores = ref<any[]>([]);

// Aviso no bloqueante (en vez de alert, que detiene todo el navegador).
const aviso = ref<{ texto: string; tipo: 'ok' | 'error' } | null>(null);
let temporizadorAviso: any = null;
const avisar = (texto: string, tipo: 'ok' | 'error' = 'ok') => {
  aviso.value = { texto, tipo };
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (aviso.value = null), 6000);
};

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
    `${i.nombre || ''} ${i.codigo || ''} ${i.color || ''} ${i.proveedorNombre || ''}`
      .toLowerCase()
      .includes(q)
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
  codigo: '', // Vacío al crear: el backend lo genera solo (TEL-000001, AVI-000002...)
  nombre: '',
  tipo: 'Tela',
  unidadMedida: 'Kilos',
  color: '',
  proveedorId: '' as any,
  stockActual: 0,
  costoTotalFactura: 0,
  costoUnitario: 0
});

// Prefijo que usará el código automático, solo para mostrárselo al usuario.
const PREFIJOS: Record<string, string> = {
  Tela: 'TEL', Avio: 'AVI', Empaque: 'EMP', Etiqueta: 'ETQ'
};
const prefijoPrevisto = computed(() => PREFIJOS[form.value.tipo] || 'MAT');

// La unidad decide cómo se llama lo que entra: kilos de tela, unidades de avío.
const esPeso = computed(() => form.value.unidadMedida === 'Kilos');
const etiquetaCantidad = computed(() =>
  esPeso.value ? '⚖️ Peso total que llegó (kg)' : '🔢 Cantidad que llegó'
);
const hexDeColor = (nombre: string) =>
  colores.value.find((c) => c.nombre === nombre)?.codigoHex || '#94a3b8';

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
const cargarCatalogos = async () => {
  try {
    const [resC, resP] = await Promise.all([
      api.get('/colores'),
      api.get('/compras/proveedores')
    ]);
    colores.value = resC.data;
    proveedores.value = resP.data;
  } catch (error) {
    console.error('Error al cargar colores / proveedores:', error);
  }
};

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
  form.value = {
    codigo: '', nombre: '', tipo: 'Tela', unidadMedida: 'Kilos',
    color: '', proveedorId: '', stockActual: 0, costoTotalFactura: 0, costoUnitario: 0
  };
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
    color: insumo.color || '',
    proveedorId: insumo.proveedorId ?? '',
    stockActual: Number(insumo.stockActual),
    costoTotalFactura: totalFacturaCalculado,
    costoUnitario: Number(insumo.costoUnitario)
  };
  mostrarModal.value = true;
};

const guardando = ref(false);

const guardarInsumo = async () => {
  // Lo único obligatorio es el nombre: el código se genera solo y el precio
  // es opcional (se puede corregir después con una compra o editando).
  if (!form.value.nombre.trim()) return avisar('Ponle un nombre al material.', 'error');
  guardando.value = true;
  try {
    const datos = {
      ...form.value,
      nombre: form.value.nombre.trim(),
      color: form.value.color || null,
      proveedorId: form.value.proveedorId === '' ? null : Number(form.value.proveedorId)
    };
    if (modoEdicion.value && idEdicion.value) {
      await api.put(`/insumos/${idEdicion.value}`, datos);
      avisar('✅ Material actualizado.');
    } else {
      const res = await api.post('/insumos', datos);
      avisar(`✅ Registrado con el código ${res.data?.codigo || ''}`);
    }
    mostrarModal.value = false;
    cargarInsumos();
  } catch (error: any) {
    const msj = error.response?.data?.message || 'Error al guardar el insumo.';
    avisar('❌ ' + msj, 'error');
  } finally {
    guardando.value = false;
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

onMounted(() => {
  cargarInsumos();
  cargarCatalogos();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Aviso flotante: no bloquea la pantalla como un alert -->
    <transition name="fade">
      <div
        v-if="aviso"
        class="fixed top-6 right-6 z-[200] px-5 py-4 rounded-xl shadow-2xl font-bold text-sm max-w-sm border-l-4"
        :class="aviso.tipo === 'ok'
          ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
          : 'bg-rose-50 border-rose-500 text-rose-800'"
      >
        {{ aviso.texto }}
      </div>
    </transition>

    <div class="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-6 rounded-2xl shadow-lg text-white flex flex-col md:flex-row justify-between items-center gap-4">
      <div>
        <h2 class="text-3xl font-black">🧶 Almacén de Insumos</h2>
        <p class="text-blue-100 mt-1 text-sm font-medium">
          Telas y avíos: de qué color son, quién los trajo y cuánto llegó.
        </p>
      </div>
      <div class="flex flex-col md:flex-row gap-3 w-full md:w-auto">
        <div class="relative w-full md:w-64">
          <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
          <input
            type="text"
            v-model="busqueda"
            placeholder="Buscar por nombre, código, color o proveedor..."
            class="w-full border-0 rounded-xl py-2.5 pl-10 pr-4 outline-none focus:ring-4 focus:ring-white/40 text-sm text-gray-800 shadow-inner"
          >
        </div>
        <button @click="abrirModalNuevo" class="bg-white text-indigo-700 hover:bg-indigo-50 px-6 py-2.5 rounded-xl font-black shadow-lg transition-all whitespace-nowrap">
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
              <th class="p-4">Color</th>
              <th class="p-4">Proveedor</th>
              <th class="p-4 text-center">Stock Actual</th>
              <th class="p-4 text-right">Costo Unit. Promedio</th>
              <th class="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="insumosPaginados.length === 0">
              <td colspan="7" class="p-8 text-center text-gray-400 font-bold">No se encontraron insumos.</td>
            </tr>
            <tr v-for="insumo in insumosPaginados" :key="insumo.id" class="hover:bg-blue-50/50 transition-colors even:bg-slate-50">
              <td class="p-4 font-mono font-bold text-gray-700">{{ insumo.codigo }}</td>
              <td class="p-4 font-medium text-gray-800">
                {{ insumo.nombre }} <span class="ml-2 px-2 py-0.5 rounded bg-white border border-gray-200 shadow-sm text-gray-500 text-[10px]">{{ insumo.tipo }}</span>
              </td>

              <td class="p-4">
                <span v-if="insumo.color" class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                  <span class="w-3 h-3 rounded-full border border-white shadow" :style="{ backgroundColor: hexDeColor(insumo.color) }"></span>
                  {{ insumo.color }}
                </span>
                <span v-else class="text-gray-300 text-xs font-bold">—</span>
              </td>

              <td class="p-4 text-xs font-bold text-gray-600">
                {{ insumo.proveedorNombre || '—' }}
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
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
        <div class="bg-gray-900 p-5 flex justify-between items-center text-white">
          <h3 class="text-lg font-bold">{{ modoEdicion ? '✏️ Editar Material' : '➕ Nuevo Material' }}</h3>
          <button @click="mostrarModal = false" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div class="p-6 space-y-5 max-h-[72vh] overflow-y-auto">

          <!-- ========== 1. QUÉ ES ========== -->
          <div class="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-4">
            <p class="text-[11px] font-black text-blue-800 uppercase tracking-wider">1 · ¿Qué material es?</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Categoría</label>
                <select v-model="form.tipo" class="w-full border-2 border-blue-200 rounded-lg p-3 outline-none focus:border-blue-500 bg-white text-sm font-bold text-blue-800">
                  <option value="Tela">🧵 Tela</option>
                  <option value="Avio">🔘 Avío (Botones, Cierres)</option>
                  <option value="Empaque">📦 Empaque (Bolsas, Cajas)</option>
                  <option value="Etiqueta">🏷️ Etiqueta</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Código Único</label>
                <!-- Ya no se escribe: lo genera el sistema para que nunca se repita -->
                <div v-if="!modoEdicion" class="w-full border-2 border-dashed border-blue-300 bg-white/70 rounded-lg p-3 text-sm">
                  <span class="font-mono font-black text-blue-700">{{ prefijoPrevisto }}-000000</span>
                  <span class="block text-[10px] text-blue-600 font-bold mt-0.5">⚙️ Se genera automático al guardar</span>
                </div>
                <div v-else class="w-full border-2 border-blue-200 bg-gray-100 rounded-lg p-3 font-mono font-black text-gray-600 text-sm">
                  {{ form.codigo }}
                </div>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-600 uppercase mb-1">
                Nombre / Descripción <span class="text-rose-600">*</span>
              </label>
              <input type="text" v-model="form.nombre" placeholder="Ej. Tela Denim 14oz Rígido" class="w-full border-2 border-blue-200 rounded-lg p-3 outline-none focus:border-blue-500 text-sm font-bold">
            </div>
          </div>

          <!-- ========== 2. COLOR Y PROVEEDOR ========== -->
          <div class="bg-violet-50 border border-violet-200 rounded-2xl p-4 space-y-4">
            <p class="text-[11px] font-black text-violet-800 uppercase tracking-wider">2 · ¿De qué color y de quién vino? <span class="text-violet-500 normal-case font-bold">(opcional)</span></p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">🎨 Color de la tela</label>
                <select v-model="form.color" class="w-full border-2 border-violet-200 rounded-lg p-3 outline-none focus:border-violet-500 bg-white text-sm font-bold text-violet-800">
                  <option value="">— Sin color / No aplica —</option>
                  <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }} ({{ c.codigo }})</option>
                </select>
                <div v-if="form.color" class="mt-2 flex items-center gap-2 text-xs font-bold text-violet-700">
                  <span class="w-5 h-5 rounded-full border-2 border-white shadow" :style="{ backgroundColor: hexDeColor(form.color) }"></span>
                  {{ form.color }}
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">🚚 Proveedor</label>
                <select v-model="form.proveedorId" class="w-full border-2 border-violet-200 rounded-lg p-3 outline-none focus:border-violet-500 bg-white text-sm font-bold text-violet-800">
                  <option value="">— Sin proveedor —</option>
                  <option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.razonSocial }}</option>
                </select>
                <p class="text-[10px] text-violet-600 font-bold mt-1">Los proveedores se crean en el módulo de Compras.</p>
              </div>
            </div>
          </div>

          <!-- ========== 3. CUÁNTO LLEGÓ ========== -->
          <div v-if="!modoEdicion" class="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-4">
            <p class="text-[11px] font-black text-amber-800 uppercase tracking-wider">3 · ¿Cuánto llegó?</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Unidad de medida</label>
                <select v-model="form.unidadMedida" class="w-full border-2 border-amber-200 rounded-lg p-3 outline-none focus:border-amber-500 font-bold text-amber-800 text-sm bg-white">
                  <option value="Kilos">Kilos (kg)</option>
                  <option value="Unidad">Unidad (und)</option>
                  <option value="Conos">Conos</option>
                  <option value="Paquetes">Paquetes</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">{{ etiquetaCantidad }}</label>
                <input
                  type="number"
                  :step="esPeso ? '0.01' : '1'"
                  v-model.number="form.stockActual"
                  class="w-full border-2 border-amber-300 rounded-lg p-3 outline-none focus:border-amber-500 text-right font-black text-xl text-amber-900"
                >
              </div>
            </div>

            <!-- Esto es lo que el usuario pidió que quede claro para todos -->
            <div class="bg-white/80 border-l-4 border-amber-500 rounded-lg p-3">
              <p class="text-xs font-black text-amber-900 mb-1">ℹ️ Este peso es solo INFORMATIVO</p>
              <p class="text-[11px] text-amber-800 leading-relaxed">
                Puedes poner todo el peso del rollo que trajeron: sirve para ver
                <b>qué tela tienes y de qué peso</b>. Transformación <b>no descuenta de aquí</b>:
                el consumo real se hace rollo por rollo en <b>🧵 Almacén de Rollos</b>.
              </p>
            </div>
          </div>

          <!-- ========== 4. PRECIO (OPCIONAL) ========== -->
          <div v-if="!modoEdicion" class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-4">
            <p class="text-[11px] font-black text-emerald-800 uppercase tracking-wider">
              4 · Precio <span class="text-emerald-600 normal-case font-bold">(opcional — puedes dejarlo en 0)</span>
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Costo total de la factura (S/)</label>
                <input type="number" step="0.01" v-model.number="form.costoTotalFactura" class="w-full border-2 border-emerald-200 rounded-lg p-3 outline-none focus:border-emerald-500 text-right font-black text-lg text-emerald-800">
              </div>
              <div class="bg-white rounded-xl border border-dashed border-emerald-300 p-3 flex justify-between items-center">
                <div>
                  <p class="text-[10px] font-black text-emerald-800 uppercase">Costo unitario</p>
                  <p class="text-[10px] text-emerald-600 font-bold">Total ÷ cantidad</p>
                </div>
                <p class="text-xl font-black text-gray-800">S/ {{ form.costoUnitario.toFixed(4) }}</p>
              </div>
            </div>

            <p class="text-[11px] text-emerald-800 font-bold">
              Si todavía no sabes cuánto costó, déjalo en 0 y corrígelo después editando el material.
            </p>
          </div>

          <div v-if="modoEdicion" class="bg-orange-50 p-4 rounded-xl border border-dashed border-orange-300">
            <p class="text-xs font-bold text-orange-800 text-center">
              Para ingresar más stock y recalcular costos, usa el módulo de <b>Compras</b>.
            </p>
          </div>
        </div>

        <div class="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
          <button @click="mostrarModal = false" class="px-5 py-2.5 rounded-lg font-bold text-gray-600 hover:bg-gray-200 transition">Cancelar</button>
          <button
            @click="guardarInsumo"
            :disabled="guardando"
            class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-lg font-black shadow-md transition"
          >
            {{ guardando ? 'Guardando...' : (modoEdicion ? 'Actualizar Datos' : '💾 Guardar Material') }}
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