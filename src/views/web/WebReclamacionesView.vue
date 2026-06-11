<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../../api/axios';

const items = ref<any[]>([]);
const cargando = ref(true);
const filtro = ref('TODOS');

const cargar = async () => {
  cargando.value = true;
  try { items.value = (await api.get('/web/reclamaciones')).data; }
  catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const filtrados = computed(() =>
  filtro.value === 'TODOS' ? items.value : items.value.filter((r) => r.estado === filtro.value),
);

const guardar = async (r: any) => {
  await api.put(`/web/reclamaciones/${r.id}`, { respuesta: r.respuesta, estado: r.estado });
  r._ok = true; setTimeout(() => (r._ok = false), 1500);
};

onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">📕 Libro de Reclamaciones</h2>
        <p class="text-gray-500 mt-1">Reclamos y quejas de los clientes (Indecopi). Responde dentro del plazo de ley.</p>
      </div>
      <button @click="cargar" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-semibold text-sm">Actualizar</button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button v-for="e in ['TODOS','PENDIENTE','ATENDIDO']" :key="e" @click="filtro = e" class="px-4 py-2 rounded-lg text-xs font-bold uppercase" :class="filtro === e ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500'">{{ e }}</button>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500"><div class="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div></div>
    <div v-else-if="filtrados.length" class="space-y-4">
      <div v-for="r in filtrados" :key="r.id" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex flex-wrap justify-between items-start gap-3">
          <div>
            <div class="flex items-center gap-3">
              <span class="font-mono font-bold text-gray-800">{{ r.codigo }}</span>
              <span class="text-[10px] font-black px-2 py-0.5 rounded-full uppercase" :class="r.tipo === 'QUEJA' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'">{{ r.tipo }}</span>
              <span class="text-[10px] font-black px-2 py-0.5 rounded-full uppercase" :class="r.estado === 'ATENDIDO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'">{{ r.estado }}</span>
            </div>
            <p class="font-bold text-gray-800 mt-2">{{ r.nombre }} <span v-if="r.documento" class="text-gray-400 text-sm font-normal">· {{ r.documento }}</span></p>
            <p class="text-sm text-gray-500">{{ r.telefono }} <span v-if="r.email">· {{ r.email }}</span></p>
            <p v-if="r.pedidoCodigo" class="text-xs text-gray-500 mt-1">Pedido: {{ r.pedidoCodigo }} <span v-if="r.montoReclamado">· Monto: S/ {{ r.montoReclamado }}</span></p>
          </div>
          <p class="text-[10px] text-gray-400">{{ new Date(r.fecha).toLocaleString('es-PE') }}</p>
        </div>

        <div class="mt-3 bg-gray-50 rounded-lg p-3 text-sm space-y-1">
          <p v-if="r.descripcionBien"><span class="text-gray-400">Bien:</span> {{ r.descripcionBien }}</p>
          <p><span class="text-gray-400">Detalle:</span> {{ r.detalle }}</p>
          <p v-if="r.pedidoConsumidor"><span class="text-gray-400">Pedido del cliente:</span> {{ r.pedidoConsumidor }}</p>
        </div>

        <div class="mt-4">
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Respuesta de la empresa</label>
          <textarea v-model="r.respuesta" rows="2" class="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none focus:border-emerald-500"></textarea>
          <div class="flex gap-2 mt-2">
            <select v-model="r.estado" class="border border-gray-200 rounded-lg p-2 text-sm bg-white">
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="ATENDIDO">ATENDIDO</option>
            </select>
            <button @click="guardar(r)" class="text-xs font-bold px-4 py-2 rounded-lg bg-gray-900 text-white">{{ r._ok ? '✓ Guardado' : 'Guardar respuesta' }}</button>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="text-center text-gray-400 py-12">No hay reclamaciones {{ filtro !== 'TODOS' ? 'en estado ' + filtro : '' }}.</p>
  </div>
</template>
