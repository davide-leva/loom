# SF2 Tickets

Applicazione ticket completa con backend Spring Boot, frontend Angular, PostgreSQL, Flyway, autenticazione JWT, allegati su filesystem e notifiche email.

## Avvio rapido con Docker Compose

Ci sono due compose:

- `compose.yml`: usa immagini già pubblicate su GitHub Container Registry;
- `compose.dev.yml`: compila backend e frontend in locale usando i Dockerfile del progetto.

### Avvio con immagini GitHub

Il workflow GitHub pubblica le immagini qui:

```text
ghcr.io/<owner>/<repo>/backend
ghcr.io/<owner>/<repo>/frontend
```

Crea il file `.env` e genera i secret con lo script di bootstrap:

```bash
./configure.sh
```

Lo script:

- genera `JWT_SECRET` (e opzionalmente `DB_PASSWORD`) con `openssl`;
- chiede in prompt le variabili che richiedono intervento umano (abilitazione TLS, dominio, SMTP se le mail sono attive, …);
- scrive `.env` con mode `0600`;
- genera il `Caddyfile` in base alla scelta TLS.

Avvia tutto:

```bash
docker compose up -d
```

Poi apri:

- senza TLS: <http://localhost/>
- con TLS: <https://tickets.example.com/> (sostituisci con il tuo dominio)

Se le immagini GHCR sono private, prima fai login:

```bash
echo '<github-token>' | docker login ghcr.io -u '<github-username>' --password-stdin
```

### Avvio con build locale

Per compilare le immagini dal codice presente nella cartella:

```bash
docker compose -f compose.dev.yml up --build
```

Anche in questo caso l’applicazione sarà disponibile sull’URL configurato (vedi sopra).

Al primo accesso, se il database non contiene utenti, viene mostrata la pagina di configurazione iniziale. Da lì crei la compagnia interna del team sviluppatori e il primo utente `ADMIN`.

### Servizi avviati

Entrambi i compose avviano quattro servizi:

- `database`: PostgreSQL;
- `backend`: API Spring Boot;
- `frontend`: Angular servito da nginx, con proxy `/api` verso il backend;
- `caddy`: reverse proxy HTTPS davanti a frontend. Terminazione TLS automatica via Let's Encrypt (se `TLS_ENABLED=true`), altrimenti solo HTTP su :80.

### Porte esposte sull'host

| Servizio | Porta host | Note |
| --- | ---: | --- |
| Caddy | `80`, `443` | unico servizio raggiungibile dall'esterno |

> Backend, frontend e PostgreSQL **non** sono pubblicati sull'host: vivono solo nella rete Docker.
> Il frontend raggiunge il backend via `http://backend:8080`; il backend raggiunge Postgres via `jdbc:postgresql://database:5432/...`.

### TLS (HTTPS)

Disabilitato di default (HTTP puro su `http://localhost/`). Per abilitare Let's Encrypt:

1. Punta un record DNS `A` (o `AAAA`) del tuo dominio verso l'IP pubblico del server.
2. Verifica la propagazione: `dig +short tickets.example.com`.
3. Rilancia `./configure.sh` e rispondi `y` a "Enable TLS with Let's Encrypt?", quindi fornisci `DOMAIN` e `ACME_EMAIL`.
4. Riavvia: `docker compose up -d`.

Il cert viene ottenuto al primo avvio e rinnovato automaticamente prima della scadenza.

### Persistenza Docker

I dati vivono in `./data/` come bind mount (più comodo da ispezionare e backuppare rispetto ai named volume):

- `./data/db/`: dati PostgreSQL;
- `./data/attachments/`: file caricati nelle issue;
- `./data/branding/`: loghi delle compagnie e dei progetti;
- `./data/caddy/`, `./data/caddy-config/`: stato di Caddy (cert Let's Encrypt inclusi).

Per fermare i container senza cancellare i dati:

```bash
docker compose down
```

Per cancellare anche database e allegati:

```bash
rm -rf ./data/db ./data/attachments ./data/branding
```

### Backup

Lo script `backup.sh` crea un archivio `tar.gz` di `data/` + `.env` + `Caddyfile` in `backups/` (creato se non esiste), nominato con timestamp UTC ISO-8601:

```bash
./backup.sh
# → backups/ticket-platform-2026-09-22T19-34-20Z.tar.gz

./backup.sh --label pre-migration
# → backups/ticket-platform-2026-09-22T19-34-20Z-pre-migration.tar.gz

BACKUP_DIR=/mnt/external ./backup.sh
# → scrive su un mount esterno
```

L'archivio viene creato con mode `0600` perché contiene `JWT_SECRET` e `DB_PASSWORD`. Per ripristinare:

```bash
tar -xzf backups/ticket-platform-<timestamp>.tar.gz -C /restore/target
```

I path nell'archivio sono prefissati con `ticket-platform/` per evitare clash in caso di restore in una directory condivisa.

## Pubblicazione immagini Docker

Il workflow `.github/workflows/publish-images.yml` viene eseguito a ogni push e anche manualmente da GitHub Actions. Costruisce e pubblica due immagini su GHCR:

```text
ghcr.io/<owner>/<repo>/backend:<tag>
ghcr.io/<owner>/<repo>/frontend:<tag>
```

Tag creati:

- branch, per esempio `main`;
- commit SHA, per esempio `sha-abc1234`;
- `latest` sul branch predefinito del repository;
- tag Git, se il push contiene un tag.

Il workflow usa `GITHUB_TOKEN`, quindi non richiede secret aggiuntivi. Nel repository GitHub deve essere consentita la scrittura dei package da Actions.

## Configurazione `.env`

Valori principali:

```env
DB_NAME=tickets
DB_USER=dbatickets
DB_PASSWORD=change-me-database-password

JWT_SECRET=change-me-at-least-32-bytes-long-secret-value

BACKEND_IMAGE=ghcr.io/your-org/sf2-tickets/backend:latest
FRONTEND_IMAGE=ghcr.io/your-org/sf2-tickets/frontend:latest

# TLS via Let's Encrypt (Caddy). Disabilitato di default.
TLS_ENABLED=false
DOMAIN=
ACME_EMAIL=

ATTACHMENTS_MAX_FILE_SIZE=25MB
ATTACHMENTS_MAX_REQUEST_SIZE=25M
```

Notifiche email:

```env
MAIL_NOTIFICATIONS_ENABLED=false
MAIL_FROM=no-reply@tickets.local
MAIL_NOTIFICATIONS_DELAY=5m
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_AUTH=false
SMTP_STARTTLS_ENABLE=false
```

Per Gmail, ad esempio, di solito servono SMTP autenticato, STARTTLS e una password app:

```env
MAIL_NOTIFICATIONS_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_AUTH=true
SMTP_STARTTLS_ENABLE=true
SMTP_USERNAME=nome.account@gmail.com
SMTP_PASSWORD=password-app
MAIL_FROM=nome.account@gmail.com
```

Il backend usa il logo della compagnia interna nelle email, se presente. Gli allegati vengono salvati in `./data/attachments/`; i loghi in `./data/branding/`.

## Avvio locale per sviluppo

Per sviluppare con hot reload, lo script `scripts/dev.sh` avvia il database in Docker e lancia backend e frontend in locale (Spring Boot + Angular dev server). Richiede Docker, Java 21+, Maven e Node.js.

```bash
./scripts/dev.sh           # foreground: tail dei log, Ctrl+C per fermare tutto
./scripts/dev.sh --detach  # background: PIDs e path dei log stampati e poi esce
./scripts/dev.sh --stop    # ferma i processi locali e il database
```

Cosa fa:

1. `cd` nella root del repo e legge `.env` da lì;
2. `docker compose up -d database` e attende il healthcheck `healthy`;
3. esporta le variabili di `.env` (`set -a; . .env; set +a`);
4. avvia `mvn spring-boot:run` in `backend/` scrivendo il log in `.dev-logs/backend.log`;
5. avvia `npm start` in `frontend/` scrivendo il log in `.dev-logs/frontend.log`;
6. cattura `SIGINT`/`SIGTERM` per terminare entrambi i processi locali e fermare il container del database.

Apri <http://localhost:4200/>. Il dev server di Angular inoltra `/api`, incluso l'upgrade WebSocket, al backend tramite `frontend/proxy.conf.json` (default: `http://localhost:8080`). Dopo una modifica a quel file, riavvia `npm start`: Angular legge la configurazione del proxy solo all'avvio.

Se preferisci i passi manuali: `docker compose up -d database`, poi `cd backend && mvn spring-boot:run` e in un altro terminale `cd frontend && npm start`.

## Note applicative

Conserva `JWT_SECRET` tra i riavvii: cambiandola, i token già emessi cessano di essere validi.

Flyway esegue le migrazioni in `backend/src/main/resources/db/migration/`. Hibernate verifica che le entità corrispondano allo schema senza modificarlo.

Il frontend usa PrimeNG. Durante il setup si scelgono il nome, il colore primary e un logo opzionale della compagnia interna. Ogni compagnia può avere un colore e un logo opzionale; ogni progetto può avere un logo opzionale. Il colore della compagnia dell’utente viene applicato dopo il login. L’header mostra il logo interno e, per gli utenti esterni, quello della loro compagnia. Il progetto selezionato viene conservato in un cookie distinto per utente.

I loghi PNG, JPEG, WebP o SVG (massimo 2 MB) sono salvati in `ROOT_FOLDER/companies/<company_id>.<original_ext>` e `ROOT_FOLDER/projects/<project_id>.<original_ext>`. In Docker, `ROOT_FOLDER` è `/data/branding`; in locale il valore predefinito è `./branding` (relativo alla directory `backend`). Se il logo manca, l’interfaccia mostra il nome.

## Autenticazione

`POST /api/auth/login` accetta:

```json
{"username":"admin","password":"..."}
```

e restituisce un access token Bearer valido per 15 minuti.

Per verificare il token:

```http
GET /api/auth/me
Authorization: Bearer <token>
```

`GET /api/auth/projects` restituisce i progetti visibili all’utente corrente.

Non è prevista registrazione pubblica. Gli utenti vengono creati dagli `ADMIN` nelle sezioni di configurazione.

### Autenticazione esterna

In **Configurazione → Autenticazione esterna**, un `ADMIN` può abilitare l’accesso per progetto e creare applicazioni con un secret e utenti associati tramite il valore `sub`. Ogni applicazione usa HS256, HS384 o HS512 e può indicare se il secret inserito è Base64. In quel caso il backend lo decodifica prima di verificare la firma; altrimenti usa i byte UTF-8 del testo inserito. La chiave risultante deve contenere almeno 32, 48 o 64 byte rispettivamente, e al massimo 512 byte. Il JWT deve avere `sub` mappato ed `exp` non scaduto.

Il sistema esterno apre `GET /login?t=<external_token>`. Il frontend rimuove subito `t` dall’URL e invia il token a `POST /api/auth/external-login`; il backend verifica firma, scadenza, mapping e appartenenza al progetto, poi emette il normale access token applicativo. Il JWT esterno non viene salvato.

Usa HTTPS e configura gli eventuali proxy davanti a nginx per non registrare la query string di `/login`: il token è presente nella prima richiesta HTTP.

Il secret può essere sostituito modificando l’applicazione; lasciando vuoto il campo viene conservato. Le API di configurazione non ne restituiscono mai il valore. Nel database è cifrato con AES-GCM usando una chiave derivata da `JWT_SECRET`. Conserva `JWT_SECRET` stabile: se cambia, i secret esterni salvati non sono più decifrabili e devono essere reinseriti.

## Gestione compagnie, utenti e progetti

La compagnia interna del team sviluppatori viene creata dal setup iniziale. È visualizzata come “Team interno”, può essere modificata e non può essere eliminata. Gli utenti `TEAM` e `ADMIN` appartengono sempre a questa compagnia.

Le compagnie cliente contengono utenti `USER` e `SUPERUSER`. Un progetto può essere collegato a una compagnia cliente: in quel caso tutti i suoi utenti entrano automaticamente nel progetto, anche se vengono creati in seguito. Scollegando la compagnia dal progetto, quegli utenti perdono l’accesso automatico. È comunque possibile assegnare utenti esterni in modo esplicito.

`ADMIN` e `TEAM` vedono solo i progetti a cui sono assegnati, salvo le funzionalità amministrative previste per gli `ADMIN`. `USER` e `SUPERUSER` vedono i progetti della propria compagnia e quelli assegnati esplicitamente.

## Issue, stati e approvazione

Le issue hanno campi standard e campi custom per progetto. La creazione issue usa i campi visibili allo `USER`; la pianificazione assegna tipologia e sviluppatore.

Stati principali:

- Segnalato;
- In lavorazione;
- Completato;
- Rilasciato;
- Approvato.

Il passaggio ad “Approvato” non può essere fatto dalla kanban: lo può fare solo un `SUPERUSER` dal dettaglio della issue quando lo stato è “Rilasciato”. Una issue già approvata può essere spostata indietro dalla kanban.

Tipologie:

- Anomalia;
- Miglioria;
- Implementazione.

## Notifiche email

Le notifiche vengono scritte nella tabella eventi e inviate periodicamente agli utenti che hanno abilitato le email a livello personale o per progetto. Il controllo parte subito all’avvio del backend e poi continua con il ritardo configurato da `MAIL_NOTIFICATIONS_DELAY`.

Eventi notificati:

- creazione issue;
- pianificazione issue;
- cambio stato;
- approvazione;
- nuovo commento;
- eliminazione commento;
- nuovo allegato;
- modifica dei campi team;
- eliminazione issue.

Il testo email è in italiano e traduce anche stati e tipologie.

## Eventi e sincronizzazione live

Il registro **Eventi** è accessibile solo a `TEAM` e `ADMIN` e si può filtrare per tipo, utente e data. Le segnalazioni interne restano visibili solo ai ruoli interni.

Dashboard, kanban, pianificazione, registro eventi e dettagli aperti si aggiornano tramite WebSocket quando vengono create o modificate segnalazioni, commenti, allegati, campi team, pianificazioni e stati. Gli avvisi sono inviati dopo il commit della modifica. Il browser apre il canale con un ticket monouso di breve durata, ottenuto tramite JWT, e si riconnette automaticamente se la connessione cade. Il proxy deve inoltrare l'upgrade WebSocket su `/api/work/live`; la configurazione nginx inclusa lo fa già.

Il broker WebSocket è locale al processo backend. Per distribuire più istanze backend serve un broker condiviso per propagare gli avvisi tra istanze.

## API amministrative

I seguenti endpoint richiedono un JWT con ruolo `ADMIN`. Ognuno supporta `GET /`, `GET /{id}`, `POST /`, `PUT /{id}` e `DELETE /{id}` rispetto al percorso indicato:

| Entità | Percorso | Filtri aggiuntivi |
| --- | --- | --- |
| Aziende | `/api/companies` | — |
| Utenti | `/api/users` | `/project/{projectId}`, `/company/{companyId}` |
| Progetti | `/api/projects` | `/company/{companyId}` |
| Ticket | `/api/issues` | `/project/{projectId}` |
| Campi | `/api/issue-fields` | `/project/{projectId}` |
| Opzioni | `/api/issue-field-options` | `/project/{projectId}`, `/field/{definitionId}` |
| Valori | `/api/issue-data` | `/project/{projectId}`, `/issue/{issueId}` |
| Commenti | `/api/issue-comments` | `/project/{projectId}`, `/issue/{issueId}` |

`GET /api/users/project/{projectId}` restituisce gli utenti effettivi del progetto. `/api/project-users` gestisce le assegnazioni esplicite non coperte dal collegamento automatico tra progetto e compagnia.

## Developer Notes

### API notifiche issue

Il riepilogo delle issue nuove o aggiornate è disponibile con:

```http
GET /api/work/projects/{projectId}/notifications
Authorization: Bearer <access-token-applicativo>
```

L'utente non viene passato nella richiesta: viene sempre ricavato dal `sub` del Bearer token. Il `projectId` è nel path, coerentemente con le altre API workspace, e il backend verifica che quell'utente possa vedere il progetto. La risposta è, ad esempio:

```json
{
  "projectId": 12,
  "total": 3,
  "planning": 1,
  "anomalies": 1,
  "improvements": 0,
  "implementations": 1,
  "issues": [
    { "issueId": 41, "issueType": null },
    { "issueId": 44, "issueType": "ANOMALY" },
    { "issueId": 51, "issueType": "IMPLEMENTATION" }
  ]
}
```

I contatori rappresentano issue distinte, non eventi: più eventi non letti sulla stessa issue producono un solo incremento. Le azioni eseguite dall'utente stesso non generano un non-letto per quell'utente. Le issue senza tipologia confluiscono in `planning`; le altre nei tre contatori di tipologia. Visibilità delle issue interne, membership del progetto e cancellazioni rispettano le stesse regole delle API workspace.

`GET /api/work/projects/{projectId}/issues` restituisce la lista senza modificare lo stato di lettura. `GET /api/work/issues/{issueId}` restituisce il dettaglio e, nella stessa transazione, registra per l'utente l'ultimo evento visto: dalla successiva chiamata al riepilogo l'issue non compare più, finché non arriva un nuovo evento di un altro utente.

### Token interni ed esterni

Con un token interno ottenuto da `POST /api/auth/login`, il Bearer token si usa direttamente sull'API notifiche.

Le applicazioni configurate in **Configurazione → Autenticazione esterna** effettuano prima l'exchange del proprio JWT esterno:

```http
POST /api/auth/external-login
Content-Type: application/json

{ "token": "<jwt-esterno-firmato>" }
```

Il backend valida firma, algoritmo, `exp`, mapping di `sub`, progetto abilitato e membership. La risposta contiene il progetto vincolato al mapping e una sessione applicativa che include internamente lo stesso vincolo di progetto:

```json
{
  "session": {
    "accessToken": "<access-token-applicativo>",
    "tokenType": "Bearer",
    "expiresInSeconds": 900
  },
  "projectId": 12
}
```

L'applicazione esterna usa quindi `session.accessToken` come Bearer per `GET /api/work/projects/12/notifications` e, quando vuole marcare una issue come vista, per `GET /api/work/issues/{issueId}`. Per queste operazioni il backend rifiuta un `projectId` o una issue appartenenti a un progetto diverso da quello dell'applicazione esterna. In questo modo la stessa API supporta login interno e identità provenienti da token esterni mantenendo un solo formato di access token autorizzativo; il JWT esterno non viene inoltrato alle API workspace né conservato dal sistema.
