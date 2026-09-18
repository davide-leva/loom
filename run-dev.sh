docker compose up -d database

set -a
. ./.env
set +a

cd backend
mvn spring-boot:run