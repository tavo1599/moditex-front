<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import api from '../api/axios';

// ESTADOS OPERATIVOS
const busqueda = ref('');
const cargando = ref(false);
const ordenSeleccionada = ref<any>(null);
const enviando = ref(false);

// Catálogos
const bodegas = ref<any[]>([]);
const talleres = ref<any[]>([]);
const colores = ref<any[]>([]);

const bodegaDestinoId = ref<number | null>(null);
const derivarTallerId = ref<number | null>(null);

// Modo de escaneo actual: a qué columna suma cada lectura de la pistola
type Modo = 'buena' | 'falla' | 'derivar';
const modo = ref<Modo>('buena');

// Matriz de recepción: una fila por variante con sus contadores
const matriz = ref<any[]>([]);

// Input de escaneo
const codigoEscaneado = ref('');
const inputEscaner = ref<HTMLInputElement | null>(null);
const ultimoMensaje = ref('');

const cargarCatalogos = async () => {
  try {
    const [resBod, resTall, resCol] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/talleres'),
      api.get('/colores'),
    ]);
    bodegas.value = resBod.data.filter((b: any) => b.estado && b.tipo !== 'Merma');
    talleres.value = resTall.data?.map?.((t: any) => t.taller || t) || resTall.data || [];
    colores.value = resCol.data || [];
    if (bodegas.value.length > 0) bodegaDestinoId.value = bodegas.value[0].id;
  } catch (error) {
    console.error('Error al cargar catálogos:', error);
  }
};

// Código de color (para armar el SKU de la etiqueta: PRD{id}-{codigoColor}-{talla})
const codigoColor = (nombreColor: string): string => {
  const c = colores.value.find(
    (x) => x.codigo === nombreColor || x.nombre === nombreColor,
  );
  return (c ? c.codigo : String(nombreColor).substring(0, 3)).toUpperCase();
};

const buscarOrden = async () => {
  if (!busqueda.value) return;
  cargando.value = true;
  try {
    const res = await api.get(`/ordenes/buscar/${busqueda.value.trim()}`);
    ordenSeleccionada.value = res.data;
    const prodId = res.data.producto?.id ?? res.data.productoId;

    matriz.value = res.data.detallesMatriz.map((d: any) => ({
      color: d.color,
      talla: d.talla,
      programado: d.cantidadProgramada,
      sku: `PRD${prodId}-${codigoColor(d.color)}-${String(d.talla)}`.toUpperCase(),
      buena: 0,
      falla: 0,
      derivar: 0,
    }));

    await nextTick();
    inputEscaner.value?.focus();
  } catch (error: any) {
    alert('❌ ' + (error.response?.data?.message || 'No se encontró la Orden.'));
    ordenSeleccionada.value = null;
  } finally {
    cargando.value = false;
  }
};

// Procesa un código escaneado: lo suma a la columna del modo activo
const procesarEscaneo = () => {
  const code = codigoEscaneado.value.trim().toUpperCase().replace(/'/g, '-');
  codigoEscaneado.value = '';
  if (!code) return;

  // Buscamos la variante por su SKU, o por "COLOR-TALLA"
  const fila =
    matriz.value.find((f) => f.sku === code) ||
    matriz.value.find((f) => `${f.color}-${f.talla}`.toUpperCase() === code);

  if (!fila) {
    ultimoMensaje.value = `❌ ${code} no pertenece a esta orden`;
    return;
  }

  fila[modo.value]++;
  const etiqueta = modo.value === 'buena' ? 'Buena' : modo.value === 'falla' ? 'Falla' : 'Derivar';
  ultimoMensaje.value = `+1 ${etiqueta}: ${fila.color} ${fila.talla}`;
};

const totales = computed(() => {
  return matriz.value.reduce(
    (acc, f) => {
      acc.buena += f.buena;
      acc.falla += f.falla;
      acc.derivar += f.derivar;
      acc.programado += f.programado;
      return acc;
    },
    { buena: 0, falla: 0, derivar: 0, programado: 0 },
  );
});

const finalizarRecepcion = async () => {
  if (totales.value.buena + totales.value.falla + totales.value.derivar === 0) {
    return alert('⚠️ Escanea al menos una prenda antes de finalizar.');
  }
  if (!bodegaDestinoId.value) {
    return alert('⚠️ Selecciona la bodega destino para las prendas buenas.');
  }
  if (totales.value.derivar > 0 && !derivarTallerId.value) {
    return alert('⚠️ Hay prendas para Derivar: elige el taller/lavado destino.');
  }

  if (!confirm(
    `Confirmar recepción:\n` +
    `• Buenas: ${totales.value.buena} → almacén\n` +
    `• Fallas: ${totales.value.falla} → merma\n` +
    `• Derivar: ${totales.value.derivar} → otro taller (no entra a almacén)\n\n¿Continuar?`
  )) return;

  enviando.value = true;
  try {
    const res = await api.post(`/ordenes/${ordenSeleccionada.value.id}/recepcionar`, {
      bodegaId: bodegaDestinoId.value,
      derivarTallerId: totales.value.derivar > 0 ? derivarTallerId.value : null,
      items: matriz.value.map((f) => ({
        color: f.color,
        talla: f.talla,
        cantidadBuena: f.buena,
        cantidadFalla: f.falla,
        cantidadDerivar: f.derivar,
      })),
    });

    const r = res.data;
    alert(
      `🎉 ${r.mensaje}\n\n` +
      `Buenas: ${r.prendasBuenas} → ${r.bodegaDestino}\n` +
      `Merma: ${r.prendasMerma} (${r.mermaRegistrada})\n` +
      `Derivadas: ${r.prendasDerivadas}${r.guiaDerivacion ? ' · Guía ' + r.guiaDerivacion : ''}\n` +
      `Costo real/prenda: S/ ${r.costoRealUnitario}\n` +
      `Estado orden: ${r.estadoOrden}`
    );
    ordenSeleccionada.value = null;
    busqueda.value = '';
  } catch (error: any) {
    alert('❌ ' + (error.response?.data?.message || 'Error al procesar la recepción.'));
  } finally {
    enviando.value = false;
  }
};

onMounted(cargarCatalogos);
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- HEADER Y BUSCADOR -->
    <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
      <div class="flex-1">
        <h2 class="text-3xl font-black text-gray-900 tracking-tight">Recepción de Taller 📥</h2>
        <p class="text-gray-500 mt-1 font-medium">Escanea el QR de la guía o ingresa el código OP para recibir prendas.</p>
      </div>
      <div class="w-full md:w-96 flex gap-2">
        <input
          v-model="busqueda"
          @keyup.enter="buscarOrden"
          type="text"
          placeholder="Ej: OP-2026-002 o escanea QR..."
          class="flex-1 border-2 border-gray-200 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all"
        >
        <button @click="buscarOrden" :disabled="cargando" class="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all">
          {{ cargando ? '...' : 'Buscar' }}
        </button>
      </div>
    </div>

    <div v-if="ordenSeleccionada" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- LADO IZQUIERDO: escáner + config -->
      <div class="lg:col-span-4 space-y-6">
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div>
            <p class="text-sm font-black text-gray-400 uppercase tracking-widest">Orden</p>
            <p class="font-bold text-gray-800 text-lg">{{ ordenSeleccionada.codigoOp }}</p>
            <p class="text-sm text-gray-500">{{ ordenSeleccionada.producto?.nombre }}</p>
          </div>

          <!-- MODO DE ESCANEO -->
          <div>
            <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Modo de escaneo</p>
            <div class="grid grid-cols-3 gap-2">
              <button @click="modo = 'buena'" :class="modo === 'buena' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700'" class="py-2.5 rounded-xl font-black text-xs uppercase transition-all">Buena</button>
              <button @click="modo = 'falla'" :class="modo === 'falla' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'" class="py-2.5 rounded-xl font-black text-xs uppercase transition-all">Falla</button>
              <button @click="modo = 'derivar'" :class="modo === 'derivar' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'" class="py-2.5 rounded-xl font-black text-xs uppercase transition-all">Derivar</button>
            </div>
          </div>

          <!-- INPUT DE PISTOLA -->
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pistola de escaneo</label>
            <input
              ref="inputEscaner"
              v-model="codigoEscaneado"
              @keyup.enter="procesarEscaneo"
              type="text"
              placeholder="Dispara el código aquí..."
              class="w-full border-2 p-3 rounded-xl font-mono font-bold outline-none transition-all"
              :class="modo === 'buena' ? 'border-green-300 focus:border-green-500' : modo === 'falla' ? 'border-red-300 focus:border-red-500' : 'border-amber-300 focus:border-amber-500'"
            >
            <p v-if="ultimoMensaje" class="text-xs font-bold mt-2 text-indigo-600">{{ ultimoMensaje }}</p>
          </div>

          <hr class="border-gray-100">

          <!-- BODEGA DESTINO -->
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bodega destino (buenas)</label>
            <select v-model="bodegaDestinoId" class="w-full border-2 border-gray-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white text-sm">
              <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
            </select>
          </div>

          <!-- TALLER DERIVAR (solo si hay derivadas) -->
          <div v-if="totales.derivar > 0">
            <label class="block text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Derivar a (taller / lavado)</label>
            <select v-model="derivarTallerId" class="w-full border-2 border-amber-200 p-2.5 rounded-xl font-bold outline-none focus:border-amber-500 bg-white text-sm">
              <option :value="null" disabled>Selecciona destino...</option>
              <option v-for="t in talleres" :key="t.id" :value="t.id">{{ t.razonSocial }}</option>
            </select>
          </div>
        </div>

        <!-- RESUMEN -->
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-green-50 p-4 rounded-xl text-center border border-green-100">
            <p class="text-[10px] font-black text-green-600 uppercase">Buenas</p>
            <p class="text-2xl font-black text-green-700">{{ totales.buena }}</p>
          </div>
          <div class="bg-red-50 p-4 rounded-xl text-center border border-red-100">
            <p class="text-[10px] font-black text-red-600 uppercase">Falla</p>
            <p class="text-2xl font-black text-red-700">{{ totales.falla }}</p>
          </div>
          <div class="bg-amber-50 p-4 rounded-xl text-center border border-amber-100">
            <p class="text-[10px] font-black text-amber-600 uppercase">Derivar</p>
            <p class="text-2xl font-black text-amber-700">{{ totales.derivar }}</p>
          </div>
        </div>
      </div>

      <!-- LADO DERECHO: matriz tipo tabla -->
      <div class="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <table class="w-full text-left">
          <thead class="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
            <tr>
              <th class="p-4">Color / Talla</th>
              <th class="p-4 text-center">Programado</th>
              <th class="p-4 text-center bg-green-800">Buenas</th>
              <th class="p-4 text-center bg-red-800">Falla</th>
              <th class="p-4 text-center bg-amber-700">Derivar</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(f, i) in matriz" :key="i" class="hover:bg-gray-50 transition-colors">
              <td class="p-4">
                <p class="font-bold text-gray-800">{{ f.color }}</p>
                <p class="text-xs text-gray-500">Talla {{ f.talla }} · <span class="font-mono">{{ f.sku }}</span></p>
              </td>
              <td class="p-4 text-center font-bold text-gray-400">{{ f.programado }}</td>
              <td class="p-3 text-center">
                <input type="number" min="0" v-model.number="f.buena" class="w-20 text-center border-2 border-green-100 rounded-lg p-2 font-black text-green-700 focus:border-green-500 outline-none">
              </td>
              <td class="p-3 text-center">
                <input type="number" min="0" v-model.number="f.falla" class="w-20 text-center border-2 border-red-100 rounded-lg p-2 font-black text-red-700 focus:border-red-500 outline-none">
              </td>
              <td class="p-3 text-center">
                <input type="number" min="0" v-model.number="f.derivar" class="w-20 text-center border-2 border-amber-100 rounded-lg p-2 font-black text-amber-700 focus:border-amber-500 outline-none">
              </td>
            </tr>
          </tbody>
        </table>

        <div class="p-6 bg-gray-50 border-t border-gray-100 flex justify-between items-center mt-auto">
          <div>
            <p class="text-[10px] font-black text-gray-400 uppercase">Total recibido</p>
            <p class="text-2xl font-black text-gray-800">{{ totales.buena + totales.falla + totales.derivar }} prendas</p>
          </div>
          <button
            @click="finalizarRecepcion"
            :disabled="enviando"
            class="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-2xl font-black text-lg shadow-xl shadow-indigo-500/20 transition-all flex items-center gap-3 disabled:opacity-50"
          >
            <span v-if="enviando">Procesando...</span>
            <span v-else>✅ Finalizar Recepción</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ESTADO VACÍO -->
    <div v-else class="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl py-20 text-center">
      <span class="text-6xl">🔍</span>
      <h3 class="text-xl font-bold text-gray-400 mt-4 tracking-tight">Esperando lectura de QR o Código OP</h3>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>
