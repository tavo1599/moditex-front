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

// --- MODO: solo devolución o cambio ---
const modo = ref<'devolucion' | 'cambio'>('devolucion');

// Prendas que se lleva el cliente (en un cambio)
const inventario = ref<any[]>([]);
const colores = ref<any[]>([]);
const busqueda = ref('');
const seLleva = ref<any[]>([]);
const pagaDiferencia = ref(true);
const ticket = ref<any>(null);

const cargarInventario = async () => {
  try {
    const [resI, resC] = await Promise.all([
      api.get('/almacen-terminados/inventario'),
      api.get('/colores'),
    ]);
    inventario.value = resI.data;
    colores.value = resC.data || [];
  } catch (e) { console.error(e); }
};

const nombreColor = (val: any) => {
  const c = colores.value.find((x) => x.codigo === val || x.nombre === val);
  return c ? c.nombre : val;
};

const resultados = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q || !bodegaDestino.value) return [];
  return inventario.value
    .filter((i: any) => Number(i.bodegaId) === Number(bodegaDestino.value) && Number(i.stock) > 0)
    .filter((i: any) => {
      const txt = `${i.producto?.nombre || ''} ${nombreColor(i.color)} ${i.talla}`.toLowerCase();
      return txt.includes(q);
    })
    .slice(0, 25);
});

const agregarSeLleva = (p: any) => {
  const ya = seLleva.value.find(
    (x) => x.productoId === (p.productoId || p.producto?.id) && x.color === p.color && x.talla === p.talla,
  );
  if (ya) {
    if (ya.cantidad + 1 > p.stock) return alert('No hay más stock de esa prenda.');
    ya.cantidad++;
  } else {
    seLleva.value.push({
      productoId: p.productoId || p.producto?.id,
      nombre: p.producto?.nombre || 'Prenda',
      color: p.color,
      talla: p.talla,
      cantidad: 1,
      stockMax: p.stock,
      precioUnitario: Number(p.producto?.precioWeb) || 0,
    });
  }
  busqueda.value = '';
};
const quitarSeLleva = (i: number) => seLleva.value.splice(i, 1);

const totalSeLleva = computed(() =>
  seLleva.value.reduce((s, x) => s + Number(x.cantidad) * Number(x.precioUnitario || 0), 0),
);
const diferencia = computed(() => totalSeLleva.value - totalDevolver.value);

const confirmarCambio = async () => {
  if (!bodegaDestino.value) return alert('Selecciona el almacén.');
  if (!hayAlgo.value) return alert('Indica qué prenda entrega el cliente.');
  if (!seLleva.value.length) return alert('Indica qué prenda se lleva el cliente.');

  const entrega = (venta.value.detalles || [])
    .map((d: any) => ({ detalleId: d.id, cantidad: Number(devolver.value[d.id]) || 0 }))
    .filter((i: any) => i.cantidad > 0);

  procesando.value = true;
  try {
    const res = await api.post('/ventas/cambio', {
      ventaId: venta.value.id,
      bodegaId: Number(bodegaDestino.value),
      motivo: motivo.value || undefined,
      entrega,
      recibe: seLleva.value.map((x) => ({
        productoId: x.productoId,
        color: x.color,
        talla: x.talla,
        cantidad: x.cantidad,
        precioUnitario: Number(x.precioUnitario) || 0,
      })),
      pagaDiferencia: pagaDiferencia.value,
    });
    ticket.value = res.data;
    seLleva.value = [];
    motivo.value = '';
    await buscarVenta();
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al registrar el cambio.'));
  } finally {
    procesando.value = false;
  }
};

const imprimirTicket = () => window.print();

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

onMounted(async () => { await cargarBodegas(); await cargarInventario(); });
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">🔄 Devoluciones y Cambios</h2>
      <p class="text-gray-500 mt-1">Busca la venta e indica qué prendas regresan. En un <b>cambio</b>, además eliges la prenda que se lleva y el sistema calcula la diferencia.</p>

      <div class="grid grid-cols-2 gap-3 mt-4 max-w-md">
        <button
          @click="modo = 'devolucion'"
          :class="modo === 'devolucion' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-400'"
          class="border-2 p-3 rounded-xl font-black text-sm transition-all"
        >↩️ Solo devolución</button>
        <button
          @click="modo = 'cambio'"
          :class="modo === 'cambio' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'"
          class="border-2 p-3 rounded-xl font-black text-sm transition-all"
        >🔁 Cambio (otra talla/color)</button>
      </div>
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
        <!-- ===== MODO CAMBIO: qué se lleva el cliente ===== -->
        <div v-if="modo === 'cambio'" class="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
          <p class="text-[11px] font-black text-blue-700 uppercase">🔁 Prenda que se lleva el cliente</p>

          <div class="relative">
            <input
              v-model="busqueda"
              placeholder="Busca por nombre, color o talla..."
              class="w-full border border-blue-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <div v-if="resultados.length" class="absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 max-h-60 overflow-y-auto">
              <button
                v-for="p in resultados"
                :key="p.id"
                @click="agregarSeLleva(p)"
                class="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-none flex justify-between items-center gap-3"
              >
                <div class="min-w-0">
                  <p class="font-bold text-gray-800 text-sm truncate">{{ p.producto?.nombre }}</p>
                  <p class="text-[11px] text-gray-500">{{ nombreColor(p.color) }} · Talla {{ p.talla }}</p>
                </div>
                <span class="text-[11px] font-black text-emerald-600 shrink-0">{{ p.stock }} u.</span>
              </button>
            </div>
          </div>

          <div v-if="seLleva.length" class="space-y-2">
            <div v-for="(x, i) in seLleva" :key="i" class="bg-white border border-blue-100 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <div class="flex-1 min-w-[160px]">
                <p class="font-bold text-gray-800 text-sm">{{ x.nombre }}</p>
                <p class="text-[11px] text-gray-500">{{ nombreColor(x.color) }} · Talla {{ x.talla }}</p>
              </div>
              <div>
                <label class="block text-[9px] font-black text-gray-400 uppercase">Cant.</label>
                <input v-model.number="x.cantidad" type="number" min="1" :max="x.stockMax" class="w-16 border border-gray-200 rounded-lg text-center py-1.5 font-bold outline-none" />
              </div>
              <div>
                <label class="block text-[9px] font-black text-gray-400 uppercase">Precio S/</label>
                <input v-model.number="x.precioUnitario" type="number" step="0.10" class="w-24 border border-gray-200 rounded-lg text-right px-2 py-1.5 font-bold outline-none" />
              </div>
              <button @click="quitarSeLleva(i)" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">🗑️</button>
            </div>
          </div>
          <p v-else class="text-[11px] text-blue-500">Busca y agrega la prenda que se lleva a cambio.</p>

          <label class="flex items-center gap-2 text-xs font-bold text-blue-700 cursor-pointer">
            <input type="checkbox" v-model="pagaDiferencia" class="accent-blue-600">
            Cobrar / devolver la diferencia al momento (si lo desmarcas, va a la cuenta del cliente)
          </label>
        </div>

        <!-- ===== Totales y acción ===== -->
        <div class="flex flex-wrap items-center gap-3">
          <div class="mr-auto">
            <span class="text-sm font-black text-orange-600">Devuelve: S/ {{ totalDevolver.toFixed(2) }}</span>
            <template v-if="modo === 'cambio'">
              <span class="text-sm font-black text-blue-600 ml-3">Se lleva: S/ {{ totalSeLleva.toFixed(2) }}</span>
              <span
                class="text-sm font-black ml-3"
                :class="diferencia > 0 ? 'text-red-600' : diferencia < 0 ? 'text-emerald-600' : 'text-gray-400'"
              >
                {{ diferencia > 0 ? `Cobrar: S/ ${diferencia.toFixed(2)}` : diferencia < 0 ? `Devolver: S/ ${Math.abs(diferencia).toFixed(2)}` : 'Sin diferencia' }}
              </span>
            </template>
          </div>

          <button
            v-if="modo === 'devolucion'"
            @click="confirmar"
            :disabled="!hayAlgo || procesando"
            class="bg-orange-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-orange-500/20 hover:bg-orange-700 disabled:opacity-40"
          >
            {{ procesando ? 'Procesando...' : '↩️ Registrar devolución' }}
          </button>
          <button
            v-else
            @click="confirmarCambio"
            :disabled="!hayAlgo || !seLleva.length || procesando"
            class="bg-blue-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-40"
          >
            {{ procesando ? 'Procesando...' : '🔁 Registrar cambio' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ===== TICKET DEL CAMBIO ===== -->
    <div v-if="ticket" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 print:bg-white print:p-0">
      <div class="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl print:shadow-none">
        <div class="p-5 border-b border-gray-100 flex justify-between items-center print:hidden">
          <h3 class="text-xl font-black text-gray-800">Ticket de cambio</h3>
          <div class="flex gap-2">
            <button @click="imprimirTicket" class="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-50">🖨️ Imprimir</button>
            <button @click="ticket = null" class="text-gray-400 hover:text-red-500 text-2xl leading-none px-2">&times;</button>
          </div>
        </div>

        <div class="p-6 space-y-4 text-sm">
          <div class="text-center border-b border-dashed border-gray-300 pb-3">
            <p class="font-black text-lg">CAMBIO DE PRENDA</p>
            <p class="text-gray-500">Venta {{ ticket.correlativo }}</p>
            <p class="text-gray-400 text-xs">{{ new Date(ticket.fecha).toLocaleString('es-PE') }}</p>
          </div>

          <div>
            <p class="font-black text-orange-600 text-xs uppercase mb-1">Entregó</p>
            <div v-for="(e, i) in ticket.entregadas" :key="'e'+i" class="flex justify-between">
              <span>{{ e.cantidad }}× {{ e.producto }} · {{ e.color }} · T{{ e.talla }}</span>
              <span class="font-bold">S/ {{ e.subtotal.toFixed(2) }}</span>
            </div>
          </div>

          <div>
            <p class="font-black text-blue-600 text-xs uppercase mb-1">Se llevó</p>
            <div v-for="(r, i) in ticket.recibidas" :key="'r'+i" class="flex justify-between">
              <span>{{ r.cantidad }}× {{ r.producto }} · {{ r.color }} · T{{ r.talla }}</span>
              <span class="font-bold">S/ {{ r.subtotal.toFixed(2) }}</span>
            </div>
          </div>

          <div class="border-t border-dashed border-gray-300 pt-3 space-y-1">
            <div class="flex justify-between"><span>Valor devuelto</span><span>S/ {{ ticket.montoDevuelto.toFixed(2) }}</span></div>
            <div class="flex justify-between"><span>Valor nuevo</span><span>S/ {{ ticket.montoNuevo.toFixed(2) }}</span></div>
            <div v-if="ticket.efectivoACobrar > 0" class="flex justify-between font-black text-red-600 text-base">
              <span>COBRAR AL CLIENTE</span><span>S/ {{ ticket.efectivoACobrar.toFixed(2) }}</span>
            </div>
            <div v-else-if="ticket.efectivoADevolver > 0" class="flex justify-between font-black text-emerald-600 text-base">
              <span>DEVOLVER AL CLIENTE</span><span>S/ {{ ticket.efectivoADevolver.toFixed(2) }}</span>
            </div>
            <div v-else class="flex justify-between font-black text-gray-500"><span>SIN DIFERENCIA</span><span>S/ 0.00</span></div>
          </div>

          <div class="border-t border-dashed border-gray-300 pt-3 text-xs text-gray-500 space-y-1">
            <div class="flex justify-between"><span>Nuevo total de la venta</span><span>S/ {{ ticket.nuevoTotalVenta.toFixed(2) }}</span></div>
            <div class="flex justify-between"><span>Pagado</span><span>S/ {{ ticket.nuevoTotalPagado.toFixed(2) }}</span></div>
            <div class="flex justify-between"><span>Saldo pendiente</span><span>S/ {{ ticket.nuevoSaldo.toFixed(2) }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
