FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY backend/pom.xml backend/pom.xml
WORKDIR /workspace/backend
RUN mvn -q -DskipTests dependency:go-offline
WORKDIR /workspace
COPY backend backend
WORKDIR /workspace/backend
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_TIME=unknown
WORKDIR /app
RUN mkdir -p /data/attachments /data/branding
COPY --from=build /workspace/backend/target/loom-1.1.0-SNAPSHOT.jar /app/app.jar
ENV APP_VERSION=${VERSION} \
    APP_COMMIT=${COMMIT} \
    APP_BUILD_TIME=${BUILD_TIME}
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
