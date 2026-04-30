import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../api/axios';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const usuario = ref(null);

  const estaAutenticado = computed(() => !!token.value);

  async function login(credentials: any) {
    try {
      // Llamamos a tu endpoint de NestJS
      const { data } = await api.post('/auth/login', credentials);
      
      token.value = data.access_token; // Ajusta según tu backend
      usuario.value = data.user;
      
      // Guardamos en el navegador para que no se cierre la sesión al pulsar F5
      localStorage.setItem('token', token.value);
      
      return true;
    } catch (error) {
      console.error('Error en el login:', error);
      throw error;
    }
  }

  function logout() {
    token.value = '';
    usuario.value = null;
    localStorage.removeItem('token');
  }

  return { token, usuario, estaAutenticado, login, logout };
});