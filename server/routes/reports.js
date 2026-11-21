'use strict';
const router = require('express').Router();
const db = require('../db');
const { can } = require('../auth');
const { wrap, TZ } = require('../util');

router.get('/dashboard', can('stock.read', 'sales'), wrap((req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const today = `date(created_at, '${TZ}') = date('now', '${TZ}')`;
  res.json({
    stock_value: one('SELECT COALESCE(SUM(stock*buy_price),0) v FROM products WHERE active=1').v,
    products: one('SELECT COUNT(*) n FROM products WHERE active=1').n,
    low_stock: one('SELECT COUNT(*) n FROM products WHERE active=1 AND stock <= min_stock').n,
    sales_today: one(`SELECT COALESCE(SUM(total),0) v FROM invoices WHERE status='active' AND ${today}`).v,
    cash_today: one(`SELECT COALESCE(SUM(p.amount),0) v FROM payments p JOIN invoices i ON i.id=p.invoice_id
                     WHERE i.status='active' AND date(p.created_at,'${TZ}') = date('now','${TZ}')`).v,
    receivable: one("SELECT COALESCE(SUM(total-paid),0) v FROM invoices WHERE status='active'").v,
    critical: db.prepare('SELECT id,name,unit,stock,min_stock FROM products WHERE active=1 AND stock <= min_stock ORDER BY (stock*1.0/NULLIF(min_stock,0)) LIMIT 6').all()
  });
}));

router.get('/revenue', can('revenue'), wrap((req, res) => {
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  const now = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const from = ok(req.query.from) ? req.query.from : now.slice(0, 8) + '01';
  const to = ok(req.query.to) ? req.query.to : now;
  const inv = `i.status='active' AND date(i.created_at,'${TZ}') BETWEEN ? AND ?`;
  const one = (sql) => db.prepare(sql).get(from, to);
  const sales = one(`SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM invoices i WHERE ${inv}`);
  const cash = one(`SELECT COALESCE(SUM(p.amount),0) v FROM payments p JOIN invoices i ON i.id=p.invoice_id
                    WHERE i.status='active' AND date(p.created_at,'${TZ}') BETWEEN ? AND ?`);
  const cost = one(`SELECT COALESCE(SUM(it.qty*it.unit_cost),0) v FROM invoice_items it JOIN invoices i ON i.id=it.invoice_id WHERE ${inv}`);
  const unpaid = one(`SELECT COALESCE(SUM(total-paid),0) v FROM invoices i WHERE ${inv}`);
  res.json({
    from, to, sales_total: sales.v, invoices: sales.n, cash_in: cash.v, cost: cost.v,
    margin: sales.v - cost.v - 0, unpaid: unpaid.v,
    by_day: db.prepare(`SELECT date(i.created_at,'${TZ}') AS day, SUM(i.total) AS sales, COUNT(*) AS invoices FROM invoices i WHERE ${inv} GROUP BY day ORDER BY day`).all(from, to),
    by_method: db.prepare(`SELECT p.method, SUM(p.amount) AS amount FROM payments p JOIN invoices i ON i.id=p.invoice_id
                           WHERE i.status='active' AND date(p.created_at,'${TZ}') BETWEEN ? AND ? GROUP BY p.method ORDER BY amount DESC`).all(from, to),
    top_products: db.prepare(`SELECT it.product_name AS name, SUM(it.qty) AS qty, SUM(it.qty*it.unit_price) AS revenue, SUM(it.qty*(it.unit_price-it.unit_cost)) AS margin
                              FROM invoice_items it JOIN invoices i ON i.id=it.invoice_id WHERE ${inv} GROUP BY it.product_id ORDER BY revenue DESC LIMIT 10`).all(from, to)
  });
}));

// Aide au réapprovisionnement : produits sous le seuil + quantité suggérée + autonomie (jours)
router.get('/restock', can('restock'), wrap((req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.sku, p.name, p.unit, p.stock, p.min_stock, p.target_stock, p.buy_price, p.supplier_id, s.name AS supplier_name,
      COALESCE((SELECT SUM(it.qty) FROM invoice_items it JOIN invoices i ON i.id=it.invoice_id
                WHERE it.product_id=p.id AND i.status='active' AND i.created_at >= datetime('now','-30 days')),0) / 30.0 AS daily_sales
    FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.active = 1 AND p.stock <= p.min_stock ORDER BY (p.stock*1.0/NULLIF(p.min_stock,0)), p.name`).all();
  for (const r of rows) {
    const target = r.target_stock > r.min_stock ? r.target_stock : r.min_stock * 2;
    r.suggested = Math.max(Math.ceil(target - r.stock), 1);
    r.days_left = r.daily_sales > 0 ? Math.floor(r.stock / r.daily_sales) : null;
    r.estimated_cost = r.suggested * r.buy_price;
  }
  res.json(rows);
}));

router.get('/audit', can('audit'), wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all());
}));
module.exports = router;
