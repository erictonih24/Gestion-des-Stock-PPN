'use strict';
const router = require('express').Router();
const db = require('../db');
const { can } = require('../auth');
const { wrap, str, num, httpError } = require('../util');

// ---------- Produits ----------
const readProduct = (b) => {
  const min_stock = num(b.min_stock, { label: 'Stock minimum' });
  let target = num(b.target_stock ?? 0, { label: 'Stock cible' });
  if (target < min_stock) target = min_stock * 2;
  return {
    sku: str(b.sku, { max: 30, label: 'Référence' }).toUpperCase(),
    name: str(b.name, { label: 'Désignation' }),
    category: str(b.category || 'Divers', { max: 40, label: 'Catégorie' }),
    unit: str(b.unit || 'sac', { max: 15, label: 'Unité' }),
    buy_price: num(b.buy_price, { label: "Prix d'achat" }),
    sell_price: num(b.sell_price, { label: 'Prix de vente' }),
    min_stock, target_stock: target,
    supplier_id: b.supplier_id ? Number(b.supplier_id) : null
  };
};
router.get('/products', can('stock.read'), wrap((req, res) => {
  res.json(db.prepare(`SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
                       WHERE p.active = 1 ORDER BY p.category, p.name`).all());
}));
router.post('/products', can('stock.write'), wrap((req, res) => {
  const p = readProduct(req.body);
  if (db.prepare('SELECT 1 FROM products WHERE sku = ?').get(p.sku)) throw httpError(409, 'Cette référence existe déjà.');
  const r = db.prepare(`INSERT INTO products (sku,name,category,unit,buy_price,sell_price,min_stock,target_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(p.sku, p.name, p.category, p.unit, p.buy_price, p.sell_price, p.min_stock, p.target_stock, p.supplier_id);
  db.audit(req, 'PRODUIT_CREE', p.sku); res.status(201).json({ id: Number(r.lastInsertRowid) });
}));
router.put('/products/:id', can('stock.write'), wrap((req, res) => {
  const id = Number(req.params.id); const p = readProduct(req.body);
  const dup = db.prepare('SELECT id FROM products WHERE sku = ? AND id <> ?').get(p.sku, id);
  if (dup) throw httpError(409, 'Cette référence existe déjà.');
  const r = db.prepare(`UPDATE products SET sku=?,name=?,category=?,unit=?,buy_price=?,sell_price=?,min_stock=?,target_stock=?,supplier_id=? WHERE id=? AND active=1`)
    .run(p.sku, p.name, p.category, p.unit, p.buy_price, p.sell_price, p.min_stock, p.target_stock, p.supplier_id, id);
  if (!r.changes) throw httpError(404, 'Produit introuvable.');
  db.audit(req, 'PRODUIT_MODIFIE', p.sku); res.json({ ok: true });
}));
router.delete('/products/:id', can('stock.write'), wrap((req, res) => {
  if (!['admin', 'gerant'].includes(req.user.role)) throw httpError(403, 'Réservé au gérant.');
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(Number(req.params.id));
  db.audit(req, 'PRODUIT_ARCHIVE', String(req.params.id)); res.json({ ok: true });
}));
// Ajustement manuel (casse, inventaire, perte)
router.post('/products/:id/adjust', can('stock.write'), wrap((req, res) => {
  const id = Number(req.params.id);
  const delta = num(req.body.delta, { min: -1e9, label: 'Quantité' });
  const reason = str(req.body.reason, { max: 200, label: 'Motif' });
  if (!delta) throw httpError(400, 'Quantité nulle.');
  db.tx(() => {
    const r = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND active = 1 AND stock + ? >= 0').run(delta, id, delta);
    if (!r.changes) throw httpError(400, 'Ajustement impossible (produit introuvable ou stock négatif).');
    db.prepare('INSERT INTO stock_movements (product_id,type,qty,note,user_id) VALUES (?,?,?,?,?)').run(id, 'ajustement', delta, reason, req.user.id);
  });
  db.audit(req, 'STOCK_AJUSTE', `produit ${id}: ${delta} (${reason})`); res.json({ ok: true });
}));
router.get('/products/:id/movements', can('stock.read'), wrap((req, res) => {
  res.json(db.prepare(`SELECT m.*, u.full_name AS user FROM stock_movements m JOIN users u ON u.id = m.user_id
                       WHERE product_id = ? ORDER BY m.id DESC LIMIT 100`).all(Number(req.params.id)));
}));

// ---------- Fournisseurs ----------
router.get('/suppliers', can('stock.read', 'purchases'), wrap((req, res) => res.json(db.prepare('SELECT * FROM suppliers ORDER BY name').all())));
router.post('/suppliers', can('purchases'), wrap((req, res) => {
  const name = str(req.body.name, { label: 'Nom' });
  if (db.prepare('SELECT 1 FROM suppliers WHERE name = ?').get(name)) throw httpError(409, 'Ce fournisseur existe déjà.');
  const r = db.prepare('INSERT INTO suppliers (name, phone, address) VALUES (?,?,?)')
    .run(name, str(req.body.phone, { max: 30, required: false }), str(req.body.address, { max: 150, required: false }));
  db.audit(req, 'FOURNISSEUR_CREE', name); res.status(201).json({ id: Number(r.lastInsertRowid) });
}));

// ---------- Clients ----------
router.get('/customers', can('customers'), wrap((req, res) => {
  res.json(db.prepare(`SELECT c.*, COALESCE((SELECT SUM(i.total - i.paid) FROM invoices i WHERE i.customer_id = c.id AND i.status='active'),0) AS balance
                       FROM customers c WHERE c.active = 1 ORDER BY c.name`).all());
}));
router.post('/customers', can('customers'), wrap((req, res) => {
  const r = db.prepare('INSERT INTO customers (name, phone, address, nif) VALUES (?,?,?,?)').run(
    str(req.body.name, { label: 'Nom' }), str(req.body.phone, { max: 30, required: false }),
    str(req.body.address, { max: 150, required: false }), str(req.body.nif, { max: 30, required: false }));
  db.audit(req, 'CLIENT_CREE', req.body.name); res.status(201).json({ id: Number(r.lastInsertRowid) });
}));
router.put('/customers/:id', can('customers'), wrap((req, res) => {
  db.prepare('UPDATE customers SET name=?, phone=?, address=?, nif=? WHERE id=?').run(
    str(req.body.name, { label: 'Nom' }), str(req.body.phone, { max: 30, required: false }),
    str(req.body.address, { max: 150, required: false }), str(req.body.nif, { max: 30, required: false }), Number(req.params.id));
  res.json({ ok: true });
}));
module.exports = router;
