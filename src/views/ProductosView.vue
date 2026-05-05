<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios';

// El molde exacto de tu tabla Producto en Prisma
interface Producto {
  id?: number;
  skuBase: string; // Ej: JEAN-SLIM-001
  nombre: string;  // Ej: Pantalón Denim Slim Fit
  categoria: string; // Ej: Pantalones, Casacas, Polos
}

const productos = ref<Producto[]>([]);
const cargando = ref(true);
const mostrarModal = ref(false);

// ESTADOS PARA EDICIÓN
const modoEdicion = ref(false);
const idEdicion = ref<number | null>(null);

const formBase: Producto = { skuBase: '', nombre: '', categoria: 'Pantalones' };
const formulario = ref<Producto>({ ...formBase });

const cargarProductos = async () => {
  cargando.value = true;
  try {
    const respuesta = await api.get('/productos'); 
    productos.value = respuesta.data;
  } catch (error) {
    console.error("Error al cargar productos:", error);
  } finally {
    cargando.value = false;
  }
};

const guardarProducto = async () => {
  try {
    if (modoEdicion.value && idEdicion.value) {
      // MODO ACTUALIZAR
      await api.put(`/productos/${idEdicion.value}`, formulario.value);
    } else {
      // MODO CREAR
      await api.post('/productos', formulario.value);
    }
    cerrarModal();
    cargarProductos();
  } catch (error) {
    alert("Asegúrate de que el SKU no esté repetido.");
  }
};

const abrirEditar = (item: Producto) => {
  modoEdicion.value = true;
  idEdicion.value = item.id || null;
  formulario.value = { ...item }; // Copiamos los datos del producto al formulario
  mostrarModal.value = true;
};

const eliminarProducto = async (id: number) => {
  const confirmacion = confirm("¿Estás seguro de eliminar este producto?");
  if (!confirmacion) return;
  
  try {
    await api.delete(`/productos/${id}`);
    await cargarProductos(); // Vuelves a cargar la tabla
    alert("Producto eliminado con éxito");
  } catch (error: any) {
    alert("❌ No se puede eliminar. Es probable que este producto ya tenga stock en el almacén o esté en una orden de producción.");
  }
};

const abrirModal = () => {
  modoEdicion.value = false;
  idEdicion.value = null;
  formulario.value = { ...formBase };
  mostrarModal.value = true;
};

const cerrarModal = () => {
  mostrarModal.value = false;
};

onMounted(() => {
  cargarProductos();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Catálogo de Modelos</h2>
        <p class="text-gray-500 mt-1">Registra las prendas base que fabricará MODITEX.</p>
      </div>
      <button @click="abrirModal" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors">
        + Nuevo Modelo
      </button>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-gray-800 text-white text-sm">
            <th class="p-4 font-medium w-32">SKU Base</th>
            <th class="p-4 font-medium">Nombre del Modelo</th>
            <th class="p-4 font-medium">Categoría</th>
            <th class="p-4 font-medium text-center w-24">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="cargando">
            <td colspan="4" class="p-8 text-center text-gray-400">Consultando catálogo...</td>
          </tr>
          <tr v-else-if="productos.length === 0">
            <td colspan="4" class="p-8 text-center text-gray-500">Aún no tienes modelos. Crea el primero.</td>
          </tr>
          <tr v-else v-for="item in productos" :key="item.id" class="hover:bg-gray-50 transition-colors">
            <td class="p-4 text-sm font-mono font-bold text-gray-900">{{ item.skuBase }}</td>
            <td class="p-4 text-sm font-medium text-blue-700">{{ item.nombre }}</td>
            <td class="p-4 text-sm text-gray-500">
              <span class="px-2 py-1 rounded bg-gray-100">{{ item.categoria }}</span>
            </td>
            <td class="p-4 text-center">
              <div class="flex justify-center gap-2">
                <button @click="abrirEditar(item)" class="text-gray-400 hover:text-blue-600 transition text-lg" title="Editar">✏️</button>
                <button @click="item.id && eliminarProducto(item.id)" class="text-gray-400 hover:text-red-600 transition text-lg" title="Eliminar">🗑️</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="mostrarModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
        <div class="bg-gray-900 p-4 flex justify-between items-center text-white">
          <h3 class="font-bold text-lg">{{ modoEdicion ? 'Editar Modelo' : 'Crear Nuevo Modelo' }}</h3>
          <button @click="cerrarModal" class="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
        <form @submit.prevent="guardarProducto" class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">SKU (Código Base)</label>
            <input v-model="formulario.skuBase" type="text" required placeholder="Ej. PANT-DEN-001" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 uppercase font-mono text-sm">
            <p class="text-xs text-gray-400 mt-1">Debe ser único en todo el sistema.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
            <input v-model="formulario.nombre" type="text" required placeholder="Ej. Pantalón Denim Cargo" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select v-model="formulario.categoria" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option>Pantalones</option>
              <option>Casacas</option>
              <option>Polos</option>
              <option>Vestidos</option>
              <option>Poleras</option>
              <option>Conjuntos</option>
              <option>Camisas</option>
              <option>Accesorios</option>
            </select>
          </div>
          <div class="flex justify-end gap-3 pt-6 mt-2 border-t border-gray-100">
            <button type="button" @click="cerrarModal" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition font-medium">Cancelar</button>
            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold shadow-md transition">
              {{ modoEdicion ? '💾 Actualizar Modelo' : '💾 Guardar Modelo' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>