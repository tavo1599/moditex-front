<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api/axios';

const API = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';

const slides = ref<any[]>([]);
const cargando = ref(true);
const subiendo = ref(false);

const form = ref<{ file: File | null; titulo: string; subtitulo: string; enlace: string; orden: number }>({
  file: null, titulo: '', subtitulo: '', enlace: '', orden: 0,
});

const cargar = async () => {
  cargando.value = true;
  try {
    slides.value = (await api.get('/web/portada')).data;
  } catch (e) {
    console.error(e);
  } finally {
    cargando.value = false;
  }
};

const onFile = (e: Event) => {
  form.value.file = (e.target as HTMLInputElement).files?.[0] || null;
};

const subir = async () => {
  if (!form.value.file) return alert('Selecciona una imagen o video.');
  subiendo.value = true;
  try {
    const fd = new FormData();
    fd.append('file', form.value.file);
    fd.append('titulo', form.value.titulo);
    fd.append('subtitulo', form.value.subtitulo);
    fd.append('enlace', form.value.enlace);
    fd.append('orden', String(form.value.orden || 0));
    await api.post('/web/portada', fd);
    form.value = { file: null, titulo: '', subtitulo: '', enlace: '', orden: 0 };
    await cargar();
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al subir.'));
  } finally {
    subiendo.value = false;
  }
};

const toggleActivo = async (s: any) => {
  s.activo = !s.activo;
  await api.put(`/web/portada/${s.id}`, { activo: s.activo });
};

const guardarOrden = async (s: any) => {
  await api.put(`/web/portada/${s.id}`, { orden: Number(s.orden) || 0, titulo: s.titulo, subtitulo: s.subtitulo, enlace: s.enlace });
  s._ok = true; setTimeout(() => (s._ok = false), 1500);
};

const borrar = async (s: any) => {
  if (!confirm('¿Eliminar este slide?')) return;
  await api.delete(`/web/portada/${s.id}`);
  await cargar();
};

onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">🖼️ Portada / Carrusel</h2>
      <p class="text-gray-500 mt-1">Imágenes y videos grandes que aparecen al entrar a la tienda.</p>
    </div>

    <!-- Subir nuevo slide -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-700 mb-4">Agregar slide</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Imagen o Video</label>
          <input type="file" accept="image/*,video/*" @change="onFile" class="w-full text-sm">
          <p class="text-[10px] text-gray-400 mt-1">Recomendado: imagen horizontal grande (ej. 1920×1080) o video corto .mp4</p>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Título (opcional)</label>
          <input v-model="form.titulo" type="text" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Subtítulo (opcional)</label>
          <input v-model="form.subtitulo" type="text" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Enlace (opcional)</label>
            <input v-model="form.enlace" type="text" placeholder="/tienda?categoria=Polos" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Orden</label>
            <input v-model.number="form.orden" type="number" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-center outline-none focus:border-emerald-500">
          </div>
        </div>
      </div>
      <button @click="subir" :disabled="subiendo" class="mt-4 bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
        {{ subiendo ? 'Subiendo...' : '+ Agregar a la portada' }}
      </button>
    </div>

    <!-- Lista de slides -->
    <div v-if="cargando" class="text-center py-12 text-gray-500">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
    </div>
    <div v-else-if="slides.length" class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div v-for="s in slides" :key="s.id" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" :class="{ 'opacity-50': !s.activo }">
        <div class="aspect-video bg-gray-100 relative">
          <video v-if="s.tipo === 'video'" :src="`${API}${s.url}`" class="w-full h-full object-cover" muted loop autoplay playsinline></video>
          <img v-else :src="`${API}${s.url}`" class="w-full h-full object-cover">
          <span class="absolute top-2 left-2 bg-black/70 text-white text-[9px] px-2 py-0.5 rounded uppercase tracking-wider">{{ s.tipo }}</span>
        </div>
        <div class="p-4 space-y-3">
          <input v-model="s.titulo" placeholder="Título" class="w-full border border-gray-200 rounded-lg p-2 text-sm font-bold outline-none focus:border-emerald-500">
          <input v-model="s.subtitulo" placeholder="Subtítulo" class="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none focus:border-emerald-500">
          <input v-model="s.enlace" placeholder="Enlace (/tienda?...)" class="w-full border border-gray-200 rounded-lg p-2 text-xs font-mono outline-none focus:border-emerald-500">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <label class="text-[10px] font-bold text-gray-500 uppercase">Orden</label>
              <input v-model.number="s.orden" type="number" class="w-16 border border-gray-200 rounded-lg p-1.5 text-center text-sm outline-none focus:border-emerald-500">
              <button @click="guardarOrden(s)" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black">{{ s._ok ? '✓' : 'Guardar' }}</button>
            </div>
            <div class="flex items-center gap-2">
              <button @click="toggleActivo(s)" class="text-xs font-bold px-3 py-1.5 rounded-lg" :class="s.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'">
                {{ s.activo ? 'Activo' : 'Oculto' }}
              </button>
              <button @click="borrar(s)" class="text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg text-sm">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="text-center text-gray-400 py-12">Aún no hay slides. Agrega el primero arriba.</p>
  </div>
</template>
