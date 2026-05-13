<template>
  <div class="fixed inset-0 z-[200] bg-gray-900 flex flex-col overflow-hidden font-sans w-screen h-screen">
    
    <div v-if="!conectado" class="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-900 to-black text-white w-full h-full">
      
      <template v-if="!modoEscaneoQR">
        <div class="w-24 h-24 bg-blue-600/20 rounded-full flex items-center justify-center mb-6 border border-blue-500/30">
          <span class="text-5xl">📱</span>
        </div>
        <h2 class="text-3xl md:text-4xl font-black mb-2 tracking-tight text-center max-w-md mx-auto">Escáner POS</h2>
        <p class="text-gray-400 text-center mb-10 text-sm md:text-base max-w-md mx-auto">Escanea el QR de la caja principal o ingresa el PIN manualmente.</p>
        
        <div class="bg-gray-800/80 backdrop-blur-md p-8 rounded-[2rem] w-full max-w-sm border border-gray-700 shadow-2xl flex flex-col gap-4">
          
          <button 
            @click="prepararCamara('login')"
            class="w-full bg-gray-900 border border-blue-500/50 hover:bg-gray-800 text-blue-400 py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all"
          >
            <span class="text-2xl">📷</span> ESCANEAR QR
          </button>

          <div class="flex items-center gap-3 my-2">
            <div class="flex-1 h-px bg-gray-700"></div>
            <span class="text-xs text-gray-500 font-bold uppercase tracking-widest">O usa el PIN</span>
            <div class="flex-1 h-px bg-gray-700"></div>
          </div>

          <div class="relative">
             <span class="absolute left-0 top-1/2 -translate-y-1/2 text-gray-600 text-4xl font-mono tracking-wider ml-1 pl-2">🔒</span>
             <input 
                type="number" 
                v-model="pin" 
                placeholder="0000" 
                class="w-full text-center text-6xl tracking-[0.2em] font-mono font-black bg-transparent pl-20 py-2 outline-none text-white placeholder-gray-700 border-b-2 border-gray-600 focus:border-blue-500 transition-colors"
              >
          </div>
          <button 
            @click="conectar" 
            :disabled="pin.length < 4 || intentandoConexion"
            class="w-full bg-blue-600 disabled:bg-gray-700 text-white py-4 mt-2 rounded-xl font-black text-lg shadow-lg shadow-blue-900/50 hover:bg-blue-500 active:scale-95 transition-all"
          >
            {{ intentandoConexion ? 'CONECTANDO...' : 'VINCULAR' }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="w-full max-w-sm flex flex-col items-center">
          <h3 class="text-xl font-black text-white mb-4">Apunta al QR de la pantalla</h3>
          
          <select v-if="camarasDisponibles.length > 0" v-model="camaraSeleccionada" @change="reiniciarCamara('login')" class="mb-4 bg-gray-800 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
            <option v-for="cam in camarasDisponibles" :key="cam.id" :value="cam.id">
              {{ cam.label || 'Cámara ' + cam.id.substring(0,5) }}
            </option>
          </select>

          <div class="w-full h-80 bg-black rounded-3xl overflow-hidden border-4 border-blue-500/50 relative shadow-2xl shadow-blue-900/20">
            <div id="lector-qr-login" class="w-full h-full absolute inset-0"></div>
          </div>
          <button 
            @click="cerrarCamaraVinculacion" 
            class="mt-8 text-gray-400 hover:text-white underline font-bold"
          >
            Cancelar y usar PIN
          </button>
        </div>
      </template>

    </div>

    <div v-else class="flex-1 flex flex-col md:flex-row relative h-full w-full">
      <div class="absolute top-0 left-0 w-full p-4 z-50 flex flex-col items-center gap-4 md:items-start md:flex-row md:justify-between pointer-events-none">
        <div class="bg-black/60 backdrop-blur-md px-4 py-2.5 rounded-full border border-gray-700 flex items-center gap-3 shadow-lg pointer-events-auto">
          <span :class="socketActivo ? 'bg-green-500' : 'bg-red-500'" class="w-3 h-3 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
          <span class="font-bold text-xs md:text-sm text-white">{{ socketActivo ? 'Caja Conectada' : 'Reconectando...' }}</span>
        </div>
        
        <div class="flex gap-2 pointer-events-auto">
          <select v-if="camarasDisponibles.length > 0" v-model="camaraSeleccionada" @change="reiniciarCamara('productos')" class="bg-gray-800/80 backdrop-blur-md border border-gray-600 text-white text-xs rounded-full focus:ring-blue-500 focus:border-blue-500 block p-2 px-4 shadow-lg">
            <option v-for="cam in camarasDisponibles" :key="cam.id" :value="cam.id">
              Lente: {{ cam.label || cam.id.substring(0,5) }}
            </option>
          </select>

          <button @click="desconectarManual" class="bg-red-500/90 backdrop-blur-md text-white p-3 rounded-full shadow-lg border border-red-400/50 hover:bg-red-600 active:scale-90 transition-all flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            <span class="font-bold text-sm hidden md:inline pr-1">Desconectar</span>
          </button>
        </div>
      </div>

      <div class="h-[50vh] md:h-full w-full md:w-7/12 lg:w-2/3 bg-black relative flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
        <div id="lector-qr" class="w-full h-full absolute inset-0"></div>
        <div class="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
          <div class="w-72 h-56 md:w-96 md:h-72 border-2 border-white/5 relative transition-all rounded-lg glow-green shadow-[0_0_20px_rgba(34,197,94,0.1)]">
            <div class="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
            <div class="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
            <div class="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
            <div class="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>
          </div>
        </div>
        <div v-if="ultimoCodigo" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500/95 backdrop-blur-md text-white px-8 py-4 rounded-full font-black text-xl z-50 shadow-2xl flex items-center gap-3 animate-[zoomIn_0.2s_ease-out]">
          <span class="text-3xl">✅</span> ¡Escaneado!
        </div>
      </div>

      <div class="flex-1 w-full md:w-5/12 lg:w-1/3 bg-white flex flex-col relative z-20 rounded-t-[2rem] md:rounded-t-none md:rounded-l-[2rem] -mt-8 md:mt-0 shadow-[0_-15px_30px_rgba(0,0,0,0.5)] md:shadow-[-15px_0_30px_rgba(0,0,0,0.5)] overflow-hidden">
        <div class="w-14 h-1.5 bg-gray-300 rounded-full mx-auto mt-4 mb-2 md:hidden"></div>
        <div class="px-6 md:px-8 py-4 flex justify-between items-center border-b border-gray-200 shrink-0">
          <div>
            <h3 class="font-black text-gray-800 text-xl">Carrito Sincronizado</h3>
            <p class="text-[10px] uppercase tracking-widest text-gray-400 font-bold mt-1">Reflejo de la PC</p>
          </div>
          <span class="bg-blue-100 border border-blue-200 text-blue-800 text-sm font-black px-3 py-1.5 rounded-lg shadow-sm">
            {{ carritoLaptop.length }} ítems
          </span>
        </div>

        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-gray-100/30">
          <div v-if="carritoLaptop.length === 0" class="h-full flex flex-col items-center justify-center text-gray-400">
            <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 border border-dashed border-gray-300">
              <span class="text-4xl opacity-40">🛒</span>
            </div>
            <p class="text-base font-bold text-gray-500">Esperando productos</p>
          </div>
          
          <div v-else v-for="(item, index) in carritoLaptop" :key="index" class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-4 hover:shadow-md transition-all animate-[fadeIn_0.3s_ease-out]">
            <div class="flex-1 min-w-0">
              <p class="font-black text-gray-800 text-base truncate">{{ item.nombre }}</p>
              <div class="flex flex-wrap items-center gap-2 mt-1.5">
                <span class="text-[10px] font-mono font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md border border-gray-200 shadow-inner">{{ item.sku }}</span>
                <span class="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-md">Talla {{ item.talla }}</span>
              </div>
            </div>
            <div class="bg-gray-50 border border-gray-100 px-4 py-2 rounded-xl text-center shrink-0 shadow-inner">
              <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Cant.</p>
              <p class="font-black text-blue-600 text-xl leading-none mt-1">{{ item.cantidad }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white p-4 md:p-6 border-t border-gray-200 pb-safe shrink-0 shadow-[0_-10px_15px_rgba(0,0,0,0.03)]">
           <button @click="simularDisparo" class="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all text-sm md:text-base border border-gray-800">
            <span class="text-xl">🔫</span> SIMULAR ESCANEO MANUAL
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import { Html5Qrcode } from 'html5-qrcode';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const pin = ref('');
const conectado = ref(false);
const socketActivo = ref(false);
const intentandoConexion = ref(false);
const ultimoCodigo = ref('');
let socket: Socket;

let scannerLogin: Html5Qrcode | null = null;
let scannerProductos: Html5Qrcode | null = null;

const modoEscaneoQR = ref(false);
const carritoLaptop = ref<any[]>([]);

// 🔥 NUEVAS VARIABLES PARA CÁMARAS
const camarasDisponibles = ref<{id: string, label: string}[]>([]);
const camaraSeleccionada = ref('');

const IP_BACKEND = 'http://192.168.100.252:3000'; 

onMounted(() => {
  if (route.query.pin) {
    pin.value = String(route.query.pin);
    router.replace('/escaner');
    conectar();
    return;
  }
  const pinGuardado = localStorage.getItem('scanner_vinculado_pin');
  if (pinGuardado) {
    pin.value = pinGuardado;
    conectar(); 
  }
});

// ==========================================
// 🔥 LÓGICA DE DETECCIÓN Y CAMBIO DE CÁMARAS 
// ==========================================
const prepararCamara = async (tipo: 'login' | 'productos') => {
  if (tipo === 'login') modoEscaneoQR.value = true;

  // Si aún no tenemos la lista de cámaras, las pedimos al sistema
  if (camarasDisponibles.value.length === 0) {
    try {
      const devices = await Html5Qrcode.getCameras();
      
      if (devices && devices.length > 0) {
        camarasDisponibles.value = devices;
        
        // Extraemos la primera de forma segura sin usar [0]
        const [primeraCamara] = devices; 
        
        // Extraemos la última clonando el final del arreglo (evita errores de índice)
        const ultimaCamara = devices.slice(-1)[0]; 

        // Usamos el encadenamiento opcional (?.) para que TS no llore si algo es undefined
        camaraSeleccionada.value = ultimaCamara?.id || primeraCamara?.id || '';
      }
    } catch (err) {
      console.warn("No se pudieron obtener las cámaras específicas, usando por defecto.", err);
    }
  }

  // Lanzamos la cámara correspondiente
  if (tipo === 'login') abrirCamaraVinculacion();
  else iniciarCamaraProductos();
};

const reiniciarCamara = async (tipo: 'login' | 'productos') => {
  // Apagamos la cámara actual y la volvemos a encender con el nuevo ID
  if (tipo === 'login' && scannerLogin) {
    await scannerLogin.stop();
    abrirCamaraVinculacion();
  } else if (tipo === 'productos' && scannerProductos) {
    await scannerProductos.stop();
    iniciarCamaraProductos();
  }
};

// ==========================================
// INICIALIZACIÓN DE ESCÁNERES
// ==========================================
const abrirCamaraVinculacion = () => {
  setTimeout(() => {
    scannerLogin = new Html5Qrcode("lector-qr-login");
    
    // Si elegimos una cámara del select, usamos su ID. Si no, usamos la trasera por defecto.
    const config = camaraSeleccionada.value 
      ? { deviceId: { exact: camaraSeleccionada.value } } 
      : { facingMode: "environment" };

    scannerLogin.start(
      config,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        const urlParams = new URLSearchParams(decodedText.split('?')[1]);
        const pinEscaneado = urlParams.get('pin');
        if (pinEscaneado) {
          pin.value = pinEscaneado;
          cerrarCamaraVinculacion();
          conectar();
        } else if (decodedText.length === 4 && !isNaN(Number(decodedText))) {
          pin.value = decodedText;
          cerrarCamaraVinculacion();
          conectar();
        }
      },
      (error) => {} 
    ).catch(err => {
      console.warn("Error iniciando lente login:", err);
    });
  }, 300);
};

const iniciarCamaraProductos = () => {
  if (scannerProductos?.isScanning) return; 

  setTimeout(() => {
    scannerProductos = new Html5Qrcode("lector-qr");
    
    const config = camaraSeleccionada.value 
      ? { deviceId: { exact: camaraSeleccionada.value } } 
      : { facingMode: "environment" };

    scannerProductos.start(
      config,
      { fps: 15, qrbox: { width: 300, height: 200 } }, 
      (decodedText) => {
        if (socketActivo.value) {
          ultimoCodigo.value = decodedText;
          socket.emit('enviar-codigo', { pin: String(pin.value), codigo: decodedText });

          scannerProductos!.pause();
          setTimeout(() => scannerProductos!.resume(), 1000); 
          setTimeout(() => ultimoCodigo.value = '', 1000);
        }
      },
      (error) => {}
    ).catch(err => {
      console.warn("Error iniciando lente productos:", err);
    });
  }, 500);
};

const cerrarCamaraVinculacion = () => {
  if (scannerLogin && scannerLogin.isScanning) {
    scannerLogin.stop().catch(()=>{});
  }
  scannerLogin = null;
  modoEscaneoQR.value = false;
};

// ==========================================
// WEBSOCKETS Y DESCONEXIÓN
// ==========================================
const conectar = () => {
  intentandoConexion.value = true;
  socket = io(IP_BACKEND); 

  socket.on('connect', () => {
    socket.emit('unirse-sala', { pin: String(pin.value) });
    localStorage.setItem('scanner_vinculado_pin', String(pin.value));
    
    conectado.value = true;
    socketActivo.value = true;
    intentandoConexion.value = false;
    
    // 🔥 Iniciamos la cámara pidiendo permisos de lentes primero
    prepararCamara('productos');
  });

  socket.on('disconnect', () => socketActivo.value = false);
  socket.on('carrito-actualizado', (carritoSincronizado) => {
    carritoLaptop.value = carritoSincronizado;
    if (navigator.vibrate) navigator.vibrate(50);
  });
};

const simularDisparo = () => {
  if (!socketActivo.value) return alert("Espera a que recupere la conexión...");
  const codigoPrueba = 'PRD1-BCO-L';
  ultimoCodigo.value = codigoPrueba;
  socket.emit('enviar-codigo', { pin: String(pin.value), codigo: codigoPrueba });
  setTimeout(() => ultimoCodigo.value = '', 1000);
};

const desconectarManual = () => {
  if (socket) socket.emit('enviar-codigo', { pin: String(pin.value), codigo: 'DETACH_SCANNER' }); 
  localStorage.removeItem('scanner_vinculado_pin'); 
  
  if (scannerProductos && scannerProductos.isScanning) {
    scannerProductos.stop().catch(()=>{});
    scannerProductos = null;
  }
  if (socket) socket.disconnect();
  
  conectado.value = false;
  socketActivo.value = false;
  carritoLaptop.value = [];
  pin.value = '';
};

onUnmounted(() => {
  cerrarCamaraVinculacion();
  if (scannerProductos && scannerProductos.isScanning) {
    scannerProductos.stop().catch(()=>{});
  }
  if (socket) socket.disconnect();
});
</script>

<style>
/* Forzamos al contenedor base a ser negro y no tener márgenes/bordes de la librería */
#lector-qr, #lector-qr-login {
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  background: black !important;
}

#lector-qr *, #lector-qr-login * {
  box-shadow: none !important;
  border: none !important;
}

#lector-qr video, #lector-qr-login video {
  object-fit: cover !important; 
  width: 100% !important;
  height: 100% !important;
  min-width: 100%;
  min-height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

@keyframes zoomIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scan {
  0% { transform: translateY(-50px); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(50px); opacity: 0; }
}

.glow-green {
  border-color: rgba(34, 197, 94, 0.3) !important;
  box-shadow: 0 0 15px rgba(34, 197, 94, 0.1) !important;
}
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 1rem);
}
</style>