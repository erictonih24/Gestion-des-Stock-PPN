'use strict';
// Données de démonstration : node server/seed.js (utilise TURSO_* du .env si présents)
require('dotenv').config();
const db = require('./db');
(async () => {
  await db.ready;
  for (const [i, n] of ['Importateur Riz Tana', 'Huilerie Antsirabe', 'Sucrerie Namakia'].entries())
    await db.run('INSERT OR IGNORE INTO suppliers (name, phone) VALUES (?,?)', [n, '034 00 000 0' + i]);
  const sid = async (n) => (await db.get('SELECT id FROM suppliers WHERE name=?', [n])).id;
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
  for (const p of P) await db.run('INSERT OR IGNORE INTO products (sku,name,category,unit,buy_price,sell_price,stock,min_stock,target_stock,supplier_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9] ? await sid(p[9]) : null]);
  if (!(await db.get('SELECT 1 AS x FROM customers')))
    for (const n of ['Épicerie Rakoto', 'Hotely Soa', 'Supermarché Tsaralalàna']) await db.run('INSERT INTO customers (name, phone) VALUES (?,?)', [n, '032 00 000 00']);
  console.log('Données de démonstration insérées.'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
