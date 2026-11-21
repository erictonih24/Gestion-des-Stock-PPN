'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { signSession, clearSession, requireAuth, publicUser, passwordProblem } = require('../auth');
const { wrap, httpError } = require('../util');

const DUMMY = bcrypt.hashSync('dummy-password-for-timing', 12);
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' } });

router.post('/login', limiter, wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const u = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  const generic = httpError(401, 'Identifiant ou mot de passe incorrect.');
  if (!u) { bcrypt.compareSync(password, DUMMY); await db.audit(req, 'LOGIN_ECHEC', 'inconnu'); throw generic; }
  if (u.locked_until && new Date(u.locked_until + 'Z') > new Date()) {
    throw httpError(423, 'Compte verrouillé temporairement après plusieurs échecs. Réessayez dans 15 minutes.');
  }
  if (!u.active || !bcrypt.compareSync(password, u.password_hash)) {
    const fails = u.failed_attempts + 1;
    const lock = fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ') : null;
    await db.run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [lock ? 0 : fails, lock, u.id]);
    await db.audit(req, 'LOGIN_ECHEC', lock ? 'compte verrouillé' : null);
    throw generic;
  }
  await db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [u.id]);
  signSession(res, u);
  req.user = u; await db.audit(req, 'LOGIN');
  res.json({ user: publicUser(u) });
}));

router.post('/logout', requireAuth, wrap(async (req, res) => { await db.audit(req, 'LOGOUT'); clearSession(res); res.json({ ok: true }); }));

router.get('/me', requireAuth, wrap((req, res) => {
  res.json({ user: publicUser(req.user), company: {
    name: process.env.COMPANY_NAME || 'Grossiste PPN', address: process.env.COMPANY_ADDRESS || '',
    phone: process.env.COMPANY_PHONE || '', nif: process.env.COMPANY_NIF || '', stat: process.env.COMPANY_STAT || '',
    currency: process.env.CURRENCY || 'Ar' } });
}));

router.post('/change-password', requireAuth, wrap(async (req, res) => {
  const { current, next } = req.body;
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) throw httpError(400, 'Mot de passe actuel incorrect.');
  const problem = passwordProblem(next); if (problem) throw httpError(400, problem);
  if (next === current) throw httpError(400, "Choisissez un mot de passe différent de l'ancien.");
  await db.run('UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?', [bcrypt.hashSync(next, 12), req.user.id]);
  signSession(res, await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]));
  await db.audit(req, 'MOT_DE_PASSE_CHANGE');
  res.json({ ok: true });
}));
module.exports = router;
