'use strict';
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { requireAuth, passwordProblem } = require('./auth');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"]
  } },
  hsts: PROD ? undefined : false
}));
// Attend la création des tables et du compte admin avant de traiter une requête
const ready = db.ready.then(bootstrapAdmin);
app.use((req, res, next) => ready.then(() => next(), next));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// Protection CSRF : cookie SameSite=Strict + en-tête personnalisé obligatoire sur les écritures
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'ppn') {
    return res.status(403).json({ error: 'Requête refusée.' });
  }
  res.set('Cache-Control', 'no-store'); next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', requireAuth, require('./routes/users'));
app.use('/api', requireAuth, require('./routes/catalog'), require('./routes/operations'), require('./routes/reports'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Introuvable.' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: PROD ? '1h' : 0 }));
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err); res.status(500).json({ error: 'Erreur interne du serveur.' });
});

// Création du compte administrateur au premier démarrage
async function bootstrapAdmin() {
  if (await db.get('SELECT 1 AS x FROM users LIMIT 1')) return;
  const u = process.env.ADMIN_USERNAME || 'admin';
  const pw = process.env.ADMIN_PASSWORD;
  const problem = passwordProblem(pw);
  if (problem) { console.error('ADMIN_PASSWORD invalide : ' + problem + ' (voir .env.example).'); throw new Error('ADMIN_PASSWORD invalide'); }
  await db.run("INSERT OR IGNORE INTO users (username, full_name, password_hash, role, must_change_password) VALUES (?,?,?,?,1)", [u, 'Administrateur', bcrypt.hashSync(pw, 12), 'admin']);
  console.log(`Compte administrateur « ${u} » créé (changement de mot de passe exigé à la 1re connexion).`);
}
module.exports = app;
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000;
  ready.then(() => app.listen(port, () => console.log(`Gestion Stock PPN → http://localhost:${port}`)))
       .catch(() => process.exit(1));
}
