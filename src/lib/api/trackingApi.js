import { httpsCallable } from 'firebase/functions';
import { functions, isFirebaseConfigured } from '../firebase';
import { normalizePhone, projectTrackingOrder, validTrackingCredentials } from '../../../firebase-functions/tracking-model.mjs';

export const isTrackingDemo = !isFirebaseConfigured && import.meta.env.DEV;
export const DEMO_TRACKING = { code: 'ORD-DEMO-2026', phone: '081234567890' };
const NOT_FOUND = 'Kode pesanan atau nomor WhatsApp tidak cocok. Periksa kembali data pada struk Anda.';

export const trackingApi = {
  async lookup(code, phone) {
    const normalizedCode = code.trim().toUpperCase();
    if (!validTrackingCredentials(normalizedCode, phone)) throw new Error('Masukkan kode pesanan dan nomor WhatsApp Indonesia yang valid.');
    if (isFirebaseConfigured) {
      try {
        const response = await httpsCallable(functions, 'getOrderProgress')({ code: normalizedCode, phone: normalizePhone(phone) });
        return response.data;
      } catch (error) {
        if (error.code === 'functions/not-found') throw new Error(NOT_FOUND);
        if (error.code === 'functions/resource-exhausted') throw new Error('Terlalu banyak percobaan. Tunggu 15 menit sebelum mencoba lagi.');
        throw new Error('Pelacakan belum dapat diakses. Coba lagi atau hubungi tim Lave Streat.');
      }
    }
    if (!isTrackingDemo) throw new Error('Pelacakan belum dikonfigurasi. Silakan hubungi tim Lave Streat.');
    if (normalizedCode === DEMO_TRACKING.code && normalizePhone(phone) === normalizePhone(DEMO_TRACKING.phone)) {
      const { initialGallery } = await import('./mockData');
      const time = new Date();
      const history = ['Menunggu Konfirmasi', 'Dikonfirmasi', 'Sedang Dijemput', 'Diproses', 'Siap Diantar']
        .map((status, index) => ({ status, timestamp: new Date(time.getTime() - (5 - index) * 3600000).toISOString() }));
      return { ...projectTrackingOrder({
        id: DEMO_TRACKING.code, status: 'Siap Diantar', metode: 'dijemput',
        created_at: history[0].timestamp, updated_at: history.at(-1).timestamp, status_history: history,
        items: [{ nama_snapshot: 'White Clean', qty: 1, kategori: 'cuci', before_after: initialGallery[0] }],
      }), demo: true };
    }
    // Only locally created demo orders; never look up the imported customer records.
    let orders = [];
    try { orders = JSON.parse(localStorage.getItem('lavestreat_orders_data_v17') || '[]'); } catch {}
    if (!Array.isArray(orders) || orders.length === 0) {
      const { initialOrders } = await import('./mockData');
      orders = initialOrders || [];
    }
    const order = orders.find(item => {
      const matchesCode = [item.id, item.invoice, item.invoice_number, item.order_id]
        .filter(Boolean)
        .some(c => String(c).trim().toUpperCase() === normalizedCode);
      const matchesPhone = [item.pelanggan?.telepon, item.customer_phone, item.customer?.telepon]
        .filter(Boolean)
        .some(p => normalizePhone(p) === normalizePhone(phone));
      return matchesCode && matchesPhone;
    });
    if (!order) throw new Error(NOT_FOUND);
    return { ...projectTrackingOrder(order), demo: true };
  },
};
