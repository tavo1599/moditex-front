<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import api from '../api/axios';
import JsBarcode from 'jsbarcode';

// Estados Principales
const vistaActiva = ref('kardex'); 
const inventario = ref<any[]>([]);
const bodegas = ref<any[]>([]);
const productos = ref<any[]>([]);
const colores = ref<any[]>([]); 
const cargando = ref(true);

// Estados para Filtros y Acordeón
const filtroStock = ref('con_stock');
const filasExpandidas = ref<Record<string, boolean>>({});

// Modales
const modalBodega = ref(false);
const modoEdicionBodega = ref(false);
const idEdicionBodega = ref<number | null>(null);
const modalIngreso = ref(false);

// Estados para Ajuste de Inventario (⚙️)
const modalAjuste = ref(false);
const ajustando = ref(false);
const formAjuste = ref({
  id: null as number | null,
  productoNombre: '',
  varianteDetalle: '',
  stockActual: 0,
  stockNuevo: 0,
  motivo: ''
});

// Estados Códigos de Barras
const modalEtiquetas = ref(false);
const itemEtiqueta = ref<any>(null);
const cantidadEtiquetas = ref(1);
const codigoGenerado = ref('');

// Formularios
const formBodega = ref({ nombre: '', tipo: 'Venta', direccion: '', estado: true });
const formIngreso = ref({ bodegaId: '' as number | '', productoId: '' as number | '', color: '', talla: '', cantidad: '' as any });

// ==========================================
// ESTADOS PARA AUTOCOMPLETADO
// ==========================================
const searchBodega = ref('');
const showBodegas = ref(false);

const searchProducto = ref('');
const showProductos = ref(false);

const searchColor = ref('');
const showColores = ref(false);

const cerrarBuscadorBodegas = () => setTimeout(() => showBodegas.value = false, 200);
const cerrarBuscadorProductos = () => setTimeout(() => showProductos.value = false, 200);
const cerrarBuscadorColores = () => setTimeout(() => showColores.value = false, 200);

// Filtros
const bodegasFiltradas = computed(() => {
  const activas = bodegas.value.filter(b => b.estado);
  if (!searchBodega.value) return activas;
  const q = searchBodega.value.toLowerCase();
  return activas.filter(b => b.nombre.toLowerCase().includes(q) || b.tipo.toLowerCase().includes(q));
});

const productosFiltrados = computed(() => {
  if (!searchProducto.value) return productos.value;
  const q = searchProducto.value.toLowerCase();
  return productos.value.filter(p => p.nombre.toLowerCase().includes(q) || p.skuBase.toLowerCase().includes(q));
});

const coloresFiltrados = computed(() => {
  if (!searchColor.value) return colores.value;
  const q = searchColor.value.toLowerCase();
  return colores.value.filter(c => c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q));
});

const selectBodega = (bodega: any) => {
  formIngreso.value.bodegaId = bodega.id;
  searchBodega.value = bodega.nombre;
  showBodegas.value = false;
};

const selectProducto = (producto: any) => {
  formIngreso.value.productoId = producto.id;
  searchProducto.value = `${producto.skuBase} - ${producto.nombre}`;
  showProductos.value = false;
};

// ==========================================
// COLOR VISUAL + DATOS
// ==========================================
const colorCodigoSeleccionado = ref(''); 
const colorFondoSeleccionado = ref('');  

const selectColor = (color: any) => {
  formIngreso.value.color = color.codigo; 
  searchColor.value = color.nombre; 
  colorCodigoSeleccionado.value = color.codigo;
  colorFondoSeleccionado.value = color.hex || color.codigoHex || '#E5E7EB'; 
  showColores.value = false;
};

const getNombreColor = (codigoColor: string) => {
  const colorObj = colores.value.find(c => c.codigo === codigoColor || c.nombre === codigoColor);
  return colorObj ? `${colorObj.nombre}` : codigoColor;
};

// ==========================================
// TALLAS Y KARDEX
// ==========================================
const tallasAgrupadas = {
  'Letras (Polos, Casacas, etc.)': ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'],
  'Números (Pantalones, Jeans)': ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46'],
  'Especiales': ['Estándar / Única']
};

const inventarioFiltrado = computed(() => {
  if (filtroStock.value === 'con_stock') return inventario.value.filter(item => item.stock > 0);
  if (filtroStock.value === 'critico') return inventario.value.filter(item => item.stock > 0 && item.stock <= 5);
  if (filtroStock.value === 'agotados') return inventario.value.filter(item => item.stock === 0);
  return inventario.value;
});

const inventarioAgrupado = computed(() => {
  const grupos: Record<string, any> = {};
  inventarioFiltrado.value.forEach(item => {
    const nombreProd = item.producto.nombre;
    if (!grupos[nombreProd]) {
      grupos[nombreProd] = { nombre: nombreProd, skuBase: item.producto.skuBase, totalStock: 0, tieneCritico: false, variantes: [] };
    }
    grupos[nombreProd].totalStock += item.stock;
    if (item.stock > 0 && item.stock <= 5) grupos[nombreProd].tieneCritico = true;
    grupos[nombreProd].variantes.push(item);
  });
  return grupos;
});

const toggleFila = (nombre: string) => filasExpandidas.value[nombre] = !filasExpandidas.value[nombre];

const cargarDatos = async () => {
  cargando.value = true;
  try {
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
    console.error("Error cargando datos:", error);
  } finally {
    cargando.value = false;
  }
};

const abrirNuevaBodega = () => { modoEdicionBodega.value = false; idEdicionBodega.value = null; formBodega.value = { nombre: '', tipo: 'Venta', direccion: '', estado: true }; modalBodega.value = true; };
const abrirEditarBodega = (bodega: any) => { modoEdicionBodega.value = true; idEdicionBodega.value = bodega.id; formBodega.value = { nombre: bodega.nombre, tipo: bodega.tipo, direccion: bodega.direccion || '', estado: bodega.estado }; modalBodega.value = true; };
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

const abrirIngreso = (bodegaIdPredefinida: number | '' = '') => {
  formIngreso.value = { bodegaId: bodegaIdPredefinida, productoId: '', color: '', talla: '', cantidad: '' as any };
  searchProducto.value = ''; searchColor.value = '';
  colorCodigoSeleccionado.value = ''; colorFondoSeleccionado.value = '';
  showBodegas.value = false; showProductos.value = false; showColores.value = false;
  searchBodega.value = bodegaIdPredefinida !== '' ? (bodegas.value.find(b => b.id === bodegaIdPredefinida)?.nombre || '') : '';
  modalIngreso.value = true;
};

// ==========================================
// INGRESO CONTINUO Y DESHACER
// ==========================================
const historialSesion = ref<any[]>([]);
const mostrarExito = ref(false);

const guardarIngreso = async () => {
  if (!formIngreso.value.bodegaId || !formIngreso.value.productoId || !formIngreso.value.cantidad || !formIngreso.value.color || !formIngreso.value.talla) {
    return alert("⚠️ Completa todos los campos (Bodega, Producto, Color, Talla y Cantidad).");
  }

  try {
    // 🔥 TU RUTA ORIGINAL PARA GUARDAR EL INGRESO 🔥
    await api.post('/almacen-terminados/inventario', formIngreso.value);

    historialSesion.value.unshift({
      id: Date.now(),
      bodegaId: formIngreso.value.bodegaId,
      productoId: formIngreso.value.productoId,
      productoNombre: searchProducto.value,
      color: formIngreso.value.color, 
      colorFondo: colorFondoSeleccionado.value, 
      talla: formIngreso.value.talla,
      cantidad: formIngreso.value.cantidad,
      hora: new Date().toLocaleTimeString()
    });

    mostrarExito.value = true;
    setTimeout(() => mostrarExito.value = false, 2000);

    formIngreso.value.color = ''; searchColor.value = ''; 
    colorCodigoSeleccionado.value = ''; colorFondoSeleccionado.value = '';
    formIngreso.value.talla = ''; formIngreso.value.cantidad = '' as any;
    cargarDatos();

  } catch (error: any) {
    alert("❌ Error al guardar.");
  }
};

// DESHACER INGRESO (REDUCIR)
const deshacerIngresoInmediato = async (item: any, index: number) => {
  if (!confirm(`¿Deshacer el ingreso de ${item.cantidad} unidades de ${item.color} Talla ${item.talla}?`)) return;

  try {
    // Llama a la nueva ruta en el backend
    await api.post('/almacen-terminados/revertir-ingreso', {
      bodegaId: item.bodegaId,
      productoId: item.productoId,
      color: item.color,
      talla: item.talla,
      cantidad: item.cantidad
    });

    historialSesion.value.splice(index, 1);
    alert("🔄 Ingreso revertido correctamente.");
    cargarDatos(); 
  } catch (error) {
    alert("Error al intentar deshacer el ingreso. Asegúrate de tener stock suficiente.");
  }
};

const cerrarModalIngreso = () => { modalIngreso.value = false; historialSesion.value = []; };

// ==========================================
// AJUSTE DE KARDEX (CORRECCIÓN)
// ==========================================
const abrirAjuste = (item: any) => {
  formAjuste.value = {
    id: item.id,
    productoNombre: item.producto.nombre,
    varianteDetalle: `Talla: ${item.talla} | Color: ${getNombreColor(item.color)}`,
    stockActual: item.stock,
    stockNuevo: item.stock,
    motivo: ''
  };
  modalAjuste.value = true;
};

const guardarAjuste = async () => {
  if (!formAjuste.value.motivo || formAjuste.value.motivo.length < 5) {
    return alert("⚠️ Debes ingresar un motivo válido para la auditoría (mín. 5 caracteres).");
  }
  if (!confirm(`¿Confirmas el ajuste manual de stock a ${formAjuste.value.stockNuevo}? Esto quedará registrado.`)) return;

  ajustando.value = true;
  try {
    await api.post('/almacen-terminados/ajustar-stock', {
      inventarioId: formAjuste.value.id,
      nuevoStock: formAjuste.value.stockNuevo,
      motivo: formAjuste.value.motivo
    });
    alert("✅ Stock ajustado correctamente.");
    modalAjuste.value = false;
    cargarDatos();
  } catch (error) {
    alert("Error al ajustar el stock.");
  } finally {
    ajustando.value = false;
  }
};

// ==========================================
// 1. GENERACIÓN DEL CÓDIGO (Tu lógica original intacta)
// ==========================================
const abrirEtiquetas = async (item: any) => {
  itemEtiqueta.value = item;
  cantidadEtiquetas.value = item.stock > 0 ? item.stock : 1; 
  
  // Buscar el color de forma robusta por si la BD guarda el nombre o el código
  const colorEncontrado = colores.value.find(c => c.codigo === item.color || c.nombre === item.color);
  const codigoColor = colorEncontrado ? colorEncontrado.codigo : item.color.substring(0, 3).toUpperCase();

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

// ==========================================
// 2. IMPRESIÓN FÍSICA (Diseño de 3 columnas verticales)
// ==========================================
const imprimirEtiquetas = () => {
  const svgContenedor = document.getElementById('contenedor-barcode')?.innerHTML || '';
  const nombrePrenda = itemEtiqueta.value.producto.nombre;
  const nombreColor = getNombreColor(itemEtiqueta.value.color); 
  const ventana = window.open('', 'PRINT', 'height=600,width=800');
  
  ventana!.document.write(`
    <html><head><title>Impresión de Etiquetas</title>
    <style>
      @page {
        size: 100mm 40mm; 
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
        width: 100mm;
        height: 40mm;
        font-family: Arial, sans-serif;
      }
      
      .fila {
        display: flex;
        flex-direction: row; 
        width: 100mm;
        height: 40mm;
        page-break-after: always; 
        justify-content: space-between;
        align-items: center;
        box-sizing: border-box;
      }
      
      .etiqueta {
        width: 33.3%; 
        height: 38mm; 
        display: flex;
        flex-direction: column; 
        align-items: center;
        justify-content: center;
        text-align: center;
        overflow: hidden;
        padding: 0 1mm; 
        box-sizing: border-box;
      }

      .titulo {
        font-size: 11px; 
        font-weight: 900;
        margin-bottom: 2px;
        text-transform: uppercase;
        line-height: 1;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .svg-container {
        width: 100%;
        display: flex;
        justify-content: center;
      }
      
      /* El max-width asegura que tu código original encaje perfecto en la etiqueta sin cortarse */
      .svg-container svg {
        max-width: 100%; 
        height: auto; 
      }
      
      .detalle {
        font-size: 10px; 
        margin-top: 2px;
        color: #000;
        font-weight: bold;
      }
    </style></head><body>
  `);

  for (let i = 0; i < cantidadEtiquetas.value; i += 3) {
    ventana!.document.write('<div class="fila">');

    for (let j = 0; j < 3; j++) {
      if (i + j < cantidadEtiquetas.value) {
        ventana!.document.write(`
          <div class="etiqueta">
            <div class="titulo">${nombrePrenda.substring(0, 15)}</div>
            <div class="svg-container">${svgContenedor}</div>
            <div class="detalle">T: ${itemEtiqueta.value.talla} | C: ${nombreColor.substring(0,8)}</div>
          </div>
        `);
      } else {
        ventana!.document.write('<div class="etiqueta"></div>');
      }
    }

    ventana!.document.write('</div>');
  }

  ventana!.document.write('</body></html>');
  ventana!.document.close();
  ventana!.focus();

  setTimeout(() => {
    ventana!.print();
    ventana!.close();
  }, 800);
};

onMounted(cargarDatos);
</script>

<template>
  <div class="space-y-6">
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

    <div class="flex gap-6 border-b border-gray-200 px-2">
      <button @click="vistaActiva = 'kardex'" class="pb-3 text-sm font-bold tracking-wide transition-colors border-b-2" :class="vistaActiva === 'kardex' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'">
        📑 KARDEX GENERAL
      </button>
      <button @click="vistaActiva = 'bodegas'" class="pb-3 text-sm font-bold tracking-wide transition-colors border-b-2" :class="vistaActiva === 'bodegas' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'">
        🏢 GESTIÓN DE BODEGAS
      </button>
    </div>

    <template v-if="!cargando && vistaActiva === 'kardex'">
      <div class="space-y-4 animate-in fade-in duration-300">
        <div class="flex gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-100 w-fit">
          <button @click="filtroStock = 'con_stock'" class="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition" :class="filtroStock === 'con_stock' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'">🟢 Disponibles</button>
          <button @click="filtroStock = 'critico'" class="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition" :class="filtroStock === 'critico' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:bg-gray-50'">🔴 Crítico 🚨</button>
          <button @click="filtroStock = 'agotados'" class="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition" :class="filtroStock === 'agotados' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'">⚫ Agotados</button>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
              <tr>
                <th class="p-4 w-10"></th><th class="p-4">Modelo de Prenda</th><th class="p-4">Bodega / Ubicación</th><th class="p-4">Color</th><th class="p-4 text-center">Talla</th><th class="p-4 text-right">Stock</th><th class="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <template v-for="(grupo, nombre) in inventarioAgrupado" :key="nombre">
                <tr @click="toggleFila(String(nombre))" class="cursor-pointer transition-colors" :class="filasExpandidas[String(nombre)] ? 'bg-blue-50/50' : 'hover:bg-gray-50'">
                  <td class="p-4 text-center text-gray-400 font-black">{{ filasExpandidas[String(nombre)] ? '▼' : '▶' }}</td>
                  <td class="p-4 font-black text-gray-800 text-base">{{ nombre }} <span class="ml-2 text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{{ grupo.skuBase }}</span></td>
                  <td colspan="3" class="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">{{ grupo.variantes.length }} Variantes</td>
                  <td class="p-4 text-right font-black text-lg text-blue-700">{{ grupo.totalStock }}</td>
                  <td class="p-4 text-center"></td>
                </tr>

                <tr v-if="filasExpandidas[String(nombre)]" v-for="item in grupo.variantes" :key="item.id" class="bg-gray-50/30 hover:bg-white transition-colors">
                  <td class="p-3"></td> <td class="p-3 text-xs font-bold text-gray-500 pl-8">↳ Variante</td>
                  <td class="p-3"><span class="font-bold text-gray-700">{{ item.bodega.nombre }}</span></td>
                  <td class="p-3 text-gray-700 font-bold flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full border border-gray-300 shadow-sm inline-block" :style="{ backgroundColor: item.colorHex || '#ccc' }"></span>
                    {{ getNombreColor(item.color) }} <span class="text-[10px] text-gray-400 bg-gray-200 px-1.5 rounded font-mono">{{ item.color }}</span>
                  </td>
                  <td class="p-3 text-center font-black text-gray-900">{{ item.talla }}</td>
                  <td class="p-3 text-right font-black text-base" :class="item.stock === 0 ? 'text-gray-300' : 'text-green-600'">{{ item.stock }} und</td>
                  <td class="p-3 flex justify-center gap-2">
                    <button v-if="item.stock > 0" @click="abrirEtiquetas(item)" class="bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition shadow-sm">🖨️ SKU</button>
                    <button @click="abrirAjuste(item)" title="Ajuste Manual" class="bg-white border border-gray-200 hover:bg-yellow-50 text-gray-600 hover:text-yellow-600 px-2.5 py-1.5 rounded-lg text-sm transition-all shadow-sm">⚙️</button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </template>
    
    <div v-if="vistaActiva === 'bodegas'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in duration-300">
      <div @click="abrirNuevaBodega" class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-8 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:border-gray-400 cursor-pointer transition-all min-h-[200px]"><span class="text-4xl mb-2">+</span><span class="font-bold">Crear Nueva Bodega</span></div>
      <div v-for="bodega in bodegas" :key="bodega.id" class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col" :class="bodega.estado ? '' : 'opacity-60 bg-gray-50'">
        <div class="absolute top-0 right-0 p-3 flex items-center gap-2">
          <span v-if="!bodega.estado" class="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-gray-200 text-gray-600">Inactivo</span>
          <span v-else class="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-blue-100 text-blue-700">{{ bodega.tipo }}</span>
          <button @click.stop="abrirEditarBodega(bodega)" class="text-gray-400 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 p-1.5 rounded-md transition" title="Editar Bodega">✏️</button>
        </div>
        <div class="mb-4 mt-2"><span class="text-3xl mb-2 block">🏬</span><h3 class="text-xl font-black text-gray-800" :class="!bodega.estado && 'line-through'">{{ bodega.nombre }}</h3><p class="text-xs text-gray-400 mt-1 uppercase">{{ bodega.direccion || 'Sin dirección registrada' }}</p></div>
        <div class="pt-4 border-t border-gray-100 mt-auto"><button v-if="bodega.estado" @click="abrirIngreso(bodega.id)" class="w-full bg-gray-900 hover:bg-black text-white font-bold py-2.5 rounded-lg text-sm transition shadow-md flex items-center justify-center gap-2"><span>📥</span> Ingresar a esta Bodega</button></div>
      </div>
    </div>

    <div v-if="modalBodega" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
        <h3 class="text-2xl font-black text-gray-800 mb-6">{{ modoEdicionBodega ? 'Editar Bodega' : 'Nueva Bodega' }}</h3>
        <div class="space-y-4">
          <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nombre Corto</label><input type="text" v-model="formBodega.nombre" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500"></div>
          <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Bodega</label><select v-model="formBodega.tipo" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500"><option value="Venta">Bodega Comercial</option><option value="Transito">Tránsito</option><option value="Merma">Merma</option></select></div>
          <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Dirección (Opcional)</label><input type="text" v-model="formBodega.direccion" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500"></div>
          <div><label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estado</label><select v-model="formBodega.estado" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500"><option :value="true">🟢 Operativa</option><option :value="false">🔴 Clausurada</option></select></div>
          <div class="flex gap-3 pt-6 border-t border-gray-100">
            <button @click="modalBodega = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold">Cancelar</button>
            <button @click="guardarBodega" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">Guardar</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="modalIngreso" class="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-[2rem] w-full max-w-5xl min-h-[75vh] max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col md:flex-row overflow-hidden relative">
        <div v-if="mostrarExito" class="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-fade-in font-bold">
          <span>✅</span> ¡Ingreso guardado!
        </div>

        <div class="w-full md:w-[55%] flex flex-col">
          <div class="bg-gradient-to-br from-emerald-500 to-green-600 p-8 rounded-tl-[2rem] text-white flex justify-between items-start relative overflow-hidden shrink-0">
            <div class="absolute -top-10 -right-10 opacity-20 text-9xl">📦</div>
            <div class="relative z-10">
              <h3 class="text-3xl font-black flex items-center gap-3">Ingreso Continuo</h3>
            </div>
            <button @click="cerrarModalIngreso" class="md:hidden relative z-10 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 rounded-full p-2">✕</button>
          </div>

          <div class="p-8 space-y-6 bg-white flex-1 overflow-y-auto">
            
            <div class="relative">
              <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Ubicación</label>
              <div class="relative flex items-center">
                <input type="text" v-model="searchBodega" @focus="showBodegas = true" @blur="cerrarBuscadorBodegas" @input="formIngreso.bodegaId = ''" placeholder="🔍 Buscar bodega..." class="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl pl-4 pr-10 py-4 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg" />
                <button v-if="searchBodega" @click="searchBodega = ''; formIngreso.bodegaId = ''" class="absolute right-3 text-gray-400 hover:text-red-500 bg-gray-200 hover:bg-red-100 p-1.5 rounded-full transition">✕</button>
              </div>
              <div v-if="showBodegas" class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                <div v-for="b in bodegasFiltradas" :key="b.id" @click="selectBodega(b)" class="px-4 py-3 hover:bg-emerald-50 cursor-pointer text-sm font-bold border-b border-gray-50">{{ b.nombre }}</div>
              </div>
            </div>

            <div class="relative">
              <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Modelo de Prenda</label>
              <div class="relative flex items-center">
                <input type="text" v-model="searchProducto" @focus="showProductos = true" @blur="cerrarBuscadorProductos" @input="formIngreso.productoId = ''" placeholder="🔍 Busca SKU o nombre..." class="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl pl-4 pr-10 py-4 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg" />
                <button v-if="searchProducto" @click="searchProducto = ''; formIngreso.productoId = ''" class="absolute right-3 text-gray-400 hover:text-red-500 bg-gray-200 hover:bg-red-100 p-1.5 rounded-full transition">✕</button>
              </div>
              <div v-if="showProductos" class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                <div v-for="p in productosFiltrados" :key="p.id" @click="selectProducto(p)" class="px-4 py-3 hover:bg-emerald-50 cursor-pointer text-sm font-bold flex flex-col">
                  <span>👕 {{ p.nombre }}</span><span class="text-[10px] text-gray-400 ml-6">{{ p.skuBase }}</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="relative">
                <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Color (Se resetea)</label>
                <div class="relative flex items-center">
                  <div v-if="colorCodigoSeleccionado" class="absolute left-3 flex items-center gap-1.5 bg-white border border-gray-200 px-2 py-1 rounded z-10 shadow-sm">
                    <span class="w-4 h-4 rounded-full border border-gray-300" :style="{ backgroundColor: colorFondoSeleccionado }"></span>
                    <span class="text-xs font-mono font-black text-gray-700">{{ colorCodigoSeleccionado }}</span>
                  </div>
                  <input type="text" v-model="searchColor" @focus="showColores = true" @blur="cerrarBuscadorColores" @input="formIngreso.color = ''; colorCodigoSeleccionado = ''; colorFondoSeleccionado = ''" placeholder="🎨 Buscar..." :class="['w-full bg-emerald-50/50 border border-emerald-100 rounded-xl py-4 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg', colorCodigoSeleccionado ? 'pl-24 pr-4' : 'px-4']" />
                </div>
                <div v-if="showColores" class="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                  <div v-for="c in coloresFiltrados" :key="c.id" @click="selectColor(c)" class="px-4 py-3 hover:bg-emerald-50 cursor-pointer text-sm font-bold flex justify-between items-center">
                    <div class="flex items-center gap-3"><span class="w-4 h-4 rounded-full border border-gray-300" :style="{ backgroundColor: c.hex || c.codigoHex || '#E5E7EB' }"></span><span>{{ c.nombre }}</span></div>
                    <span class="text-[10px] bg-gray-100 px-2 py-1 rounded font-mono font-black border">{{ c.codigo }}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Talla (Se resetea)</label>
                <select v-model="formIngreso.talla" class="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-4 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-center text-lg appearance-none cursor-pointer">
                  <option value="" disabled>Talla...</option>
                  <optgroup v-for="(listaTallas, categoria) in tallasAgrupadas" :key="categoria" :label="categoria"><option v-for="t in listaTallas" :key="t" :value="t">{{ t }}</option></optgroup>
                </select>
              </div>
            </div>

            <div class="pt-4 pb-2">
              <input type="number" v-model.number="formIngreso.cantidad" min="1" placeholder="Cant." class="w-full border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white py-6 px-6 rounded-2xl text-5xl text-center font-black text-emerald-800 outline-none focus:ring-4 focus:ring-emerald-500/20 shadow-inner">
            </div>

            <button @click="guardarIngreso" class="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition flex items-center justify-center gap-2 mt-4">
              Ingresar y Seguir ⚡
            </button>
          </div>
        </div>

        <div class="hidden md:flex w-[45%] bg-gray-50 border-l border-gray-100 flex-col">
          <div class="p-8 border-b border-gray-200 flex justify-between items-center bg-gray-100/50">
            <h4 class="font-black text-xl text-gray-700 flex items-center gap-2">📋 Historial de Sesión</h4>
            <button @click="cerrarModalIngreso" class="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full p-2 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <div class="flex-1 p-8 overflow-y-auto">
            <div v-if="historialSesion.length === 0" class="h-full flex flex-col items-center justify-center text-gray-400">
              <span class="text-7xl opacity-20">🛒</span><p class="font-bold text-base mt-6">Aún no has ingresado prendas.</p>
            </div>
            
            <div v-else class="space-y-4">
              <div v-for="(item, index) in historialSesion" :key="item.id" class="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 animate-in slide-in-from-right-4">
                <div class="flex justify-between items-start">
                  <div>
                    <p class="font-bold text-gray-800 text-base truncate w-60">{{ item.productoNombre }}</p>
                    <div class="flex gap-2 mt-2">
                      <span class="bg-gray-100 text-gray-600 text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1.5"><span class="w-3 h-3 rounded-full border border-gray-300" :style="{ backgroundColor: item.colorFondo }"></span>{{ item.color }}</span>
                      <span class="bg-gray-100 text-gray-600 text-[11px] font-bold px-2.5 py-1 rounded">Talla {{ item.talla }}</span>
                    </div>
                  </div>
                  <div class="text-right flex flex-col items-end">
                    <p class="text-emerald-600 font-black text-2xl">+{{ item.cantidad }}</p>
                    <p class="text-[10px] text-gray-400 mb-2 font-bold">{{ item.hora }}</p>
                    <button @click="deshacerIngresoInmediato(item, index)" class="text-[11px] font-bold text-red-500 hover:text-white border border-red-200 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm">
                      ↩️ Deshacer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="p-8 border-t border-gray-200 bg-white">
            <button @click="cerrarModalIngreso" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition-all shadow-md">Cerrar Ingresos</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="modalAjuste" class="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
        <div class="bg-yellow-500 p-6 text-white text-center relative">
          <div class="absolute inset-0 bg-yellow-600 opacity-20 pattern-diagonal-lines"></div>
          <h3 class="text-xl font-black relative z-10 flex items-center justify-center gap-2">⚙️ Ajuste de Inventario</h3>
          <p class="text-xs font-medium text-yellow-100 mt-1 relative z-10">{{ formAjuste.productoNombre }}</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="text-center bg-gray-50 p-3 rounded-xl border border-gray-100">
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Variante a modificar</p>
            <p class="font-bold text-gray-800 text-sm mt-1">{{ formAjuste.varianteDetalle }}</p>
          </div>
          
          <div class="grid grid-cols-2 gap-4 items-center">
            <div class="text-center">
              <p class="text-[10px] text-gray-400 font-bold uppercase">Stock Actual</p>
              <p class="text-3xl font-black text-gray-300">{{ formAjuste.stockActual }}</p>
            </div>
            <div class="text-center">
              <p class="text-[10px] text-yellow-600 font-bold uppercase">Stock Real</p>
              <input type="number" v-model.number="formAjuste.stockNuevo" min="0" class="w-full border-b-4 border-yellow-400 bg-yellow-50 text-3xl font-black text-center text-gray-800 py-2 outline-none focus:bg-yellow-100 rounded-t-lg transition-colors">
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 mt-2">Motivo del Ajuste (Obligatorio)</label>
            <textarea v-model="formAjuste.motivo" placeholder="Ej: Error de digitación anterior..." rows="2" class="w-full border border-gray-200 rounded-xl p-3 text-sm font-medium text-gray-700 outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 resize-none"></textarea>
          </div>
        </div>
        
        <div class="bg-gray-50 p-6 flex gap-3 border-t border-gray-100">
          <button @click="modalAjuste = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-200 rounded-xl font-bold transition">Cancelar</button>
          <button @click="guardarAjuste" :disabled="ajustando" class="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-black shadow-lg shadow-yellow-500/30 hover:bg-yellow-600 transition flex items-center justify-center gap-2">
            {{ ajustando ? 'Guardando...' : 'Confirmar Ajuste' }}
          </button>
        </div>
      </div>
    </div>

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
            <p class="text-xs font-bold text-gray-800 mt-2">Talla: {{ itemEtiqueta?.talla }} | Col: {{ getNombreColor(itemEtiqueta?.color) }}</p>
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

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>