<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import api from '../api/axios';

const bodegas = ref<any[]>([]);
const inventario = ref<any[]>([]);
const productos = ref<any[]>([]);
const colores = ref<any[]>([]);
const cargando = ref(true);
const guardando = ref(false);

const bodegaSel = ref('');
const busqueda = ref('');

// Conteo físico por id de inventario
const conteos = ref<Record<number, number | string>>({});

// Variantes nuevas a crear (no existen en el sistema)
const nuevos = ref<any[]>([]);
const formNuevo = ref({ productoId: '', color: '', talla: '', cantidad: 1 });

const cargarTodo = async () => {
  cargando.value = true;
  try {
    const [resB, resI, resP, resC] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario'),
      api.get('/productos'),
      api.get('/colores'),
    ]);
    bodegas.value = resB.data.filter((b: any) => b.estado);
    inventario.value = resI.data;
    productos.value = resP.data;
    colores.value = resC.data || [];
  } catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const nombreColor = (val: string) => {
  const c = colores.value.find((x) => x.codigo === val || x.nombre === val);
  return c ? c.nombre : val;
};
const nombreProducto = (id: any) => productos.value.find((p) => p.id === Number(id))?.nombre || '';

// Inventario de la bodega elegida (con filtro de búsqueda)
const itemsBodega = computed(() => {
  if (!bodegaSel.value) return [];
  const q = busqueda.value.trim().toLowerCase();
  return inventario.value
    .filter((it) => it.bodegaId === Number(bodegaSel.value))
    .filter((it) => {
      if (!q) return true;
      const txt = `${it.producto?.nombre || ''} ${nombreColor(it.color)} ${it.talla}`.toLowerCase();
      return txt.includes(q);
    });
});

// Al cambiar de bodega o recargar, inicializamos el conteo = stock actual del sistema
watch([itemsBodega], () => {
  for (const it of itemsBodega.value) {
    if (conteos.value[it.id] === undefined) conteos.value[it.id] = it.stock;
  }
});
watch(bodegaSel, () => { conteos.value = {}; nuevos.value = []; busqueda.value = ''; });

const diferencia = (it: any) => {
  const fisico = Number(conteos.value[it.id]);
  if (Number.isNaN(fisico)) return 0;
  return fisico - it.stock;
};

// Cuántos cambios hay pendientes (ajustes + variantes nuevas)
const pendientes = computed(() => {
  let n = nuevos.value.length;
  for (const it of itemsBodega.value) {
    const f = conteos.value[it.id];
    if (f !== '' && f != null && Number(f) !== it.stock) n++;
  }
  return n;
});

// 🔫 CONTEO POR ESCANEO: cada disparo suma 1 al conteo físico de esa prenda
const codigoBarra = ref('');
const scanError = ref('');
const scanOk = ref('');
const norm = (s: any) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const procesarEscaneoConteo = async () => {
  const code = norm(codigoBarra.value).replace(/'/g, '-');
  codigoBarra.value = '';
  if (!code) return;
  if (!bodegaSel.value) { scanError.value = 'Selecciona primero el almacén.'; return; }

  const m = code.match(/^PRD(\d+)-(.+)-([^-]+)$/);
  if (!m) { scanError.value = `Código no reconocido: ${code}`; scanOk.value = ''; return; }
  const idProd = Number(m[1]);
  const colorTok = m[2] || '';
  const tallaTok = m[3] || '';

  // Buscamos la fila del inventario de esa bodega (color por código o nombre)
  const item = itemsBodega.value.find((it: any) => {
    if (Number(it.productoId) !== idProd) return false;
    if (norm(it.talla) !== tallaTok) return false;
    const c = colores.value.find((x) => norm(x.codigo) === norm(it.color) || norm(x.nombre) === norm(it.color));
    return (
      norm(it.color) === colorTok ||
      (!!c && (norm(c.codigo) === colorTok || norm(c.nombre) === colorTok))
    );
  });

  if (!item) {
    scanError.value = `Esa prenda no está registrada en este almacén (${code}). Agrégala como variante nueva.`;
    scanOk.value = '';
    return;
  }

  // Suma 1 al conteo físico (si es el primer escaneo de esa fila, arranca en 0)
  const actual = Number(conteos.value[item.id]);
  conteos.value[item.id] = (Number.isNaN(actual) ? 0 : actual) + 1;
  scanError.value = '';
  scanOk.value = `${item.producto?.nombre || ''} · ${nombreColor(item.color)} · ${item.talla} → ${conteos.value[item.id]}`;
  setTimeout(() => (scanOk.value = ''), 2000);
};

// Al escanear queremos partir de 0 (no del stock del sistema) para contar de verdad
const ponerTodoEnCero = () => {
  for (const it of itemsBodega.value) conteos.value[it.id] = 0;
};

const agregarVariante = () => {
  const f = formNuevo.value;
  if (!f.productoId) return alert('Selecciona el producto.');
  if (!f.color) return alert('Selecciona el color.');
  if (!f.talla) return alert('Ingresa la talla.');
  if (!f.cantidad || Number(f.cantidad) < 1) return alert('Cantidad inválida.');
  nuevos.value.push({
    productoId: Number(f.productoId),
    nombreProducto: nombreProducto(f.productoId),
    color: f.color,
    talla: String(f.talla).toUpperCase(),
    cantidad: Number(f.cantidad),
  });
  formNuevo.value = { productoId: '', color: '', talla: '', cantidad: 1 };
};
const quitarNuevo = (i: number) => nuevos.value.splice(i, 1);

const guardar = async () => {
  if (!bodegaSel.value) return;
  const ajustes = itemsBodega.value.filter((it) => {
    const f = conteos.value[it.id];
    return f !== '' && f != null && Number(f) !== it.stock;
  });
  if (!ajustes.length && !nuevos.value.length) return alert('No hay cambios para guardar.');

  guardando.value = true;
  try {
    for (const it of ajustes) {
      await api.post('/almacen-terminados/ajustar-stock', {
        inventarioId: it.id,
        nuevoStock: Number(conteos.value[it.id]),
        motivo: 'Conteo físico',
      });
    }
    for (const n of nuevos.value) {
      await api.post('/almacen-terminados/inventario', {
        productoId: n.productoId,
        bodegaId: Number(bodegaSel.value),
        color: n.color,
        talla: n.talla,
        cantidad: n.cantidad,
        motivo: 'Conteo físico (variante nueva)',
      });
    }
    nuevos.value = [];
    conteos.value = {};
    await cargarTodo();
    alert(`✅ Inventario actualizado (${ajustes.length + (nuevos.value.length)} cambio(s)).`);
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al guardar los ajustes.'));
  } finally {
    guardando.value = false;
  }
};

onMounted(cargarTodo);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">📋 Conteo de Inventario</h2>
      <p class="text-gray-500 mt-1">Cuenta físicamente las prendas de cada almacén y corrige el stock del sistema. Cada cambio queda registrado en el kardex. (Solo administrador.)</p>
    </div>

    <!-- Selector de bodega -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-4">
      <div class="flex-1 min-w-[220px]">
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Almacén a contar</label>
        <select v-model="bodegaSel" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
          <option value="">Selecciona un almacén...</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }} ({{ b.tipo }})</option>
        </select>
      </div>
      <div v-if="bodegaSel" class="flex-1 min-w-[220px]">
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Buscar prenda</label>
        <input v-model="busqueda" placeholder="Producto, color o talla..." class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
      </div>
    </div>

    <template v-if="bodegaSel">
      <!-- 🔫 CONTEO POR ESCANEO -->
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p class="text-[11px] font-black text-blue-700 uppercase">🔫 Contar escaneando</p>
          <button @click="ponerTodoEnCero" class="text-[11px] font-bold text-blue-600 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-lg">
            Poner todo en 0 para contar
          </button>
        </div>
        <input
          v-model="codigoBarra"
          @keyup.enter="procesarEscaneoConteo"
          type="text"
          placeholder="Dispara con la pistola a cada prenda..."
          class="w-full bg-white border-2 border-blue-300 rounded-xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
        />
        <p v-if="scanError" class="mt-2 text-xs font-bold text-red-600">⚠️ {{ scanError }}</p>
        <p v-else-if="scanOk" class="mt-2 text-xs font-bold text-emerald-600">✅ +1 · {{ scanOk }}</p>
        <p v-else class="mt-2 text-[10px] text-blue-500">Cada disparo suma 1 al conteo físico de esa prenda. Tip: pulsa "Poner todo en 0" antes de empezar a contar.</p>
      </div>

      <!-- Agregar variante nueva -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <p class="text-sm font-bold text-gray-700 mb-1">➕ Agregar variante que NO está en el sistema</p>
        <p class="text-[11px] text-gray-400 mb-3">Úsalo solo si la prenda existe físicamente pero no aparece en la tabla de abajo.</p>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select v-model="formNuevo.productoId" class="border border-gray-300 rounded-lg p-2 text-sm bg-white col-span-2 md:col-span-2">
            <option value="">Producto...</option>
            <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select>
          <select v-model="formNuevo.color" class="border border-gray-300 rounded-lg p-2 text-sm bg-white">
            <option value="">Color...</option>
            <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
          </select>
          <input v-model="formNuevo.talla" placeholder="Talla" class="border border-gray-300 rounded-lg p-2 text-sm uppercase">
          <div class="flex gap-2">
            <input v-model.number="formNuevo.cantidad" type="number" min="1" class="w-16 border border-gray-300 rounded-lg p-2 text-sm text-center font-bold">
            <button @click="agregarVariante" class="flex-1 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-black px-3">Agregar</button>
          </div>
        </div>

        <!-- Variantes nuevas en cola -->
        <div v-if="nuevos.length" class="mt-3 flex flex-wrap gap-2">
          <span v-for="(n, i) in nuevos" :key="i" class="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5 text-xs font-bold">
            {{ n.nombreProducto }} · {{ nombreColor(n.color) }} · {{ n.talla }} → +{{ n.cantidad }}
            <button @click="quitarNuevo(i)" class="text-emerald-400 hover:text-red-500">&times;</button>
          </span>
        </div>
      </div>

      <!-- Tabla de conteo -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div v-if="cargando" class="py-16 text-center text-gray-400 text-sm">Cargando inventario...</div>
        <div v-else-if="!itemsBodega.length" class="py-16 text-center text-gray-400 text-sm">Este almacén no tiene prendas registradas.</div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th class="p-3 text-left">Producto</th>
                <th class="p-3 text-left">Color</th>
                <th class="p-3 text-center">Talla</th>
                <th class="p-3 text-center">Stock sistema</th>
                <th class="p-3 text-center">Conteo físico</th>
                <th class="p-3 text-center">Diferencia</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="it in itemsBodega" :key="it.id" class="hover:bg-gray-50">
                <td class="p-3 font-bold text-gray-800">{{ it.producto?.nombre || nombreProducto(it.productoId) }}</td>
                <td class="p-3 text-gray-600">{{ nombreColor(it.color) }}</td>
                <td class="p-3 text-center font-bold text-gray-700">{{ it.talla }}</td>
                <td class="p-3 text-center text-gray-500">{{ it.stock }}</td>
                <td class="p-2 text-center">
                  <input
                    v-model.number="conteos[it.id]"
                    type="number"
                    min="0"
                    class="w-20 border rounded-lg text-center py-1.5 outline-none font-bold"
                    :class="diferencia(it) !== 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200 focus:border-blue-500'"
                  >
                </td>
                <td class="p-3 text-center font-black">
                  <span v-if="diferencia(it) > 0" class="text-emerald-600">+{{ diferencia(it) }}</span>
                  <span v-else-if="diferencia(it) < 0" class="text-red-500">{{ diferencia(it) }}</span>
                  <span v-else class="text-gray-300">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
          <span class="text-sm font-bold text-gray-600 mr-auto">
            {{ pendientes }} cambio(s) pendiente(s)
          </span>
          <button
            @click="guardar"
            :disabled="!pendientes || guardando"
            class="bg-blue-600 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2"
          >
            {{ guardando ? 'Guardando...' : `💾 Guardar ajustes (${pendientes})` }}
          </button>
        </div>
      </div>
    </template>

    <div v-else class="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center text-gray-400 text-sm">
      Selecciona un almacén para empezar el conteo.
    </div>
  </div>
</template>
