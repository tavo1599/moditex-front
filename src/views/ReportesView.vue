<template>
  <div class="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans space-y-6">

    <!-- Encabezado -->
    <header class="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-800 text-white rounded-3xl p-6 lg:p-8 shadow-lg">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 class="text-3xl lg:text-4xl font-black tracking-tight flex items-center gap-2">📈 Reportes</h1>
          <p class="text-indigo-100 mt-1 text-sm font-medium">Ventas y stock en tiempo real.</p>
        </div>
        <button
          @click="obtenerReportes"
          :disabled="cargando"
          class="bg-white/15 hover:bg-white/25 border-2 border-white/30 text-white font-black px-5 py-3 rounded-2xl shadow transition-transform active:scale-95 disabled:opacity-50 w-full lg:w-auto"
        >
          <span :class="{ 'animate-spin inline-block': cargando }">🔄</span>
          {{ cargando ? 'Actualizando...' : 'Actualizar' }}
        </button>
      </div>

      <!-- KPIs dentro del encabezado -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div class="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/10">
          <p class="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Ingresos de hoy</p>
          <h2 class="text-3xl font-black">S/ {{ resumen.ventasHoy }}</h2>
        </div>
        <div class="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/10">
          <p class="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Prendas vendidas</p>
          <h2 class="text-3xl font-black">{{ resumen.prendasVendidas }} <span class="text-lg text-indigo-200">unds</span></h2>
        </div>
        <div class="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/10">
          <p class="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Stock crítico</p>
          <h2 class="text-3xl font-black text-rose-200">{{ resumen.stockBajo }} <span class="text-lg text-rose-300">SKUs</span></h2>
        </div>
      </div>
    </header>

    <!-- REPORTE DE STOCK POR PRENDA (talla x color) -->
    <ReportePorPrenda />

    <!-- ÚLTIMAS TRANSACCIONES -->
    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div class="px-5 lg:px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-lg font-black text-slate-800">🧾 Últimas transacciones</h3>
        <span class="text-xs font-bold text-slate-400">{{ ventas.length }} ventas</span>
      </div>

      <!-- Filtros -->
      <div class="px-5 lg:px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2 print:hidden">
        <div class="flex items-center gap-2">
          <button @click="filtrar('')" :class="!fechaFiltro ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'" class="px-4 h-11 rounded-xl border-2 text-xs font-black transition-all">Últimas</button>
          <button @click="filtrar(HOY)" :class="fechaFiltro === HOY ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'" class="px-4 h-11 rounded-xl border-2 text-xs font-black transition-all">Hoy</button>
          <button @click="filtrar(AYER)" :class="fechaFiltro === AYER ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'" class="px-4 h-11 rounded-xl border-2 text-xs font-black transition-all">Ayer</button>
        </div>
        <select
          v-if="bodegas.length > 1"
          v-model="bodegaFiltro"
          @change="filtrarBodega"
          class="h-11 border-2 border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 bg-white"
        >
          <option :value="''">🏬 Todos los almacenes</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
        <div class="flex items-center gap-2 ml-auto">
          <label class="text-[11px] font-black text-slate-400 uppercase tracking-wider hidden sm:block">Otra fecha</label>
          <input type="date" :value="fechaFiltro" @change="filtrar($event.target.value)" class="h-11 border-2 border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500" />
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left min-w-[640px]">
          <thead class="bg-slate-800 text-white uppercase text-[10px] tracking-wider">
            <tr>
              <th class="px-6 py-4">Código</th>
              <th class="px-6 py-4">Fecha y hora</th>
              <th class="px-6 py-4">Método</th>
              <th class="px-6 py-4">Almacén</th>
              <th class="px-6 py-4 text-right">Total</th>
              <th class="px-6 py-4 text-center">Estado</th>
              <th class="px-6 py-4 text-center">Detalle</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="cargando && ventas.length === 0">
              <td colspan="7" class="px-6 py-10 text-center text-slate-400 font-bold">Cargando datos...</td>
            </tr>
            <tr v-else-if="ventas.length === 0">
              <td colspan="7" class="px-6 py-10 text-center text-slate-400 font-bold">No hay ventas en este filtro.</td>
            </tr>
            <tr v-for="venta in ventas" :key="venta.id" class="hover:bg-indigo-50/40 transition-colors">
              <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black bg-slate-100 text-slate-800 font-mono">{{ venta.correlativo }}</span>
              </td>
              <td class="px-6 py-4 text-sm font-bold text-slate-600 whitespace-nowrap">{{ formatearFecha(venta.createdAt) }}</td>
              <td class="px-6 py-4"><span class="text-xs font-black text-slate-500 uppercase tracking-wider">{{ venta.metodoPago }}</span></td>
              <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700">🏬 {{ venta.almacen }}</span>
              </td>
              <td class="px-6 py-4 text-right"><span class="text-sm font-black text-slate-900 whitespace-nowrap">S/ {{ parseFloat(venta.total).toFixed(2) }}</span></td>
              <td class="px-6 py-4 text-center">
                <span :class="['inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap', venta.estado === 'Completada' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700']">
                  <span :class="['w-1.5 h-1.5 rounded-full', venta.estado === 'Completada' ? 'bg-emerald-500' : 'bg-amber-500']"></span>
                  {{ venta.estado }}
                </span>
              </td>
              <td class="px-6 py-4 text-center">
                <button @click="verDetalle(venta)" title="Ver detalle" class="bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 font-bold text-xs px-3 py-2 rounded-lg transition-colors">👁 Ver</button>
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
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Lista de precios</p><p class="font-bold text-gray-800 text-sm">{{ detalle.tipoVenta }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Condición</p><p class="font-bold text-gray-800 text-sm">{{ detalle.condicionPago }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Entrega</p><p class="font-bold text-gray-800 text-sm">{{ detalle.metodoEntrega }}</p></div>
            <div v-if="detalle.destinoEnvio"><p class="text-[10px] font-black text-gray-400 uppercase">Destino</p><p class="font-bold text-gray-800 text-sm">{{ detalle.destinoEnvio }}</p></div>
            <div><p class="text-[10px] font-black text-gray-400 uppercase">Estado pago</p><p class="font-bold text-gray-800 text-sm">{{ detalle.estadoPago }}</p></div>
          </div>

          <!-- Prendas vendidas -->
          <div>
            <h4 class="font-black text-gray-700 mb-2 text-sm uppercase tracking-wider">Prendas vendidas ({{ detalle.prendas }})</h4>
            <div class="border border-gray-100 rounded-xl overflow-x-auto">
              <table class="w-full text-sm min-w-[360px]">
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
            <div class="bg-white border border-orange-100 rounded-xl overflow-x-auto">
              <table class="w-full text-sm min-w-[360px]">
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
import ReportePorPrenda from '../components/reportes/ReportePorPrenda.vue';

const ventas = ref([]);
const cargando = ref(false);
const resumen = ref({
  ventasHoy: '0.00',
  prendasVendidas: 0,
  stockBajo: 0
});

// Multi-almacén: el admin puede filtrar el reporte por almacén. '' = todos.
const bodegas = ref([]);
const bodegaFiltro = ref('');
const cargarBodegas = async () => {
  try {
    const { data } = await api.get('/almacen-terminados/bodegas');
    bodegas.value = data || [];
  } catch (e) { /* sin bodegas, sin filtro */ }
};
const filtrarBodega = () => obtenerReportes();

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
    const params = {};
    if (fechaFiltro.value) params.fecha = fechaFiltro.value;
    if (bodegaFiltro.value) params.bodegaId = bodegaFiltro.value;
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

onMounted(() => { cargarBodegas(); obtenerReportes(); });
</script>