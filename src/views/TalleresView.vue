<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios';

interface Taller {
  id?: number;
  razonSocial: string;
  tipo: string; // 'Taller Confeccion', 'Lavanderia', 'Ojal y Boton', etc.
  telefono: string;
}

const talleres = ref<Taller[]>([]);
const mostrarModal = ref(false);

// ESTADOS PARA EDICIÓN
const modoEdicion = ref(false);
const idEdicion = ref<number | null>(null);

const formBase: Taller = { razonSocial: '', tipo: 'Taller Confeccion', telefono: '' };
const formulario = ref<Taller>({ ...formBase });

const cargarTalleres = async () => {
  try {
    const res = await api.get('/talleres');
    talleres.value = res.data;
  } catch (err) {
    console.error("Error al cargar talleres:", err);
  }
};

const guardarTaller = async () => {
  try {
    if (modoEdicion.value && idEdicion.value) {
      // MODO ACTUALIZAR
      await api.put(`/talleres/${idEdicion.value}`, formulario.value);
    } else {
      // MODO CREAR
      await api.post('/talleres', formulario.value);
    }
    cerrarModal();
    cargarTalleres();
  } catch (err) {
    alert("Error al guardar el taller. Revisa tu conexión.");
  }
};

const abrirEditar = (taller: Taller) => {
  modoEdicion.value = true;
  idEdicion.value = taller.id || null;
  formulario.value = { ...taller }; // Copiamos los datos al formulario
  mostrarModal.value = true;
};

const eliminarTaller = async (id: number) => {
  const confirmacion = confirm("¿Estás seguro de eliminar este taller o servicio?");
  if (!confirmacion) return;
  
  try {
    await api.delete(`/talleres/${id}`);
    await cargarTalleres();
  } catch (error: any) {
    alert("❌ No se puede eliminar. Es probable que este taller tenga órdenes de producción (Rutas) o pagos pendientes asignados.");
  }
};

const abrirModalNuevo = () => {
  modoEdicion.value = false;
  idEdicion.value = null;
  formulario.value = { ...formBase };
  mostrarModal.value = true;
};

const cerrarModal = () => {
  mostrarModal.value = false;
};

onMounted(cargarTalleres);
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Directorio de Talleres y Servicios</h2>
        <p class="text-gray-500 mt-1">Registra los talleres externos de confección, ojal, lavandería y serigrafía.</p>
      </div>
      <button @click="abrirModalNuevo" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-colors">
        + Registrar Nuevo Taller
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      
      <div v-if="talleres.length === 0" class="col-span-full text-center py-10 text-gray-400 font-bold bg-white rounded-xl shadow-sm border border-gray-100">
        Aún no hay talleres registrados en el directorio.
      </div>

      <div v-for="taller in talleres" :key="taller.id" class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-t-4 border-t-indigo-500 hover:shadow-md transition-shadow">
        <div class="flex justify-between items-start">
          <div>
            <h3 class="text-lg font-bold text-gray-800">{{ taller.razonSocial }}</h3>
            <span class="inline-block mt-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-md uppercase">
              {{ taller.tipo }}
            </span>
          </div>
          <span class="text-2xl">🧵</span>
        </div>
        <div class="mt-4 pt-4 border-t border-gray-50 text-sm text-gray-600 space-y-2">
          <p><strong>📞 Teléfono:</strong> {{ taller.telefono || 'No registrado' }}</p>
        </div>
        <div class="mt-4 flex gap-2">
          <button @click="abrirEditar(taller)" class="flex-1 text-sm bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 py-2 rounded-lg font-bold transition">
            ✏️ Editar
          </button>
          <button @click="taller.id && eliminarTaller(taller.id)" class="flex-1 text-sm bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 py-2 rounded-lg font-bold transition">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    </div>

    <div v-if="mostrarModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
        <div class="bg-gray-900 p-4 text-white font-bold text-center flex justify-between items-center">
          <span>{{ modoEdicion ? '✏️ Editar Taller / Servicio' : '➕ Registrar Nuevo Taller' }}</span>
          <button @click="cerrarModal" class="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
        <form @submit.prevent="guardarTaller" class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">Nombre o Razón Social</label>
            <input v-model="formulario.razonSocial" type="text" required placeholder="Ej: Confecciones El Sol" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">Especialidad (Servicio)</label>
            <select v-model="formulario.tipo" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium">
              <option>Taller Confeccion</option>
              <option>Lavanderia</option>
              <option>Corte</option>
              <option>Ojal y Boton</option>
              <option>Serigrafia</option>
              <option>Limpieza / Acabados</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">Teléfono de Contacto</label>
            <input v-model="formulario.telefono" type="text" placeholder="Ej: 999 888 777" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
          <div class="flex gap-3 pt-4 border-t border-gray-100">
            <button type="button" @click="cerrarModal" class="flex-1 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition">Cancelar</button>
            <button type="submit" class="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition">
              {{ modoEdicion ? 'Actualizar' : 'Guardar Taller' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>