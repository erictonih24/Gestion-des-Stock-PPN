'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { can, passwordProblem } = require('../auth');
const { wrap, str, httpError } = require('../util');
const ROLES = ['admin', 'gerant', 'vendeur', 'magasinier'];
router.use(can('users'));

router.get('/', wrap(async (req, res) => {
  res.json(await db.all('SELECT id, username, full_name, role, active, locked_until, created_at FROM users ORDER BY full_name'));
}));
router.post('/', wrap(async (req, res) => {
  const username = str(req.body.username, { max: 40, label: 'Identifiant' });
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) throw httpError(400, 'Identifiant : 3 à 40 caractères (lettres, chiffres, . _ -).');
  const full_name = str(req.body.full_name, { label: 'Nom complet' });
  const role = req.body.role; if (!ROLES.includes(role)) throw httpError(400, 'Rôle invalide.');
  const pw = req.body.password; const p = passwordProblem(pw); if (p) throw httpError(400, p);
  if (await db.get('SELECT 1 AS x FROM users WHERE username = ?', [username])) throw httpError(409, 'Cet identifiant existe déjà.');
  const r = await db.run('INSERT INTO users (username, full_name, password_hash, role, must_change_password) VALUES (?,?,?,?,1)', [username, full_name, bcrypt.hashSync(pw, 12), role]);
  await db.audit(req, 'UTILISATEUR_CREE', `${username} (${role})`);
  res.status(201).json({ id: r.lastInsertRowid });
}));
router.put('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const u = await db.get('SELECT * FROM users WHERE id = ?', [id]); if (!u) throw httpError(404, 'Utilisateur introuvable.');
  const full_name = str(req.body.full_name, { label: 'Nom complet' });
  const role = req.body.role; if (!ROLES.includes(role)) throw httpError(400, 'Rôle invalide.');
  const active = req.body.active ? 1 : 0;
  if (id === req.user.id && (!active || role !== 'admin')) throw httpError(400, 'Vous ne pouvez pas retirer vos propres droits administrateur ni désactiver votre compte.');
  await db.run('UPDATE users SET full_name=?, role=?, active=?, token_version = token_version + 1 WHERE id=?', [full_name, role, active, id]);
  await db.audit(req, 'UTILISATEUR_MODIFIE', `${u.username} → ${role}, actif=${active}`);
  res.json({ ok: true });
}));
router.post('/:id/reset-password', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const u = await db.get('SELECT * FROM users WHERE id = ?', [id]); if (!u) throw httpError(404, 'Utilisateur introuvable.');
  const p = passwordProblem(req.body.password); if (p) throw httpError(400, p);
  await db.run('UPDATE users SET password_hash=?, must_change_password=1, failed_attempts=0, locked_until=NULL, token_version = token_version + 1 WHERE id=?', [bcrypt.hashSync(req.body.password, 12), id]);
  await db.audit(req, 'MOT_DE_PASSE_REINITIALISE', u.username);
  res.json({ ok: true });
}));
module.exports = router;
