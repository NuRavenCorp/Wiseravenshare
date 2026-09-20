FROM node:20-alpine AS build
WORKDIR /app
COPY nuravencorpllm.client/package*.json ./
RUN npm install
ENV VITE_DISABLE_HTTPS_CERTS=1
COPY nuravencorpllm.client/ .
RUN npm run build

FROM nginx:1.27-alpine AS final
COPY docker/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
