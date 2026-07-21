<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios';

const hoy = new Date().toISOString().slice(0, 10);
const fecha = ref(hoy);
const bodegas = ref<any[]>([]);
const bodegaSel = ref<number | ''>('');
const data = ref<any>(null);
const cargando = ref(false);

const cargarBodegas = async () => {
  try {
    const res = await api.get('/almacen-terminados/bodegas');
    bodegas.value = res.data.filter((b: any) => b.estado);
  } catch (e) { console.error(e); }
};

const cargar = async () => {
  cargando.value = true;
  try {
    const params: any = { fecha: fecha.value };
    if (bodegaSel.value) params.bodegaId = bodegaSel.value;
    const res = await api.get('/ventas/cierre-caja', { params });
    data.value = res.data;
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al cargar el cierre de caja.'));
  } finally {
    cargando.value = false;
  }
};

const hora = (f: string) => new Date(f).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

const imprimir = () => window.print();

onMounted(async () => { await cargarBodegas(); await cargar(); });
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:hidden">
      <h2 class="text-3xl font-bold text-gray-800">🧾 Cierre de Caja</h2>
      <p class="text-gray-500 mt-1">Resumen de todo lo vendido y cobrado en el día, para cuadrar al cerrar.</p>
    </div>

    <!-- Filtros -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-end print:hidden">
      <div>
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fecha</label>
        <input v-model="fecha" type="date" class="border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
      </div>
      <div class="min-w-[200px]">
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Almacén (opcional)</label>
        <select v-model="bodegaSel" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
          <option value="">Todos</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
      </div>
      <button @click="cargar" :disabled="cargando" class="bg-gray-900 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-black disabled:opacity-40">
        {{ cargando ? 'Cargando...' : 'Ver cierre' }}
      </button>
      <button @click="imprimir" class="border border-gray-300 text-gray-600 px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-50">🖨️ Imprimir</button>
    </div>

    <template v-if="data">
      <!-- Tarjetas resumen -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p class="text-[10px] font-black text-gray-400 uppercase">Ventas del día</p>
          <p class="text-3xl font-black text-gray-800 mt-1">{{ data.resumen.numeroVentas }}</p>
          <p class="text-[11px] text-gray-400 font-bold">{{ data.resumen.prendasVendidas }} prenda(s)</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p class="text-[10px] font-black text-gray-400 uppercase">Total vendido</p>
          <p class="text-3xl font-black text-gray-800 mt-1">S/ {{ data.resumen.totalVendido }}</p>
        </div>
        <div class="bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm p-5">
          <p class="text-[10px] font-black text-emerald-600 uppercase">Entró a caja</p>
          <p class="text-3xl font-black text-emerald-700 mt-1">S/ {{ data.resumen.totalEnCaja }}</p>
          <p class="text-[11px] text-emerald-600 font-bold">Ventas + cobranzas</p>
        </div>
        <div class="bg-orange-50 rounded-xl border border-orange-200 shadow-sm p-5">
          <p class="text-[10px] font-black text-orange-600 uppercase">Quedó a crédito</p>
          <p class="text-3xl font-black text-orange-700 mt-1">S/ {{ data.resumen.totalCredito }}</p>
        </div>
      </div>

      <!-- Desgloses -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 class="font-bold text-gray-700 mb-3">Ventas por condición de pago</h3>
          <div v-if="!Object.keys(data.porCondicion).length" class="text-sm text-gray-400">Sin ventas.</div>
          <div v-for="(v, k) in data.porCondicion" :key="k" class="flex justify-between items-center py-2 border-b border-gray-50 last:border-none">
            <span class="text-sm font-bold text-gray-700">{{ k }}</span>
            <span class="text-sm text-gray-500">{{ v.cantidad }} venta(s) · <b class="text-gray-800">S/ {{ v.monto.toFixed(2) }}</b></span>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 class="font-bold text-gray-700 mb-3">Cobranzas del día (por método)</h3>
          <div v-if="!Object.keys(data.porMetodoAbono).length" class="text-sm text-gray-400">Sin cobranzas hoy.</div>
          <div v-for="(v, k) in data.porMetodoAbono" :key="k" class="flex justify-between items-center py-2 border-b border-gray-50 last:border-none">
            <span class="text-sm font-bold text-gray-700">{{ k }}</span>
            <span class="text-sm text-gray-500">{{ v.cantidad }} pago(s) · <b class="text-emerald-600">S/ {{ v.monto.toFixed(2) }}</b></span>
          </div>
          <p class="text-xs text-gray-400 mt-2">Total cobranzas: <b>S/ {{ data.resumen.totalAbonosCobranzas }}</b></p>
        </div>
      </div>

      <!-- Detalle de ventas -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="p-4 border-b border-gray-100">
          <h3 class="font-bold text-gray-700">Ventas del {{ data.fecha }}</h3>
        </div>
        <div v-if="!data.ventas.length" class="py-12 text-center text-gray-400 text-sm">No hubo ventas ese día.</div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th class="p-3 text-left">Hora</th>
                <th class="p-3 text-left">Código</th>
                <th class="p-3 text-left">Cliente</th>
                <th class="p-3 text-left">Almacén</th>
                <th class="p-3 text-left">Condición</th>
                <th class="p-3 text-right">Total</th>
                <th class="p-3 text-right">Pagado</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="v in data.ventas" :key="v.id" class="hover:bg-gray-50">
                <td class="p-3 text-gray-500">{{ hora(v.hora) }}</td>
                <td class="p-3 font-mono font-bold text-gray-800">{{ v.correlativo }}</td>
                <td class="p-3 text-gray-600">{{ v.cliente }}</td>
                <td class="p-3 text-gray-500">{{ v.bodega }}</td>
                <td class="p-3">
                  <span class="text-[10px] font-bold px-2 py-1 rounded" :class="v.condicionPago === 'CONTADO' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'">
                    {{ v.condicionPago }}
                  </span>
                </td>
                <td class="p-3 text-right font-bold">S/ {{ v.totalVenta }}</td>
                <td class="p-3 text-right text-emerald-600 font-bold">S/ {{ v.totalPagado }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
