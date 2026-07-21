<template>
  <div class="min-h-screen bg-[#F8FAFC] p-6 lg:p-8 font-sans">
    
    <header class="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-black text-gray-900 tracking-tight">Dashboard Moditex</h1>
        <p class="text-sm text-gray-500 mt-1 font-medium">Control en tiempo real de ventas y almacén</p>
      </div>
      
      <button 
        @click="obtenerReportes" 
        :disabled="cargando"
        class="inline-flex items-center justify-center px-4 py-2 bg-black text-white text-sm font-bold rounded-lg shadow-md hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg v-if="cargando" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {{ cargando ? 'Actualizando...' : 'Actualizar Datos' }}
      </button>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <div class="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 flex items-center justify-between relative overflow-hidden group">
        <div class="absolute w-2 h-full bg-emerald-500 left-0 top-0"></div>
        <div class="pl-4">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ingresos de Hoy</p>
          <h2 class="text-3xl font-black text-gray-900">S/ {{ resumen.ventasHoy }}</h2>
        </div>
        <div class="p-3 bg-emerald-50 rounded-xl">
          <svg class="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 flex items-center justify-between relative overflow-hidden">
        <div class="absolute w-2 h-full bg-indigo-500 left-0 top-0"></div>
        <div class="pl-4">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Prendas Vendidas</p>
          <h2 class="text-3xl font-black text-gray-900">{{ resumen.prendasVendidas }} <span class="text-lg text-gray-500 font-bold">unds</span></h2>
        </div>
        <div class="p-3 bg-indigo-50 rounded-xl">
          <svg class="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100 flex items-center justify-between relative overflow-hidden">
        <div class="absolute w-2 h-full bg-rose-500 left-0 top-0"></div>
        <div class="pl-4">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Stock Crítico</p>
          <h2 class="text-3xl font-black text-rose-600">{{ resumen.stockBajo }} <span class="text-lg text-rose-400 font-bold">SKUs</span></h2>
        </div>
        <div class="p-3 bg-rose-50 rounded-xl">
          <svg class="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden">
      <div class="px-6 py-5 border-b border-gray-100">
        <h3 class="text-lg font-bold text-gray-900">Últimas Transacciones</h3>
      </div>
      
      <!-- FILTRO DE FECHAS -->
      <div class="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-2 print:hidden">
        <span class="text-[11px] font-black text-gray-400 uppercase tracking-wider mr-1">Ver:</span>
        <button @click="filtrar('')" :class="!fechaFiltro ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'" class="px-4 py-2 rounded-lg border text-xs font-bold transition-all">Últimas</button>
        <button @click="filtrar(HOY)" :class="fechaFiltro === HOY ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'" class="px-4 py-2 rounded-lg border text-xs font-bold transition-all">Hoy</button>
        <button @click="filtrar(AYER)" :class="fechaFiltro === AYER ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'" class="px-4 py-2 rounded-lg border text-xs font-bold transition-all">Ayer</button>
        <div class="flex items-center gap-2 ml-auto">
          <label class="text-[11px] font-black text-gray-400 uppercase tracking-wider">Otra fecha</label>
          <input type="date" :value="fechaFiltro" @change="filtrar($event.target.value)" class="border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-blue-500" />
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Código</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Fecha y Hora</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Método</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Almacén</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Total</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Estado</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-center">Detalle</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="cargando && ventas.length === 0">
              <td colspan="5" class="px-6 py-10 text-center text-gray-400 font-medium">
                Cargando datos del servidor...
              </td>
            </tr>
            
            <tr v-else-if="ventas.length === 0">
              <td colspan="5" class="px-6 py-10 text-center text-gray-400 font-medium">
                No hay ventas registradas aún.
              </td>
            </tr>

            <tr v-for="venta in ventas" :key="venta.id" class="hover:bg-gray-50/80 transition-colors duration-150">
              <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200 font-mono">
                  {{ venta.correlativo }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm font-medium text-gray-600">
                {{ formatearFecha(venta.createdAt) }}
              </td>
              <td class="px-6 py-4">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">{{ venta.metodoPago }}</span>
              </td>
              <td class="px-6 py-4">
  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
    {{ venta.almacen }}
  </span>
</td>
              <td class="px-6 py-4">
                <span class="text-sm font-black text-gray-900">S/ {{ parseFloat(venta.total).toFixed(2) }}</span>
              </td>
              <td class="px-6 py-4">
                <span :class="[
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold',
                  venta.estado === 'Completada' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                ]">
                  <span :class="['w-1.5 h-1.5 rounded-full', venta.estado === 'Completada' ? 'bg-emerald-500' : 'bg-amber-500']"></span>
                  {{ venta.estado }}
                </span>
              </td>
              <td class="px-6 py-4 text-center">
                <button
                  @click="verDetalle(venta)"
                  title="Ver detalle de la venta"
                  class="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL DETALLE DE VENTA -->
    <div v-if="modalDetalle" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 print:bg-white print:p-0">
      <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl print:shadow-none print:max-h-none">

        <div class="p-6 border-b border-gray-100 flex justify-between items-start sticky top-0 bg-white z-10 print:hidden">
          <div>
            <h3 class="text-2xl font-black text-gray-800">Detalle de la venta</h3>
            <p class="text-sm text-gray-500">{{ detalle?.correlativo }}</p>
          </div>
          <div class="flex gap-2">
            <button @click="imprimirTicket" class="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-50">🖨️ Imprimir</button>
            <button @click="modalDetalle = false" class="text-gray-400 hover:text-red-500 text-2xl leading-none px-2">&times;</button>
          </div>
        </div>

        <div v-if="cargandoDetalle" class="py-20 text-center text-gray-400 font-medium">Cargando detalle...</div>

        <div v-else-if="detalle" class="p-6 space-y-6">
          <!-- Datos generales -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Fecha</p><p class="font-bold text-gray-800 text-sm">{{ formatearFecha(detalle.fecha) }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Vendedor</p><p class="font-bold text-gray-800 text-sm">{{ detalle.vendedor || '—' }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Almacén</p><p class="font-bold text-gray-800 text-sm">{{ detalle.almacen }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Cliente</p><p class="font-bold text-gray-800 text-sm">{{ detalle.cliente }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Comprobante</p><p class="font-bold text-gray-800 text-sm">{{ detalle.tipoVenta }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Condición</p><p class="font-bold text-gray-800 text-sm">{{ detalle.condicionPago }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Entrega</p><p class="font-bold text-gray-800 text-sm">{{ detalle.metodoEntrega }}</p></div>
            <div v-if="detalle.destinoEnvio"><p class="text-[10px] font-black text-gray-400 uppercase">Destino</p><p class="font-bold text-gray-800 text-sm">{{ detalle.destinoEnvio }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Estado pago</p><p class="font-bold text-gray-800 text-sm">{{ detalle.estadoPago }}</p></div>
          </div>

          <!-- Prendas vendidas -->
          <div>
            <h4 class="font-black text-gray-700 mb-2 text-sm uppercase tracking-wider">Prendas vendidas ({{ detalle.prendas }})</h4>
            <div class="border border-gray-100 rounded-xl overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold">
                  <tr>
                    <th class="p-3 text-left">Prenda</th>
                    <th class="p-3 text-left">Color / Talla</th>
                    <th class="p-3 text-center">Cant.</th>
                    <th class="p-3 text-right">P. Unit.</th>
                    <th class="p-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  <tr v-for="d in detalle.detalles" :key="d.id">
                    <td class="p-3 font-bold text-gray-800">{{ d.producto }}<span class="block text-[10px] font-mono text-gray-400">{{ d.sku }}</span></td>
                    <td class="p-3 text-gray-600">{{ d.color }} · {{ d.talla }}</td>
                    <td class="p-3 text-center font-bold">{{ d.cantidad }}</td>
                    <td class="p-3 text-right">S/ {{ d.precioUnitario.toFixed(2) }}</td>
                    <td class="p-3 text-right font-bold">S/ {{ d.subtotal.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Totales -->
          <div class="bg-gray-900 text-white rounded-2xl p-5 grid grid-cols-3 gap-4 text-center">
            <div><p class="text-[10px] text-gray-400 font-black uppercase">Total</p><p class="text-xl font-black">S/ {{ detalle.totalVenta.toFixed(2) }}</p></div>
            <div><p class="text-[10px] text-gray-400 font-black uppercase">Pagado</p><p class="text-xl font-black text-green-400">S/ {{ detalle.totalPagado.toFixed(2) }}</p></div>
            <div><p class="text-[10px] text-gray-400 font-black uppercase">Saldo</p><p class="text-xl font-black" :class="detalle.saldo > 0 ? 'text-red-400' : 'text-gray-500'">S/ {{ detalle.saldo.toFixed(2) }}</p></div>
          </div>

          <!-- CRÉDITO DEL CLIENTE (solo si la venta fue al crédito) -->
          <div v-if="detalle.credito" class="border-2 border-orange-200 bg-orange-50/50 rounded-2xl p-5">
            <h4 class="font-black text-orange-700 mb-3 text-sm uppercase tracking-wider">💳 Crédito otorgado</h4>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p class="text-[10px] font-black text-orange-400 uppercase">Cliente</p>
                <p class="font-black text-gray-800 text-sm">{{ detalle.credito.nombre }}</p>
                <p v-if="detalle.credito.documento" class="text-[11px] text-gray-500">Doc: {{ detalle.credito.documento }}</p>
                <p v-if="detalle.credito.telefono" class="text-[11px] text-gray-500">{{ detalle.credito.telefono }}</p>
              </div>
              <div>
                <p class="text-[10px] font-black text-orange-400 uppercase">Se le fió aquí</p>
                <p class="text-xl font-black text-orange-700">S/ {{ detalle.credito.aportoAEstaDeuda.toFixed(2) }}</p>
              </div>
              <div>
                <p class="text-[10px] font-black text-orange-400 uppercase">Deuda total hoy</p>
                <p class="text-xl font-black text-red-600">S/ {{ detalle.credito.deudaTotalActual.toFixed(2) }}</p>
              </div>
              <div>
                <p class="text-[10px] font-black text-orange-400 uppercase">Ventas a crédito</p>
                <p class="text-xl font-black text-gray-800">{{ detalle.credito.historial.length }}</p>
              </div>
            </div>

            <!-- Historial: cómo fue creciendo su crédito -->
            <p class="text-[10px] font-black text-orange-400 uppercase mb-2">Historial de créditos de este cliente</p>
            <div class="bg-white border border-orange-100 rounded-xl overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-orange-50 text-orange-600 text-[10px] uppercase font-bold">
                  <tr>
                    <th class="p-2.5 text-left">Venta</th>
                    <th class="p-2.5 text-left">Fecha</th>
                    <th class="p-2.5 text-right">Total</th>
                    <th class="p-2.5 text-right">Pagado</th>
                    <th class="p-2.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-orange-50">
                  <tr v-for="h in detalle.credito.historial" :key="h.id" :class="h.esEsta ? 'bg-orange-50/70 font-bold' : ''">
                    <td class="p-2.5 font-mono text-xs text-gray-700">
                      {{ h.correlativo }}
                      <span v-if="h.esEsta" class="ml-1 text-[9px] bg-orange-600 text-white px-1.5 py-0.5 rounded">ESTA</span>
                    </td>
                    <td class="p-2.5 text-gray-500 text-xs">{{ formatearFecha(h.fecha) }}</td>
                    <td class="p-2.5 text-right">S/ {{ h.total.toFixed(2) }}</td>
                    <td class="p-2.5 text-right text-emerald-600">S/ {{ h.pagado.toFixed(2) }}</td>
                    <td class="p-2.5 text-right font-black" :class="h.saldo > 0 ? 'text-red-600' : 'text-gray-400'">S/ {{ h.saldo.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Abonos -->
          <div v-if="detalle.abonos?.length">
            <h4 class="font-black text-gray-700 mb-2 text-sm uppercase tracking-wider">Pagos registrados</h4>
            <div v-for="a in detalle.abonos" :key="a.id" class="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 mb-2">
              <div>
                <span class="font-bold text-gray-700 text-sm">S/ {{ a.monto.toFixed(2) }}</span>
                <span class="text-xs text-gray-400 ml-2">{{ a.metodoPago }}</span>
              </div>
              <span class="text-xs text-gray-400">{{ formatearFecha(a.fecha) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../api/axios';

const ventas = ref([]);
const cargando = ref(false); // 🔥 Nuevo estado para mejorar UX
const resumen = ref({
  ventasHoy: '0.00',
  prendasVendidas: 0,
  stockBajo: 0
});

// --- Filtro de fechas ---
const aISO = (d) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
const HOY = aISO(new Date());
const AYER = aISO(new Date(Date.now() - 86400000));
const fechaFiltro = ref(''); // '' = últimas ventas

const filtrar = (f) => { fechaFiltro.value = f; obtenerReportes(); };

const obtenerReportes = async () => {
  cargando.value = true;
  try {
    const params = fechaFiltro.value ? { fecha: fechaFiltro.value } : {};
    const { data } = await api.get('/ventas/reporte-general', { params });
    ventas.value = data.ultimasVentas || [];
    resumen.value = data.kpis || resumen.value;
  } catch (error) {
    console.error("Error cargando el dashboard:", error);
    // Podrías agregar aquí una alerta de error visible
  } finally {
    cargando.value = false;
  }
};

// --- Detalle de una venta (modal) ---
const modalDetalle = ref(false);
const detalle = ref(null);
const cargandoDetalle = ref(false);

const verDetalle = async (venta) => {
  modalDetalle.value = true;
  cargandoDetalle.value = true;
  detalle.value = null;
  try {
    const { data } = await api.get(`/ventas/detalle/${venta.id}`);
    detalle.value = data;
  } catch (e) {
    alert('❌ No se pudo cargar el detalle de la venta.');
    modalDetalle.value = false;
  } finally {
    cargandoDetalle.value = false;
  }
};

const imprimirTicket = () => window.print();

const formatearFecha = (fecha) => {
  if (!fecha) return '-';
  return new Date(fecha).toLocaleString('es-PE', { 
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
  });
};

onMounted(obtenerReportes);
</script>