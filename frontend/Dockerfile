FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY upgrade-map.conf.template /etc/nginx/templates/upgrade-map.conf.template
COPY --from=build /app/dist/loom/browser /usr/share/nginx/html
EXPOSE 443
