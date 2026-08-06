<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import api from '../api/axios';

/**
 * 💵 LISTA DE PRECIOS
 *
 * Cada prenda maneja dos precios: minorista (venta al público) y mayorista
 * (venta por volumen). El punto de venta toma uno u otro según la lista elegida
 * en la caja, y el vendedor todavía puede ajustarlo línea por línea al vender.
 */

interface Prenda {
  id: number;
  nombre: string;
  skuBase: string;
  categoria: string | null;
  precioMinorista: number;
  precioMayorista: number;
  _guardado?: boolean;
  _guardando?: boolean;
}

const prendas = ref<Prenda[]>([]);
const cargando = ref(true);
const busqueda = ref('');
const soloSinPrecio = ref(false);

const cargar = async () => {
  cargando.value = true;
  try {
    const { data } = await api.get('/productos');
    prendas.value = (data || []).map((p: any) => ({
      ...p,
      precioMinorista: Number(p.precioMinorista) || 0,
      precioMayorista: Number(p.precioMayorista) || 0
    }));
  } catch (e) {
    console.error('Error cargando precios:', e);
    alert('❌ No se pudieron cargar los productos.');
  } finally {
    cargando.value = false;
  }
};

const listadas = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return prendas.value
    .filter(p => !q || `${p.nombre} ${p.skuBase} ${p.categoria || ''}`.toLowerCase().includes(q))
    .filter(p => !soloSinPrecio.value || p.precioMinorista <= 0 || p.precioMayorista <= 0);
});

const sinPrecio = computed(() =>
  prendas.value.filter(p => p.precioMinorista <= 0 && p.precioMayorista <= 0).length
);

/** Margen del mayorista respecto al minorista, para detectar precios cargados al revés. */
const diferencia = (p: Prenda) => {
  if (p.precioMinorista <= 0 || p.precioMayorista <= 0) return null;
  return ((p.precioMayorista - p.precioMinorista) / p.precioMinorista) * 100;
};

const guardar = async (p: Prenda) => {
  p._guardando = true;
  try {
    await api.put(`/productos/${p.id}`, {
      precioMinorista: Number(p.precioMinorista) || 0,
      precioMayorista: Number(p.precioMayorista) || 0
    });
    p._guardado = true;
    setTimeout(() => (p._guardado = false), 2000);
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'No se pudo guardar el precio.'));
    await cargar();
  } finally {
    p._guardando = false;
  }
};

// --- Carga masiva: aplicar un mismo precio o un % a lo que está filtrado ---
const modalMasivo = ref(false);
const modoMasivo = ref<'mayorista_pct' | 'fijo'>('mayorista_pct');
const valorMasivo = ref<number | null>(null);
const aplicandoMasivo = ref(false);

const aplicarMasivo = async () => {
  const valor = Number(valorMasivo.value);
  if (!isFinite(valor)) return alert('Ingresa un número válido.');

  const objetivo = listadas.value;
  const descripcion = modoMasivo.value === 'mayorista_pct'
    ? `poner el precio mayorista a ${valor}% por debajo del minorista`
    : `poner el precio minorista en S/ ${valor.toFixed(2)}`;

  if (!confirm(`Vas a ${descripcion} en ${objetivo.length} prenda(s) de la lista filtrada.\n\n¿Continuar?`)) return;

  aplicandoMasivo.value = true;
  let fallidas = 0;
  try {
    for (const p of objetivo) {
      if (modoMasivo.value === 'mayorista_pct') {
        if (p.precioMinorista <= 0) continue; // sin base no hay de dónde calcular
        p.precioMayorista = Number((p.precioMinorista * (1 - valor / 100)).toFixed(2));
      } else {
        p.precioMinorista = Number(valor.toFixed(2));
      }
      try {
        await api.put(`/productos/${p.id}`, {
          precioMinorista: Number(p.precioMinorista) || 0,
          precioMayorista: Number(p.precioMayorista) || 0
        });
      } catch {
        fallidas++;
      }
    }
  } finally {
    aplicandoMasivo.value = false;
    modalMasivo.value = false;
    valorMasivo.value = null;
    if (fallidas > 0) {
      alert(`⚠️ ${fallidas} prenda(s) no se pudieron guardar. Revisa la lista.`);
      await cargar();
    }
  }
};

onMounted(cargar);
</script>

<template>
  <div class="p-4 md:p-8 max-w-[1400px] mx-auto min-h-screen bg-gray-50/50">

    <header class="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">Lista de Precios</h1>
        <p class="text-xs md:text-sm text-gray-500 font-medium mt-1">
          Precio minorista y mayorista por prenda. El punto de venta usa el que elija la caja.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="modalMasivo = true"
          class="border border-gray-300 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-50"
        >
          ⚡ Carga masiva
        </button>
        <button
          @click="cargar"
          :disabled="cargando"
          class="bg-gray-900 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-800 disabled:opacity-50"
        >
          {{ cargando ? 'Cargando...' : '↻ Actualizar' }}
        </button>
      </div>
    </header>

    <!-- Aviso: prendas que se venderían en cero -->
    <div v-if="sinPrecio > 0" class="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm font-bold text-amber-900">
        ⚠️ {{ sinPrecio }} prenda(s) no tienen ningún precio configurado. En caja saldrán en S/ 0.00 y habrá que escribirlo a mano.
      </p>
      <button @click="soloSinPrecio = true; busqueda = ''" class="text-[10px] font-black uppercase tracking-wider text-amber-800 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100">
        Ver cuáles
      </button>
    </div>

    <!-- Filtros -->
    <div class="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-3">
      <input
        v-model="busqueda"
        type="text"
        placeholder="🔎 Buscar por nombre, SKU o categoría..."
        class="flex-1 min-w-[220px] bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-500"
      />
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="soloSinPrecio" class="w-4 h-4 accent-blue-600" />
        <span class="text-xs font-bold text-gray-600">Solo prendas con precio incompleto</span>
      </label>
      <span class="text-[11px] font-black text-gray-400 uppercase tracking-wider ml-auto">
        {{ listadas.length }} de {{ prendas.length }}
      </span>
    </div>

    <!-- Tabla -->
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr class="text-[10px] font-black text-gray-500 uppercase tracking-wider">
              <th class="p-4 text-left">Prenda</th>
              <th class="p-4 text-left">Categoría</th>
              <th class="p-4 text-center min-w-[150px]">Minorista (público)</th>
              <th class="p-4 text-center min-w-[150px]">Mayorista (volumen)</th>
              <th class="p-4 text-center">Dif.</th>
              <th class="p-4 text-center">Guardar</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="cargando">
              <td colspan="6" class="p-10 text-center text-gray-400 font-bold">Cargando prendas...</td>
            </tr>
            <tr v-else-if="listadas.length === 0">
              <td colspan="6" class="p-10 text-center text-gray-400 font-bold">No hay prendas que coincidan con el filtro.</td>
            </tr>

            <tr v-for="p in listadas" :key="p.id" class="hover:bg-gray-50/70 transition-colors">
              <td class="p-4">
                <p class="font-black text-gray-800">{{ p.nombre }}</p>
                <p class="text-[10px] font-mono text-gray-400">{{ p.skuBase }}</p>
              </td>
              <td class="p-4 text-xs font-bold text-gray-500">{{ p.categoria || '—' }}</td>

              <td class="p-4">
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">S/</span>
                  <input
                    v-model.number="p.precioMinorista"
                    @keyup.enter="guardar(p)"
                    type="number" step="0.10" min="0"
                    class="w-full bg-gray-50 border border-gray-200 py-2.5 pl-8 pr-3 rounded-xl font-black text-gray-800 text-right outline-none focus:bg-white focus:border-blue-500"
                    :class="p.precioMinorista <= 0 ? 'border-amber-300 bg-amber-50/50' : ''"
                  />
                </div>
              </td>

              <td class="p-4">
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">S/</span>
                  <input
                    v-model.number="p.precioMayorista"
                    @keyup.enter="guardar(p)"
                    type="number" step="0.10" min="0"
                    class="w-full bg-gray-50 border border-gray-200 py-2.5 pl-8 pr-3 rounded-xl font-black text-gray-800 text-right outline-none focus:bg-white focus:border-blue-500"
                    :class="p.precioMayorista <= 0 ? 'border-amber-300 bg-amber-50/50' : ''"
                  />
                </div>
              </td>

              <td class="p-4 text-center">
                <span
                  v-if="diferencia(p) !== null"
                  class="text-[11px] font-black px-2 py-1 rounded"
                  :class="(diferencia(p) as number) > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'"
                  :title="(diferencia(p) as number) > 0 ? 'El mayorista está MÁS CARO que el minorista. ¿Están invertidos?' : 'Descuento del mayorista frente al minorista'"
                >
                  {{ (diferencia(p) as number) > 0 ? '+' : '' }}{{ (diferencia(p) as number).toFixed(0) }}%
                </span>
                <span v-else class="text-gray-300 text-xs font-bold">—</span>
              </td>

              <td class="p-4 text-center">
                <button
                  @click="guardar(p)"
                  :disabled="p._guardando"
                  class="px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all disabled:opacity-50"
                  :class="p._guardado ? 'bg-emerald-500 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'"
                >
                  {{ p._guardando ? '...' : p._guardado ? '✓ Listo' : 'Guardar' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-[11px] font-bold text-gray-400 mt-4">
      Presiona Enter dentro de un precio para guardar esa fila sin usar el mouse.
    </p>

    <!-- MODAL CARGA MASIVA -->
    <div v-if="modalMasivo" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
        <div>
          <h3 class="text-xl font-black text-gray-800">Carga masiva de precios</h3>
          <p class="text-xs text-gray-500 font-medium mt-1">
            Se aplica a las <strong>{{ listadas.length }}</strong> prenda(s) que están mostrándose ahora con el filtro actual.
          </p>
        </div>

        <div class="space-y-2">
          <button
            @click="modoMasivo = 'mayorista_pct'"
            :class="modoMasivo === 'mayorista_pct' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'"
            class="w-full text-left border-2 rounded-xl p-3 transition-all"
          >
            <p class="font-black text-gray-800 text-sm">Mayorista = minorista − X%</p>
            <p class="text-[11px] text-gray-500 font-medium">Calcula el mayorista como un descuento sobre el precio al público.</p>
          </button>
          <button
            @click="modoMasivo = 'fijo'"
            :class="modoMasivo === 'fijo' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'"
            class="w-full text-left border-2 rounded-xl p-3 transition-all"
          >
            <p class="font-black text-gray-800 text-sm">Minorista = precio fijo</p>
            <p class="text-[11px] text-gray-500 font-medium">Pone el mismo precio al público en todas las prendas filtradas.</p>
          </button>
        </div>

        <div>
          <label class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">
            {{ modoMasivo === 'mayorista_pct' ? 'Descuento (%)' : 'Precio (S/)' }}
          </label>
          <input
            v-model.number="valorMasivo"
            type="number" step="0.10" min="0"
            :placeholder="modoMasivo === 'mayorista_pct' ? 'Ej. 20' : 'Ej. 45.00'"
            class="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl font-black text-gray-800 text-lg outline-none focus:bg-white focus:border-blue-500"
          />
        </div>

        <div class="flex gap-2">
          <button
            @click="modalMasivo = false"
            class="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            @click="aplicarMasivo"
            :disabled="aplicandoMasivo"
            class="flex-1 bg-gray-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-800 disabled:opacity-50"
          >
            {{ aplicandoMasivo ? 'Aplicando...' : 'Aplicar' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
