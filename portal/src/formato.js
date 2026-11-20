// Formatação partilhada pelo portal.
export const hh = (h) => String(h).padStart(2, '0') + ':00';
export const fmt = (v, casas = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: 'always' }));
/** Minutos para "1h42". */
export const hm = (m) => {
  const t = Math.round(m);
  return Math.floor(t / 60) + 'h' + String(t % 60).padStart(2, '0');
};
/** Minutos do dia para "09:42". */
export const hc = (m) => {
  const t = Math.round(m);
  return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};
/** Hora do dia em horas (13.5) para "13:30". */
export const relogio = (t) => hc(t * 60);
export const NOMES_CENARIO = { normal: 'dia normal', chuva: 'dia de chuva' };
