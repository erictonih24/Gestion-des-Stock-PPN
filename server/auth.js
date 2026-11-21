'use strict';
const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32 || SECRET === 'CHANGER_MOI') {
  console.error('JWT_SECRET manquant ou trop court (32 caractères minimum). Voir .env.example.');
  process.exit(1);
}
const COOKIE = 'ppn_session';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 h

const PERMISSIONS = {
  admin:      ['users', 'stock.read', 'stock.write', 'purchases', 'sales', 'customers', 'revenue', 'restock', 'audit'],
  gerant:     ['stock.read', 'stock.write', 'purchases', 'sales', 'customers', 'revenue', 'restock'],
  vendeur:    ['stock.read', 'sales', 'customers'],
  magasinier: ['stock.read', 'stock.write', 'purchases', 'restock']
};

function signSession(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.token_version }, SECRET, { expiresIn: '8h' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: MAX_AGE_MS, path: '/'
  });
}
function clearSession(res) { res.clearCookie(COOKIE, { path: '/' }); }

function publicUser(u) {
  return { id: u.id, username: u.username, full_name: u.full_name, role: u.role,
           must_change_password: !!u.must_change_password, permissions: PERMISSIONS[u.role] || [] };
}

async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });
  try {
    const p = jwt.verify(token, SECRET);
    const u = await db.get('SELECT * FROM users WHERE id = ?', [p.sub]);
    if (!u || !u.active || u.token_version !== p.v) return res.status(401).json({ error: 'Session expirée.' });
    req.user = u;
    if (u.must_change_password && !req.originalUrl.startsWith('/api/auth/')) {
      return res.status(403).json({ error: 'Changez votre mot de passe pour continuer.', code: 'PASSWORD_CHANGE' });
    }
    next();
  } catch { res.status(401).json({ error: 'Session expirée.' }); }
}
const can = (...perms) => async (req, res, next) => {
  const mine = PERMISSIONS[req.user.role] || [];
  if (perms.some(p => mine.includes(p))) return next();
  await db.audit(req, 'ACCES_REFUSE', `${req.method} ${req.originalUrl}`);
  res.status(403).json({ error: "Vous n'avez pas le droit d'effectuer cette action." });
};
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Utilisez des majuscules, minuscules et chiffres.';
  return null;
}
module.exports = { signSession, clearSession, requireAuth, can, publicUser, passwordProblem, PERMISSIONS };
