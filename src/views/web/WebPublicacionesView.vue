<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api/axios';

import { imagenUrl } from '../../utils/imagen';

const items = ref<any[]>([]);
const cargando = ref(true);
const subiendo = ref(false);

const form = ref<{ file: File | null; caption: string; enlace: string; orden: number }>({
  file: null, caption: '', enlace: '', orden: 0,
});

const cargar = async () => {
  cargando.value = true;
  try {
    items.value = (await api.get('/web/publicaciones')).data;
  } catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const onFile = (e: Event) => { form.value.file = (e.target as HTMLInputElement).files?.[0] || null; };

const subir = async () => {
  if (!form.value.file) return alert('Selecciona una foto o video.');
  subiendo.value = true;
  try {
    const fd = new FormData();
    fd.append('file', form.value.file);
    fd.append('caption', form.value.caption);
    fd.append('enlace', form.value.enlace);
    fd.append('orden', String(form.value.orden || 0));
    await api.post('/web/publicaciones', fd);
    form.value = { file: null, caption: '', enlace: '', orden: 0 };
    await cargar();
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al subir.'));
  } finally { subiendo.value = false; }
};

const toggleActivo = async (p: any) => {
  p.activo = !p.activo;
  await api.put(`/web/publicaciones/${p.id}`, { activo: p.activo });
};

const guardar = async (p: any) => {
  await api.put(`/web/publicaciones/${p.id}`, { caption: p.caption, enlace: p.enlace, orden: Number(p.orden) || 0 });
  p._ok = true; setTimeout(() => (p._ok = false), 1500);
};

const borrar = async (p: any) => {
  if (!confirm('¿Eliminar esta publicación?')) return;
  await api.delete(`/web/publicaciones/${p.id}`);
  await cargar();
};

onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">📸 Publicaciones</h2>
      <p class="text-gray-500 mt-1">Fotos y videos tipo Instagram que aparecen en la tienda. Tú controlas el contenido.</p>
    </div>

    <!-- Subir -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-700 mb-4">Nueva publicación</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Foto o Video</label>
          <input type="file" accept="image/*,video/*" @change="onFile" class="w-full text-sm">
          <p class="text-[10px] text-gray-400 mt-1">Vertical (9:16) se ve mejor, tipo reel.</p>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Texto / caption</label>
          <input v-model="form.caption" type="text" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Enlace a Instagram (opcional)</label>
          <input v-model="form.enlace" type="text" placeholder="https://instagram.com/p/..." class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500 font-mono">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Orden</label>
          <input v-model.number="form.orden" type="number" class="w-32 border border-gray-300 rounded-lg p-2.5 text-sm text-center outline-none focus:border-emerald-500">
        </div>
      </div>
      <button @click="subir" :disabled="subiendo" class="mt-4 bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
        {{ subiendo ? 'Subiendo...' : '+ Agregar publicación' }}
      </button>
    </div>

    <!-- Lista -->
    <div v-if="cargando" class="text-center py-12 text-gray-500">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
    </div>
    <div v-else-if="items.length" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      <div v-for="p in items" :key="p.id" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" :class="{ 'opacity-50': !p.activo }">
        <div class="aspect-[9/16] bg-gray-100 relative">
          <video v-if="p.tipo === 'video'" :src="imagenUrl(p.url)" class="w-full h-full object-cover" muted loop></video>
          <img v-else :src="imagenUrl(p.url)" class="w-full h-full object-cover">
          <span class="absolute top-2 left-2 bg-black/70 text-white text-[9px] px-2 py-0.5 rounded uppercase">{{ p.tipo }}</span>
        </div>
        <div class="p-3 space-y-2">
          <input v-model="p.caption" placeholder="Texto" class="w-full border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-emerald-500">
          <input v-model="p.enlace" placeholder="Enlace IG" class="w-full border border-gray-200 rounded-lg p-2 text-[11px] font-mono outline-none focus:border-emerald-500">
          <div class="flex items-center justify-between gap-1">
            <input v-model.number="p.orden" type="number" class="w-14 border border-gray-200 rounded-lg p-1.5 text-center text-xs outline-none focus:border-emerald-500">
            <button @click="guardar(p)" class="text-[11px] font-bold px-2 py-1.5 rounded-lg bg-gray-900 text-white">{{ p._ok ? '✓' : 'Guardar' }}</button>
            <button @click="toggleActivo(p)" class="text-[11px] font-bold px-2 py-1.5 rounded-lg" :class="p.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'">{{ p.activo ? 'Activo' : 'Oculto' }}</button>
            <button @click="borrar(p)" class="text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg text-sm">🗑️</button>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="text-center text-gray-400 py-12">Aún no hay publicaciones. Agrega la primera arriba.</p>
  </div>
</template>
