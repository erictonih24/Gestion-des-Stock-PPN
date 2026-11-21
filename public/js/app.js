'use strict';
/* Gestion Stock PPN — application monopage (sans dépendance, compatible CSP stricte) */
const S = { user: null, company: {}, products: [], cart: [], pcart: [] };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + '\u00A0' + (S.company.currency || 'Ar');
const qty = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n || 0);
const when = (s) => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const METHODS = { especes: 'Espèces', mvola: 'MVola', orange_money: 'Orange Money', airtel_money: 'Airtel Money', virement: 'Virement', cheque: 'Chèque' };
const ROLES = { admin: 'Administrateur', gerant: 'Gérant', vendeur: 'Vendeur', magasinier: 'Magasinier' };
const can = (p) => S.user.permissions.includes(p);
const methodOptions = () => Object.entries(METHODS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ppn' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { location.replace('/'); throw new Error('Session expirée.'); }
  if (r.status === 403 && data.code === 'PASSWORD_CHANGE') { openPasswordModal(true); throw new Error(data.error); }
  if (!r.ok) throw new Error(data.error || 'Erreur.');
  return data;
}
let toastTimer;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 3500);
}
const fail = (e) => toast(e.message, true);

/* ---------- Modale ---------- */
function modal(title, html, { locked } = {}) {
  const d = $('#modal');
  d.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2>${locked ? '' : '<button class="btn small" data-action="close" aria-label="Fermer">Fermer</button>'}</div><div class="modal-body">${html}</div>`;
  d.oncancel = (e) => { if (locked) e.preventDefault(); };
  if (!d.open) d.showModal();
  const f = $('input,select', d); if (f) f.focus();
}
const closeModal = () => { const d = $('#modal'); if (d.open) d.close(); };

/* ---------- Jauges (largeurs posées via le DOM : compatible CSP) ---------- */
function applyGauges(root = document) {
  $$('.gauge', root).forEach(g => {
    const st = +g.dataset.stock, mn = +g.dataset.min, tg = Math.max(+g.dataset.target, mn * 2, 1);
    g.firstElementChild.style.width = Math.min(100, st / tg * 100) + '%';
    g.lastElementChild.style.left = Math.min(100, mn / tg * 100) + '%';
    g.classList.add(st <= mn ? 'low' : st <= mn * 1.5 ? 'mid' : 'ok');
  });
  $$('.bar[data-pct]', root).forEach(b => b.style.width = b.dataset.pct + '%');
}
const gauge = (p) => `<span class="gauge" data-stock="${p.stock}" data-min="${p.min_stock}" data-target="${p.target_stock}" role="img" aria-label="Stock ${qty(p.stock)}, minimum ${qty(p.min_stock)}"><i></i><b></b></span>`;

/* ---------- Navigation ---------- */
const NAV = [
  ['dashboard', 'Tableau de bord', 'stock.read'], ['sales', 'Nouvelle vente', 'sales'], ['invoices', 'Factures', 'sales'],
  ['customers', 'Clients', 'customers'], ['stock', 'Stock', 'stock.read'], ['purchases', 'Achats', 'purchases'],
  ['restock', 'Réapprovisionnement', 'restock'], ['revenue', 'Recettes', 'revenue'], ['users', 'Utilisateurs', 'users'], ['audit', 'Journal', 'audit']
];
const PAGES = { dashboard: pageDashboard, stock: pageStock, sales: pageSales, invoices: pageInvoices, customers: pageCustomers,
  purchases: pagePurchases, restock: pageRestock, revenue: pageRevenue, users: pageUsers, audit: pageAudit };

async function route() {
  const id = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  const item = NAV.find(n => n[0] === id && can(n[2])) || NAV.find(n => can(n[2]));
  $('#nav').innerHTML = NAV.filter(n => can(n[2])).map(n => `<a href="#/${n[0]}" ${n[0] === item[0] ? 'aria-current="page"' : ''}>${n[1]}</a>`).join('');
  document.title = item[1] + ' · Stock PPN';
  try { await PAGES[item[0]]($('#view')); applyGauges(); } catch (e) { if (e.message !== 'Session expirée.') $('#view').innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
}

/* ---------- Tableau de bord ---------- */
async function pageDashboard(v) {
  const d = await api('/dashboard');
  v.innerHTML = `<div class="page-head"><h1>Tableau de bord</h1></div>
  <dl class="ledger">
    <div><dt>Ventes du jour</dt><dd>${money(d.sales_today)}</dd></div>
    <div><dt>Encaissé aujourd'hui</dt><dd>${money(d.cash_today)}</dd></div>
    <div><dt>Créances clients</dt><dd>${money(d.receivable)}</dd></div>
    <div><dt>Valeur du stock</dt><dd>${money(d.stock_value)}</dd></div>
    <div class="${d.low_stock ? 'warn' : ''}"><dt>Produits sous le seuil</dt><dd>${d.low_stock} / ${d.products}</dd></div>
  </dl>
  <div class="panel"><div class="page-head"><h2>À réapprovisionner en priorité</h2>${can('restock') ? '<a class="btn small" href="#/restock">Préparer la commande</a>' : ''}</div>
  ${d.critical.length ? `<div class="tablewrap"><table><tbody>${d.critical.map(p => `<tr><td>${esc(p.name)}</td><td>${gauge({ ...p, target_stock: p.min_stock * 2 })}</td><td class="num">${qty(p.stock)} ${esc(p.unit)}</td><td class="num muted">min. ${qty(p.min_stock)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Tous les produits sont au-dessus de leur seuil minimum.</p>'}</div>`;
}

/* ---------- Stock ---------- */
async function pageStock(v) {
  const list = await api('/products'); S.products = list;
  const cats = [...new Set(list.map(p => p.category))].sort();
  v.innerHTML = `<div class="page-head"><h1>Stock</h1><div class="toolbar">
    <input type="search" id="q" placeholder="Rechercher un produit" aria-label="Rechercher">
    <select id="cat" aria-label="Catégorie"><option value="">Toutes les catégories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
    ${can('stock.write') ? '<button class="btn primary" data-action="product-new">Nouveau produit</button>' : ''}</div></div>
  <div class="tablewrap"><table><thead><tr><th>Réf.</th><th>Désignation</th><th>Niveau de stock</th><th class="num">Stock</th><th class="num">Prix achat</th><th class="num">Prix vente</th><th></th></tr></thead><tbody id="stock-body"></tbody></table></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), c = $('#cat').value;
    const rows = list.filter(p => (!c || p.category === c) && (p.name + p.sku).toLowerCase().includes(q));
    $('#stock-body').innerHTML = rows.length ? rows.map(p => `<tr><td>${esc(p.sku)}</td><td>${esc(p.name)}<br><span class="muted">${esc(p.category)}</span></td>
      <td>${gauge(p)}${p.stock <= p.min_stock ? '<span class="tag bad">Bas</span>' : ''}</td><td class="num">${qty(p.stock)} ${esc(p.unit)}</td>
      <td class="num">${money(p.buy_price)}</td><td class="num">${money(p.sell_price)}</td>
      <td class="actions"><button class="btn small" data-action="movements" data-id="${p.id}">Historique</button>
      ${can('stock.write') ? `<button class="btn small" data-action="adjust" data-id="${p.id}">Ajuster</button><button class="btn small" data-action="product-edit" data-id="${p.id}">Modifier</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="7" class="empty">Aucun produit trouvé.</td></tr>';
    applyGauges($('#stock-body'));
  };
  $('#q').oninput = draw; $('#cat').onchange = draw; draw();
}
async function productForm(p = {}) {
  const sup = await api('/suppliers');
  modal(p.id ? 'Modifier le produit' : 'Nouveau produit', `<form data-form="product" data-id="${p.id || ''}"><div class="form-grid">
    <label>Référence<input name="sku" required maxlength="30" value="${esc(p.sku)}"></label>
    <label>Catégorie<input name="category" maxlength="40" list="cats" value="${esc(p.category || 'Divers')}"></label>
    <label class="full">Désignation<input name="name" required maxlength="120" value="${esc(p.name)}"></label>
    <label>Unité de vente<input name="unit" maxlength="15" value="${esc(p.unit || 'sac')}"></label>
    <label>Fournisseur habituel<select name="supplier_id"><option value="">—</option>${sup.map(s => `<option value="${s.id}" ${s.id === p.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label>Prix d'achat<input name="buy_price" type="number" min="0" step="any" required value="${p.buy_price ?? ''}"></label>
    <label>Prix de vente<input name="sell_price" type="number" min="0" step="any" required value="${p.sell_price ?? ''}"></label>
    <label>Stock minimum (seuil d'alerte)<input name="min_stock" type="number" min="0" step="any" required value="${p.min_stock ?? 0}"></label>
    <label>Stock cible après réapprovisionnement<input name="target_stock" type="number" min="0" step="any" value="${p.target_stock ?? 0}"></label>
    </div><p class="form-error" hidden></p><div class="modal-foot"><button type="button" class="btn" data-action="close">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
}

/* ---------- Panier (ventes et achats) ---------- */
function cartHtml(kind) {
  const cart = kind === 'sale' ? S.cart : S.pcart, priceLabel = kind === 'sale' ? 'Prix unitaire' : "Prix d'achat";
  const editPrice = kind === 'purchase' || ['admin', 'gerant'].includes(S.user.role);
  if (!cart.length) return '<div class="empty">Ajoutez un produit pour commencer.</div>';
  return `<div class="tablewrap"><table><thead><tr><th>Produit</th><th class="num">Quantité</th><th class="num">${priceLabel}</th><th class="num">Total</th><th></th></tr></thead><tbody>
  ${cart.map((l, i) => `<tr><td>${esc(l.name)}${kind === 'sale' ? `<br><span class="muted">Dispo : ${qty(l.stock)} ${esc(l.unit)}</span>` : ''}</td>
    <td class="num"><input class="qty" type="number" min="0.01" step="any" value="${l.qty}" data-cart="${kind}" data-i="${i}" data-f="qty" aria-label="Quantité"></td>
    <td class="num">${editPrice ? `<input class="qty" type="number" min="0" step="any" value="${l.price}" data-cart="${kind}" data-i="${i}" data-f="price" aria-label="${priceLabel}">` : money(l.price)}</td>
    <td class="num" id="${kind}-line-${i}">${money(l.qty * l.price)}</td><td class="actions"><button class="btn small danger" data-action="cart-remove" data-kind="${kind}" data-i="${i}">Retirer</button></td></tr>`).join('')}
  </tbody></table></div>`;
}
const cartSubtotal = (kind) => (kind === 'sale' ? S.cart : S.pcart).reduce((s, l) => s + l.qty * l.price, 0);
function refreshCart(kind) {
  $('#' + kind + '-cart').innerHTML = cartHtml(kind); updateTotals(kind);
}
function updateTotals(kind) {
  const sub = cartSubtotal(kind);
  if (kind === 'sale') {
    const disc = Math.min(+($('#sale-discount')?.value || 0), sub);
    $('#sale-sub').textContent = money(sub); $('#sale-total').textContent = money(sub - disc);
  } else $('#purchase-total').textContent = money(sub);
}
function addToCart(kind) {
  const input = $('#' + kind + '-product'); const p = S.products.find(x => `${x.sku} — ${x.name}` === input.value);
  const q = +$('#' + kind + '-qty').value;
  if (!p) return toast('Choisissez un produit dans la liste.', true);
  if (!(q > 0)) return toast('Quantité invalide.', true);
  const cart = kind === 'sale' ? S.cart : S.pcart; const ex = cart.find(l => l.product_id === p.id);
  if (ex) ex.qty += q; else cart.push({ product_id: p.id, name: p.name, unit: p.unit, stock: p.stock, qty: q, price: kind === 'sale' ? p.sell_price : p.buy_price });
  input.value = ''; $('#' + kind + '-qty').value = 1; refreshCart(kind); input.focus();
}
const productPicker = (kind, label) => `<div class="cart-row"><label>Produit<input id="${kind}-product" list="${kind}-list" placeholder="Référence ou nom" autocomplete="off"></label>
  <label>Quantité<input id="${kind}-qty" type="number" min="0.01" step="any" value="1"></label><button class="btn primary" data-action="cart-add" data-kind="${kind}">${label}</button></div>
  <datalist id="${kind}-list">${S.products.map(p => `<option value="${esc(p.sku)} — ${esc(p.name)}"></option>`).join('')}</datalist>`;

/* ---------- Vente ---------- */
async function pageSales(v) {
  const [products, customers] = await Promise.all([api('/products'), api('/customers')]); S.products = products;
  const mgr = ['admin', 'gerant'].includes(S.user.role);
  v.innerHTML = `<div class="page-head"><h1>Nouvelle vente</h1></div>
  <div class="panel">${productPicker('sale', 'Ajouter à la vente')}<div id="sale-cart"></div></div>
  <div class="grid2"><div class="panel"><h3>Client et paiement</h3>
    <label>Client<select id="sale-customer"><option value="">Client comptoir</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
    <label>Mode de paiement<select id="sale-method">${methodOptions()}</select></label>
    <label>Montant payé maintenant<input id="sale-paid" type="number" min="0" step="any" value="0"></label>
    <button class="btn small" data-action="pay-full">Payé en totalité</button></div>
  <div class="panel"><h3>Total</h3><div class="totals"><div><span>Sous-total</span><b id="sale-sub">${money(0)}</b></div>
    ${mgr ? '<label>Remise<input id="sale-discount" type="number" min="0" step="any" value="0"></label>' : ''}
    <div class="big"><span>À payer</span><span id="sale-total">${money(0)}</span></div></div>
    <p class="form-error" id="sale-error" hidden></p><button class="btn primary" style="width:100%;margin-top:.8rem" data-action="sale-submit">Enregistrer la vente et créer la facture</button></div></div>`;
  refreshCart('sale');
}
async function submitSale(btn) {
  const err = $('#sale-error'); err.hidden = true;
  if (!S.cart.length) { err.textContent = 'Ajoutez au moins un produit.'; err.hidden = false; return; }
  btn.disabled = true;
  try {
    const r = await api('/invoices', 'POST', { customer_id: $('#sale-customer').value || null, method: $('#sale-method').value, paid: +$('#sale-paid').value || 0,
      discount: +($('#sale-discount')?.value || 0), items: S.cart.map(l => ({ product_id: l.product_id, qty: l.qty, unit_price: l.price })) });
    S.cart = []; toast('Facture ' + r.number + ' créée.'); await openInvoice(r.id); route();
  } catch (e) { err.textContent = e.message; err.hidden = false; } finally { btn.disabled = false; }
}

/* ---------- Factures ---------- */
async function pageInvoices(v) {
  v.innerHTML = `<div class="page-head"><h1>Factures</h1><div class="toolbar"><input type="search" id="iq" placeholder="N° ou client" aria-label="Rechercher une facture">
    <select id="ist" aria-label="Filtre"><option value="">Toutes</option><option value="impayee">Impayées</option></select></div></div><div id="inv-list"></div>`;
  const load = async () => {
    const list = await api(`/invoices?q=${encodeURIComponent($('#iq').value)}&status=${$('#ist').value}`);
    $('#inv-list').innerHTML = list.length ? `<div class="tablewrap"><table><thead><tr><th>N°</th><th>Date</th><th>Client</th><th class="num">Total</th><th class="num">Reste</th><th>État</th><th></th></tr></thead><tbody>
    ${list.map(i => { const rest = i.total - i.paid; return `<tr><td>${esc(i.number)}</td><td>${when(i.created_at)}</td><td>${esc(i.customer_name)}</td><td class="num">${money(i.total)}</td><td class="num">${money(rest)}</td>
      <td>${i.status === 'annulee' ? '<span class="tag bad">Annulée</span>' : rest > 0 ? '<span class="tag warn">À encaisser</span>' : '<span class="tag ok">Payée</span>'}</td>
      <td class="actions"><button class="btn small" data-action="invoice-open" data-id="${i.id}">Ouvrir</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Aucune facture.</div>';
  };
  let t; $('#iq').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); }; $('#ist').onchange = load; await load();
}
async function openInvoice(id) {
  const i = await api('/invoices/' + id), rest = i.total - i.paid, c = S.company;
  modal('Facture ' + i.number, `<div class="invoice"><div class="head"><div><h2>${esc(c.name)}</h2><p>${esc(c.address)}</p><p>${esc(c.phone)}</p>${c.nif ? `<p>NIF : ${esc(c.nif)}</p>` : ''}${c.stat ? `<p>STAT : ${esc(c.stat)}</p>` : ''}</div>
    <div class="right"><h2>${esc(i.number)}</h2><p>${when(i.created_at)}</p><p>Édité par ${esc(i.user)}</p>${i.status === 'annulee' ? '<p><span class="tag bad">ANNULÉE</span></p>' : ''}</div></div>
    <p><b>Client :</b> ${esc(i.customer_name)} ${i.customer_phone ? '· ' + esc(i.customer_phone) : ''}<br>${esc(i.customer_address || '')} ${i.customer_nif ? '· NIF ' + esc(i.customer_nif) : ''}</p>
    <div class="tablewrap"><table><thead><tr><th>Désignation</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Total</th></tr></thead><tbody>
    ${i.items.map(l => `<tr><td>${esc(l.product_name)}</td><td class="num">${qty(l.qty)}</td><td class="num">${money(l.unit_price)}</td><td class="num">${money(l.qty * l.unit_price)}</td></tr>`).join('')}</tbody></table></div>
    <div class="totals"><div><span>Sous-total</span><span>${money(i.subtotal)}</span></div>${i.discount ? `<div><span>Remise</span><span>− ${money(i.discount)}</span></div>` : ''}
    <div class="big"><span>Total</span><span>${money(i.total)}</span></div><div><span>Payé</span><span>${money(i.paid)}</span></div><div><b>Reste à payer</b><b>${money(rest)}</b></div></div>
    ${i.payments.length ? `<p class="muted">Paiements : ${i.payments.map(p => `${money(p.amount)} (${METHODS[p.method] || p.method}, ${when(p.created_at)})`).join(' ; ')}</p>` : ''}
    <p class="muted" style="margin-top:1.4rem">Merci pour votre confiance.</p></div>
    <div class="modal-foot no-print"><button class="btn" data-action="print">Imprimer</button>
    ${i.status === 'active' && can('revenue') ? `<button class="btn danger" data-action="invoice-cancel" data-id="${i.id}">Annuler la facture</button>` : ''}</div>
    ${i.status === 'active' && rest > 0 ? `<form data-form="payment" data-id="${i.id}" class="panel no-print"><h3>Enregistrer un paiement</h3><div class="form-grid">
      <label>Montant<input name="amount" type="number" min="1" max="${rest}" step="any" value="${rest}" required></label><label>Mode<select name="method">${methodOptions()}</select></label></div>
      <p class="form-error" hidden></p><button class="btn primary">Encaisser</button></form>` : ''}`);
}

/* ---------- Clients ---------- */
async function pageCustomers(v) {
  const list = await api('/customers');
  v.innerHTML = `<div class="page-head"><h1>Clients</h1><button class="btn primary" data-action="customer-new">Nouveau client</button></div>
  ${list.length ? `<div class="tablewrap"><table><thead><tr><th>Nom</th><th>Téléphone</th><th>Adresse</th><th class="num">Solde dû</th><th></th></tr></thead><tbody>
  ${list.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td><td class="num">${c.balance > 0 ? `<span class="tag warn">${money(c.balance)}</span>` : money(0)}</td>
  <td class="actions"><button class="btn small" data-action="customer-edit" data-id="${c.id}">Modifier</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucun client enregistré.</div>'}`;
  S.customers = list;
}
function customerForm(c = {}) {
  modal(c.id ? 'Modifier le client' : 'Nouveau client', `<form data-form="customer" data-id="${c.id || ''}"><div class="form-grid">
    <label class="full">Nom<input name="name" required maxlength="100" value="${esc(c.name)}"></label>
    <label>Téléphone<input name="phone" maxlength="30" value="${esc(c.phone)}"></label><label>NIF<input name="nif" maxlength="30" value="${esc(c.nif)}"></label>
    <label class="full">Adresse<input name="address" maxlength="150" value="${esc(c.address)}"></label></div>
    <p class="form-error" hidden></p><div class="modal-foot"><button type="button" class="btn" data-action="close">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
}

/* ---------- Achats ---------- */
async function pagePurchases(v) {
  const [products, suppliers, hist] = await Promise.all([api('/products'), api('/suppliers'), api('/purchases')]); S.products = products;
  v.innerHTML = `<div class="page-head"><h1>Achats et réceptions</h1></div>
  <div class="panel"><h3>Nouvel achat reçu</h3><div class="toolbar" style="margin-bottom:.8rem"><label style="margin:0">Fournisseur<select id="purchase-supplier"><option value="">—</option>${suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
  <button class="btn small" data-action="supplier-new">Nouveau fournisseur</button></div>
  ${productPicker('purchase', 'Ajouter')}<div id="purchase-cart"></div>
  <div class="totals"><div class="big"><span>Total achat</span><span id="purchase-total">${money(0)}</span></div></div>
  <label>Note<input id="purchase-note" maxlength="200" placeholder="N° de bon de livraison, remarque…"></label>
  <p class="form-error" id="purchase-error" hidden></p><button class="btn primary" data-action="purchase-submit">Réceptionner et ajouter au stock</button></div>
  <h3>Derniers achats</h3>${hist.length ? `<div class="tablewrap"><table><thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th>Reçu par</th><th class="num">Total</th></tr></thead><tbody>
  ${hist.map(p => `<tr><td>ACH-${p.id}</td><td>${when(p.created_at)}</td><td>${esc(p.supplier_name || '—')}</td><td>${esc(p.user)}</td><td class="num">${money(p.total)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aucun achat enregistré.</div>'}`;
  refreshCart('purchase');
}
async function submitPurchase(btn) {
  const err = $('#purchase-error'); err.hidden = true;
  if (!S.pcart.length) { err.textContent = 'Ajoutez au moins un produit.'; err.hidden = false; return; }
  btn.disabled = true;
  try {
    await api('/purchases', 'POST', { supplier_id: $('#purchase-supplier').value || null, note: $('#purchase-note').value, items: S.pcart.map(l => ({ product_id: l.product_id, qty: l.qty, unit_cost: l.price })) });
    S.pcart = []; toast('Achat réceptionné : stock mis à jour.'); route();
  } catch (e) { err.textContent = e.message; err.hidden = false; } finally { btn.disabled = false; }
}

/* ---------- Réapprovisionnement ---------- */
async function pageRestock(v) {
  const list = await api('/restock'); S.restock = list;
  v.innerHTML = `<div class="page-head"><h1>Réapprovisionnement</h1><div class="toolbar">
    <button class="btn" data-action="restock-copy" ${list.length ? '' : 'disabled'}>Copier le bon de commande</button>
    <button class="btn" data-action="restock-csv" ${list.length ? '' : 'disabled'}>Exporter en CSV</button>
    <button class="btn primary" data-action="restock-prepare" ${list.length ? '' : 'disabled'}>Préparer la réception</button></div></div>
  <p class="muted">Produits dont le stock est au niveau minimum ou en dessous. La quantité suggérée ramène le stock à sa valeur cible.</p>
  ${list.length ? `<div class="tablewrap"><table><thead><tr><th>Produit</th><th>Fournisseur</th><th>Stock</th><th class="num">Autonomie</th><th class="num">Qté suggérée</th><th class="num">Coût estimé</th></tr></thead><tbody>
  ${list.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.supplier_name || '—')}</td><td>${gauge({ ...p })}${qty(p.stock)} / min ${qty(p.min_stock)}</td>
  <td class="num">${p.days_left === null ? '—' : p.days_left + ' j'}</td><td class="num"><b>${qty(p.suggested)} ${esc(p.unit)}</b></td><td class="num">${money(p.estimated_cost)}</td></tr>`).join('')}</tbody></table></div>
  <p class="num" style="margin-top:.6rem"><b>Total estimé : ${money(list.reduce((s, p) => s + p.estimated_cost, 0))}</b></p>` : '<div class="empty">Rien à commander pour le moment.</div>'}`;
}
function restockText() {
  const by = {}; S.restock.forEach(p => (by[p.supplier_name || 'Sans fournisseur'] ||= []).push(p));
  return Object.entries(by).map(([s, ps]) => `Bon de commande — ${s}\n` + ps.map(p => `• ${p.name} : ${qty(p.suggested)} ${p.unit}`).join('\n')).join('\n\n');
}

/* ---------- Recettes ---------- */
async function pageRevenue(v) {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  v.innerHTML = `<div class="page-head"><h1>Recettes</h1><div class="toolbar"><label style="margin:0">Du<input type="date" id="rf" value="${today.slice(0, 8)}01"></label>
  <label style="margin:0">Au<input type="date" id="rt" value="${today}"></label><button class="btn primary" data-action="revenue-load">Afficher</button></div></div><div id="rev"></div>`;
  await loadRevenue();
}
async function loadRevenue() {
  const r = await api(`/revenue?from=${$('#rf').value}&to=${$('#rt').value}`), max = Math.max(...r.by_day.map(d => d.sales), 1);
  $('#rev').innerHTML = `<dl class="ledger"><div><dt>Chiffre d'affaires (${r.invoices} factures)</dt><dd>${money(r.sales_total)}</dd></div><div><dt>Encaissé</dt><dd>${money(r.cash_in)}</dd></div>
  <div><dt>Marge brute</dt><dd>${money(r.margin)}</dd></div><div class="${r.unpaid ? 'warn' : ''}"><dt>Reste à encaisser</dt><dd>${money(r.unpaid)}</dd></div></dl>
  <div class="grid2"><div class="panel"><h3>Ventes par jour</h3><div class="tablewrap bars"><table><tbody>${r.by_day.map(d => `<tr><td>${d.day.slice(5).split('-').reverse().join('/')}</td><td><span class="bar" data-pct="${d.sales / max * 100}"></span></td><td class="num">${money(d.sales)}</td></tr>`).join('') || '<tr><td class="empty">Aucune vente sur la période.</td></tr>'}</tbody></table></div></div>
  <div class="panel"><h3>Encaissements par mode de paiement</h3><div class="tablewrap"><table><tbody>${r.by_method.map(m => `<tr><td>${METHODS[m.method] || esc(m.method)}</td><td class="num">${money(m.amount)}</td></tr>`).join('') || '<tr><td class="empty">Aucun encaissement.</td></tr>'}</tbody></table></div></div></div>
  <h3 style="margin-top:1.2rem">Produits les plus vendus</h3><div class="tablewrap"><table><thead><tr><th>Produit</th><th class="num">Quantité</th><th class="num">Chiffre d'affaires</th><th class="num">Marge</th></tr></thead><tbody>
  ${r.top_products.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${qty(p.qty)}</td><td class="num">${money(p.revenue)}</td><td class="num">${money(p.margin)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Aucune vente.</td></tr>'}</tbody></table></div>`;
  applyGauges($('#rev'));
}

/* ---------- Utilisateurs & journal ---------- */
async function pageUsers(v) {
  const list = await api('/users'); S.users = list;
  v.innerHTML = `<div class="page-head"><h1>Utilisateurs</h1><button class="btn primary" data-action="user-new">Nouvel utilisateur</button></div>
  <div class="tablewrap"><table><thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>État</th><th></th></tr></thead><tbody>
  ${list.map(u => `<tr><td>${esc(u.full_name)}</td><td>${esc(u.username)}</td><td>${ROLES[u.role]}</td><td>${u.active ? '<span class="tag ok">Actif</span>' : '<span class="tag bad">Désactivé</span>'}</td>
  <td class="actions"><button class="btn small" data-action="user-edit" data-id="${u.id}">Modifier</button><button class="btn small" data-action="user-reset" data-id="${u.id}">Réinitialiser le mot de passe</button></td></tr>`).join('')}</tbody></table></div>
  <div class="panel" style="margin-top:1.2rem"><h3>Droits par rôle</h3><p class="muted"><b>Administrateur</b> : tout, y compris utilisateurs et journal. <b>Gérant</b> : stock, achats, ventes, remises, annulations, recettes. <b>Vendeur</b> : ventes, factures, clients ; consulte le stock ; vend au tarif officiel. <b>Magasinier</b> : stock, achats, réapprovisionnement.</p></div>`;
}
function userForm(u = {}) {
  modal(u.id ? "Modifier l'utilisateur" : 'Nouvel utilisateur', `<form data-form="user" data-id="${u.id || ''}"><div class="form-grid">
    <label>Nom complet<input name="full_name" required maxlength="120" value="${esc(u.full_name)}"></label>
    <label>Identifiant<input name="username" required maxlength="40" pattern="[a-zA-Z0-9._-]{3,40}" value="${esc(u.username)}" ${u.id ? 'disabled' : ''}></label>
    <label>Rôle<select name="role">${Object.entries(ROLES).map(([k, n]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    ${u.id ? `<label>Compte<select name="active"><option value="1" ${u.active ? 'selected' : ''}>Actif</option><option value="0" ${!u.active ? 'selected' : ''}>Désactivé</option></select></label>`
      : '<label>Mot de passe provisoire<input name="password" type="password" required minlength="10" autocomplete="new-password"></label>'}</div>
    <p class="muted">Mot de passe : 10 caractères minimum avec majuscules, minuscules et chiffres. L'utilisateur devra le changer à sa première connexion.</p>
    <p class="form-error" hidden></p><div class="modal-foot"><button type="button" class="btn" data-action="close">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
}
async function pageAudit(v) {
  const list = await api('/audit');
  v.innerHTML = `<div class="page-head"><h1>Journal d'activité</h1></div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détail</th><th>IP</th></tr></thead><tbody>
  ${list.map(a => `<tr><td>${when(a.created_at)}</td><td>${esc(a.username)}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td><td>${esc(a.ip)}</td></tr>`).join('')}</tbody></table></div>`;
}
function openPasswordModal(forced) {
  modal(forced ? 'Choisissez un nouveau mot de passe' : 'Changer le mot de passe', `<form data-form="password">
    ${forced ? '<p>Pour la sécurité du compte, remplacez le mot de passe provisoire avant de continuer.</p>' : ''}
    <label>Mot de passe actuel<input name="current" type="password" required autocomplete="current-password"></label>
    <label>Nouveau mot de passe<input name="next" type="password" required minlength="10" autocomplete="new-password"></label>
    <p class="muted">10 caractères minimum avec majuscules, minuscules et chiffres.</p><p class="form-error" hidden></p>
    <div class="modal-foot">${forced ? '' : '<button type="button" class="btn" data-action="close">Annuler</button>'}<button class="btn primary">Enregistrer</button></div></form>`, { locked: forced });
}

/* ---------- Événements ---------- */
const byId = (list, id) => list.find(x => x.id === +id);
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action, id = b.dataset.id;
  try {
    switch (a) {
      case 'close': closeModal(); break;
      case 'print': window.print(); break;
      case 'logout': await api('/auth/logout', 'POST'); location.replace('/'); break;
      case 'change-password': openPasswordModal(false); break;
      case 'product-new': await productForm(); break;
      case 'product-edit': await productForm(byId(S.products, id)); break;
      case 'adjust': { const p = byId(S.products, id); modal('Ajuster le stock — ' + p.name, `<form data-form="adjust" data-id="${p.id}"><p>Stock actuel : <b>${qty(p.stock)} ${esc(p.unit)}</b></p>
        <label>Variation (négative pour une perte ou casse)<input name="delta" type="number" step="any" required></label><label>Motif<input name="reason" required maxlength="200" placeholder="Inventaire, casse, perte…"></label>
        <p class="form-error" hidden></p><div class="modal-foot"><button type="button" class="btn" data-action="close">Annuler</button><button class="btn primary">Valider</button></div></form>`); break; }
      case 'movements': { const m = await api(`/products/${id}/movements`); modal('Historique du stock', m.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Type</th><th class="num">Qté</th><th>Réf.</th><th>Par</th></tr></thead><tbody>
        ${m.map(x => `<tr><td>${when(x.created_at)}</td><td>${esc(x.type)}${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ''}</td><td class="num">${x.qty > 0 ? '+' : ''}${qty(x.qty)}</td><td>${esc(x.ref)}</td><td>${esc(x.user)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun mouvement.</p>'); break; }
      case 'cart-add': addToCart(b.dataset.kind); break;
      case 'cart-remove': (b.dataset.kind === 'sale' ? S.cart : S.pcart).splice(+b.dataset.i, 1); refreshCart(b.dataset.kind); break;
      case 'pay-full': $('#sale-paid').value = Math.max(0, cartSubtotal('sale') - +($('#sale-discount')?.value || 0)); break;
      case 'sale-submit': await submitSale(b); break;
      case 'purchase-submit': await submitPurchase(b); break;
      case 'supplier-new': modal('Nouveau fournisseur', `<form data-form="supplier"><label>Nom<input name="name" required maxlength="120"></label><label>Téléphone<input name="phone" maxlength="30"></label>
        <p class="form-error" hidden></p><div class="modal-foot"><button type="button" class="btn" data-action="close">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`); break;
      case 'invoice-open': await openInvoice(id); break;
      case 'invoice-cancel': modal("Annuler la facture", `<form data-form="cancel" data-id="${id}"><p>Le stock des produits sera remis en vente. Cette action est enregistrée dans le journal.</p>
        <label>Motif de l'annulation<input name="reason" required maxlength="200"></label><p class="form-error" hidden></p><div class="modal-foot"><button type="button" class="btn" data-action="close">Retour</button><button class="btn danger">Annuler la facture</button></div></form>`); break;
      case 'customer-new': customerForm(); break;
      case 'customer-edit': customerForm(byId(S.customers, id)); break;
      case 'user-new': userForm(); break;
      case 'user-edit': userForm(byId(S.users, id)); break;
      case 'user-reset': modal('Réinitialiser le mot de passe', `<form data-form="reset" data-id="${id}"><label>Nouveau mot de passe provisoire<input name="password" type="password" required minlength="10" autocomplete="new-password"></label>
        <p class="form-error" hidden></p><div class="modal-foot"><button type="button" class="btn" data-action="close">Annuler</button><button class="btn primary">Réinitialiser</button></div></form>`); break;
      case 'restock-copy': await navigator.clipboard.writeText(restockText()); toast('Bon de commande copié : collez-le dans WhatsApp ou un SMS.'); break;
      case 'restock-csv': { const csv = 'Produit;Fournisseur;Stock;Quantité suggérée;Unité\n' + S.restock.map(p => [p.name, p.supplier_name || '', p.stock, p.suggested, p.unit].map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
        const a2 = document.createElement('a'); a2.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' })); a2.download = 'reapprovisionnement.csv'; a2.click(); URL.revokeObjectURL(a2.href); break; }
      case 'restock-prepare': { const all = await api('/products'); S.products = all; S.pcart = S.restock.map(p => ({ product_id: p.id, name: p.name, unit: p.unit, qty: p.suggested, price: p.buy_price }));
        location.hash = '#/purchases'; break; }
      case 'revenue-load': await loadRevenue(); break;
    }
  } catch (ex) { fail(ex); }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.cart) { const kind = t.dataset.cart, l = (kind === 'sale' ? S.cart : S.pcart)[+t.dataset.i]; l[t.dataset.f] = +t.value || 0; $(`#${kind}-line-${t.dataset.i}`).textContent = money(l.qty * l.price); updateTotals(kind); }
  if (t.id === 'sale-discount') updateTotals('sale');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && /^(sale|purchase)-(product|qty)$/.test(e.target.id)) { e.preventDefault(); addToCart(e.target.id.split('-')[0]); } });
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  const kind = f.dataset.form, id = f.dataset.id, fd = Object.fromEntries(new FormData(f)), err = $('.form-error', f), btn = $('button:not([type=button])', f);
  err.hidden = true; btn.disabled = true;
  try {
    if (kind === 'product') { await api(id ? '/products/' + id : '/products', id ? 'PUT' : 'POST', fd); toast('Produit enregistré.'); closeModal(); route(); }
    else if (kind === 'adjust') { await api(`/products/${id}/adjust`, 'POST', { delta: +fd.delta, reason: fd.reason }); toast('Stock ajusté.'); closeModal(); route(); }
    else if (kind === 'supplier') { await api('/suppliers', 'POST', fd); toast('Fournisseur ajouté.'); closeModal(); route(); }
    else if (kind === 'customer') { await api(id ? '/customers/' + id : '/customers', id ? 'PUT' : 'POST', fd); toast('Client enregistré.'); closeModal(); route(); }
    else if (kind === 'payment') { await api(`/invoices/${id}/payments`, 'POST', { amount: +fd.amount, method: fd.method }); toast('Paiement enregistré.'); await openInvoice(id); route(); }
    else if (kind === 'cancel') { await api(`/invoices/${id}/cancel`, 'POST', { reason: fd.reason }); toast('Facture annulée.'); closeModal(); route(); }
    else if (kind === 'user') { await api(id ? '/users/' + id : '/users', id ? 'PUT' : 'POST', id ? { ...byId(S.users, id), ...fd, active: fd.active === '1' } : fd); toast('Utilisateur enregistré.'); closeModal(); route(); }
    else if (kind === 'reset') { await api(`/users/${id}/reset-password`, 'POST', fd); toast('Mot de passe réinitialisé.'); closeModal(); }
    else if (kind === 'password') { await api('/auth/change-password', 'POST', fd); toast('Mot de passe modifié.'); closeModal(); if (!S.user) init(); else route(); }
  } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.disabled = false; }
});
window.addEventListener('hashchange', route);

async function init() {
  try {
    const me = await api('/auth/me'); S.user = me.user; S.company = me.company;
    $('#who').textContent = `${me.user.full_name} · ${ROLES[me.user.role]}`;
    if (me.user.must_change_password) { openPasswordModal(true); return; }
    await route();
  } catch (e) { if (e.message !== 'Session expirée.') $('#view').innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
init();
