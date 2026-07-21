<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import api from '../api/axios';

const bodegas = ref<any[]>([]);
const bodegaDestino = ref<number | ''>('');
const correlativo = ref('');
const venta = ref<any>(null);
const buscando = ref(false);
const procesando = ref(false);
const motivo = ref('');
const error = ref('');

// Cantidad a devolver por cada línea de la venta: { detalleId: cantidad }
const devolver = ref<Record<number, number>>({});

const cargarBodegas = async () => {
  try {
    const res = await api.get('/almacen-terminados/bodegas');
    bodegas.value = res.data.filter((b: any) => b.estado);
    const principal = bodegas.value.find((b: any) => b.tipo === 'Principal');
    if (principal) bodegaDestino.value = principal.id;
  } catch (e) { console.error(e); }
};

const buscarVenta = async () => {
  const cod = correlativo.value.trim();
  if (!cod) return;
  buscando.value = true;
  error.value = '';
  venta.value = null;
  devolver.value = {};
  try {
    const res = await api.get(`/ventas/buscar/${encodeURIComponent(cod)}`);
    venta.value = res.data;
    for (const d of res.data.detalles || []) devolver.value[d.id] = 0;
  } catch (e: any) {
    error.value = e.response?.data?.message || 'No se encontró esa venta.';
  } finally {
    buscando.value = false;
  }
};

const totalDevolver = computed(() => {
  if (!venta.value) return 0;
  return (venta.value.detalles || []).reduce((s: number, d: any) => {
    const c = Number(devolver.value[d.id]) || 0;
    return s + c * Number(d.precioUnitario);
  }, 0);
});
const hayAlgo = computed(() => totalDevolver.value > 0);

const confirmar = async () => {
  if (!bodegaDestino.value) return alert('Selecciona a qué almacén regresan las prendas.');
  if (!hayAlgo.value) return alert('Indica cuántas unidades devuelve.');

  const items = (venta.value.detalles || [])
    .map((d: any) => ({ detalleId: d.id, cantidad: Number(devolver.value[d.id]) || 0 }))
    .filter((i: any) => i.cantidad > 0);

  if (!confirm(`¿Confirmar la devolución por S/ ${totalDevolver.value.toFixed(2)}?`)) return;

  procesando.value = true;
  try {
    const res = await api.post('/ventas/devolucion', {
      ventaId: venta.value.id,
      bodegaId: Number(bodegaDestino.value),
      motivo: motivo.value || undefined,
      items,
    });
    const r = res.data;
    alert(
      `✅ Devolución registrada\n\n` +
      `Monto devuelto: S/ ${r.montoDevuelto}\n` +
      `Efectivo a devolver al cliente: S/ ${r.efectivoADevolver}\n` +
      `Deuda reducida: S/ ${r.deudaReducida}\n` +
      `Nuevo total de la venta: S/ ${r.nuevoTotalVenta}`
    );
    // Recargamos la venta para ver cómo quedó
    await buscarVenta();
    motivo.value = '';
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al registrar la devolución.'));
  } finally {
    procesando.value = false;
  }
};

onMounted(cargarBodegas);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">🔄 Devoluciones y Cambios</h2>
      <p class="text-gray-500 mt-1">Busca la venta, indica qué prendas regresan y a qué almacén. El stock vuelve, la venta se ajusta y la deuda del cliente se corrige sola.</p>
    </div>

    <!-- Buscador -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
      <div class="flex-1 min-w-[220px]">
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Código de la venta</label>
        <input
          v-model="correlativo"
          @keyup.enter="buscarVenta"
          placeholder="Ej: VEN-000123"
          class="w-full border border-gray-300 rounded-lg p-2.5 text-sm uppercase outline-none focus:border-blue-500 font-mono font-bold"
        />
      </div>
      <div class="min-w-[200px]">
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Almacén donde ingresa</label>
        <select v-model="bodegaDestino" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
          <option value="">Selecciona...</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
      </div>
      <button @click="buscarVenta" :disabled="buscando" class="bg-gray-900 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-black disabled:opacity-40">
        {{ buscando ? 'Buscando...' : 'Buscar venta' }}
      </button>
    </div>

    <p v-if="error" class="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 text-sm font-bold">⚠️ {{ error }}</p>

    <!-- Detalle de la venta -->
    <div v-if="venta" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 class="font-bold text-gray-800">{{ venta.correlativo }}</h3>
          <p class="text-xs text-gray-500">
            {{ venta.clienteNombre || venta.cliente?.nombre || 'Público General' }} ·
            {{ venta.condicionPago }} · Estado: <b>{{ venta.estadoPago }}</b>
          </p>
        </div>
        <div class="text-right">
          <p class="text-[10px] text-gray-400 uppercase font-bold">Total actual</p>
          <p class="text-xl font-black text-gray-800">S/ {{ Number(venta.totalVenta).toFixed(2) }}</p>
        </div>
      </div>

      <div v-if="!venta.detalles?.length" class="py-12 text-center text-gray-400 text-sm">
        Esta venta ya no tiene prendas (todo fue devuelto).
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th class="p-3 text-left">Prenda</th>
              <th class="p-3 text-left">Color / Talla</th>
              <th class="p-3 text-center">Vendidas</th>
              <th class="p-3 text-right">P. Unit.</th>
              <th class="p-3 text-center">Devolver</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="d in venta.detalles" :key="d.id" class="hover:bg-gray-50">
              <td class="p-3 font-bold text-gray-800">{{ d.producto?.nombre }}</td>
              <td class="p-3 text-gray-600">{{ d.color }} · {{ d.talla }}</td>
              <td class="p-3 text-center font-bold">{{ d.cantidad }}</td>
              <td class="p-3 text-right">S/ {{ Number(d.precioUnitario).toFixed(2) }}</td>
              <td class="p-2 text-center">
                <input
                  v-model.number="devolver[d.id]"
                  type="number"
                  min="0"
                  :max="d.cantidad"
                  class="w-20 border rounded-lg text-center py-1.5 outline-none font-bold"
                  :class="(devolver[d.id] || 0) > 0 ? 'border-orange-400 bg-orange-50' : 'border-gray-200 focus:border-blue-500'"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="venta.detalles?.length" class="p-4 border-t border-gray-100 space-y-3">
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Motivo (opcional)</label>
          <input v-model="motivo" placeholder="Ej: talla equivocada, prenda con falla..." class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-sm font-black text-orange-600 mr-auto">A devolver: S/ {{ totalDevolver.toFixed(2) }}</span>
          <button
            @click="confirmar"
            :disabled="!hayAlgo || procesando"
            class="bg-orange-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-orange-500/20 hover:bg-orange-700 disabled:opacity-40"
          >
            {{ procesando ? 'Procesando...' : '🔄 Registrar devolución' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
