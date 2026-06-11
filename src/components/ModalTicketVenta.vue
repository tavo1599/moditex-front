<script setup lang="ts">
import { ref } from 'vue';
import jsPDF from 'jspdf';

const props = defineProps({
  show: Boolean,
  ventaRealizada: Object,
  carrito: { type: Array as () => any[], default: () => [] },
  clienteNombre: String,
  condicionPago: String,
  totalPagar: { type: Number, default: 0 },
  saldoPendiente: { type: Number, default: 0 }
});

const emit = defineEmits(['close']);

// Formatos de ticket térmico. El usuario elige uno antes de imprimir/descargar.
const FORMATOS: Record<string, { px: number; font: number; page: string; mm: number; pdfFont: number; chars: number }> = {
  '80': { px: 280, font: 12, page: '80mm', mm: 80, pdfFont: 9, chars: 40 },
  '58': { px: 200, font: 10, page: '58mm', mm: 58, pdfFont: 7, chars: 30 },
};
const formato = ref<'80' | '58'>('80');

const fechaTexto = () => new Date().toLocaleString('es-PE');
const ticketNum = () => props.ventaRealizada?.correlativo || props.ventaRealizada?.id || '0001';
const totalCobrado = () => Number(props.ventaRealizada?.totalPagado) || props.totalPagar;

// ====== HTML para impresión (iframe) ======
const construirTicketHTML = (f: { px: number; font: number; page: string }): string => {
  return `
    <html><head><meta charset="utf-8"><style>
      @page { size: ${f.page} auto; margin: 0; }
      body { font-family: 'Courier New', Courier, monospace; width: ${f.px}px; padding: 8px; font-size: ${f.font}px; line-height: 1.25; color: #000; }
      .c { text-align: center; } .b { font-weight: bold; }
      .d { border-bottom: 1px dashed #000; margin: 8px 0; }
      .f { display: flex; justify-content: space-between; gap: 6px; }
      .q { width: 22px; } .n { flex-grow: 1; }
    </style></head><body>
      <div class="c b" style="font-size:${f.font + 5}px;margin-bottom:4px;">MODITEX</div>
      <div class="c">Venta de Ropa al por Mayor y Menor</div>
      <div class="d"></div>
      <div>TICKET N°: ${ticketNum()}</div>
      <div>FECHA: ${fechaTexto()}</div>
      <div>CLIENTE: ${props.clienteNombre || 'PÚBLICO GENERAL'}</div>
      <div>CONDICIÓN: ${props.condicionPago}</div>
      <div class="d"></div>
      <div class="b f"><span class="q">CT</span><span class="n">DESCRIPCIÓN</span><span>TOTAL</span></div>
      <div class="d"></div>
      ${props.carrito.map(item => `
        <div class="f" style="margin-bottom:4px;">
          <span class="q">${item.cantidad}</span>
          <span class="n">${item.nombre}<br><small>T:${item.talla} | C:${item.color}</small></span>
          <span>${(item.cantidad * item.precioUnitario).toFixed(2)}</span>
        </div>`).join('')}
      <div class="d"></div>
      <div style="text-align:right;">
        <div>TOTAL FACTURADO: S/ ${props.totalPagar.toFixed(2)}</div>
        <div>TOTAL COBRADO: S/ ${totalCobrado().toFixed(2)}</div>
        ${props.condicionPago !== 'CONTADO' ? `<div>SALDO RESTANTE: S/ ${props.saldoPendiente.toFixed(2)}</div>` : ''}
      </div>
      <div class="d"></div>
      <div class="c b" style="margin-top:8px;">¡GRACIAS POR SU COMPRA!</div>
    </body></html>`;
};

const imprimirTicket = () => {
  const f = FORMATOS[formato.value]!;
  const html = construirTicketHTML(f);
  try {
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error('sin documento');
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      catch (e) { alert('No se pudo abrir el diálogo de impresión en este dispositivo.'); }
      setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1000);
    }, 400);
  } catch (error) {
    const ventana = window.open('', 'PRINT', 'height=600,width=400');
    if (!ventana) { alert('Tu navegador bloqueó la impresión. Usa "Descargar PDF".'); return; }
    ventana.document.write(html); ventana.document.close(); ventana.focus();
    setTimeout(() => { ventana.print(); ventana.close(); }, 500);
  }
};

// ====== PDF descargable (jsPDF, ancho térmico real) ======
const envolver = (texto: string, max: number): string[] => {
  const palabras = String(texto).split(/\s+/);
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    if ((actual + ' ' + p).trim().length <= max) actual = (actual + ' ' + p).trim();
    else { if (actual) lineas.push(actual); actual = p.length > max ? p.slice(0, max) : p; }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
};

const descargarPDF = () => {
  const f = FORMATOS[formato.value]!;
  const w = f.mm;
  const margin = 3;
  const usableChars = f.chars;
  const lh = 4; // alto de línea en mm

  // 1) Construir las "filas" para calcular el alto
  type Fila = { kind: 'txt' | 'div' | 'lr' | 'item'; lines?: string[]; right?: string; size?: number; bold?: boolean; align?: 'center' | 'left'; h: number };
  const filas: Fila[] = [];
  filas.push({ kind: 'txt', lines: ['MODITEX'], size: f.pdfFont + 4, bold: true, align: 'center', h: 6 });
  filas.push({ kind: 'txt', lines: envolver('Venta de Ropa al por Mayor y Menor', usableChars), size: f.pdfFont - 1, align: 'center', h: lh });
  filas.push({ kind: 'div', h: 3 });
  for (const t of [`TICKET N: ${ticketNum()}`, `FECHA: ${fechaTexto()}`, `CLIENTE: ${props.clienteNombre || 'PUBLICO GENERAL'}`, `CONDICION: ${props.condicionPago}`]) {
    for (const l of envolver(t, usableChars)) filas.push({ kind: 'txt', lines: [l], size: f.pdfFont, align: 'left', h: lh });
  }
  filas.push({ kind: 'div', h: 3 });
  filas.push({ kind: 'lr', lines: ['CT DESCRIPCION'], right: 'TOTAL', bold: true, size: f.pdfFont, h: lh });
  filas.push({ kind: 'div', h: 3 });
  for (const item of props.carrito) {
    const izq = envolver(`${item.cantidad} ${item.nombre} (T:${item.talla} C:${item.color})`, usableChars - 8);
    filas.push({ kind: 'item', lines: izq, right: `S/ ${(item.cantidad * item.precioUnitario).toFixed(2)}`, size: f.pdfFont, h: lh * izq.length });
  }
  filas.push({ kind: 'div', h: 3 });
  const totales = [
    { l: 'TOTAL FACTURADO:', r: `S/ ${props.totalPagar.toFixed(2)}` },
    { l: 'TOTAL COBRADO:', r: `S/ ${totalCobrado().toFixed(2)}` },
  ];
  if (props.condicionPago !== 'CONTADO') totales.push({ l: 'SALDO RESTANTE:', r: `S/ ${props.saldoPendiente.toFixed(2)}` });
  for (const t of totales) filas.push({ kind: 'lr', lines: [t.l], right: t.r, size: f.pdfFont, h: lh });
  filas.push({ kind: 'div', h: 3 });
  filas.push({ kind: 'txt', lines: ['GRACIAS POR SU COMPRA'], bold: true, align: 'center', size: f.pdfFont, h: 6 });

  const alto = margin * 2 + filas.reduce((s, fila) => s + fila.h, 0);

  // 2) Crear el PDF con el ancho térmico exacto y dibujar
  const doc = new jsPDF({ unit: 'mm', format: [w, Math.max(alto, 50)] });
  doc.setFont('courier', 'normal');
  let y = margin + 3;
  for (const fila of filas) {
    if (fila.kind === 'div') {
      doc.setLineDashPattern([0.6, 0.6], 0);
      doc.setLineWidth(0.1);
      doc.line(margin, y - 2, w - margin, y - 2);
      doc.setLineDashPattern([], 0);
      y += fila.h;
      continue;
    }
    doc.setFontSize(fila.size || f.pdfFont);
    doc.setFont('courier', fila.bold ? 'bold' : 'normal');
    if (fila.kind === 'txt') {
      for (const l of fila.lines!) {
        if (fila.align === 'center') doc.text(l, w / 2, y, { align: 'center' });
        else doc.text(l, margin, y);
        y += lh;
      }
    } else if (fila.kind === 'lr') {
      doc.text(fila.lines![0] || '', margin, y);
      doc.text(fila.right || '', w - margin, y, { align: 'right' });
      y += lh;
    } else if (fila.kind === 'item') {
      fila.lines!.forEach((l, idx) => {
        doc.text(l, margin, y);
        if (idx === 0) doc.text(fila.right || '', w - margin, y, { align: 'right' });
        y += lh;
      });
    }
  }

  doc.save(`Ticket-${ticketNum()}-${formato.value}mm.pdf`);
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
    <div class="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-[zoomIn_0.3s_ease-out]">
      <div class="bg-green-500 p-6 text-white text-center">
        <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl">✅</div>
        <h3 class="text-xl font-black italic">VENTA EXITOSA</h3>
        <p class="text-green-100 text-xs font-bold uppercase tracking-widest mt-1">Ticket N° {{ ticketNum() }}</p>
      </div>

      <div class="p-6 space-y-5">
        <p class="text-gray-500 text-xs font-medium text-center">La venta se guardó con éxito. Elige el formato del comprobante.</p>

        <!-- Selector de formato -->
        <div>
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Tamaño de papel</p>
          <div class="grid grid-cols-2 gap-2">
            <button @click="formato = '80'" class="py-3 rounded-xl font-black text-sm border-2 transition-all"
              :class="formato === '80' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'">
              80mm
            </button>
            <button @click="formato = '58'" class="py-3 rounded-xl font-black text-sm border-2 transition-all"
              :class="formato === '58' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'">
              58mm
            </button>
          </div>
        </div>

        <!-- Acciones -->
        <div class="flex flex-col gap-2">
          <button @click="imprimirTicket" class="w-full bg-gray-900 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-black transition-all">
            🖨️ Imprimir ({{ formato }}mm)
          </button>
          <button @click="descargarPDF" class="w-full bg-blue-600 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all">
            📄 Descargar PDF
          </button>
          <button @click="emit('close')" class="w-full bg-gray-100 text-gray-500 py-3 rounded-xl font-bold hover:bg-gray-200 text-xs transition-all border border-gray-200">
            Cerrar
          </button>
        </div>

        <p class="text-[10px] text-gray-400 text-center leading-relaxed">
          En tablet/celular, "Imprimir" abre el diálogo donde también puedes guardar como PDF o enviar a una impresora Bluetooth.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes zoomIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
</style>
