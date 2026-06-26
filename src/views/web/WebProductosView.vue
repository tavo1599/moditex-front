<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../../api/axios';

import { imagenUrl } from '../../utils/imagen';

const productos = ref<any[]>([]);
const colores = ref<any[]>([]);
const cargando = ref(true);

const cargar = async () => {
  cargando.value = true;
  try {
    const [resP, resC] = await Promise.all([api.get('/productos'), api.get('/colores')]);
    productos.value = resP.data;
    colores.value = resC.data;
  } catch (e) {
    console.error('Error al cargar:', e);
  } finally {
    cargando.value = false;
  }
};

// Categorías existentes (para sugerir al crear)
const categoriasExistentes = computed(() =>
  [...new Set(productos.value.map((p) => p.categoria).filter(Boolean))],
);

// ===== CREAR PRODUCTO NUEVO DESDE LA WEB =====
const modalNuevo = ref(false);
const guardandoNuevo = ref(false);
const nuevo = ref({ nombre: '', skuBase: '', categoria: '', precioWeb: 0, descripcionWeb: '', publicadoWeb: true });

const abrirNuevo = () => {
  nuevo.value = { nombre: '', skuBase: '', categoria: '', precioWeb: 0, descripcionWeb: '', publicadoWeb: true };
  modalNuevo.value = true;
};

// Sugiere un SKU a partir del nombre (editable)
const sugerirSku = () => {
  if (nuevo.value.skuBase) return;
  const base = nuevo.value.nombre.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
  nuevo.value.skuBase = base ? `${base}-${Math.floor(100 + Math.random() * 900)}` : '';
};

const crearProducto = async () => {
  if (!nuevo.value.nombre) return alert('El nombre es obligatorio.');
  if (!nuevo.value.skuBase) sugerirSku();
  guardandoNuevo.value = true;
  try {
    await api.post('/productos', {
      skuBase: nuevo.value.skuBase,
      nombre: nuevo.value.nombre,
      categoria: nuevo.value.categoria || null,
      precioWeb: Number(nuevo.value.precioWeb) || 0,
      descripcionWeb: nuevo.value.descripcionWeb || null,
      publicadoWeb: nuevo.value.publicadoWeb,
    });
    modalNuevo.value = false;
    await cargar();
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'No se pudo crear el producto.'));
  } finally {
    guardandoNuevo.value = false;
  }
};

// Guardar publicar / precio / descripción
const guardarProducto = async (p: any) => {
  try {
    await api.put(`/productos/${p.id}`, {
      skuBase: p.skuBase,
      nombre: p.nombre,
      categoria: p.categoria,
      publicadoWeb: p.publicadoWeb,
      precioWeb: Number(p.precioWeb) || 0,
      descripcionWeb: p.descripcionWeb,
    });
    p._guardado = true;
    setTimeout(() => (p._guardado = false), 2000);
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'No se pudo guardar.'));
  }
};

// ===== GALERÍA DE FOTOS POR COLOR =====
const modalFotos = ref(false);
const prodActivo = ref<any>(null);
const galeria = ref<any[]>([]);
const coloresProducto = ref<any[]>([]); // solo los colores que la prenda tiene en almacén
const subiendo = ref(false);
const formFoto = ref<{ file: File | null; color: string; orden: number }>({ file: null, color: '', orden: 0 });

const abrirFotos = async (p: any) => {
  prodActivo.value = p;
  formFoto.value = { file: null, color: '', orden: 0 };
  modalFotos.value = true;
  await Promise.all([cargarGaleria(), cargarColoresProducto()]);
};

const cargarGaleria = async () => {
  const res = await api.get(`/archivos/producto/${prodActivo.value.id}/galeria`);
  galeria.value = res.data;
};

const cargarColoresProducto = async () => {
  const res = await api.get(`/archivos/producto/${prodActivo.value.id}/colores`);
  coloresProducto.value = res.data;
};

const onFile = (e: Event) => {
  const t = e.target as HTMLInputElement;
  formFoto.value.file = t.files?.[0] || null;
};

const subirFoto = async () => {
  if (!formFoto.value.file) return alert('Selecciona una imagen.');
  subiendo.value = true;
  try {
    const fd = new FormData();
    fd.append('file', formFoto.value.file);
    if (formFoto.value.color) fd.append('color', formFoto.value.color);
    fd.append('orden', String(formFoto.value.orden || 0));
    await api.post(`/archivos/producto/${prodActivo.value.id}/galeria`, fd);
    formFoto.value = { file: null, color: '', orden: 0 };
    await cargarGaleria();
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al subir.'));
  } finally {
    subiendo.value = false;
  }
};

const borrarFoto = async (img: any) => {
  if (!confirm('¿Eliminar esta foto?')) return;
  await api.delete(`/archivos/imagen/${img.id}`);
  await cargarGaleria();
};

onMounted(cargar);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">🛍️ Productos en la Web</h2>
        <p class="text-gray-500 mt-1">Controla qué prendas se muestran online, su precio y sus fotos por color.</p>
      </div>
      <button @click="abrirNuevo" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md whitespace-nowrap">
        + Nuevo producto
      </button>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
    </div>

    <div v-else class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-800 text-white font-bold uppercase text-[10px] tracking-wider">
          <tr>
            <th class="p-4">Producto</th>
            <th class="p-4 text-center">Mostrar en web</th>
            <th class="p-4">Precio web (S/)</th>
            <th class="p-4">Descripción web</th>
            <th class="p-4 text-center">Fotos</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="p in productos" :key="p.id" class="hover:bg-emerald-50/40 even:bg-slate-50">
            <td class="p-4">
              <p class="font-bold text-gray-800">{{ p.nombre }}</p>
              <p class="text-[11px] text-gray-400 font-mono">{{ p.skuBase }}</p>
            </td>
            <td class="p-4 text-center">
              <button
                @click="p.publicadoWeb = !p.publicadoWeb; guardarProducto(p)"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="p.publicadoWeb ? 'bg-emerald-500' : 'bg-gray-300'"
              >
                <span class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform" :class="p.publicadoWeb ? 'translate-x-5' : 'translate-x-1'"></span>
              </button>
            </td>
            <td class="p-4">
              <div class="flex items-center gap-2">
                <input v-model.number="p.precioWeb" type="number" step="0.10" class="w-28 border border-gray-300 rounded-lg p-2 text-right font-bold outline-none focus:border-emerald-500">
                <button @click="guardarProducto(p)" class="text-xs font-bold px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black">
                  {{ p._guardado ? '✓' : 'Guardar' }}
                </button>
              </div>
            </td>
            <td class="p-4">
              <input v-model="p.descripcionWeb" type="text" placeholder="Descripción corta..." class="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:border-emerald-500" @blur="guardarProducto(p)">
            </td>
            <td class="p-4 text-center">
              <button @click="abrirFotos(p)" class="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-bold text-xs border border-emerald-200">
                📷 Fotos
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- MODAL DE FOTOS -->
    <div v-if="modalFotos" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div class="bg-gray-900 p-5 flex justify-between items-center text-white">
          <div>
            <h3 class="text-lg font-bold">Fotos de {{ prodActivo?.nombre }}</h3>
            <p class="text-xs text-gray-400">Asigna fotos a cada color. La primera sin color es la portada.</p>
          </div>
          <button @click="modalFotos = false" class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6">
          <!-- Subir nueva -->
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div class="md:col-span-2">
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Imagen</label>
              <input type="file" accept="image/*" @change="onFile" class="w-full text-xs">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Color</label>
              <select v-model="formFoto.color" class="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white">
                <option value="">Portada (general)</option>
                <option v-for="c in coloresProducto" :key="c.valor" :value="c.valor">{{ c.nombre }}</option>
              </select>
              <p v-if="!coloresProducto.length" class="text-[10px] text-amber-600 mt-1">Esta prenda no tiene colores en almacén.</p>
            </div>
            <button @click="subirFoto" :disabled="subiendo" class="bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
              {{ subiendo ? 'Subiendo...' : 'Subir' }}
            </button>
          </div>

          <!-- Galería actual -->
          <div v-if="galeria.length" class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div v-for="img in galeria" :key="img.id" class="relative group border border-gray-200 rounded-lg overflow-hidden">
              <img :src="imagenUrl(img.url)" class="w-full aspect-[3/4] object-cover">
              <div class="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-2 py-0.5 rounded uppercase tracking-wider">
                {{ img.color || 'Portada' }}
              </div>
              <button @click="borrarFoto(img)" class="absolute top-1 right-1 bg-red-600 text-white w-6 h-6 rounded-full text-xs opacity-0 group-hover:opacity-100 transition">×</button>
            </div>
          </div>
          <p v-else class="text-center text-gray-400 text-sm py-8">Aún no hay fotos. Sube la primera arriba.</p>
        </div>
      </div>
    </div>

    <!-- MODAL NUEVO PRODUCTO -->
    <div v-if="modalNuevo" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div class="bg-gray-900 p-5 flex justify-between items-center text-white">
          <h3 class="text-lg font-bold">➕ Nuevo producto</h3>
          <button @click="modalNuevo = false" class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nombre de la prenda *</label>
            <input v-model="nuevo.nombre" @blur="sugerirSku" type="text" placeholder="Ej. Polo Box Oversize" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-emerald-500">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Código (SKU)</label>
              <input v-model="nuevo.skuBase" type="text" placeholder="Se sugiere solo" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-emerald-500 font-mono text-sm">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Categoría / Tipo</label>
              <input v-model="nuevo.categoria" list="cats" type="text" placeholder="Ej. Polos" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-emerald-500">
              <datalist id="cats">
                <option v-for="c in categoriasExistentes" :key="c" :value="c"></option>
              </datalist>
            </div>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Precio web (S/)</label>
            <input v-model.number="nuevo.precioWeb" type="number" step="0.10" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-emerald-500 text-right font-bold">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Descripción web</label>
            <input v-model="nuevo.descripcionWeb" type="text" placeholder="Descripción corta..." class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-emerald-500 text-sm">
          </div>
          <label class="flex items-center gap-3 cursor-pointer">
            <input v-model="nuevo.publicadoWeb" type="checkbox" class="w-5 h-5 accent-emerald-600">
            <span class="text-sm font-bold text-gray-700">Mostrar en la web al crear</span>
          </label>
          <p class="text-[11px] text-gray-400">Después podrás subirle fotos por color con el botón 📷.</p>
        </div>
        <div class="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
          <button @click="modalNuevo = false" class="px-5 py-2.5 rounded-lg font-bold text-gray-600 hover:bg-gray-200">Cancelar</button>
          <button @click="crearProducto" :disabled="guardandoNuevo" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-bold disabled:opacity-50">
            {{ guardandoNuevo ? 'Creando...' : 'Crear producto' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
