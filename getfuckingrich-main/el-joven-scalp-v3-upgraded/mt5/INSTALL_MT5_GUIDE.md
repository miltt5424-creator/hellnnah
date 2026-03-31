# 🤖 El Joven Scalp PRO — Guide MT5 Auto-Executor

## Architecture

```
[El Joven Dashboard] ──POST /api/mt5/command──► [Backend Node.js]
                                                        │
                                          poll every 3s │ POST /api/mt5/executor/next
                                                        ▼
                                               [MT5 Expert Advisor]
                                                        │
                                                   executes trade
                                                        │
                                          ACK  │ POST /api/mt5/executor/ack
                                               ▼
                                         [Backend logs]
```

## Étape 1 — Configurer le backend

Ajouter dans `backend/.env` :
```
MT5_BRIDGE_TOKEN=eljoven-secret  # choisir un token sécurisé
```

## Étape 2 — Compiler l'Expert Advisor

1. Ouvrir **MetaEditor** (depuis MT5 : menu Outils > MetaEditor ou F4)
2. Copier `ElJoven_MT5_AutoExecutor.mq5` dans :
   ```
   C:\Users\TON_USER\AppData\Roaming\MetaQuotes\Terminal\XXXX\MQL5\Experts\
   ```
3. Ouvrir le fichier dans MetaEditor
4. Cliquer **Compiler** (F7) — doit afficher 0 erreurs

## Étape 3 — Autoriser WebRequest dans MT5

⚠️ **OBLIGATOIRE** — sinon l'EA ne peut pas contacter le backend

1. MT5 : **Outils > Options > Expert Advisors**
2. Cocher **Autoriser les requêtes WebRequest pour les URL listées**
3. Ajouter : `http://localhost:3001` (ou ton URL de production)
4. Cliquer **OK**

## Étape 4 — Attacher l'EA au chart

1. Ouvrir un chart du symbole (ex: XAUUSD)
2. Dans l'Explorateur à gauche : **Expert Advisors > ElJoven_MT5_AutoExecutor**
3. Double-clic ou drag-drop sur le chart
4. Dans la fenêtre de configuration :
   - `ApiBaseUrl` = `http://localhost:3001` (ou ton serveur)
   - `BridgeToken` = `eljoven-secret` (identique au backend)
   - `AutoTradeEnabled` = `true`
   - `MagicNumber` = `202500`
   - `DeviationPoints` = `50`
5. Onglet **Commun** : cocher **Autoriser le trading en direct**
6. Cliquer **OK**

## Étape 5 — Vérifier la connexion

Le coin du chart affiche :
```
=== El Joven Scalp PRO ===
Symbol:      XAUUSD
Last Action: INIT
AutoTrade:   ON
Backend:     http://localhost:3001
```

Dans le Dashboard → panneau **MT5 EXECUTION BOT** :
- Le badge passe au vert **MT5 LIVE**
- Balance, Equity, positions affichées

## Étape 6 — Passer un ordre

**Depuis le dashboard :**
- Cliquer **BUY SIGNAL** ou **SELL SIGNAL** pour utiliser le dernier signal IA
- Ou entrer des lots manuellement et cliquer BUY/SELL

**Flux automatique (Auto-Execution ON) :**
1. L'auto-signal génère un BUY à 09:15
2. Le backend met la commande en queue
3. L'EA poll et récupère la commande en < 3 secondes
4. Trade exécuté → ACK envoyé au backend
5. Log dans l'onglet "📜 Log" du panel

## Paramètres importants

| Paramètre | Recommandé | Description |
|---|---|---|
| PollIntervalSec | 3 | Fréquence de poll (min 1s) |
| DeviationPoints | 50 | Slippage toléré (en points) |
| MagicNumber | 202500 | ID unique pour tes trades EA |
| AutoTradeEnabled | true | Activer/désactiver sans retirer l'EA |

## Symboles supportés

| El Joven | Broker MT5 |
|---|---|
| XAU/USD | XAUUSD |
| BTC/USD | BTCUSD |
| EUR/USD | EURUSD |
| GBP/USD | GBPUSD |
| USD/JPY | USDJPY |
| NAS100/USD | NAS100 |
| SPX500/USD | US500 |
| WTI/USD | USOIL |

> Si ton broker utilise un suffixe (ex: `XAUUSDm`, `XAUUSD.r`), utilise `BrokerSymbolOverride` dans les inputs de l'EA.

## Dépannage

**"WebRequest error 4060"** → URL pas dans la whitelist MT5 (voir Étape 3)

**Panel reste OFFLINE** → Vérifier que le backend tourne (`npm start` dans `/backend`)

**REJECTED "SymbolSelect failed"** → Ton broker utilise un suffixe. Configurer `BrokerSymbolOverride` dans l'EA.

**REJECTED "INVALID_STOPS"** → L'EA retente automatiquement sans SL/TP puis les applique via PositionModify

## ⚠️ Avertissement risque

Tester **obligatoirement** sur compte DÉMO avant compte RÉEL.
L'auto-exécution place des ordres réels en direct. Vérifier les paramètres de lot et de risque dans le panel Config.
