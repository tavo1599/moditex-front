<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import api from '../api/axios'; 
import { io, Socket } from 'socket.io-client';
import QrcodeVue from 'qrcode.vue'; 

// ==========================================
// 1. ESTADOS BASE Y CARGA DE DATOS
// ==========================================
const bodegas = ref<any[]>([]);
const inventarioTotal = ref<any[]>([]);
const colores = ref<any[]>([]); 
const cargando = ref(true);

const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resBodegas, resInv, resColores] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario'),
      api.get('/colores') 
    ]);
    bodegas.value = resBodegas.data.filter((b: any) => b.estado);
    inventarioTotal.value = resInv.data;
    colores.value = resColores.data;
  } catch (error) {
    console.error("Error al cargar datos:", error);
  } finally {
    cargando.value = false;
  }
};

// ==========================================
// 2. ESTADOS DE WEBSOCKETS (ESCÁNER MÓVIL)
// ==========================================
const pinConexion = ref('');
const movilVinculado = ref(false);
const mostrarVinculacion = ref(false); 
let socket: Socket;

// 🚀 CORRECCIÓN: Usamos la URL del Frontend actual (Vercel) para que el QR abra la página correcta
const urlVinculacion = computed(() => {
  // window.location.origin tomará "https://moditex.vercel.app" automáticamente
  return `${window.location.origin}/escaner?pin=${pinConexion.value}`;
});

// Cierra el acordeón del QR si el celular se conecta
watch(movilVinculado, (nuevoEstado) => {
  if (nuevoEstado === true) {
    mostrarVinculacion.value = false;
  }
});

// ==========================================
// 3. ESTADOS DEL PUNTO DE VENTA Y CARRITO
// ==========================================
const bodegaSeleccionada = ref<number | ''>('');
const codigoEscaneado = ref('');
const carrito = ref<any[]>([]);
const inputEscaner = ref<HTMLInputElement | null>(null);

// Mapeamos el inventario para poder buscar por SKU exacto
const inventarioConSKU = computed(() => {
  return inventarioTotal.value.map(item => {
    const colorObj = colores.value.find(c => c.codigo === item.color || c.nombre === item.color);
    const codigoColor = colorObj ? colorObj.codigo : String(item.color).substring(0, 3).toUpperCase();
    const idProd = item.productoId || item.producto?.id;
    return { ...item, skuCalculado: `PRD${idProd}-${codigoColor}-${item.talla}` };
  });
});

const totalPagar = computed(() => {
  return carrito.value.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0);
});

const procesarEscaneo = () => {
  if (!bodegaSeleccionada.value) {
    alert("Selecciona una bodega primero.");
    codigoEscaneado.value = '';
    return;
  }

  const sku = codigoEscaneado.value.trim().toUpperCase();
  if (!sku) return;

  const prenda = inventarioConSKU.value.find(
    i => i.skuCalculado === sku && Number(i.bodegaId) === Number(bodegaSeleccionada.value)
  );

  if (!prenda || prenda.stock <= 0) {
    alert(`El producto ${sku} no se encontró o no tiene stock en esta bodega.`);
    codigoEscaneado.value = '';
    return;
  }

  const itemEnCarrito = carrito.value.find(c => c.sku === sku);

  if (itemEnCarrito) {
    if (itemEnCarrito.cantidad + 1 > prenda.stock) {
      alert("No hay más stock disponible en almacén para esta variante.");
    } else {
      itemEnCarrito.cantidad++;
    }
  } else {
    carrito.value.unshift({
      sku: sku,
      productoId: prenda.productoId || prenda.producto?.id,
      nombre: prenda.producto?.nombre || 'Producto Genérico',
      color: prenda.color,
      talla: prenda.talla,
      cantidad: 1,
      stockMaximo: prenda.stock,
      precioUnitario: prenda.producto?.precioVenta || 0 
    });
  }
  
  codigoEscaneado.value = '';
  
  // Efecto de sonido (Bip)
  const beep = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  beep.volume = 0.3;
  beep.play().catch(() => {});

  // Avisamos al celular que el carrito cambió
  if (socket && movilVinculado.value) {
    socket.emit('sincronizar-carrito', { pin: pinConexion.value, carrito: carrito.value });
  }

  nextTick(() => inputEscaner.value?.focus());
};

const quitarDelCarrito = (index: number) => {
  carrito.value.splice(index, 1);
  if (socket && movilVinculado.value) {
    socket.emit('sincronizar-carrito', { pin: pinConexion.value, carrito: carrito.value });
  }
  nextTick(() => inputEscaner.value?.focus());
};

// ==========================================
// 4. LOGÍSTICA, COBRO Y TICKETS
// ==========================================
const clienteNombre = ref('');
const tipoVenta = ref('MINORISTA');
const metodoEntrega = ref('ENTREGA_INMEDIATA'); 
const destinoEnvio = ref('');
const modalTicket = ref(false);
const ventaRealizada = ref<any>(null);

const imprimirTicket = () => {
  const ventana = window.open('', 'PRINT', 'height=600,width=400');
  const fecha = new Date().toLocaleString();
  
  ventana!.document.write(`
    <html><head><style>
      @page { margin: 0; }
      body { font-family: 'Courier New', Courier, monospace; width: 280px; padding: 10px; font-size: 12px; line-height: 1.2; color: #000; }
      .text-center { text-align: center; }
      .bold { font-weight: bold; }
      .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
      .flex { display: flex; justify-content: space-between; }
      .item-qty { width: 30px; }
      .item-name { flex-grow: 1; padding-right: 5px; }
    </style></head><body>
      <div class="text-center bold" style="font-size: 18px; margin-bottom: 5px;">MODITEX</div>
      <div class="text-center">Venta de Ropa al por Mayor y Menor</div>
      <div class="text-center">Juliaca, Puno - Perú</div>
      <div class="divider"></div>
      <div>TICKET N°: ${ventaRealizada.value?.id || '0001'}</div>
      <div>FECHA: ${fecha}</div>
      <div>CLIENTE: ${clienteNombre.value || 'PÚBLICO GENERAL'}</div>
      <div>T. VENTA: ${tipoVenta.value}</div>
      <div class="divider"></div>
      <div class="bold flex">
        <span class="item-qty">CT</span>
        <span class="item-name">DESCRIPCIÓN</span>
        <span>TOTAL</span>
      </div>
      <div class="divider"></div>
      ${carrito.value.map(item => `
        <div class="flex" style="margin-bottom: 5px;">
          <span class="item-qty">${item.cantidad}</span>
          <span class="item-name">${item.nombre} <br><small>T:${item.talla} | C:${item.color}</small></span>
          <span>S/ ${(item.cantidad * item.precioUnitario).toFixed(2)}</span>
        </div>
      `).join('')}
      <div class="divider"></div>
      <div class="flex bold" style="font-size: 16px;">
        <span>TOTAL A PAGAR:</span>
        <span>S/ ${totalPagar.value.toFixed(2)}</span>
      </div>
      <div class="divider"></div>
      <div class="text-center bold" style="margin-top: 10px;">¡GRACIAS POR SU COMPRA!</div>
      <div class="text-center" style="font-size: 10px; margin-top: 5px;">Conserve su ticket para cualquier cambio o reclamo.</div>
    </body></html>
  `);

  ventana!.document.close();
  ventana!.focus();
  setTimeout(() => {
    ventana!.print();
    ventana!.close();
  }, 500);
};

const procesarSalida = async () => {
  if (carrito.value.length === 0) return alert("El carrito está vacío.");
  
  if (metodoEntrega.value === 'ENVIO_AGENCIA' && !destinoEnvio.value.trim()) {
    return alert("⚠️ Para envíos por agencia debes ingresar la dirección de destino.");
  }

  try {
    const payload = {
      almacenId: Number(bodegaSeleccionada.value), 
      cliente: clienteNombre.value || 'Cliente de Mostrador',
      clienteNombre: clienteNombre.value || 'Cliente de Mostrador', 
      tipoVenta: tipoVenta.value,
      metodoEntrega: metodoEntrega.value,
      requiereEnvio: metodoEntrega.value === 'ENVIO_AGENCIA',
      destinoEnvio: metodoEntrega.value === 'ENVIO_AGENCIA' ? destinoEnvio.value : undefined,
      detalles: carrito.value.map(c => ({
        productoId: Number(c.productoId),
        color: String(c.color),
        talla: String(c.talla),
        cantidad: Number(c.cantidad),
        precioUnitario: Number(c.precioUnitario) 
      }))
    };

    const res = await api.post('/ventas', payload);
    ventaRealizada.value = res.data; 
    
    if (metodoEntrega.value === 'ENTREGA_INMEDIATA' || metodoEntrega.value === 'RECOJO_TIENDA') {
      modalTicket.value = true;
    } else {
      alert("✅ Venta registrada. Se ha notificado a logística para su despacho por Agencia.");
    }

    carrito.value = [];
    clienteNombre.value = '';
    destinoEnvio.value = '';
    cargarDatos(); 
    if (socket && movilVinculado.value) socket.emit('sincronizar-carrito', { pin: pinConexion.value, carrito: [] });
    
  } catch (error: any) {
    alert("Error al procesar: " + (error.response?.data?.message || "Error desconocido"));
  }
};

// ==========================================
// 5. INICIALIZACIÓN
// ==========================================
onMounted(async () => {
  await cargarDatos();

  const pinGuardado = localStorage.getItem('pos_scanner_pin');
  if (pinGuardado) {
    pinConexion.value = pinGuardado;
  } else {
    pinConexion.value = Math.floor(1000 + Math.random() * 9000).toString();
    localStorage.setItem('pos_scanner_pin', pinConexion.value);
  }

  // 🚀 CORRECCIÓN: URL dinámica para Sockets
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
    codigoEscaneado.value = data.codigo; 
    procesarEscaneo(); 
  });
});

onUnmounted(() => {
  if (socket) socket.disconnect();
});
</script>

<template>
  <div class="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto min-h-screen bg-gray-50/50">
    
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
      <div>
        <h1 class="text-3xl font-black text-gray-800 tracking-tight">Caja de Facturación</h1>
        <p class="text-gray-500 font-medium mt-1">Escanea, cobra y gestiona entregas en tiempo real.</p>
      </div>
      
      <div class="bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3 w-full md:w-auto">
        <span class="pl-3 text-2xl">🏢</span>
        <select v-model="bodegaSeleccionada" class="w-full md:w-64 border-none bg-transparent font-bold text-gray-700 outline-none focus:ring-0 text-sm py-2 cursor-pointer">
          <option value="" disabled>Selecciona la Bodega Actual...</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
      </div>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      <div class="lg:col-span-4 space-y-6 flex flex-col">
        
        <div class="bg-gray-900 rounded-[2rem] p-8 shadow-xl shadow-gray-900/20 relative overflow-hidden flex flex-col justify-center min-h-[200px]">
          <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/20 to-purple-500/0 rounded-bl-[100px]"></div>
          <div class="relative z-10">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700">
                <span class="text-xl">🔫</span>
              </div>
              <label class="text-blue-400 font-black uppercase tracking-widest text-xs">Pistola Láser FÍSICA</label>
            </div>
            
            <input 
              ref="inputEscaner"
              type="text" 
              v-model="codigoEscaneado"
              @keyup.enter="procesarEscaneo"
              placeholder="Escanea aquí..."
              class="w-full bg-black/50 border-2 border-gray-700 p-5 rounded-2xl text-2xl text-center outline-none focus:border-blue-500 focus:bg-gray-950 transition-all placeholder-gray-700 text-white font-mono font-bold shadow-inner"
            />
          </div>
        </div>

        <div class="bg-white rounded-[2rem] shadow-sm border border-gray-200 flex flex-col overflow-hidden transition-all duration-300">
          <button @click="mostrarVinculacion = !mostrarVinculacion" class="w-full p-6 flex justify-between items-center bg-white hover:bg-gray-50 transition-colors focus:outline-none">
             <div class="flex items-center gap-3">
               <div class="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100"><span class="text-xl">📱</span></div>
               <div class="text-left">
                 <h3 class="font-black text-gray-800 text-sm uppercase tracking-widest">Escáner Móvil</h3>
                 <p class="text-xs font-bold mt-0.5" :class="movilVinculado ? 'text-green-500' : 'text-gray-400'">{{ movilVinculado ? 'Dispositivo conectado' : 'Toca para vincular cámara' }}</p>
               </div>
             </div>
             <div class="flex items-center gap-3">
               <span v-if="movilVinculado" class="flex h-3 w-3 relative"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>
               <span v-else class="w-3 h-3 bg-gray-300 rounded-full"></span>
               <svg :class="{'rotate-180': mostrarVinculacion}" class="w-5 h-5 text-gray-400 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
             </div>
          </button>

          <div v-show="mostrarVinculacion" class="px-6 pb-6 pt-2 border-t border-gray-50 animate-[fadeIn_0.2s_ease-out]">
            <div v-if="!movilVinculado" class="bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center">
              <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Abre la cámara del celular y escanea</p>
              
              <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 mb-6">
                <qrcode-vue :value="urlVinculacion" :size="150" level="H" render-as="svg" />
              </div>

              <div class="flex items-center gap-4 w-full mb-3">
                <div class="h-px bg-gray-200 flex-1"></div>
                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">O usa el PIN manual</p>
                <div class="h-px bg-gray-200 flex-1"></div>
              </div>
              <div class="text-3xl font-mono font-black text-gray-800 tracking-[0.3em] bg-white px-6 py-3 rounded-xl shadow-sm border border-gray-200">
                {{ pinConexion }}
              </div>
            </div>

            <div v-else class="bg-green-50 border border-green-200 rounded-2xl p-6 flex items-center justify-between">
              <div>
                <p class="font-black text-green-800 text-lg">Móvil Vinculado</p>
                <p class="text-xs text-green-600 font-bold mt-1 uppercase tracking-wider">Puedes ocultar esta pestaña</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="lg:col-span-8 bg-white rounded-[2rem] shadow-xl border border-gray-100 flex flex-col overflow-hidden h-[85vh]">
        
        <div class="px-8 py-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
          <h2 class="text-xl font-black text-gray-800 flex items-center gap-2"><span>🛒</span> Carrito de Compras</h2>
          <span class="text-xs font-bold text-gray-500 bg-gray-200 px-3 py-1 rounded-full">{{ carrito.length }} Ítems</span>
        </div>
        
        <div class="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/20">
          <div v-if="carrito.length === 0" class="h-full flex flex-col items-center justify-center text-gray-400">
            <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4 border-2 border-dashed border-gray-300">
              <span class="text-4xl opacity-50">🛍️</span>
            </div>
            <p class="font-bold text-lg text-gray-500">La boleta está en blanco</p>
          </div>
          
          <div v-else class="space-y-4">
            <div v-for="(item, index) in carrito" :key="item.sku" class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
              <div class="flex-1">
                <p class="font-black text-gray-800 text-lg">{{ item.nombre }}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                  <span class="text-[10px] font-mono bg-gray-100 text-gray-600 font-bold px-2.5 py-1 rounded-md border border-gray-200">{{ item.sku }}</span>
                  <span class="text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-100">Talla {{ item.talla }}</span>
                </div>
              </div>
              
              <div class="flex items-center gap-6 bg-gray-50 p-2 rounded-xl border border-gray-100">
                <div class="flex flex-col items-center">
                  <span class="text-[9px] text-gray-400 font-black uppercase mb-1">Precio (S/)</span>
                  <input type="number" v-model.number="item.precioUnitario" class="w-20 bg-white border border-gray-300 p-2 text-center rounded-lg font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
                <div class="flex flex-col items-center">
                  <span class="text-[9px] text-gray-400 font-black uppercase mb-1">Cant.</span>
                  <div class="bg-white border border-gray-300 px-4 py-2 rounded-lg font-black text-xl text-blue-600 text-center">{{ item.cantidad }}</div>
                </div>
                <button @click="quitarDelCarrito(index)" class="text-gray-300 hover:text-red-500 bg-white hover:bg-red-50 border border-transparent hover:border-red-200 p-2.5 rounded-lg transition-all">✕</button>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white border-t border-gray-100 p-6 md:p-8 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-10">
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Cliente / Razón Social</label>
              <input v-model="clienteNombre" type="text" placeholder="Público General" class="w-full bg-gray-50 border border-gray-200 text-gray-800 font-bold p-3.5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Comprobante</label>
              <select v-model="tipoVenta" class="w-full bg-gray-50 border border-gray-200 text-gray-800 font-bold p-3.5 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20">
                <option value="MINORISTA">Venta Minorista (Boleta/Nota)</option>
                <option value="MAYORISTA">Venta Mayorista (Factura)</option>
              </select>
            </div>
          </div>

          <div class="mb-6 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Método de Entrega / Logística</label>
            <div class="grid grid-cols-3 gap-3">
              <button @click="metodoEntrega = 'ENTREGA_INMEDIATA'" :class="metodoEntrega === 'ENTREGA_INMEDIATA' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'" class="border-2 p-3 rounded-xl flex flex-col items-center gap-1 transition-all">
                <span class="text-xl">🛍️</span><span class="text-[10px] font-black uppercase">Mostrador</span>
              </button>
              <button @click="metodoEntrega = 'RECOJO_TIENDA'" :class="metodoEntrega === 'RECOJO_TIENDA' ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'" class="border-2 p-3 rounded-xl flex flex-col items-center gap-1 transition-all">
                <span class="text-xl">🏃‍♂️</span><span class="text-[10px] font-black uppercase">Recojo Almacén</span>
              </button>
              <button @click="metodoEntrega = 'ENVIO_AGENCIA'" :class="metodoEntrega === 'ENVIO_AGENCIA' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'" class="border-2 p-3 rounded-xl flex flex-col items-center gap-1 transition-all">
                <span class="text-xl">🚚</span><span class="text-[10px] font-black uppercase">Agencia</span>
              </button>
            </div>
            
            <div v-if="metodoEntrega === 'ENVIO_AGENCIA'" class="mt-4 animate-[fadeIn_0.2s_ease-out]">
              <input v-model="destinoEnvio" type="text" placeholder="Ej: Shalom - Agencia Cusco" class="w-full bg-purple-50/50 border border-purple-200 p-3 rounded-xl text-sm font-bold text-purple-900 outline-none focus:ring-2 focus:ring-purple-500/20 placeholder-purple-300">
            </div>
          </div>

          <div class="flex flex-col md:flex-row gap-4 items-stretch">
            <div class="bg-gray-900 text-white px-8 py-4 rounded-2xl flex flex-col justify-center shrink-0 shadow-lg relative overflow-hidden">
              <div class="absolute right-0 top-0 w-32 h-32 bg-green-500/20 blur-3xl rounded-full"></div>
              <span class="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1 relative z-10">Total a Pagar</span>
              <div class="flex items-baseline gap-2 relative z-10">
                <span class="text-green-400 font-black text-2xl">S/</span>
                <span class="text-5xl font-black tracking-tight">{{ totalPagar.toFixed(2) }}</span>
              </div>
            </div>

            <button @click="procesarSalida" :disabled="carrito.length === 0" class="flex-1 bg-green-500 disabled:bg-gray-300 text-white rounded-2xl font-black text-xl hover:bg-green-600 transition-all shadow-lg shadow-green-500/30 flex items-center justify-center gap-3 active:scale-[0.98]">
              <span class="text-3xl">💵</span> COBRAR Y REGISTRAR
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>

  <div v-if="modalTicket" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
    <div class="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-[zoomIn_0.3s_ease-out]">
      <div class="bg-green-500 p-8 text-white text-center">
        <div class="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">✅</div>
        <h3 class="text-2xl font-black italic">VENTA EXITOSA</h3>
        <p class="text-green-100 text-sm font-bold uppercase tracking-widest mt-1">
          Ticket N° {{ ventaRealizada?.id || '000' }}
        </p>
      </div>
      
      <div class="p-8 space-y-6 text-center">
        <p class="text-gray-500 font-medium">La venta ha sido registrada correctamente en el sistema.</p>
        
        <div class="flex flex-col gap-3">
          <button @click="imprimirTicket" class="w-full bg-gray-900 text-white py-4 rounded-xl font-black text-lg flex items-center justify-center gap-3 hover:bg-black transition-all">
            <span class="text-2xl">🖨️</span> IMPRIMIR TICKET
          </button>
          <button @click="modalTicket = false" class="w-full bg-gray-100 text-gray-500 py-4 rounded-xl font-bold hover:bg-gray-200 transition-all border border-gray-200">
            Cerrar Ventana
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn { 
  from { opacity: 0; transform: translateY(-5px); } 
  to { opacity: 1; transform: translateY(0); } 
}
@keyframes zoomIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  -moz-appearance: textfield;
}
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}
.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 20px;
}
</style>