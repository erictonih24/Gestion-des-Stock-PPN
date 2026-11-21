'use strict';
const num = (v, { min = 0, max = 1e12, label = 'Valeur' } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw httpError(400, `${label} invalide.`);
  return n;
};
const str = (v, { max = 120, label = 'Texte', required = true } = {}) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw httpError(400, `${label} obligatoire.`);
  if (s.length > max) throw httpError(400, `${label} trop long.`);
  return s;
};
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };
const TZ = process.env.TZ_OFFSET || '+3 hours';
module.exports = { num, str, httpError, wrap, TZ };
