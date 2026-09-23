# Casi d'uso — Loom

> Documento di riferimento per i test E2E. Ogni caso d'uso elenca attore, precondizioni, flusso principale, flussi alternativi ed esito atteso. Le regole di accesso per ruolo sono consolidate nella sezione finale **Matrice di autorizzazione**.

## Indice

1. [Modello di dominio e ruoli](#1-modello-di-dominio-e-ruoli)
2. [Setup iniziale](#2-setup-iniziale)
3. [Autenticazione interna](#3-autenticazione-interna)
4. [Autenticazione esterna (JWT)](#4-autenticazione-esterna-jwt)
5. [Branding](#5-branding)
6. [Gestione aziende (companies)](#6-gestione-aziende-companies)
7. [Gestione utenti (users)](#7-gestione-utenti-users)
8. [Gestione progetti (projects)](#8-gestione-progetti-projects)
9. [Gestione appartenenze progetto](#9-gestione-appartenenze-progetto)
10. [Campi ticket personalizzati](#10-campi-ticket-personalizzati)
11. [Opzioni di campo (SELECT)](#11-opzioni-di-campo-select)
12. [Preferenze email](#12-preferenze-email)
13. [Configurazione autenticazione esterna per progetto](#13-configurazione-autenticazione-esterna-per-progetto)
14. [Ciclo di vita di una segnalazione (issue)](#14-ciclo-di-vita-di-una-segnalazione-issue)
15. [Dashboard (home)](#15-dashboard-home)
16. [Kanban per tipologia](#16-kanban-per-tipologia)
17. [Planning](#17-planning)
18. [Dettaglio segnalazione](#18-dettaglio-segnalazione)
19. [Commenti](#19-commenti)
20. [Allegati](#20-allegati)
21. [Valori dei campi personalizzati](#21-valori-dei-campi-personalizzati)
22. [Approvazione](#22-approvazione)
23. [Archiviazione manuale](#23-archiviazione-manuale)
24. [Auto-archiviazione (scheduler)](#24-auto-archiviazione-scheduler)
25. [Eliminazione temporanea (soft-delete)](#25-eliminazione-temporanea-soft-delete)
26. [Eliminazione definitiva multipla](#26-eliminazione-definitiva-multipla)
27. [Issues interne — regole di visibilità](#27-issues-interne--regole-di-visibilità)
28. [Generazione report PDF](#28-generazione-report-pdf)
29. [Registro eventi (event log)](#29-registro-eventi-event-log)
30. [Aggiornamenti live (WebSocket)](#30-aggiornamenti-live-websocket)
31. [Notifiche utente (unread counter)](#31-notifiche-utente-unread-counter)
32. [Notifiche email](#32-notifiche-email)
33. [Matrice di autorizzazione](#33-matrice-di-autorizzazione)
34. [Note trasversali](#34-note-trasversali)

---

## 1. Modello di dominio e ruoli

### Attori

| Ruolo      | Descrizione sintetica                                                                |
| ---------- | ----------------------------------------------------------------------------------- |
| `ADMIN`    | Amministratore globale. Vede tutto, può modificare tutto, può eliminare tutto.       |
| `TEAM`     | Utente interno del team di sviluppo. Vede issues interne e pubbliche.               |
| `SUPERUSER`| Utente del cliente con visibilità avanzata: vede issues pubbliche e SUPERUSER-scope. |
| `USER`     | Utente del cliente standard: vede solo issues pubbliche.                            |

### Concetti chiave

- **Team company**: azienda "interna" che identifica il team di sviluppo; è immutabile (non eliminabile), possiede un colore primario e un logo pubblico.
- **Company (client)**: azienda cliente. Può essere associata a uno o più progetti (appartenenza automatica) oppure essere usata solo per assegnare utenti.
- **Project**: progetto su cui si raccolgono le segnalazioni. Può essere "isolato" (senza azienda) o collegato a una company.
- **Issue (segnalazione)**: voce del Kanban / dashboard. Ha stato, tipologia (categoria) e valori di campi personalizzati.
- **Internal issue**: segnalazione la cui visibilità è limitata a utenti interni (TEAM/ADMIN).
- **Soft-delete vs archive**: la riga viene mantenuta in entrambi i casi con un timestamp; cambia la semantica di accesso (vedi sezioni 25 e 23).

### Macrostati di un'issue

```
REPORTED → IN_PROGRESS → COMPLETED → RELEASED → APPROVED → (ARCHIVED, manuale)
                  ↑   ↓          ↓
                  (può regredire liberamente fino a RELEASED escluso)
```

- `ARCHIVED` è uno stato derivato (timestamp `archivedAt`); lo stato logico rimane `APPROVED`.
- Le regole di transizione sono nelle sezioni **Kanban** (§16) e **Approvazione** (§22).

---

## 2. Setup iniziale

### 2.1 Verificare se il setup è richiesto

- **Endpoint**: `GET /api/setup/status` (pubblico).
- **Attore**: visitatore anonimo.
- **Risposta**: `{ required: true }` finché non esiste almeno un utente.
- **Frontend**: al boot, `AuthService` controlla `/api/setup/status`; se `required = true` redirige a `/setup`, altrimenti a `/login`.

### 2.2 Creare l'azienda interna e il primo ADMIN

- **Endpoint**: `POST /api/setup` (multipart/form-data, pubblico).
- **Attore**: operatore di prima installazione.
- **Campi form**:
  - `input` (parte JSON): `{ teamCompanyName, primaryColor, adminUsername, adminEmail, adminPassword, adminFirstName?, adminLastName? }`.
  - `logo` (parte file, opzionale): PNG/JPG/WebP/SVG ≤ 2 MB.
- **Validazioni backend**:
  - `required = false` → 409 `Setup already completed`.
  - `teamCompanyName` non vuoto.
  - `adminEmail` ben formato.
  - `adminPassword` lunghezza minima (configurata).
  - `primaryColor` ∈ palette consentita (blue, green, red, … vedi [setup.component.ts](frontend/src/app/setup.component.ts)).
  - Logo: dimensione ≤ 2 MB, estensione e content-type coerenti (PNG, JPEG, WebP, SVG).
  - Per SVG: parser hardened (no DOCTYPE, no entità esterne, no `<script>`, `<iframe>`, `<object>`, `<embed>`, handler `on*`, URI `javascript:`, `@import`, `href` esterni).
- **Effetti**: crea la company marcata `teamCompany = true`, salva il logo, crea l'utente ADMIN con password BCrypt.
- **Esito atteso**: l'operatore viene rediretto a `/login` e può autenticarsi come primo ADMIN.

### 2.3 Tentativo di rieseguire il setup

- **Endpoint**: `POST /api/setup`.
- **Precondizione**: esiste almeno un utente.
- **Risposta**: 409 `Setup already completed`.
- **Esito atteso**: nessuna modifica allo stato del sistema.

---

## 3. Autenticazione interna

### 3.1 Login con username + password

- **Endpoint**: `POST /api/auth/login` (pubblico).
- **Attore**: qualsiasi visitatore.
- **Input**: `{ username, password }`.
- **Backend**:
  - Trim + lowercase del username; lookup case-insensitive; verifica BCrypt.
  - Esito positivo → JWT HS256 firmato con claims `sub` (username), `email`, `role`, `iss`, `iat`, `exp`, TTL configurato.
- **Frontend**:
  - Salva `access_token` in `sessionStorage` sotto chiave dedicata.
  - Chiama `GET /api/auth/me` per popolare il segnale utente.
  - Applica il colore brand dell'azienda dell'utente (default `blue`).
  - Reindirizza alla home.
- **Errori**:
  - 401 `Invalid credentials` per credenziali errate (messaggio generico).
  - 401 se l'istanza non è ancora inizializzata.

### 3.2 Ottenere il proprio profilo

- **Endpoint**: `GET /api/auth/me`.
- **Attore**: utente autenticato.
- **Risposta**: `{ id, username, displayName, email, role, companyName, companyId, primaryColor, companyLogoUrl, internalCompanyName, internalLogoUrl }`.
- **Errori**: 401 se il token è scaduto o non valido (frontend esegue logout automatico).

### 3.3 Ottenere la lista dei progetti visibili

- **Endpoint**: `GET /api/auth/projects`.
- **Backend**: un ADMIN riceve tutti i progetti; gli altri ruoli ricevono l'unione (progetti della propria azienda + progetti di cui sono membri espliciti), dedupe e ordinamento per `name, id`. Se il JWT contiene `external_project_id`, l'elenco è ridotto a quel solo progetto.
- **Output**: lista `{ id, name, logoUrl, … }`.

### 3.4 Logout

- **Flusso**: frontend rimuove il token da `sessionStorage`, azzera il segnale utente, reimposta il brand color a `blue`. Nessuna chiamata server (autenticazione stateless).

### 3.5 Scadenza o invalidazione del token

- Qualsiasi endpoint autenticato che restituisce 401/403 → `AuthService` pulisce la sessione e redirige a `/login`.

### 3.6 Pubblicazione del branding interno (pagina login)

- **Endpoint**: `GET /api/branding/internal` (pubblico).
- **Risposta**: `{ name, primaryColor, logoUrl }` dell'azienda interna, oppure defaults `{ name: "Loom", primaryColor: "blue", logoUrl: null }` se non esiste ancora.
- La pagina di login la consuma prima dell'autenticazione per personalizzare la UI.

---

## 4. Autenticazione esterna (JWT)

### 4.1 Amministratore abilita l'auth esterna su un progetto

- **Endpoint**: `PUT /api/external-auth/projects/{projectId}` body `{ enabled: boolean }`.
- **Attore**: ADMIN.
- **Esito**: flag `externalAuthEnabled` aggiornato.

### 4.2 Amministratore crea un'applicazione esterna (secret)

- **Endpoint**: `POST /api/external-auth/projects/{projectId}/secrets`.
- **Input**: `{ name, secret, algorithm, secretBase64 }` con `algorithm ∈ {HS256, HS384, HS512}`.
- **Validazioni**:
  - Nome univoco per progetto (case-insensitive), non vuoto.
  - Default algorithm HS256.
  - `secretBase64 = true` → decode Base64 prima del controllo.
  - Lunghezze minime (HS256 ≥ 32 byte, HS384 ≥ 48, HS512 ≥ 64) e massimo 512 byte.
- **Persistenza**: il segreto è cifrato AES-GCM con chiave derivata da `app.security.jwt.secret`; in DB si salvano ciphertext, IV, algorithm e flag Base64.

### 4.3 Amministratore modifica un'applicazione

- **Endpoint**: `PUT /api/external-auth/projects/{projectId}/secrets/{secretId}`.
- **Input**: stesso payload di 4.2 (secret opzionale: se vuoto, si mantiene il ciphertext corrente decifrandolo per la validazione di lunghezza).
- **Vincoli**: nome univoco escludendo il record stesso.

### 4.4 Amministratore elimina un'applicazione

- **Endpoint**: `DELETE /api/external-auth/projects/{projectId}/secrets/{secretId}`.
- **Effetti**: rimozione secret + cascade delle mappature `sub → userId`.

### 4.5 Amministratore crea una mappatura `sub → user`

- **Endpoint**: `POST /api/external-auth/projects/{projectId}/secrets/{secretId}/mappings` body `{ subject, userId }`.
- **Vincoli**:
  - `subject` non vuoto.
  - Non duplicato per la stessa applicazione.
  - `userId` deve esistere ed essere partecipante del progetto (membro esplicito, oppure utente la cui azienda coincide con quella del progetto, oppure ADMIN globale).

### 4.6 Amministratore elimina una mappatura

- **Endpoint**: `DELETE /api/external-auth/projects/{projectId}/secrets/{secretId}/mappings/{mappingId}`.

### 4.7 Login esterno con JWT firmato

- **Attore**: client esterno che possiede il segreto condiviso.
- **Trigger**: l'utente apre `/login?t=<JWT>`.
- **Frontend**: rileva il parametro `t`, lo rimuove dall'URL, invia `POST /api/auth/external-login { token }`.
- **Backend**:
  - Valida il formato: tre segmenti separati da `.` non vuoti, lunghezza limitata.
  - Per ogni progetto con `externalAuthEnabled = true`, per ogni secret del progetto:
    - ricostruisce il verifier HMAC con l'algoritmo del secret (decodificando Base64 se necessario);
    - tenta la verifica del token;
    - se la verifica riesce, legge il claim `sub` e cerca una mappatura.
  - Se **esattamente un** secret verifica il token e produce una mappatura valida → emette JWT interno con claim extra `external_project_id`.
- **Errori** (tutti 401 `Invalid external token`):
  - Più di un secret decodifica il token (ambiguità).
  - Nessun secret valido.
  - Subject non mappato.
  - Subject mappato a un utente che non partecipa al progetto.
- **Esito**: il client riceve JWT + projectId; frontend salva il token, chiama `/auth/me`, memorizza il projectId nel `ProjectContextService` (le altre pagine sono vincolate a quel progetto).

### 4.8 Refresh implicito

Riapertura della URL `?t=…` con token aggiornato → ripete 4.7.

---

## 5. Branding

### 5.1 Ottenere il logo azienda (pubblico)

- **Endpoint**: `GET /api/branding/companies/{id}/logo`.
- **Risposta**: bytes del file con `Content-Type` corretto (`image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`), `X-Content-Type-Options: nosniff`, `Content-Security-Policy` restrittivo.
- **Errori**: 404 in tutti gli altri casi (azienda inesistente, logo assente, file mancante).

### 5.2 Ottenere il logo progetto (pubblico)

- **Endpoint**: `GET /api/branding/projects/{id}/logo`.
- Comportamento analogo a 5.1.

### 5.3 Upload logo (azienda o progetto)

- **Trigger**: setup iniziale, `createCompany`, `updateCompany`, `createProject`, `updateProject`.
- **Validazioni comuni** ([BrandingService](backend/src/main/java/it/davideleva/loom/controller/BrandingService.java)):
  - ≤ 2 MB.
  - Estensione ∈ PNG, JPG, JPEG, WebP, SVG.
  - Magic bytes coerenti con l'estensione.
  - SVG: parsing hardened (vedi 2.2).
- **Errori**: 413 (troppo grande), 400 (estensione non valida / contenuto non coerente / SVG pericoloso), 500 (errore filesystem).

### 5.4 Eliminazione logo (progetto)

- **Endpoint**: `DELETE /api/projects/{id}/logo`.
- Effetto: rimozione file e reset di `logoExtension`.

### 5.5 Applicazione brand color lato client

- Dopo `/auth/me` (o `/branding/internal` in pagina login) il frontend imposta `primaryColor` su CSS custom properties; al logout il colore torna a `blue`.

---

## 6. Gestione aziende (companies)

> Solo ADMIN (`@PreAuthorize("hasRole('ADMIN')")`).

### 6.1 Lista aziende

- **Endpoint**: `GET /api/companies`.
- **Ordinamento**: per `name` case-insensitive, poi `id`.

### 6.2 Crea azienda

- **Endpoint**: `POST /api/companies` (multipart `input` JSON + `logo` opzionale).
- **Input**: `{ name, primaryColor, teamCompany? }`.
- **Vincoli**:
  - `name` non vuoto (max 64 caratteri).
  - `primaryColor` ∈ palette.
  - Solo un'azienda può avere `teamCompany = true`.

### 6.3 Modifica azienda

- **Endpoint**: `PUT /api/companies/{id}`.
- Stessi vincoli. Il flag `teamCompany` non può essere commutato dopo la creazione.

### 6.4 Elimina azienda

- **Endpoint**: `DELETE /api/companies/{id}`.
- **Vincoli**:
  - L'azienda interna (`teamCompany = true`) **non è eliminabile** → 400/409.
  - L'azienda non deve avere utenti o progetti collegati → altrimenti errore di vincolo.

---

## 7. Gestione utenti (users)

> Solo ADMIN.

### 7.1 Lista utenti

- **Endpoint**: `GET /api/users`. Ordinamento per username.

### 7.2 Crea utente

- **Endpoint**: `POST /api/users`.
- **Input**: `{ username, email, role, password, firstName?, lastName?, companyId? }`.
- **Vincoli**:
  - Username univoco (case-insensitive), ≤ 32 caratteri, solo caratteri consentiti.
  - Email ben formata, univoca.
  - `role ∈ {ADMIN, TEAM, SUPERUSER, USER}`.
  - **Regola companyId**:
    - `role ∈ {TEAM, ADMIN}` → `companyId` deve essere quello della team company (assegnato automaticamente se omesso).
    - `role ∈ {SUPERUSER, USER}` → `companyId` obbligatorio e deve corrispondere a una company cliente esistente.
  - Password salvata con BCrypt.

### 7.3 Modifica utente

- **Endpoint**: `PUT /api/users/{id}`.
- Stessi vincoli. La password può essere omessa (mantiene la corrente). Il flag `companyId` segue le regole di 7.2.

### 7.4 Elimina utente

- **Endpoint**: `DELETE /api/users/{id}`.
- **Vincoli**:
  - L'utente non deve essere l'unico ADMIN.
  - Le sue segnalazioni restano nello storico (campo `issuerUsername` cached).

### 7.5 Reset password (funzionalità amministrativa)

- Tipicamente parte dell'edit utente (PUT con `password` valorizzata). Conferma che il reset sia consentito solo ad ADMIN.

---

## 8. Gestione progetti (projects)

> Solo ADMIN.

### 8.1 Lista progetti

- **Endpoint**: `GET /api/projects`. Ordinamento per `name, id`. Include `archiveAfterDays` e `logoUrl`.

### 8.2 Crea progetto

- **Endpoint**: `POST /api/projects` (multipart).
- **Input**: `{ name, companyId?, archiveAfterDays? }` + logo opzionale.
- **Vincoli**:
  - `name` 1–32 caratteri, univoco.
  - `companyId` ∈ elenco aziende esistenti (se valorizzato).
  - `archiveAfterDays` ≥ 1 (se valorizzato).

### 8.3 Modifica progetto

- **Endpoint**: `PUT /api/projects/{id}`.
- Stessi vincoli, gestione del logo (sostituzione o rimozione).

### 8.4 Modifica rapida di `archiveAfterDays`

- **Endpoint**: `PUT /api/projects/{id}/archive-after-days` body `{ archiveAfterDays: number | null }`.
- Solo se il valore cambia (`archiveDirty` lato frontend). Aggiorna `ProjectContext` se necessario.

### 8.5 Elimina progetto

- **Endpoint**: `DELETE /api/projects/{id}`.
- **Vincoli**: nessuna issue esistente (soft-deleted incluse); in caso contrario errore di vincolo.

### 8.6 Rimozione logo progetto

- **Endpoint**: `DELETE /api/projects/{id}/logo`.

---

## 9. Gestione appartenenze progetto

> Solo ADMIN.

### 9.1 Lista utenti di un progetto

- **Endpoint**: `GET /api/projects/{id}/users`.
- **Regola di visibilità**: l'endpoint restituisce sia i membri **automatici** (utenti la cui `companyId` coincide con quella del progetto) sia i membri **espliciti**.
- Il frontend raggruppa i risultati in "Compagnia collegata" / "Membri interni" / "Membri esterni" (vedi [projects.component.ts](frontend/src/app/config/projects.component.ts)).

### 9.2 Appartenenza automatica

- L'utente la cui `companyId` coincide con `project.companyId` **partecipa automaticamente**. Non è creabile/eliminabile individualmente (i comandi espliciti vengono rifiutati).

### 9.3 Aggiunta membro esplicito

- **Endpoint**: `POST /api/projects/{id}/users/{userId}`.
- **Vincoli**: l'utente deve esistere e **non** appartenere già alla stessa azienda del progetto (altrimenti fa parte dei membri automatici e non è possibile aggiungerlo manualmente).
- Esito: l'utente compare nei gruppi di membri espliciti della pagina progetto.

### 9.4 Rimozione membro esplicito

- **Endpoint**: `DELETE /api/projects/{id}/users/{userId}`.
- **Vincoli**: l'utente **non** deve essere un membro automatico; rimozione rifiutata se l'utente appartiene per company.

---

## 10. Campi ticket personalizzati

> Solo ADMIN.

### 10.1 Definizioni di campo (CRUD)

- **Endpoints**:
  - `GET /api/projects/{projectId}/fields`
  - `POST /api/projects/{projectId}/fields`
  - `GET /api/fields/{id}`
  - `PUT /api/fields/{id}`
  - `DELETE /api/fields/{id}`

### 10.2 Proprietà

- `code`: regex `^[A-Z0-9_]{1,8}$`, univoco per progetto.
- `label`: 1–64 caratteri.
- `description`: opzionale, max 2000 caratteri (textarea `pInputTextarea` nella UI).
- `type ∈ {TEXT, TEXTAREA, NUMBER, SELECT, ATTACHMENTS}`.
- `scope ∈ {USER, SUPERUSER, TEAM}`.
- `mandatory: boolean`.
- `multiple: boolean` (disattivo per default, non ammesso su TEXTAREA).

### 10.3 Vincoli speciali

- **Modifica di `type` o `multiple`**: consentita solo se non esistono valori associati; altrimenti 409.
- **Eliminazione**: consentita solo se non ci sono valori associati; altrimenti 409.
- I campi sono **scoped per progetto**.

### 10.4 Visibilità di un campo (chi lo vede)

| Scope     | USER | SUPERUSER | TEAM | ADMIN |
| --------- | ---- | --------- | ---- | ----- |
| USER      | ✅   | ✅        | ✅   | ✅    |
| SUPERUSER | ❌   | ✅        | ✅   | ✅    |
| TEAM      | ❌   | ❌        | ✅   | ✅    |

> "Visibile" = può creare valori con quel campo (per chi può anche vedere l'issue; vedi §27).

---

## 11. Opzioni di campo (SELECT)

> Solo ADMIN, solo per campi di tipo `SELECT`.

### 11.1 CRUD

- **Endpoints**:
  - `GET /api/fields/{fieldId}/options`
  - `POST /api/fields/{fieldId}/options`
  - `PUT /api/fields/{optionId}`
  - `DELETE /api/fields/{optionId}`

### 11.2 Proprietà

- `{ value, label, position?, active }`. `active = false` nasconde l'opzione nei form ma la mantiene selezionabile per issues già esistenti.

### 11.3 Vincoli

- `value` non vuoto, univoco per campo.
- **Ridenominazione** (`value`): rifiutata se l'opzione è usata da almeno un'issue (409).
- **Eliminazione**: rifiutata se l'opzione è usata; il workaround è disattivarla.
- Le opzioni inattive sono nascoste in fase di creazione/modifica issue ma restano leggibili sui valori esistenti.

---

## 12. Preferenze email

> Endpoint autenticato, accessibile a **qualsiasi** ruolo (non solo ADMIN). Ogni utente gestisce le proprie.

### 12.1 Ottenere la preferenza corrente

- **Endpoint**: `GET /api/email-preferences/me?projectId={id}` (per progetto) o assente (default globale).

### 12.2 Aggiornare la preferenza

- **Endpoint**: `PUT /api/email-preferences/me` body `{ projectId, enabled }`.
- `enabled = false` → l'utente è escluso dalle notifiche email per quel progetto.

### 12.3 Effetto pratico

- `EmailNotificationScheduler` (§32) rispetta queste preferenze prima di inviare.

---

## 13. Configurazione autenticazione esterna per progetto

> Solo ADMIN; caso d'uso già dettagliato in §4.

---

## 14. Ciclo di vita di una segnalazione (issue)

### 14.1 Stati e transizioni

| Stato          | Descrizione                            | Transizioni consentite                                    |
| -------------- | -------------------------------------- | --------------------------------------------------------- |
| `REPORTED`     | Appena creata                          | → `IN_PROGRESS` (TEAM/ADMIN); nessun vincolo              |
| `IN_PROGRESS`  | Lavorazione avviata                    | → `REPORTED`, `COMPLETED` (TEAM/ADMIN)                    |
| `COMPLETED`    | Lavoro completato                      | → `IN_PROGRESS`, `RELEASED` (TEAM/ADMIN)                  |
| `RELEASED`     | Rilasciata al cliente                  | → `COMPLETED`, `APPROVED` (vedi §22)                      |
| `APPROVED`     | Approvata dal cliente                  | → `ARCHIVED` (manuale, §23)                               |

- `APPROVED` non è raggiungibile se non da `RELEASED`.
- `ARCHIVED` è un flag derivato (`archivedAt`), non altera lo stato logico.

### 14.2 Regola "10 minuti" per azioni del segnalatore

| Azione                                 | Regola                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Eliminare una issue (soft-delete §25)  | Il segnalatore entro 10 minuti dalla creazione; ADMIN sempre.                          |
| Eliminare un commento (§19)            | L'autore entro 10 minuti; ADMIN **non bypassa** la regola del commento.                |

### 14.3 Tipologia

- `issueType ∈ {ANOMALY, IMPROVEMENT, IMPLEMENTATION, null}`.
- `null` = "Non categorizzata" — solo in attesa di planning ADMIN. Cambiato in planning (§17).

### 14.4 Visibilità interna (§27)

- `internal: boolean` — solo TEAM/ADMIN possono settarlo in fase di creazione (§18).
- Le issues interne non sono mai restituite a USER/SUPERUSER.

---

## 15. Dashboard (home)

### 15.1 Lista issue vive

- **Endpoint**: `GET /api/work/projects/{projectId}/issues`.
- Esclude soft-deleted (`deletedAt`) e archived (`archivedAt`).
- Paginazione lato client (righe 12/25/50, ordinamento per colonna).

### 15.2 Filtri dashboard

- Ricerca testuale su `id`, `title`, `description`, `issuerUsername`, `developerUsername`, `status`, `issueType`.
- Stato, tipologia (con "Tutte" e "Non categorizzate"), segnalatore (con "Tutti" e "Non assegnato").
- Date range (DataPicker PrimeNG, selectionMode range).
- Per ogni campo personalizzato di tipo `SELECT` visibile al chiamante, un multi-select (valori OR dentro un campo, AND fra campi).
- Visibilità interna: USER/SUPERUSER non vedono issues interne; TEAM/ADMIN le vedono.

### 15.3 Header

- "Report PDF" (apre dialog §28).
- "Nuova segnalazione" (apre dialog §18.1).
- "Eliminate" — solo ADMIN, naviga a `/eliminate` (vedi §25), con badge di conteggio.
- "Archiviate" — tutti i ruoli, naviga a `/archivio` (vedi §23), con badge di conteggio.
- "Aggiorna" (forza reload).

### 15.4 Viste secondarie

- `/eliminate` (ADMIN): lista soft-deleted con multi-select e "Elimina selezionate" (§25, §26).
- `/archivio` (tutti i ruoli): lista archived con multi-select; multi-delete visibile solo ad ADMIN (§26).

---

## 16. Kanban per tipologia

### 16.1 Struttura

- 3 Kanban: Anomalie, Migliorie, Implementazioni (route `/kanban/{tipo}` parametrizzata).
- Colonne = stati (`REPORTED`, `IN_PROGRESS`, `COMPLETED`, `RELEASED`, `APPROVED`).
- Header flottanti durante lo scroll.
- Drag & drop nativo HTML5.

### 16.2 Permessi sul drop

| Da → A                | USER/SUPERUSER | TEAM/ADMIN                               |
| --------------------- | -------------- | ---------------------------------------- |
| non-APPROVED → qualsiasi stato | ❌ errore "Solo il team o un admin può cambiare lo stato" | ✅ aggiorna `PATCH /api/work/issues/{id}/status` |
| → `APPROVED`          | ❌             | solo se issue è `RELEASED` e (SUPERUSER **o** ADMIN su issue `internal`) → `POST /api/work/issues/{id}/approval` |

### 16.3 Aggiornamento ottimistico

- La card passa immediatamente nella colonna di destinazione.
- In caso di errore di rete → rollback + messaggio di errore.

### 16.4 Notifiche e unread

- Le card con evento non letto mostrano un pallino rosso (fonte: §31).

---

## 17. Planning

### 17.1 Struttura

- **Endpoint**: `GET /api/work/projects/{projectId}/planning` (ADMIN/TEAM).
- Mostra **solo issues in stato `REPORTED`**, raggruppate per tipologia (colonne: ANOMALY, IMPROVEMENT, IMPLEMENTATION + "Da categorizzare").
- Ordinamento per data di creazione ascendente.

### 17.2 Assegnazione tipologia + sviluppatore

- Drag & drop di una card fra colonne di tipologia → `PATCH /api/work/issues/{id}/planning` body `{ issueType, developerUserId }`.
- La dropdown per sviluppatore su ogni card mostra solo TEAM users del progetto.

### 17.3 Vincoli

- Solo ADMIN può salvare (TEAM visualizza in sola lettura).
- Cambiare solo lo sviluppatore è consentito solo se la tipologia è già valorizzata (altrimenti è una no-op lato backend fino a quando non viene assegnata una tipologia).

---

## 18. Dettaglio segnalazione

### 18.1 Creazione

- **Endpoint**: `POST /api/work/issues` body `{ projectId, title, description, values, attachments?, internal? }`.
- **Regole backend**:
  - Il chiamante deve essere partecipante del progetto.
  - `title` non vuoto.
  - `description` non vuota.
  - Tutti i campi `mandatory` non-ATTACHMENTS valorizzati.
  - Ogni valore è associato a un field dello stesso progetto.
  - Campi in cui il chiamante non ha diritto di scrittura (vedi §10.4) vengono filtrati.
  - `internal = true` forzato a `false` per USER/SUPERUSER.
  - Numerici: parsing decimal.
  - SELECT: il `value` deve corrispondere a un'opzione attiva del campo.
- Dopo la creazione, caricamento parallelo degli allegati `POST /api/work/issues/{id}/attachments` (per ogni ATTACHMENTS field popolato).

### 18.2 Apertura

- **Endpoint**: `GET /api/work/issues/{id}` (singolo issue con `values`, `attachments`, `comments`).
- **Errori**:
  - 404 se l'issue non esiste.
  - 403 se il chiamante non partecipa o non può vedere un'issue interna (§27).
  - 410 (Gone) se l'issue è soft-deleted o archived e il chiamante non è ADMIN.
- Mostrato in un dialog con:
  - Header: `#<id>` + tag stato (PrimeNG `p-tag` con severity per stato).
  - Auto-fields: tipologia, data segnalazione, segnalatore, sviluppatore, visibilità (se interna).
  - Descrizione.
  - Lista valori di campo personalizzato (filtrata per visibilità scope).
  - Editor "Campi team" (TEAM/ADMIN + presence di TEAM fields).
  - Galleria allegati con preview immagini (frecce, ESC).
  - Pannello commenti laterale.
  - Footer azioni (vedi 18.4).

### 18.3 Modifica valori TEAM

- **Endpoint**: `PATCH /api/work/issues/{id}/values` body `IssueFieldValueInput[]`.
- **Regole**:
  - Solo TEAM o ADMIN.
  - Si applica solo a campi `scope = TEAM`.
  - Validazione mandatory + numeric + SELECT attivo.

### 18.4 Azioni disponibili nel dialog

| Bottone      | Visibilità                              | Effetto                                       |
| ------------ | --------------------------------------- | --------------------------------------------- |
| Salva campi team | TEAM/ADMIN e TEAM fields presenti | §18.3                                      |
| Approva      | SUPERUSER sempre (se `RELEASED`); ADMIN solo se `internal && RELEASED` | §22 |
| Archivia     | ADMIN + status `APPROVED`               | §23                                            |
| Elimina issue | ADMIN sempre; altrimenti segnalatore entro 10 minuti | §25 |

### 18.5 Mark as seen

- Apertura del dettaglio → `POST /api/work/issue-notifications/{issueId}/seen` (anche se l'utente ha letto nulla di nuovo). Vedi §31.

---

## 19. Commenti

### 19.1 Aggiungere un commento

- **Endpoint**: `POST /api/work/issues/{id}/comments` body `{ comment }`.
- **Regole**: partecipante del progetto; issue non soft-deleted (non-ADMIN) e non archived (non-ADMIN); testo non vuoto.
- Autore = utente corrente; timestamp = `now`.

### 19.2 Eliminare un commento

- **Endpoint**: `DELETE /api/work/comments/{id}`.
- **Regole**:
  - L'autore entro 10 minuti.
  - **ADMIN NON bypassa** la regola: oltre 10 minuti solo l'autore (e non più nessuno) può cancellare.
  - Non applicabile a commenti su issue soft-deleted/archived se non sei ADMIN.

### 19.3 Lista commenti

- Restituiti in ordine cronologico ascendente (`IssueDetail.comments`).
- Bottone elimina visibile solo se `comment.canDelete = (author == me && now - createdAt ≤ 10m)`.

---

## 20. Allegati

### 20.1 Upload

- **Endpoint**: `POST /api/work/issues/{id}/attachments` multipart con campo `file` e header `X-Field-Id: <definitionId>`.
- **Regole**:
  - Field di tipo `ATTACHMENTS` e stesso progetto dell'issue.
  - Visibilità del campo coerente con il chiamante (§10.4).
  - File non vuoto.
  - Dimensione ≤ `app.attachments.max-file-size` (configurato).

### 20.2 Download

- **Endpoint**: `GET /api/work/attachments/{id}/download`.
- Risposta con `Content-Type` originale e `Content-Disposition: attachment; filename="<originalName>"`.
- Solo partecipanti che possono vedere l'issue e usare il field associato.

### 20.3 Preview immagini

- Preview on-click dentro il dialog dettaglio (solo se `contentType` `image/*`):
  - Pulsanti prev/next, frecce ←/→ sulla tastiera, label posizione corrente.
  - Pulsante "Scarica" (riusa il download).
- File non-immagine → click → download diretto.

### 20.4 Eliminazione allegati

- **Non esiste** un endpoint di delete per allegati. Vengono eliminati solo insieme all'issue in caso di permanent delete (§26).

---

## 21. Valori dei campi personalizzati

### 21.1 Visibilità per scope (vedi anche §10.4)

- `USER`: tutti.
- `SUPERUSER`: SUPERUSER + interni (TEAM/ADMIN).
- `TEAM`: solo TEAM/ADMIN.

### 21.2 Creazione (vedi §18.1)

- Il payload `values` ha forma `IssueFieldValueInput[]` con campi `definitionId, position, value` (0-based).
- Per campi non-multiplo è consentita una sola entry con `position = 0`.

### 21.3 Aggiornamento da ADMIN (endpoint dedicato)

- `POST /api/issue-data` body `{ issueId, definitionId, value, position }`.
- `PUT /api/issue-data/{id}`.
- `DELETE /api/issue-data/{id}` — protetto: l'ultimo valore di un campo `mandatory` non può essere eliminato.

### 21.4 Editor di soli campi TEAM (vedi §18.3)

- Il dialog dettaglio espone un form dedicato per i soli campi TEAM (TEAM/ADMIN).

---

## 22. Approvazione

### 22.1 Endpoint

- `PATCH /api/work/issues/{id}/approval` — body vuoto.

### 22.2 Regole

- Issue deve essere in stato `RELEASED` (altrimenti 400/409).
- Autorizzato:
  - **SUPERUSER**: sempre.
  - **ADMIN**: solo se l'issue è `internal`.
  - Tutti gli altri: 403.

### 22.3 Effetti

- Stato → `APPROVED`.
- `approvedAt = now`, `approverUserId = currentUser`.
- Evento `ISSUE_APPROVED`.
- Notifica email (se preferenze abilitate).

### 22.4 Raggiungibile da

- Kanban: drop su colonna `APPROVED` (vincoli sopra).
- Dialog dettaglio: bottone "Approva" (visibilità sopra).

---

## 23. Archiviazione manuale

### 23.1 Endpoint

- `POST /api/work/issues/{id}/archive`.

### 23.2 Regole

- Solo ADMIN.
- Issue deve essere in stato `APPROVED`.
- Non deve essere già archiviata né soft-deleted (altrimenti 410/409).

### 23.3 Effetti

- `archivedAt = now`.
- Issue scompare dalle liste vive (§15.1, §15.3, §16) e compare nella vista "Archiviate" (visibile a tutti i ruoli).
- Evento `ISSUE_ARCHIVED`.

### 23.4 Raggiungibile da

- Dialog dettaglio: bottone "Archivia" (visibile solo ad ADMIN su status `APPROVED`).
- Endpoint API diretto.

---

## 24. Auto-archiviazione (scheduler)

### 24.1 Comportamento

- **Componente**: `ArchiveScheduler` (`@Service`, `@ConditionalOnProperty(app.archive.enabled, default true)`).
- **Intervallo**: `app.archive.check-interval` (default `60m`); esecuzione iniziale su `ApplicationReadyEvent`.

### 24.2 Algoritmo

1. Carica tutti i `Project` con `archiveAfterDays IS NOT NULL`.
2. Soglia = `now - Duration.ofDays(archiveAfterDays)`.
3. Carica le issue in stato `RELEASED` con `releasedAt < soglia`, `deletedAt IS NULL`, `archivedAt IS NULL`.
4. Per ciascuna: `markArchived(now)`; `issueEvent(EventType.ISSUE_ARCHIVED, ...)` con actor nullo (sistema).

### 24.3 Note

- Non archivia issues `APPROVED` (l'unico modo è §23).
- Una issue può uscire e rientrare in `RELEASED` — il timer si riavvia ogni volta che `releasedAt` cambia (rollback di stato).
- L'actor nullo nei log eventi è simbolico: l'evento viene attribuito al sistema.

---

## 25. Eliminazione temporanea (soft-delete)

### 25.1 Endpoint

- `DELETE /api/work/issues/{id}`.

### 25.2 Regole

- Partecipante del progetto.
- **ADMIN**: sempre.
- **Altro**: solo segnalatore entro 10 minuti dalla creazione.
- 410 (Gone) se l'issue è già soft-deleted.

### 25.3 Effetti

- `deletedAt = now`.
- Issue scompare da dashboard, kanban, planning, PDF report.
- Issue compare nella vista **Eliminate** (visibile solo ad ADMIN).
- Issue **non** è scaricabile da dettaglio (410) se non sei ADMIN.
- L'evento `ISSUE_DELETED` viene emesso (l'issue resta associato per la history).

### 25.4 Eliminazione di un'issue archiviata

- Anche le issues archived sono soft-deletable (per ADMIN).
- Le issues archiviate non-soft-deleted rimangono visibili nella vista "Archiviate".

---

## 26. Eliminazione definitiva multipla

### 26.1 Endpoint

- `POST /api/work/issues/permanent-delete` body `{ ids: number[] }`.

### 26.2 Regole

- Solo ADMIN.
- `ids` non vuoto.

### 26.3 Effetti

- Per ogni id: detach dell'issue dagli eventi (la history resta ma `issueRefId` viene azzerato), cancellazione del record `Issue` con cascade di `Comment`, `IssueData`, attachment records. Rimozione dei file allegati dal disco.
- La vista "Eliminate" e la vista "Archiviate" aggiornano i loro conteggi.

### 26.4 Raggiungibile da

- Vista `/eliminate` (ADMIN): multi-select + "Elimina selezionate" → dialog di conferma.
- Vista `/archivio` (ADMIN): stesso pattern (l'endpoint è condiviso).

---

## 27. Issues interne — regole di visibilità

### 27.1 Dove si applica

- Lista (`GET /api/work/.../issues`): filtrate per `internal = false` se l'utente non è TEAM/ADMIN.
- Dettaglio (`GET /api/work/issues/{id}`): 403 se interna e l'utente non è TEAM/ADMIN.
- PDF report (§28): 403/idraulicamente nascoste.
- Allegati (`/api/work/attachments/{id}/download`): 403.
- Commenti, valori di campo, notifiche: propagano la stessa regola.

### 27.2 Dove NON si applica (ADMIN vede tutto)

- Le viste "Eliminate" e "Archiviate" mostrano le issues interne anche se l'utente è SUPERUSER di un altro progetto (purché sia partecipante del progetto target).
- Il permanent multi-delete può includere issues interne, sempre ADMIN-only.

### 27.3 Settare il flag `internal`

- Solo TEAM/ADMIN in fase di creazione (§18.1); il backend lo silenzia per USER/SUPERUSER.
- Non modificabile dopo la creazione.

---

## 28. Generazione report PDF

### 28.1 Endpoint

- `GET /api/work/projects/{projectId}/issues/report` (parametri query: stessi filtri dashboard + visibility).

### 28.2 Filtri accettati

- `q` (testo libero).
- `status`, `issueType` (con "ALL" e "NONE"/"Non categorizzate"), `issuerId` (con "NONE"), `developerId` (con "NONE"), `from`, `to`, `internal` (con valori `true`/`false`/`ALL`).
- Visibilità = `internal`: **mostrato solo a TEAM/ADMIN** nella UI. USER/SUPERUSER non possono chiedere `internal=true`.

### 28.3 Sezioni PDF

- Ordine sezioni: `ANOMALY`, `IMPROVEMENT`, `IMPLEMENTATION`, `Non categorizzata`, `Rifiutati` (solo se ci sono soft-deleted nei risultati).
- Sezioni vuote omesse.
- Issues archiviate restano nella loro sezione di tipologia.
- Soft-deleted: sfondo rosa.
- Internal: sfondo blu.

### 28.4 Header PDF

- Nome progetto, data di generazione, conteggio totale, lista filtri attivi.

### 28.5 Output

- PDF A4 portrait, tabella per sezione (ID, Titolo, Stato, Tipologia, Segnalatore, Data).
- Filename: `report-segnalazioni-<projectId>.pdf`.
- Implementato con PDFBox.

---

## 29. Registro eventi (event log)

### 29.1 Endpoint

- `GET /api/work/projects/{projectId}/events?type=&actorId=&from=&to=&page=&size=`.

### 29.2 Tipologie di evento

- `ISSUE_CREATED`, `ISSUE_PLANNED`, `ISSUE_STATUS_CHANGED`, `ISSUE_APPROVED`, `ISSUE_COMMENT_ADDED`, `ISSUE_COMMENT_DELETED`, `ISSUE_ATTACHMENT_UPLOADED`, `ISSUE_VALUES_CHANGED`, `ISSUE_DELETED`, `ISSUE_ARCHIVED`.

### 29.3 Permessi

- Riservato a TEAM e ADMIN.
- Eventi su issues interne **nascosti ai non interni** (USER/SUPERUSER li vedono solo se coinvolti direttamente? dipende dal filtro del backend: vedere `EventService.recipients`).

### 29.4 UI

- Tabella paginata con filtri per tipo, attore, range date; dettaglio espandibile inline (`comments` per `ISSUE_COMMENT_*`).

---

## 30. Aggiornamenti live (WebSocket)

### 30.1 Flusso di "biglietto"

1. Il client (Angular `LiveSyncService`) apre una WebSocket verso `/api/work/live?token=...`.
2. L'handshake è pubblico: prima di aprire la connessione il client chiama `POST /api/work/live/tickets` per ottenere un ticket monouso (UUID), con scadenza 30s, conservato in una `ConcurrentHashMap` lato server (single-instance).
3. Il ticket è associato al `userId` corrente.
4. Il server invia eventi sulle modifiche che appartengono all'utente (vedi `EventService.recipients`).
5. Heartbeat: ogni 25s il client reinoltra il ticket; il server ri-verifica la grant.

### 30.2 Eventi pubblicati

- `ISSUE_*` provenienti dai punti di mutazione (create, planning, status, approval, archive, delete, attach, comment, comment-delete, values).
- Ogni evento incrementa una `revision()` Signal nel `LiveSyncService`, che è osservata dai componenti che vogliono ricaricare (es. home, kanban, planning, deleted/archived).

### 30.3 Limite architetturale

- I ticket sono in-memory → funzionano solo se il backend gira in singola istanza. Con più repliche occorre un store condiviso (Redis) — non implementato.

---

## 31. Notifiche utente (unread counter)

### 31.1 Modello

- Ogni issue può avere un flag "unread" per ogni utente partecipante (basato su `lastSeenAt` utente vs `lastModifiedAt` issue).
- Conteggio per progetto, con breakdown per `ANOMALY / IMPROVEMENT / IMPLEMENTATION / PLANNING`.

### 31.2 Endpoint

- `GET /api/work/projects/{projectId}/issue-notifications/me` → `{ total, breakdown, ids: number[] }`.
- `POST /api/work/issue-notifications/{issueId}/seen` → segna l'issue come letta (`markSeen` con lock di riga).
- `POST /api/work/issue-notifications/me/seen-all` (se previsto) o refresh dopo markSeen.

### 31.3 UI

- Pallino rosso sulle card del kanban / planning / dashboard per issues in `ids`.
- Apertura del dettaglio → refresh summary.

---

## 32. Notifiche email

### 32.1 Scheduler

- `EmailNotificationScheduler` esegue ogni `app.notifications.email.scheduler-delay` (default 5 min).
- Legge gli eventi non ancora notificati, compone email HTML in italiano, invia al sottoinsieme di utenti che:
  - hanno email valorizzata;
  - non hanno disabilitato le preferenze per quel progetto (§12);
  - non sono l'autore dell'evento;
  - sono partecipanti del progetto (azienda o membri espliciti + ADMIN globali).
- Retry sui transient failures (SMTP 4xx); emissione su 5xx persistente.

### 32.2 Contenuto

- Per ogni `EventType` il subject e il body sono localizzati in italiano.
- Logo azienda inline (CID).
- Eventi coperti: tutti gli `ISSUE_*` (incluso `ISSUE_ARCHIVED`).

### 32.3 Disiscrizione per progetto

- L'utente può disabilitare la ricezione delle email per un singolo progetto (§12).

### 32.4 Trigger manuale (ADMIN)

- `POST /api/notifications/email/run` (ADMIN): forza un'esecuzione fuori schedule.

---

## 33. Matrice di autorizzazione

> Le celle indicano l'azione consentita al dato ruolo. `"–"` = non consentito. Per `"Issue"` si intende qualsiasi issue **visibile** all'utente.

| Azione                                                                                | USER | SUPERUSER | TEAM | ADMIN |
| ------------------------------------------------------------------------------------- | ---- | --------- | ---- | ----- |
| Login / logout / whoami / lista progetti visibili                                     | ✅   | ✅        | ✅   | ✅    |
| Vedere progetti della propria azienda + membri espliciti                              | ✅   | ✅        | ✅   | ✅    |
| Vedere tutti i progetti                                                                | –    | –         | –    | ✅    |
| Creare issue (pubbliche)                                                              | ✅   | ✅        | ✅   | ✅    |
| Creare issue "internal"                                                                | –    | –         | ✅   | ✅    |
| Cambiare stato via Kanban (escluso `APPROVED`)                                        | –    | –         | ✅   | ✅    |
| Spostare in `APPROVED`                                                                 | –    | –         | –    | solo su `internal` |
| Approvazione diretta (bottone/endpoint)                                               | –    | ✅ (sempre) | –  | solo `internal` |
| Salvare valori TEAM-scope                                                              | –    | –         | ✅   | ✅    |
| Salvare valori SUPERUSER-scope                                                         | –    | ✅        | ✅ (vedi internals) | ✅ |
| Aggiungere commento                                                                    | ✅   | ✅        | ✅   | ✅    |
| Eliminare il proprio commento entro 10 min                                             | ✅   | ✅        | ✅   | ✅    |
| Eliminare un commento altrui                                                            | –    | –         | –    | –     |
| Soft-delete issue entro 10 min come segnalatore                                        | ✅   | ✅        | ✅   | ✅    |
| Soft-delete issue in qualunque momento                                                | –    | –         | –    | ✅    |
| Permanent multi-delete                                                                 | –    | –         | –    | ✅    |
| Manual archive (issue `APPROVED`)                                                      | –    | –         | –    | ✅    |
| Gestire companies / users / projects / fields / options                              | –    | –         | –    | ✅    |
| Configurare auth esterna per progetto                                                  | –    | –         | –    | ✅    |
| Vedere event log                                                                        | –    | (solo pubblici) | ✅ | ✅    |
| Vedere viste "Eliminate" / "Archiviate"                                                | –    | solo archivio (vedi §27) | ✅ | ✅    |
| Vedere issues interne (lista / dettaglio / allegati)                                  | –    | –         | ✅   | ✅    |
| Trigger manuale invio email                                                            | –    | –         | –    | ✅    |

> **Attenzione**: ADMIN può tutto a parte i commenti altrui oltre la finestra 10 min (regola stretta a tutela dell'autore).

---

## 34. Note trasversali

### 34.1 Sicurezza

- JWT HS256 firmato con chiave `app.security.jwt.secret`. Claims: `sub`, `email`, `role`, `iss`, `iat`, `exp`. TTL configurabile. Eventuale claim aggiuntivo `external_project_id` per scoping da auth esterna.
- BCrypt per le password; nessuna password in chiaro nei log né nei DTO di output.
- CSRF disabilitato (stateless). Form login disabilitato. HTTP Basic disabilitato.
- Endpoint pubblici: `POST /api/auth/login`, `POST /api/auth/external-login`, `POST /api/setup`, `GET /api/setup/status`, `GET /api/branding/internal`, `GET /api/branding/companies/*/logo`, `GET /api/branding/projects/*/logo`, `GET /api/work/live` (probe) + WebSocket handshake `live/tickets` (autenticato dentro al ticket).
- Header di sicurezza sui logo: `X-Content-Type-Options: nosniff`, `Content-Security-Policy` restrictive.

### 34.2 Validazione input

- Bean Validation su tutti i DTO (NotBlank, Pattern, Size, Min, ecc.).
- Validazione multi-layer (form + service + persistenza vincoli FK).

### 34.3 Migrazioni DB (Flyway)

- Le colonne `deletedAt`, `archivedAt`, `archiveAfterDays` sono nullable — nessun backfill richiesto.
- Indici parziali sui record soft-deleted/archived (performance sulla vista admin).
- Stato pregresso: tutte le issues esistenti sono considerate "vive".

### 34.4 Internazionalizzazione

- UI e messaggi in italiano.
- Errori del backend spesso in inglese (messaggi tecnici); il frontend li sovrappone con testi localizzati.

### 34.5 Single-instance caveat

- WebSocket live update non funziona in multi-istanza (ticket in-memory). Deployment raccomandato: singola istanza backend finché non si introduce Redis.
- Scheduler di email/archive è anch'esso legato alla singola istanza: in caso di HA replicare solo in modalità attiva.

### 34.6 Migrazione fra tipi di campo

- Cambiare `type` o `multiple` di un campo con valori esistenti è bloccato (409). Workaround: creare un nuovo campo, migrare i valori via script, dismettere il vecchio.

### 34.7 Eliminazione allegati

- Non esiste un endpoint dedicato. Allegati → solo via permanent delete (multi-delete) della issue.

### 34.8 Auditoria

- Tutte le mutazioni scrivono in `IssueEvent` con actor + timestamp + message. Gli eventi `ISSUE_DELETED` (soft) e successivamente permanent-delete mantengono lo storico (anche dopo detach dell'issue).

---

_Questo documento è la base per i test E2E: ogni test deve coprire almeno il flusso principale, i vincoli di autorizzazione per ruolo, le regole temporali (10 minuti) e le regole di visibilità (interne / archived / deleted)._
