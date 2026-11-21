'use strict';
const router = require('express').Router();
const db = require('../db');
const { can } = require('../auth');
const { wrap, num, str, httpError } = require('../util');
const METHODS = ['especes', 'mvola', 'orange_money', 'airtel_money', 'virement', 'cheque'];
const isManager = (u) => ['admin', 'gerant'].includes(u.role);

// ---------- Achats (réapprovisionnement reçu) ----------
router.get('/purchases', can('purchases'), wrap((req, res) => {
  res.json(db.prepare(`SELECT p.*, s.name AS supplier_name, u.full_name AS user FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 200`).all());
}));
router.post('/purchases', can('purchases'), wrap((req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length || items.length > 200) throw httpError(400, 'Ajoutez au moins un produit.');
  const supplier_id = req.body.supplier_id ? Number(req.body.supplier_id) : null;
  const note = str(req.body.note, { max: 200, required: false });
  const id = db.tx(() => {
    let total = 0;
    const clean = items.map(it => {
      const qty = num(it.qty, { min: 0.001, label: 'Quantité' }), cost = num(it.unit_cost, { label: "Prix d'achat" });
      total += qty * cost; return { product_id: Number(it.product_id), qty, cost };
    });
    const pid = Number(db.prepare('INSERT INTO purchases (supplier_id,total,note,user_id) VALUES (?,?,?,?)').run(supplier_id, total, note, req.user.id).lastInsertRowid);
    for (const it of clean) {
      const r = db.prepare('UPDATE products SET stock = stock + ?, buy_price = ? WHERE id = ? AND active = 1').run(it.qty, it.cost, it.product_id);
      if (!r.changes) throw httpError(400, 'Produit introuvable.');
      db.prepare('INSERT INTO purchase_items (purchase_id,product_id,qty,unit_cost) VALUES (?,?,?,?)').run(pid, it.product_id, it.qty, it.cost);
      db.prepare('INSERT INTO stock_movements (product_id,type,qty,ref,user_id) VALUES (?,?,?,?,?)').run(it.product_id, 'achat', it.qty, `ACH-${pid}`, req.user.id);
    }
    return pid;
  });
  db.audit(req, 'ACHAT_RECU', `ACH-${id}`); res.status(201).json({ id });
}));

// ---------- Factures / ventes ----------
router.get('/invoices', can('sales'), wrap((req, res) => {
  const { q, status } = req.query; const args = []; let where = '1=1';
  if (q) { where += ' AND (i.number LIKE ? OR i.customer_name LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  if (status === 'impayee') where += " AND i.status='active' AND i.paid < i.total";
  res.json(db.prepare(`SELECT i.*, u.full_name AS user FROM invoices i JOIN users u ON u.id = i.user_id
                       WHERE ${where} ORDER BY i.id DESC LIMIT 200`).all(...args));
}));
router.get('/invoices/:id', can('sales'), wrap((req, res) => {
  const id = Number(req.params.id);
  const inv = db.prepare(`SELECT i.*, u.full_name AS user, c.phone AS customer_phone, c.address AS customer_address, c.nif AS customer_nif
    FROM invoices i JOIN users u ON u.id = i.user_id LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = ?`).get(id);
  if (!inv) throw httpError(404, 'Facture introuvable.');
  inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
  inv.payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY id').all(id);
  res.json(inv);
}));
router.post('/invoices', can('sales'), wrap((req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length || items.length > 100) throw httpError(400, 'Ajoutez au moins un produit.');
  const method = METHODS.includes(req.body.method) ? req.body.method : 'especes';
  const result = db.tx(() => {
    let customer = null, name = str(req.body.customer_name || 'Client comptoir', { max: 100 });
    if (req.body.customer_id) {
      customer = db.prepare('SELECT * FROM customers WHERE id = ? AND active = 1').get(Number(req.body.customer_id));
      if (!customer) throw httpError(400, 'Client introuvable.'); name = customer.name;
    }
    let subtotal = 0; const lines = [];
    for (const it of items) {
      const qty = num(it.qty, { min: 0.001, label: 'Quantité' });
      const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(it.product_id));
      if (!p) throw httpError(400, 'Produit introuvable.');
      if (p.stock < qty) throw httpError(400, `Stock insuffisant pour « ${p.name} » (disponible : ${p.stock} ${p.unit}).`);
      // Seuls admin/gérant peuvent modifier le prix ; le vendeur vend au tarif officiel.
      const price = isManager(req.user) && it.unit_price !== undefined ? num(it.unit_price, { label: 'Prix' }) : p.sell_price;
      subtotal += qty * price; lines.push({ p, qty, price });
    }
    const discount = isManager(req.user) ? num(req.body.discount || 0, { max: subtotal, label: 'Remise' }) : 0;
    const total = subtotal - discount;
    const paid = num(req.body.paid || 0, { max: total, label: 'Montant payé' });
    const inv = Number(db.prepare('INSERT INTO invoices (customer_id,customer_name,subtotal,discount,total,paid,user_id) VALUES (?,?,?,?,?,?,?)')
      .run(customer?.id ?? null, name, subtotal, discount, total, paid, req.user.id).lastInsertRowid);
    const number = `FAC-${new Date().getFullYear()}-${String(inv).padStart(6, '0')}`;
    db.prepare('UPDATE invoices SET number = ? WHERE id = ?').run(number, inv);
    for (const l of lines) {
      const r = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').run(l.qty, l.p.id, l.qty);
      if (!r.changes) throw httpError(400, `Stock insuffisant pour « ${l.p.name} ».`);
      db.prepare('INSERT INTO invoice_items (invoice_id,product_id,product_name,qty,unit_price,unit_cost) VALUES (?,?,?,?,?,?)').run(inv, l.p.id, l.p.name, l.qty, l.price, l.p.buy_price);
      db.prepare('INSERT INTO stock_movements (product_id,type,qty,ref,user_id) VALUES (?,?,?,?,?)').run(l.p.id, 'vente', -l.qty, number, req.user.id);
    }
    if (paid > 0) db.prepare('INSERT INTO payments (invoice_id,amount,method,user_id) VALUES (?,?,?,?)').run(inv, paid, method, req.user.id);
    return { id: inv, number };
  });
  db.audit(req, 'FACTURE_CREEE', result.number); res.status(201).json(result);
}));
router.post('/invoices/:id/payments', can('sales'), wrap((req, res) => {
  const id = Number(req.params.id); const method = METHODS.includes(req.body.method) ? req.body.method : 'especes';
  db.tx(() => {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!inv || inv.status !== 'active') throw httpError(400, 'Facture introuvable ou annulée.');
    const amount = num(req.body.amount, { min: 1, max: inv.total - inv.paid, label: 'Montant (reste à payer dépassé ?)' });
    db.prepare('INSERT INTO payments (invoice_id,amount,method,user_id) VALUES (?,?,?,?)').run(id, amount, method, req.user.id);
    db.prepare('UPDATE invoices SET paid = paid + ? WHERE id = ?').run(amount, id);
    db.audit(req, 'PAIEMENT', `${inv.number}: ${amount}`);
  });
  res.status(201).json({ ok: true });
}));
router.post('/invoices/:id/cancel', can('revenue'), wrap((req, res) => {
  const id = Number(req.params.id); const reason = str(req.body.reason, { max: 200, label: 'Motif' });
  db.tx(() => {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!inv || inv.status !== 'active') throw httpError(400, 'Facture introuvable ou déjà annulée.');
    for (const it of db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id)) {
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.qty, it.product_id);
      db.prepare('INSERT INTO stock_movements (product_id,type,qty,ref,note,user_id) VALUES (?,?,?,?,?,?)').run(it.product_id, 'annulation', it.qty, inv.number, reason, req.user.id);
    }
    db.prepare("UPDATE invoices SET status = 'annulee' WHERE id = ?").run(id);
    db.audit(req, 'FACTURE_ANNULEE', `${inv.number}: ${reason}`);
  });
  res.json({ ok: true });
}));
module.exports = router;
