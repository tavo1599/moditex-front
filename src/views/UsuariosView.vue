<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../api/axios';

const usuarios = ref<any[]>([]);
const cargando = ref(true);

// Modal crear/editar
const mostrarModal = ref(false);
const modoEdicion = ref(false);
const idEdicion = ref<number | null>(null);
const guardando = ref(false);

const form = ref({
  email: '',
  nombre: '',
  password: '',
  rol: 'VENDEDOR',
});

const cargarUsuarios = async () => {
  cargando.value = true;
  try {
    const res = await api.get('/usuarios');
    usuarios.value = res.data;
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
  } finally {
    cargando.value = false;
  }
};

const abrirNuevo = () => {
  modoEdicion.value = false;
  idEdicion.value = null;
  form.value = { email: '', nombre: '', password: '', rol: 'VENDEDOR' };
  mostrarModal.value = true;
};

const abrirEditar = (u: any) => {
  modoEdicion.value = true;
  idEdicion.value = u.id;
  // El email no se edita; la contraseña se deja vacía (solo se cambia si escriben una nueva)
  form.value = { email: u.email, nombre: u.nombre, password: '', rol: u.rol };
  mostrarModal.value = true;
};

const guardar = async () => {
  if (!form.value.nombre) return alert('El nombre es obligatorio.');
  if (!modoEdicion.value && (!form.value.email || !form.value.password)) {
    return alert('Email y contraseña son obligatorios para un usuario nuevo.');
  }
  guardando.value = true;
  try {
    if (modoEdicion.value && idEdicion.value) {
      await api.put(`/usuarios/${idEdicion.value}`, {
        nombre: form.value.nombre,
        rol: form.value.rol,
        password: form.value.password, // si va vacío, el backend no la cambia
      });
    } else {
      await api.post('/usuarios', form.value);
    }
    mostrarModal.value = false;
    cargarUsuarios();
  } catch (error: any) {
    alert('❌ ' + (error.response?.data?.message || 'Error al guardar el usuario.'));
  } finally {
    guardando.value = false;
  }
};

const eliminar = async (u: any) => {
  if (!confirm(`¿Eliminar al usuario "${u.nombre}" (${u.email})?`)) return;
  try {
    await api.delete(`/usuarios/${u.id}`);
    cargarUsuarios();
  } catch (error: any) {
    alert('❌ ' + (error.response?.data?.message || 'No se pudo eliminar el usuario.'));
  }
};

onMounted(() => cargarUsuarios());
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Gestión de Usuarios</h2>
        <p class="text-gray-500 mt-1">Crea cuentas y asigna roles (Admin o Vendedor).</p>
      </div>
      <button @click="abrirNuevo" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all whitespace-nowrap">
        + Nuevo Usuario
      </button>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500 font-medium">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
      <p>Cargando usuarios...</p>
    </div>

    <div v-else class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-800 text-white font-bold uppercase text-[10px] tracking-wider">
          <tr>
            <th class="p-4">Nombre</th>
            <th class="p-4">Email</th>
            <th class="p-4 text-center">Rol</th>
            <th class="p-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="usuarios.length === 0">
            <td colspan="4" class="p-8 text-center text-gray-400 font-bold">No hay usuarios registrados.</td>
          </tr>
          <tr v-for="u in usuarios" :key="u.id" class="hover:bg-blue-50/50 transition-colors even:bg-slate-50">
            <td class="p-4 font-medium text-gray-800">{{ u.nombre }}</td>
            <td class="p-4 text-gray-600">{{ u.email }}</td>
            <td class="p-4 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold"
                :class="u.rol === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'">
                {{ u.rol }}
              </span>
            </td>
            <td class="p-4 text-center">
              <div class="flex justify-center gap-2">
                <button @click="abrirEditar(u)" class="text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1.5 rounded-lg font-bold text-xs transition">✏️ Editar</button>
                <button @click="eliminar(u)" class="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg font-bold text-xs transition">🗑️</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="mostrarModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
        <div class="bg-gray-900 p-5 flex justify-between items-center text-white">
          <h3 class="text-lg font-bold">{{ modoEdicion ? '✏️ Editar Usuario' : '➕ Nuevo Usuario' }}</h3>
          <button @click="mostrarModal = false" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div class="p-6 space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre</label>
            <input type="text" v-model="form.nombre" placeholder="Ej. Juan Pérez" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
            <input type="email" v-model="form.email" :disabled="modoEdicion" placeholder="correo@moditex.com" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:text-gray-400">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">
              {{ modoEdicion ? 'Nueva Contraseña (dejar vacío para no cambiar)' : 'Contraseña' }}
            </label>
            <input type="text" v-model="form.password" :placeholder="modoEdicion ? '••••••••' : 'Mínimo 6 caracteres'" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Rol</label>
            <select v-model="form.rol" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-bold">
              <option value="VENDEDOR">Vendedor (Punto de Venta y Almacén)</option>
              <option value="ADMIN">Admin (Acceso total)</option>
            </select>
          </div>
        </div>

        <div class="bg-gray-50 p-4 border-t border-gray-100 flex justify-end gap-3">
          <button @click="mostrarModal = false" class="px-5 py-2.5 rounded-lg font-bold text-gray-600 hover:bg-gray-200 transition">Cancelar</button>
          <button @click="guardar" :disabled="guardando" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition disabled:opacity-50">
            {{ guardando ? 'Guardando...' : (modoEdicion ? 'Actualizar' : 'Crear Usuario') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
