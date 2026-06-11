<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api/axios';

const items = ref<any[]>([]);
const cargando = ref(true);
const nuevo = ref({ nombre: '', texto: '', estrellas: 5, orden: 0 });

const cargar = async () => {
  cargando.value = true;
  try { items.value = (await api.get('/web/resenas')).data; }
  catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const crear = async () => {
  if (!nuevo.value.nombre || !nuevo.value.texto) return alert('Nombre y reseña son obligatorios.');
  await api.post('/web/resenas', nuevo.value);
  nuevo.value = { nombre: '', texto: '', estrellas: 5, orden: 0 };
  await cargar();
};

const guardar = async (r: any) => {
  await api.put(`/web/resenas/${r.id}`, { nombre: r.nombre, texto: r.texto, estrellas: Number(r.estrellas), orden: Number(r.orden) });
  r._ok = true; setTimeout(() => (r._ok = false), 1500);
};

const toggle = async (r: any) => { r.activo = !r.activo; await api.put(`/web/resenas/${r.id}`, { activo: r.activo }); };
const borrar = async (r: any) => { if (!confirm('¿Eliminar reseña?')) return; await api.delete(`/web/resenas/${r.id}`); await cargar(); };

onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">⭐ Reseñas de clientes</h2>
      <p class="text-gray-500 mt-1">Opiniones que aparecen en la tienda. Tú las escribes y controlas.</p>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-700 mb-4">Nueva reseña</h3>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input v-model="nuevo.nombre" placeholder="Nombre del cliente" class="border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        <input v-model="nuevo.texto" placeholder="Reseña / opinión" class="md:col-span-2 border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        <div class="flex gap-2">
          <select v-model.number="nuevo.estrellas" class="border border-gray-300 rounded-lg p-2.5 text-sm bg-white">
            <option v-for="n in [5,4,3,2,1]" :key="n" :value="n">{{ '★'.repeat(n) }}</option>
          </select>
          <button @click="crear" class="bg-emerald-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-emerald-700">Agregar</button>
        </div>
      </div>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500"><div class="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div></div>
    <div v-else-if="items.length" class="space-y-3">
      <div v-for="r in items" :key="r.id" class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center" :class="{ 'opacity-50': !r.activo }">
        <input v-model="r.nombre" class="border border-gray-200 rounded-lg p-2 text-sm font-bold md:w-48 outline-none focus:border-emerald-500">
        <input v-model="r.texto" class="border border-gray-200 rounded-lg p-2 text-sm flex-1 outline-none focus:border-emerald-500">
        <select v-model.number="r.estrellas" class="border border-gray-200 rounded-lg p-2 text-sm bg-white">
          <option v-for="n in [5,4,3,2,1]" :key="n" :value="n">{{ '★'.repeat(n) }}</option>
        </select>
        <input v-model.number="r.orden" type="number" class="w-16 border border-gray-200 rounded-lg p-2 text-center text-sm outline-none focus:border-emerald-500">
        <button @click="guardar(r)" class="text-xs font-bold px-3 py-2 rounded-lg bg-gray-900 text-white">{{ r._ok ? '✓' : 'Guardar' }}</button>
        <button @click="toggle(r)" class="text-xs font-bold px-3 py-2 rounded-lg" :class="r.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'">{{ r.activo ? 'Activo' : 'Oculto' }}</button>
        <button @click="borrar(r)" class="text-red-500 hover:bg-red-50 px-2 py-2 rounded-lg">🗑️</button>
      </div>
    </div>
    <p v-else class="text-center text-gray-400 py-12">Aún no hay reseñas. Agrega la primera arriba.</p>
  </div>
</template>
