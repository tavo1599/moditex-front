<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import api from '../api/axios';
import JsBarcode from 'jsbarcode';

// Estados Principales
const vistaActiva = ref('kardex'); 
const inventario = ref<any[]>([]);
const bodegas = ref<any[]>([]);
const productos = ref<any[]>([]);
const colores = ref<any[]>([]); // Colores de la DB
const cargando = ref(true);

// Modales
const modalBodega = ref(false);
const modoEdicionBodega = ref(false);
const idEdicionBodega = ref<number | null>(null);
const modalIngreso = ref(false);

// --- ESTADOS PARA CÓDIGOS DE BARRAS ---
const modalEtiquetas = ref(false);
const itemEtiqueta = ref<any>(null);
const cantidadEtiquetas = ref(1);
const codigoGenerado = ref('');

// Formularios
const formBodega = ref({ nombre: '', tipo: 'Venta', direccion: '', estado: true });
const formIngreso = ref({ bodegaId: '' as number | '', productoId: '', color: '', talla: '32', cantidad: 0 });

const tallas = ['28', '30', '32', '34', '36'];

// FUNCIÓN DE CARGA COMPLETA (Corregida)
const cargarDatos = async () => {
  cargando.value = true;
  try {
    // Cargamos TODO en paralelo para que sea rápido
    const [resInv, resBodegas, resProd, resColores] = await Promise.all([
      api.get('/almacen-terminados/inventario'),
      api.get('/almacen-terminados/bodegas'),
      api.get('/productos'),
      api.get('/colores')
    ]);

    inventario.value = resInv.data;
    bodegas.value = resBodegas.data;
    productos.value = resProd.data;
    colores.value = resColores.data;
    
  } catch (error) {
    console.error("Error cargando datos del almacén:", error);
    alert("Hubo un error al conectar con el servidor.");
  } finally {
    // ¡IMPORTANTE! Esto detiene el círculo de carga
    cargando.value = false;
  }
};

// --- LOGICA DE BODEGAS ---
const abrirNuevaBodega = () => {
  modoEdicionBodega.value = false;
  idEdicionBodega.value = null;
  formBodega.value = { nombre: '', tipo: 'Venta', direccion: '', estado: true };
  modalBodega.value = true;
};

const abrirEditarBodega = (bodega: any) => {
  modoEdicionBodega.value = true;
  idEdicionBodega.value = bodega.id;
  formBodega.value = { nombre: bodega.nombre, tipo: bodega.tipo, direccion: bodega.direccion || '', estado: bodega.estado };
  modalBodega.value = true;
};

const guardarBodega = async () => {
  if (!formBodega.value.nombre) return alert('Ponle un nombre a la bodega');
  try {
    if (modoEdicionBodega.value && idEdicionBodega.value) {
      await api.put(`/almacen-terminados/bodegas/${idEdicionBodega.value}`, formBodega.value);
    } else {
      await api.post('/almacen-terminados/bodegas', formBodega.value);
    }
    modalBodega.value = false;
    cargarDatos();
  } catch (error) { alert('Error al guardar bodega'); }
};

// --- LOGICA DE INGRESOS ---
const abrirIngreso = (bodegaIdPredefinida: number | '' = '') => {
  formIngreso.value.bodegaId = bodegaIdPredefinida;
  formIngreso.value.cantidad = 0;
  modalIngreso.value = true;
};

const guardarIngreso = async () => {
  if (!formIngreso.value.bodegaId || !formIngreso.value.productoId || formIngreso.value.cantidad <= 0) {
    return alert('Llena todos los campos y pon una cantidad válida');
  }
  try {
    await api.post('/almacen-terminados/inventario', {
      bodegaId: Number(formIngreso.value.bodegaId),
      productoId: Number(formIngreso.value.productoId),
      color: formIngreso.value.color, // Mandamos el nombre o ID según tu backend
      talla: formIngreso.value.talla,
      cantidad: formIngreso.value.cantidad
    });
    modalIngreso.value = false;
    cargarDatos();
    vistaActiva.value = 'kardex'; 
  } catch (error) { alert('Error al ingresar mercadería'); }
};

// ==========================================
// LÓGICA DE CÓDIGOS DE BARRAS 
// ==========================================
const abrirEtiquetas = async (item: any) => {
  itemEtiqueta.value = item;
  cantidadEtiquetas.value = item.stock > 0 ? item.stock : 1; 
  
  // 1. Buscamos el código corto (ej: AZM) en nuestra lista de la base de datos
  const colorEncontrado = colores.value.find(c => c.nombre === item.color);
  const codigoColor = colorEncontrado ? colorEncontrado.codigo : item.color.substring(0, 3).toUpperCase();

  // 2. Generamos el SKU
  codigoGenerado.value = `PRD${item.producto.id}-${codigoColor}-${item.talla}`;

  modalEtiquetas.value = true;

  await nextTick();
  JsBarcode("#barcode-svg", codigoGenerado.value, {
    format: "CODE128", 
    lineColor: "#000",
    width: 2,
    height: 60,
    displayValue: true,
    fontSize: 14,
    margin: 0
  });
};

const imprimirEtiquetas = () => {
  const svgContenedor = document.getElementById('contenedor-barcode')?.innerHTML || '';
  const nombrePrenda = itemEtiqueta.value.producto.nombre;
  
  const ventana = window.open('', 'PRINT', 'height=600,width=800');
  
  ventana!.document.write(`
    <html>
      <head>
        <title>Impresión de Etiquetas</title>
        <style>
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
          .etiqueta { 
            width: 50mm; 
            height: 30mm; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            page-break-after: always;
            text-align: center;
            overflow: hidden;
          }
          .titulo { font-size: 10px; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%; }
          .svg-container { max-width: 90%; }
          .svg-container svg { width: 100%; height: 40px; }
          .detalle { font-size: 9px; margin-top: 2px; color: #333; font-weight: bold; }
        </style>
      </head>
      <body>
  `);

  for (let i = 0; i < cantidadEtiquetas.value; i++) {
    ventana!.document.write(`
      <div class="etiqueta">
        <div class="titulo">${nombrePrenda}</div>
        <div class="svg-container">${svgContenedor}</div>
        <div class="detalle">Talla: ${itemEtiqueta.value.talla} | Col: ${itemEtiqueta.value.color}</div>
      </div>
    `);
  }

  ventana!.document.write('</body></html>');
  ventana!.document.close();
  ventana!.focus();
  
  setTimeout(() => {
    ventana!.print();
    ventana!.close();
  }, 500);
};

onMounted(cargarDatos);
</script>

<template>
  <div class="space-y-6">
    <!-- HEADER -->
    <div class="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Productos Terminados</h2>
        <p class="text-gray-500 mt-1">Controla tu stock real por bodega, talla y color.</p>
      </div>
      <div class="flex gap-3">
        <button @click="abrirNuevaBodega" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2 text-sm border border-gray-200">
          <span>🏢</span> Nueva Bodega
        </button>
        <button @click="abrirIngreso()" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-all flex items-center gap-2 text-sm">
          <span>📦</span> Ingreso Libre
        </button>
      </div>
    </div>

    <!-- PESTAÑAS -->
    <div class="flex gap-6 border-b border-gray-200 px-2">
      <button @click="vistaActiva = 'kardex'" class="pb-3 text-sm font-bold tracking-wide transition-colors border-b-2" :class="vistaActiva === 'kardex' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'">
        📑 KARDEX GENERAL
      </button>
      <button @click="vistaActiva = 'bodegas'" class="pb-3 text-sm font-bold tracking-wide transition-colors border-b-2" :class="vistaActiva === 'bodegas' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'">
        🏢 GESTIÓN DE BODEGAS
      </button>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500 font-medium bg-white rounded-xl shadow-sm">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
      <p>Cargando información...</p>
    </div>

    <template v-else>
      <!-- VISTA 1: KARDEX -->
      <div v-if="vistaActiva === 'kardex'" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-300">
        <table class="w-full text-left text-sm">
          <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
            <tr>
              <th class="p-4">Ubicación / Bodega</th>
              <th class="p-4">Modelo</th>
              <th class="p-4">Color</th>
              <th class="p-4 text-center">Talla</th>
              <th class="p-4 text-right">Stock Físico</th>
              <th class="p-4 text-center">Etiquetas</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="inventario.length === 0">
              <td colspan="6" class="p-8 text-center text-gray-400 italic">No hay inventario registrado.</td>
            </tr>
            <tr v-for="item in inventario" :key="item.id" class="hover:bg-blue-50/30 transition-colors">
              <td class="p-4">
                <span class="font-bold text-gray-800">{{ item.bodega.nombre }}</span>
                <span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">{{ item.bodega.tipo }}</span>
              </td>
              <td class="p-4 font-bold text-blue-700">{{ item.producto.nombre }}</td>
              <td class="p-4 text-gray-600">{{ item.color }}</td>
              <td class="p-4 text-center font-black text-gray-800">{{ item.talla }}</td>
              <td class="p-4 text-right">
                <span class="text-lg font-black" :class="item.stock <= 5 ? 'text-red-500' : 'text-green-600'">{{ item.stock }}</span>
                <span class="text-xs text-gray-400 ml-1">und</span>
              </td>
              <td class="p-4 text-center">
                <button @click="abrirEtiquetas(item)" class="bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition shadow-sm">
                  🖨️ Imprimir
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- VISTA 2: BODEGAS -->
      <div v-if="vistaActiva === 'bodegas'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in duration-300">
        <div @click="abrirNuevaBodega" class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-8 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:border-gray-400 cursor-pointer transition-all min-h-[200px]">
          <span class="text-4xl mb-2">+</span>
          <span class="font-bold">Crear Nueva Bodega</span>
        </div>
        <div v-for="bodega in bodegas" :key="bodega.id" class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col" :class="bodega.estado ? '' : 'opacity-60 bg-gray-50'">
          <div class="absolute top-0 right-0 p-3 flex items-center gap-2">
            <span v-if="!bodega.estado" class="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-gray-200 text-gray-600">Inactivo</span>
            <span v-else class="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-blue-100 text-blue-700">{{ bodega.tipo }}</span>
            <button @click.stop="abrirEditarBodega(bodega)" class="text-gray-400 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 p-1.5 rounded-md transition" title="Editar Bodega">✏️</button>
          </div>
          <div class="mb-4 mt-2">
            <span class="text-3xl mb-2 block">🏬</span>
            <h3 class="text-xl font-black text-gray-800" :class="!bodega.estado && 'line-through'">{{ bodega.nombre }}</h3>
            <p class="text-xs text-gray-400 mt-1 uppercase">{{ bodega.direccion || 'Sin dirección registrada' }}</p>
          </div>
          <div class="pt-4 border-t border-gray-100 mt-auto">
             <button v-if="bodega.estado" @click="abrirIngreso(bodega.id)" class="w-full bg-gray-900 hover:bg-black text-white font-bold py-2.5 rounded-lg text-sm transition shadow-md flex items-center justify-center gap-2">
              <span>📥</span> Ingresar a esta Bodega
            </button>
            <p v-else class="text-center text-xs text-gray-400 font-bold uppercase mt-2">Bodega Clausurada</p>
          </div>
        </div>
      </div>
    </template>

    <!-- MODAL: CREAR / EDITAR BODEGA -->
    <div v-if="modalBodega" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
        <h3 class="text-2xl font-black text-gray-800 mb-6">{{ modoEdicionBodega ? 'Editar Bodega' : 'Nueva Bodega' }}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nombre Corto</label>
            <input type="text" v-model="formBodega.nombre" placeholder="Ej: Tienda Sur..." class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Bodega</label>
            <select v-model="formBodega.tipo" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
              <option value="Venta">Bodega Comercial (Ventas)</option>
              <option value="Transito">Tránsito / En Camino</option>
              <option value="Merma">Zona de Fallados / Merma</option>
            </select>
          </div>
           <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Dirección (Opcional)</label>
            <input type="text" v-model="formBodega.direccion" placeholder="Ej: Av. Principal 123" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estado de Operación</label>
            <select v-model="formBodega.estado" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
              <option :value="true">🟢 Operativa (Activa)</option>
              <option :value="false">🔴 Clausurada (Inactiva)</option>
            </select>
          </div>
          <div class="flex gap-3 pt-6 border-t border-gray-100">
            <button @click="modalBodega = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold transition">Cancelar</button>
            <button @click="guardarBodega" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition">
              {{ modoEdicionBodega ? 'Actualizar Bodega' : 'Guardar Bodega' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: INGRESO LIBRE -->
    <div v-if="modalIngreso" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
        <h3 class="text-2xl font-black text-green-600 mb-6 flex items-center gap-2"><span>📥</span> Sumar Stock</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">¿A qué Bodega entra?</label>
            <select v-model="formIngreso.bodegaId" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-green-500 bg-gray-50">
              <option value="" disabled>Selecciona el destino...</option>
              <option v-for="b in bodegas.filter(bod => bod.estado)" :key="b.id" :value="b.id">{{ b.nombre }} ({{ b.tipo }})</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Modelo / Producto</label>
            <select v-model="formIngreso.productoId" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-green-500">
              <option value="" disabled>Selecciona la prenda...</option>
              <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.skuBase }} - {{ p.nombre }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Color</label>
              <select v-model="formIngreso.color" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-green-500">
                    <option value="" disabled>Selecciona un color</option>
                    <option v-for="c in colores" :key="c.id" :value="c.id">
                        {{ c.nombre }} ({{ c.codigo }})
                    </option>
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Talla</label>
              <select v-model="formIngreso.talla" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-green-500 text-center">
                <option v-for="t in tallas" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>
          <div class="pt-2">
            <label class="block text-xs font-black text-green-600 uppercase tracking-widest mb-1 text-center">Cantidad a Ingresar</label>
            <input type="number" v-model.number="formIngreso.cantidad" min="1" class="w-full border-2 border-green-400 bg-green-50 p-4 rounded-xl text-3xl text-center font-black text-green-700 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100 transition-all">
          </div>
          <div class="flex gap-3 pt-6 border-t border-gray-100">
            <button @click="modalIngreso = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold transition">Cancelar</button>
            <button @click="guardarIngreso" class="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-500/30 hover:bg-green-700 transition">Procesar Ingreso</button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: IMPRESIÓN DE ETIQUETAS -->
    <div v-if="modalEtiquetas" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 overflow-hidden">
        <div class="bg-gray-900 p-6 text-center">
          <h3 class="text-xl font-black text-white mb-1">Centro de Impresión</h3>
          <p class="text-xs text-gray-400">{{ itemEtiqueta?.producto.nombre }}</p>
        </div>
        <div class="p-8 flex flex-col items-center">
          <div class="bg-white p-4 border-2 border-dashed border-gray-300 rounded-xl mb-6 flex flex-col items-center w-full shadow-sm">
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Vista Previa</p>
            <div id="contenedor-barcode" class="flex justify-center w-full">
              <svg id="barcode-svg" class="w-full max-w-[200px]"></svg>
            </div>
            <p class="text-xs font-bold text-gray-800 mt-2">Talla: {{ itemEtiqueta?.talla }} | Col: {{ itemEtiqueta?.color }}</p>
          </div>
          <div class="w-full space-y-4">
            <div>
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">¿Cuántas etiquetas necesitas?</label>
              <input type="number" v-model.number="cantidadEtiquetas" min="1" class="w-full border-2 border-gray-200 p-3 rounded-xl text-2xl text-center font-black text-gray-800 outline-none focus:border-blue-500">
            </div>
          </div>
        </div>
        <div class="bg-gray-50 p-6 border-t border-gray-100 flex gap-3">
          <button @click="modalEtiquetas = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-200 rounded-xl font-bold transition">Cancelar</button>
          <button @click="imprimirEtiquetas" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition flex items-center justify-center gap-2">
            <span>🖨️</span> Imprimir
          </button>
        </div>
      </div>
    </div>
  </div>
</template>