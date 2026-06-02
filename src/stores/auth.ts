import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../api/axios';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');

  // Recuperamos el usuario guardado (para que el rol sobreviva al refrescar la página)
  const usuarioGuardado = localStorage.getItem('usuario');
  const usuario = ref<any>(usuarioGuardado ? JSON.parse(usuarioGuardado) : null);

  // Al ser "computed", es de solo lectura y reacciona automáticamente al token
  const estaAutenticado = computed(() => !!token.value);

  // Helpers de rol para usar en sidebar, guards y vistas
  const rol = computed(() => usuario.value?.rol || '');
  const nombre = computed(() => usuario.value?.nombre || 'Usuario');
  const esAdmin = computed(() => rol.value === 'ADMIN');

  async function login(credentials: any) {
    try {
      const { data } = await api.post('/auth/login', credentials);

      token.value = data.access_token;
      // 🔥 FIX: el backend devuelve "usuario" (no "user"); por eso antes el rol nunca llegaba.
      usuario.value = data.usuario;

      localStorage.setItem('token', token.value);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));

      return true;
    } catch (error) {
      console.error('Error en el login:', error);
      throw error;
    }
  }

  // Esta es la función maestra que limpia todo de forma segura
  function logout() {
    token.value = '';
    usuario.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  }

  return { token, usuario, estaAutenticado, rol, nombre, esAdmin, login, logout };
});
