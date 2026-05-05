import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../api/axios';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const usuario = ref(null);

  // Al ser "computed", es de solo lectura y reacciona automáticamente al token
  const estaAutenticado = computed(() => !!token.value);

  async function login(credentials: any) {
    try {
      const { data } = await api.post('/auth/login', credentials);
      
      token.value = data.access_token; 
      usuario.value = data.user;
      
      localStorage.setItem('token', token.value);
      
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
  }

  return { token, usuario, estaAutenticado, login, logout };
});