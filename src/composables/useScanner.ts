import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { io, Socket } from 'socket.io-client';

export function useScanner(onCodigoRecibido: () => void, codigoEscaneadoRef: { value: string }) {
  const pinConexion = ref('');
  const movilVinculado = ref(false);
  const mostrarVinculacion = ref(false); 
  let socket: Socket;

  const urlVinculacion = computed(() => {
    return `${window.location.origin}/escaner?pin=${pinConexion.value}`;
  });

  watch(movilVinculado, (nuevoEstado) => {
    if (nuevoEstado === true) {
      mostrarVinculacion.value = false;
    }
  });

  const emitirSincronizacion = (carritoActual: any[]) => {
    if (socket && movilVinculado.value) {
      socket.emit('sincronizar-carrito', { pin: pinConexion.value, carrito: carritoActual });
    }
  };

  onMounted(() => {
    const pinGuardado = localStorage.getItem('pos_scanner_pin');
    if (pinGuardado) {
      pinConexion.value = pinGuardado;
    } else {
      pinConexion.value = Math.floor(1000 + Math.random() * 9000).toString();
      localStorage.setItem('pos_scanner_pin', pinConexion.value);
    }

    const urlSocket = import.meta.env.VITE_API_URL 
      ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') 
      : 'https://sistema-textil-backend-production.up.railway.app';

    socket = io(urlSocket, {
      transports: ['websocket'],
      reconnectionAttempts: 5
    }); 

    socket.on('connect', () => {
      socket.emit('crear-sala', { pin: pinConexion.value });
    });

    socket.on('movil-conectado', () => { movilVinculado.value = true; });
    socket.on('movil-desconectado', () => { movilVinculado.value = false; });

    socket.on('codigo-recibido', (data) => {
      if(data.codigo === 'DETACH_SCANNER') {
         movilVinculado.value = false;
         return;
      }
      codigoEscaneadoRef.value = data.codigo; 
      onCodigoRecibido(); 
    });
  });

  onUnmounted(() => {
    if (socket) socket.disconnect();
  });

  return {
    pinConexion,
    movilVinculado,
    mostrarVinculacion,
    urlVinculacion,
    emitirSincronizacion
  };
}