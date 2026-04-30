import axios from 'axios';

// Creamos la instancia base
const api = axios.create({
  baseURL: 'http://localhost:3000', // La ruta de tu backend
});

// EL INTERCEPTOR: Se ejecuta automáticamente antes de cada envío
api.interceptors.request.use((config) => {
  // Buscamos el token donde lo guardaste al hacer Login (suele llamarse 'token' o 'jwt')
  const token = localStorage.getItem('token'); 
  
  // Si hay token, se lo pegamos en la cabecera de seguridad
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;