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

Crea il file `.env` partendo dall’esempio:

```bash
cp .env.example .env
```

Imposta almeno questi valori:

```env
DB_PASSWORD='password-del-database'
JWT_SECRET='una-stringa-segreta-di-almeno-32-caratteri'
BACKEND_IMAGE=ghcr.io/<owner>/<repo>/backend:latest
FRONTEND_IMAGE=ghcr.io/<owner>/<repo>/frontend:latest
```

Per generare un `JWT_SECRET` sicuro puoi usare:

```bash
openssl rand -hex 32
```

Avvia tutto:

```bash
docker compose up -d
```

Poi apri:

```text
http://localhost:4200
```

Se le immagini GHCR sono private, prima fai login:

```bash
echo '<github-token>' | docker login ghcr.io -u '<github-username>' --password-stdin
```

### Avvio con build locale

Per compilare le immagini dal codice presente nella cartella:

```bash
docker compose -f compose.dev.yml up --build
```

Anche in questo caso l’applicazione sarà disponibile su `http://localhost:4200`.

Al primo accesso, se il database non contiene utenti, viene mostrata la pagina di configurazione iniziale. Da lì crei la compagnia interna del team sviluppatori e il primo utente `ADMIN`.

### Servizi avviati

Entrambi i compose avviano tre servizi:

- `database`: PostgreSQL;
- `backend`: API Spring Boot;
- `frontend`: Angular servito da nginx, con proxy `/api` verso il backend.

### Porte predefinite

| Servizio | Porta host | Variabile |
| --- | ---: | --- |
| Frontend | `4200` | `FRONTEND_PORT` |
| Backend | `8080` | `BACKEND_PORT` |
| PostgreSQL | `5432` | `DB_PORT` |

Esempio:

```env
FRONTEND_PORT=8081
BACKEND_PORT=8082
DB_PORT=5433
```

### Persistenza Docker

Compose crea due volumi:

- `postgres_data`: dati PostgreSQL;
- `attachments_data`: file caricati nelle issue.

Per fermare i container senza cancellare i dati:

```bash
docker compose down
```

Per cancellare anche database e allegati:

```bash
docker compose down -v
```

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
DB_PORT=5432

JWT_SECRET=change-me-at-least-32-bytes-long-secret-value

BACKEND_IMAGE=ghcr.io/your-org/sf2-tickets/backend:latest
FRONTEND_IMAGE=ghcr.io/your-org/sf2-tickets/frontend:latest

FRONTEND_PORT=4200
BACKEND_PORT=8080

ATTACHMENTS_MAX_FILE_SIZE=25MB
ATTACHMENTS_MAX_REQUEST_SIZE=25MB
```

Notifiche email:

```env
MAIL_NOTIFICATIONS_ENABLED=false
MAIL_FROM=no-reply@softwaredue.local
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

Il backend invia le email con il logo `Logo_SoftwareDue.svg` incluso nell’immagine Docker. Gli allegati vengono salvati dentro il container backend in `/data/attachments`, montato sul volume `attachments_data`.

## Avvio locale per sviluppo

Per lavorare senza containerizzare backend e frontend, puoi usare Docker solo per PostgreSQL:

```bash
docker compose up -d database
```

Poi avvia il backend localmente. Servono Java 21 o superiore e Maven:

```bash
export DB_URL=jdbc:postgresql://localhost:5432/tickets
export DB_USER=dbatickets
export DB_PASSWORD='password-del-database'
export JWT_SECRET='una-stringa-segreta-di-almeno-32-caratteri'
cd backend
mvn spring-boot:run
```

In un altro terminale avvia Angular. Servono Node.js e npm:

```bash
cd frontend
npm install
npm start
```

Apri `http://localhost:4200`. Il server Angular inoltra `/api` al backend tramite `frontend/proxy.conf.json`.

## Note applicative

Conserva `JWT_SECRET` tra i riavvii: cambiandola, i token già emessi cessano di essere validi.

Flyway esegue le migrazioni in `backend/src/main/resources/db/migration/`. Hibernate verifica che le entità corrispondano allo schema senza modificarlo.

Il frontend usa PrimeNG e il logo Software Due. L’header offre Dashboard, Pianificazione, Anomalie, Migliorie, Implementazioni e, per gli `ADMIN`, Configurazione. Il progetto selezionato viene conservato in un cookie distinto per utente.

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
- nuovo allegato;
- eliminazione issue.

Il testo email è in italiano e traduce anche stati e tipologie.

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
