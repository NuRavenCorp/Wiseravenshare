# docker-compose.dev.yml
version: '3.8'

services:
  # Development Backend
  backend-dev:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
      target: development
    container_name: wiseravenshare-api-dev
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - ASPNETCORE_URLS=http://+:5000
      - ConnectionStrings__DefaultConnection=Host=postgres;Port=5432;Database=wiseravenshare-db;Username=wiseravenshare-user;Password=${DB_PASSWORD:-1@Chinchin234}
      - ConnectionStrings__Redis=redis:6379,password=${REDIS_PASSWORD:-redis123},abortConnect=false
      - Jwt__Key=${JWT_SECRET_KEY}
      - Jwt__Issuer=wiseravenshare.com
      - Jwt__Audience=wiseravenshare.com
      - OpenAI__ApiKey=${OPENAI_API_KEY}
      - YouTube__ApiKey=${YOUTUBE_API_KEY}
      - DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER=true
      - DOTNET_USE_POLLING_FILE_WATCHER=1
    ports:
      - "5000:5000"
    volumes:
      - ./backend:/app
      - ~/.nuget/packages:/root/.nuget/packages
      - ~/.aspnet/https:/root/.aspnet/https:ro
    depends_on:
      - postgres
      - redis
    networks:
      - wiseravenshare-network
    command: dotnet watch run --project Wiseravenshare.API/Wiseravenshare.API.csproj --no-launch-profile

  # Development Frontend
  frontend-dev:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
      target: development
    container_name: wiseravenshare-frontend-dev
    environment:
      - VITE_API_URL=http://localhost:5000
      - VITE_WS_URL=ws://localhost:5000
      - VITE_GOOGLE_ANALYTICS_ID=
      - VITE_ENABLE_ANALYTICS=false
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - backend-dev
    networks:
      - wiseravenshare-network
    command: npm run dev -- --host

  # Hot Reload Proxy
  hot-reload:
    image: nginx:alpine
    container_name: wiseravenshare-hot-reload
    restart: unless-stopped
    volumes:
      - ./nginx/dev.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "3001:80"
    depends_on:
      - frontend-dev
      - backend-dev
    networks:
      - wiseravenshare-network