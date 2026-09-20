# Production image for the Vite frontend
FROM node:22-alpine AS build
WORKDIR /app

# Native build dependencies required by some npm modules (for example sharp/node-gyp).
RUN apk add --no-cache python3 make g++

COPY wiseravenshare.client/package*.json ./
RUN npm ci

COPY wiseravenshare.client/ ./
RUN npm run build

FROM nginx:1.27-alpine AS runtime

# Use repo-provided nginx configuration when available
COPY wiseravenshare.client/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
