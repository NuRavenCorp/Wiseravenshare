FROM node:20-alpine AS build
WORKDIR /app

COPY wiseravenshare.client/package*.json ./
RUN npm ci

COPY wiseravenshare.client/ ./

ARG VITE_API_URL
ARG VITE_RAVENSIGHT_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_RAVENSIGHT_API_URL=${VITE_RAVENSIGHT_API_URL}

RUN npm run build

FROM nginx:1.27-alpine AS final

RUN rm -f /etc/nginx/conf.d/default.conf
COPY wiseravenshare.client/nginx.cloudrun.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
