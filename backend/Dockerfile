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
WORKDIR /app
RUN mkdir -p /data/attachments /app/assets
COPY --from=build /workspace/backend/target/sf2-tickets-0.1.0-SNAPSHOT.jar /app/app.jar
COPY frontend/public/Logo_SoftwareDue.svg /app/assets/Logo_SoftwareDue.svg
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
