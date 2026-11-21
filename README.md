# Gestion des Stocks PPN

Application web de gestion pour un grossiste de produits de première nécessité (riz, huile, sucre, sel, farine, lait…) :
connexion sécurisée, stock, achats, ventes, facturation clients, recettes et aide au réapprovisionnement.
Installable comme application (PWA) sur téléphone et ordinateur, avec une version logiciel de bureau (Electron).

## Démarrage rapide

Prérequis : **Node.js ≥ 22.13** (la base SQLite est intégrée à Node, aucune compilation native).

```bash
git clone https://github.com/erictonih24/Gestion-des-Stock-PPN.git
cd Gestion-des-Stock-PPN
npm install
cp .env.example .env        # puis éditer .env (JWT_SECRET, ADMIN_PASSWORD, infos société)
npm start                   # http://localhost:3000
npm run seed                # (optionnel) données de démonstration
```

Au premier démarrage, le compte `ADMIN_USERNAME` est créé avec `ADMIN_PASSWORD` ; **le changement du mot de passe est exigé à la première connexion**.

## Modules

| Page | Contenu |
|---|---|
| Tableau de bord | Ventes et encaissements du jour, créances, valeur du stock, produits sous le seuil |
| Stock | Produits, niveau visuel (jauge), seuil minimum et stock cible, ajustements (casse, inventaire), historique des mouvements |
| Nouvelle vente | Panier, client, remise (gérant), paiement partiel ou total (espèces, MVola, Orange Money, Airtel Money, virement, chèque) |
| Factures | Recherche, impayées, encaissement d'un solde, impression, annulation (remet le stock) |
| Clients | Fiches clients et solde dû |
| Achats | Réception fournisseur : stock augmenté, prix d'achat mis à jour |
| Réapprovisionnement | Liste des produits sous le seuil, quantité suggérée, autonomie en jours, bon de commande à copier (WhatsApp/SMS), export CSV, pré-remplissage de la réception |
| Recettes | Chiffre d'affaires, encaissé, marge brute, reste à encaisser, ventes par jour, par mode de paiement, meilleurs produits |
| Utilisateurs / Journal | Comptes, rôles, réinitialisation, journal d'audit |

## Rôles

| | Admin | Gérant | Vendeur | Magasinier |
|---|:-:|:-:|:-:|:-:|
| Utilisateurs, journal | ✔ | | | |
| Recettes, annulation de facture, remises, prix libre | ✔ | ✔ | | |
| Ventes, factures, clients | ✔ | ✔ | ✔ | |
| Voir le stock | ✔ | ✔ | ✔ | ✔ |
| Modifier le stock, achats, réapprovisionnement | ✔ | ✔ | | ✔ |

Les droits sont **vérifiés côté serveur** (`server/auth.js`), pas seulement masqués dans l'interface.

## Sécurité

- Mots de passe hachés avec bcrypt (coût 12) ; politique : 10 caractères minimum, majuscules + minuscules + chiffres.
- Session par cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` en production), expiration 8 h, révocation à chaque changement de mot de passe, de rôle ou de statut.
- Protection contre la force brute : limitation de débit sur la connexion et verrouillage du compte 15 min après 5 échecs ; message d'erreur identique que le compte existe ou non.
- Protection CSRF : cookie SameSite + en-tête obligatoire sur toutes les écritures.
- En-têtes Helmet et **CSP stricte** (aucun script ni style en ligne), échappement systématique du HTML affiché.
- Requêtes SQL paramétrées uniquement ; validation des entrées ; stock jamais négatif (contrainte base + transactions atomiques).
- Un vendeur ne peut pas modifier un prix : le serveur applique le tarif officiel.
- Journal d'audit (connexions, échecs, créations, ajustements, annulations, accès refusés).
- Le service worker ne met jamais en cache les données `/api`.

### Mise en production (checklist)

1. `NODE_ENV=production`, un `JWT_SECRET` aléatoire de 48 octets, HTTPS obligatoire (reverse proxy Nginx/Caddy, ou hébergement avec TLS).
2. Sauvegarder régulièrement le dossier `data/` (fichier `stock.db`).
3. Ne jamais versionner `.env` ni `data/` (déjà dans `.gitignore`).
4. Créer un compte par personne ; désactiver les comptes des anciens employés.

## Application et logiciel

- **Application mobile/PC (PWA)** : ouvrir le site dans Chrome/Edge/Safari puis « Installer l'application » / « Ajouter à l'écran d'accueil ».
- **Logiciel de bureau** : `npm run desktop` (lance la fenêtre Electron vers `http://localhost:3000`, ou `STOCK_URL=https://votre-domaine`). Pour créer l'installateur : `cd desktop && npm run build`.

## Structure

```
server/            API Express (index.js, db.js, auth.js, routes/)
public/            Interface (index.html = connexion, app.html = application, js/, css/, PWA)
desktop/           Coquille Electron
data/              Base SQLite (créée automatiquement, hors Git)
```
