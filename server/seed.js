'use strict';
// Données de démonstration : node server/seed.js (ne touche pas aux utilisateurs)
require('dotenv').config();
const db = require('./db');
const sup = db.prepare('INSERT OR IGNORE INTO suppliers (name, phone) VALUES (?,?)');
['Importateur Riz Tana', 'Huilerie Antsirabe', 'Sucrerie Namakia'].forEach((n, i) => sup.run(n, '034 00 000 0' + i));
const s = (n) => db.prepare('SELECT id FROM suppliers WHERE name=?').get(n).id;
const P = [
  ['RIZ-50', 'Riz local vary gasy 50 kg', 'Riz', 'sac', 118000, 128000, 40, 20, 80, 'Importateur Riz Tana'],
  ['RIZ-25', 'Riz importé 25 kg', 'Riz', 'sac', 62000, 68000, 12, 15, 40, 'Importateur Riz Tana'],
  ['HUI-5L', 'Huile alimentaire 5 L', 'Huile', 'bidon', 32000, 36000, 60, 24, 120, 'Huilerie Antsirabe'],
  ['HUI-1L', 'Huile alimentaire 1 L', 'Huile', 'carton', 54000, 60000, 8, 10, 30, 'Huilerie Antsirabe'],
  ['SUC-50', 'Sucre 50 kg', 'Sucre', 'sac', 135000, 146000, 25, 10, 40, 'Sucrerie Namakia'],
  ['SEL-25', 'Sel iodé 25 kg', 'Sel', 'sac', 21000, 25000, 30, 10, 40, null],
  ['FAR-25', 'Farine de blé 25 kg', 'Farine', 'sac', 70000, 77000, 6, 10, 30, null],
  ['LAI-400', 'Lait en poudre 400 g', 'Lait', 'carton', 96000, 108000, 18, 8, 24, null]
];
const ins = db.prepare('INSERT OR IGNORE INTO products (sku,name,category,unit,buy_price,sell_price,stock,min_stock,target_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
P.forEach(p => ins.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9] ? s(p[9]) : null));
if (!db.prepare('SELECT 1 FROM customers').get())
  ['Épicerie Rakoto', 'Hotely Soa', 'Supermarché Tsaralalàna'].forEach(n => db.prepare('INSERT INTO customers (name, phone) VALUES (?,?)').run(n, '032 00 000 00'));
console.log('Données de démonstration insérées.');
