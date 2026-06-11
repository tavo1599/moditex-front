<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../../api/axios';

const API = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';
const pedidos = ref<any[]>([]);
const bodegas = ref<any[]>([]);
const cargando = ref(true);
const filtro = ref('TODOS');

const ESTADOS = ['PENDIENTE', 'CONFIRMADO', 'DESPACHADO', 'ENTREGADO', 'ANULADO'];

const cargar = async () => {
  cargando.value = true;
  try {
    const [resP, resB] = await Promise.all([
      api.get('/web/pedidos'),
      api.get('/almacen-terminados/bodegas'),
    ]);
    pedidos.value = resP.data;
    bodegas.value = resB.data.filter((b: any) => b.estado && b.tipo !== 'Merma');
  } catch (e) {
    console.error(e);
  } finally {
    cargando.value = false;
  }
};

// Confirmar = convertir en venta (descuenta stock). Pregunta de qué bodega.
const confirmando = ref<number | null>(null);
const confirmarPedido = async (p: any) => {
  if (p.ventaId) return;
  // Elegir bodega si hay más de una
  let bodegaId = bodegas.value[0]?.id;
  if (bodegas.value.length > 1) {
    const opciones = bodegas.value.map((b, i) => `${i + 1}) ${b.nombre}`).join('\n');
    const sel = prompt(`¿De qué bodega se descuenta el stock?\n\n${opciones}\n\nNúmero:`, '1');
    if (sel === null) return;
    const idx = Number(sel) - 1;
    if (isNaN(idx) || idx < 0 || idx >= bodegas.value.length) return alert('Opción no válida.');
    bodegaId = bodegas.value[idx].id;
  }
  if (!confirm(`Confirmar ${p.codigo}: se descontará el stock y quedará como venta real. ¿Continuar?`)) return;

  confirmando.value = p.id;
  try {
    const res = await api.post(`/web/pedidos/${p.id}/convertir`, { bodegaId });
    alert(`✅ ${res.data.mensaje}\nVenta: ${res.data.venta} · Bodega: ${res.data.bodega}`);
    await cargar();
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'No se pudo confirmar.'));
  } finally {
    confirmando.value = null;
  }
};

const filtrados = computed(() =>
  filtro.value === 'TODOS' ? pedidos.value : pedidos.value.filter((p) => p.estado === filtro.value),
);

const colorEstado = (e: string) => ({
  PENDIENTE: 'bg-yellow-100 text-yellow-700',
  CONFIRMADO: 'bg-blue-100 text-blue-700',
  DESPACHADO: 'bg-indigo-100 text-indigo-700',
  ENTREGADO: 'bg-green-100 text-green-700',
  ANULADO: 'bg-red-100 text-red-700',
}[e] || 'bg-gray-100 text-gray-700');

const cambiarEstado = async (p: any, estado: string) => {
  try {
    await api.put(`/web/pedidos/${p.id}/estado`, { estado });
    p.estado = estado;
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'No se pudo actualizar.'));
  }
};

const whatsapp = (p: any) => {
  const tel = String(p.telefono).replace(/\D/g, '');
  const msg = encodeURIComponent(`Hola ${p.clienteNombre}, te escribo de MODITEX por tu pedido ${p.codigo} (S/ ${Number(p.total).toFixed(2)}).`);
  window.open(`https://wa.me/51${tel}?text=${msg}`, '_blank');
};

onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">📦 Pedidos Web</h2>
        <p class="text-gray-500 mt-1">Pedidos hechos desde la tienda online. Coordina pago y despacho.</p>
      </div>
      <button @click="cargar" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-semibold text-sm">Actualizar</button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button @click="filtro = 'TODOS'" class="px-4 py-2 rounded-lg text-xs font-bold uppercase" :class="filtro === 'TODOS' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500'">Todos</button>
      <button v-for="e in ESTADOS" :key="e" @click="filtro = e" class="px-4 py-2 rounded-lg text-xs font-bold uppercase" :class="filtro === e ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500'">{{ e }}</button>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
    </div>

    <div v-else-if="filtrados.length" class="space-y-4">
      <div v-for="p in filtrados" :key="p.id" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex flex-wrap justify-between items-start gap-3">
          <div>
            <div class="flex items-center gap-3">
              <span class="font-mono font-bold text-gray-800">{{ p.codigo }}</span>
              <span class="text-[10px] font-black px-2 py-0.5 rounded-full uppercase" :class="colorEstado(p.estado)">{{ p.estado }}</span>
            </div>
            <p class="font-bold text-gray-800 mt-2">{{ p.clienteNombre }}</p>
            <p class="text-sm text-gray-500">{{ p.telefono }} <span v-if="p.documento">· {{ p.documento }}</span></p>
            <p class="text-sm text-gray-500">
              {{ p.metodoEntrega === 'ENVIO' ? '🚚 Envío: ' + (p.direccion || '—') : '🏬 Recojo en tienda' }}
            </p>
            <p v-if="p.metodoPago" class="text-sm text-gray-600 font-medium mt-1">💳 Pago: {{ p.metodoPago }}</p>
            <p v-if="p.notas" class="text-xs text-gray-400 mt-1 italic">"{{ p.notas }}"</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-black text-gray-800">S/ {{ Number(p.total).toFixed(2) }}</p>
            <p class="text-[10px] text-gray-400">{{ new Date(p.fecha).toLocaleString('es-PE') }}</p>
          </div>
        </div>

        <!-- Detalle -->
        <div class="mt-4 bg-gray-50 rounded-lg p-3 divide-y divide-gray-100">
          <div v-for="d in p.detalles" :key="d.id" class="flex justify-between py-1.5 text-sm">
            <span class="text-gray-700">{{ d.cantidad }}× {{ d.nombre }} <span class="text-gray-400 text-xs">({{ d.color }} / {{ d.talla }})</span></span>
            <span class="font-bold text-gray-700">S/ {{ Number(d.subtotal).toFixed(2) }}</span>
          </div>
        </div>

        <!-- Voucher de pago -->
        <div v-if="p.voucherUrl" class="mt-3 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
          <a :href="`${API}${p.voucherUrl}`" target="_blank">
            <img :src="`${API}${p.voucherUrl}`" class="w-16 h-16 object-cover rounded-lg border border-emerald-200 hover:scale-105 transition" />
          </a>
          <div>
            <p class="text-xs font-bold text-emerald-700 uppercase tracking-wider">Comprobante de pago</p>
            <a :href="`${API}${p.voucherUrl}`" target="_blank" class="text-xs text-emerald-600 underline">Ver en grande</a>
          </div>
        </div>
        <p v-else class="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2 inline-block">⚠️ Sin comprobante adjunto</p>

        <!-- Acciones -->
        <div class="mt-4 flex flex-wrap gap-2 items-center">
          <button @click="whatsapp(p)" class="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-2 rounded-lg text-xs font-bold border border-green-200">💬 WhatsApp</button>

          <!-- Confirmar = convertir en venta y descontar stock (solo si no se ha convertido) -->
          <button
            v-if="!p.ventaId && p.estado !== 'ANULADO'"
            @click="confirmarPedido(p)"
            :disabled="confirmando === p.id"
            class="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
          >
            {{ confirmando === p.id ? 'Procesando...' : '✅ Confirmar y descontar stock' }}
          </button>
          <span v-if="p.ventaId" class="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            ✓ Venta registrada · stock descontado
          </span>

          <span class="text-[10px] text-gray-400 uppercase tracking-wider ml-2">Estado:</span>
          <button v-for="e in ['DESPACHADO', 'ENTREGADO', 'ANULADO']" :key="e" @click="cambiarEstado(p, e)" :disabled="p.estado === e"
            class="px-3 py-1.5 rounded-lg text-[11px] font-bold border transition disabled:opacity-40"
            :class="p.estado === e ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-100'">
            {{ e }}
          </button>
        </div>
      </div>
    </div>

    <p v-else class="text-center text-gray-400 py-16">No hay pedidos {{ filtro !== 'TODOS' ? 'en estado ' + filtro : '' }}.</p>
  </div>
</template>
