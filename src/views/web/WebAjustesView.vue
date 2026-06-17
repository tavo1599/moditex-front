<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api/axios';

import { imagenUrl } from '../../utils/imagen';

// ===== CONFIG (whatsapp / contacto) =====
const config = ref<any>({ whatsapp: '', instagram: '', facebook: '', email: '', direccion: '', horario: '', yape: '', plin: '', cuentaBanco: '', titularCuenta: '', razonSocial: '', ruc: '', logo: '' });
const guardandoConfig = ref(false);
const okConfig = ref(false);
const subiendoLogo = ref(false);

const cargarConfig = async () => {
  const c = (await api.get('/web/config')).data;
  config.value = {
    whatsapp: c.whatsapp || '', instagram: c.instagram || '', facebook: c.facebook || '',
    email: c.email || '', direccion: c.direccion || '', horario: c.horario || '',
    yape: c.yape || '', plin: c.plin || '', cuentaBanco: c.cuentaBanco || '', titularCuenta: c.titularCuenta || '',
    razonSocial: c.razonSocial || '', ruc: c.ruc || '', logo: c.logo || '',
  };
};

const subirLogo = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  subiendoLogo.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post('/web/logo', fd);
    config.value.logo = res.data.url;
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al subir el logo.'));
  } finally {
    subiendoLogo.value = false;
  }
};
const guardarConfig = async () => {
  guardandoConfig.value = true;
  try { await api.put('/web/config', config.value); okConfig.value = true; setTimeout(() => (okConfig.value = false), 2000); }
  catch (e: any) { alert('❌ ' + (e.response?.data?.message || 'Error')); }
  finally { guardandoConfig.value = false; }
};

// ===== BANNER PROMOCIONAL =====
const banners = ref<any[]>([]);
const form = ref<{ file: File | null; titulo: string; subtitulo: string; textoBoton: string; enlace: string }>({ file: null, titulo: '', subtitulo: '', textoBoton: '', enlace: '' });
const subiendo = ref(false);

const cargarBanners = async () => { banners.value = (await api.get('/web/banner')).data; };
const onFile = (e: Event) => { form.value.file = (e.target as HTMLInputElement).files?.[0] || null; };
const subirBanner = async () => {
  if (!form.value.file) return alert('Selecciona una imagen.');
  subiendo.value = true;
  try {
    const fd = new FormData();
    fd.append('file', form.value.file);
    fd.append('titulo', form.value.titulo);
    fd.append('subtitulo', form.value.subtitulo);
    fd.append('textoBoton', form.value.textoBoton);
    fd.append('enlace', form.value.enlace);
    await api.post('/web/banner', fd);
    form.value = { file: null, titulo: '', subtitulo: '', textoBoton: '', enlace: '' };
    await cargarBanners();
  } catch (e: any) { alert('❌ ' + (e.response?.data?.message || 'Error al subir.')); }
  finally { subiendo.value = false; }
};
const toggleBanner = async (b: any) => { b.activo = !b.activo; await api.put(`/web/banner/${b.id}`, { activo: b.activo }); };
const guardarBanner = async (b: any) => { await api.put(`/web/banner/${b.id}`, { titulo: b.titulo, subtitulo: b.subtitulo, textoBoton: b.textoBoton, enlace: b.enlace, orden: Number(b.orden) }); b._ok = true; setTimeout(() => (b._ok = false), 1500); };
const borrarBanner = async (b: any) => { if (!confirm('¿Eliminar banner?')) return; await api.delete(`/web/banner/${b.id}`); await cargarBanners(); };

onMounted(async () => { await Promise.all([cargarConfig(), cargarBanners()]); });
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">⚙️ Ajustes Web</h2>
      <p class="text-gray-500 mt-1">WhatsApp, contacto y banner promocional de la tienda.</p>
    </div>

    <!-- MARCA + DATOS LEGALES -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-700 mb-4">🏷️ Marca y datos legales</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Logo de la tienda</label>
          <div class="flex items-center gap-4">
            <div class="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border border-gray-200">
              <img v-if="config.logo" :src="imagenUrl(config.logo)" class="max-w-full max-h-full object-contain" />
              <span v-else class="text-[10px] text-gray-400 text-center px-2">Sin logo</span>
            </div>
            <div>
              <input type="file" accept="image/*" @change="subirLogo" class="text-xs">
              <p v-if="subiendoLogo" class="text-[11px] text-emerald-600 mt-1">Subiendo...</p>
              <p class="text-[10px] text-gray-400 mt-1">PNG con fondo transparente recomendado.</p>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4">
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Razón social</label>
            <input v-model="config.razonSocial" placeholder="Essential West S.A.C." class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">RUC</label>
            <input v-model="config.ruc" placeholder="20XXXXXXXXX" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
          </div>
        </div>
      </div>
    </div>

    <!-- CONFIG / WHATSAPP -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-700 mb-4">📱 Contacto y redes</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">WhatsApp (con código país, ej. 51987654321)</label>
          <input v-model="config.whatsapp" placeholder="51987654321" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
          <p class="text-[10px] text-gray-400 mt-1">Este número activa el botón flotante de WhatsApp en la tienda.</p>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Instagram (URL)</label>
          <input v-model="config.instagram" placeholder="https://instagram.com/moditex" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Facebook (URL)</label>
          <input v-model="config.facebook" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Email</label>
          <input v-model="config.email" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Dirección</label>
          <input v-model="config.direccion" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Horario</label>
          <input v-model="config.horario" placeholder="Lun-Sáb 9am-7pm" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
      </div>
      <h3 class="font-bold text-gray-700 mb-4 mt-8 pt-6 border-t border-gray-100">💳 Datos de pago (los ve el cliente al comprar)</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Número Yape</label>
          <input v-model="config.yape" placeholder="987654321" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Número Plin</label>
          <input v-model="config.plin" placeholder="987654321" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cuenta bancaria / CCI</label>
          <input v-model="config.cuentaBanco" placeholder="BCP 191-..., CCI 002-..." class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Titular de la cuenta</label>
          <input v-model="config.titularCuenta" placeholder="Nombre del titular" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
      </div>

      <button @click="guardarConfig" :disabled="guardandoConfig" class="mt-6 bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
        {{ guardandoConfig ? 'Guardando...' : (okConfig ? '✓ Guardado' : 'Guardar contacto y pago') }}
      </button>
    </div>

    <!-- BANNER PROMOCIONAL -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-bold text-gray-700 mb-4">🏷️ Banner promocional</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Imagen (horizontal grande)</label>
          <input type="file" accept="image/*" @change="onFile" class="w-full text-sm">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Título</label>
          <input v-model="form.titulo" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Subtítulo</label>
          <input v-model="form.subtitulo" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Texto del botón</label>
            <input v-model="form.textoBoton" placeholder="Comprar ahora" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Enlace</label>
            <input v-model="form.enlace" placeholder="/tienda" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-emerald-500">
          </div>
        </div>
      </div>
      <button @click="subirBanner" :disabled="subiendo" class="mt-4 bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
        {{ subiendo ? 'Subiendo...' : '+ Agregar banner' }}
      </button>

      <div v-if="banners.length" class="mt-6 space-y-4">
        <div v-for="b in banners" :key="b.id" class="border border-gray-100 rounded-xl overflow-hidden" :class="{ 'opacity-50': !b.activo }">
          <img :src="imagenUrl(b.url)" class="w-full h-40 object-cover">
          <div class="p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
            <input v-model="b.titulo" placeholder="Título" class="border border-gray-200 rounded-lg p-2 text-sm outline-none focus:border-emerald-500">
            <input v-model="b.subtitulo" placeholder="Subtítulo" class="border border-gray-200 rounded-lg p-2 text-sm outline-none focus:border-emerald-500">
            <input v-model="b.textoBoton" placeholder="Botón" class="border border-gray-200 rounded-lg p-2 text-sm outline-none focus:border-emerald-500">
            <input v-model="b.enlace" placeholder="Enlace" class="border border-gray-200 rounded-lg p-2 text-xs font-mono outline-none focus:border-emerald-500">
          </div>
          <div class="px-3 pb-3 flex gap-2">
            <button @click="guardarBanner(b)" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white">{{ b._ok ? '✓' : 'Guardar' }}</button>
            <button @click="toggleBanner(b)" class="text-xs font-bold px-3 py-1.5 rounded-lg" :class="b.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'">{{ b.activo ? 'Activo' : 'Oculto' }}</button>
            <button @click="borrarBanner(b)" class="text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg text-sm">🗑️</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
