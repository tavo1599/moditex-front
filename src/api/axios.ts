import axios from 'axios';

// Creamos la instancia base
const api = axios.create({
  baseURL: 'http://192.168.100.252:3000', // La ruta de tu backend
});

// 1. EL INTERCEPTOR DE PETICIÓN (Lo que ya tenías)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token'); 
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

// 2. EL INTERCEPTOR DE RESPUESTA (Lo que te faltaba)
api.interceptors.response.use(
  (response) => response, // Si todo sale bien, deja pasar la respuesta
  (error) => {
    // Si el backend responde con un 401 (Token vencido o inválido)
    if (error.response && error.response.status === 401) {
      
      // Borramos el token inservible
      localStorage.removeItem('token');
      
      // Lo mandamos de una patada al Login
      window.location.replace('/login'); 
    }
    return Promise.reject(error);
  }
);

export default api;