# ==========================================
# Stage 1: Build the Frontend (React + Vite)
# ==========================================
FROM node:20-alpine AS client-build
WORKDIR /app/wiseravenshare.client

# Copy package.json and lock file first to leverage Docker cache
COPY wiseravenshare.client/package*.json ./
RUN npm install

# Copy source and build
COPY wiseravenshare.client/ ./
RUN npm run build


# ==========================================
# Stage 2: Build the Backend (.NET 10 API)
# ==========================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server-build
WORKDIR /src

# Copy projects to cache layers for dotnet restore
COPY Wiseravenshare.Server/Wiseravenshare.Server.csproj Wiseravenshare.Server/
RUN dotnet restore Wiseravenshare.Server/Wiseravenshare.Server.csproj -p:DisableSpaProject=true

# Copy the rest of the backend files
COPY Wiseravenshare.Server/ Wiseravenshare.Server/

WORKDIR /src/Wiseravenshare.Server
RUN dotnet publish Wiseravenshare.Server.csproj -c Release -o /app/publish -p:DisableSpaProject=true


# ==========================================
# Stage 3: Final Production Runtime
# ==========================================
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS final
WORKDIR /app

# Required packages for .NET runtime and PostgreSQL/general net libraries if needed
RUN apk add --no-cache tzdata curl icu-libs

# Set environment variables
ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000

# Copy compiled backend
COPY --from=server-build /app/publish ./

# Copy compiled frontend into the wwwroot so .NET serves it
# .NET looks in wwwroot by default for static files and fallbacks
COPY --from=client-build /app/wiseravenshare.client/dist ./wwwroot

# Start
ENTRYPOINT ["dotnet", "Wiseravenshare.Server.dll"]
