# ==========================================
# Stage 1: Build the Frontend (React + Vite)
# ==========================================
FROM node:20-alpine AS client-build
WORKDIR /build/client

# Copy package.json and lock file first to leverage Docker cache
COPY wiseravenshare.client/package*.json ./
RUN npm ci --prefer-offline

# Copy source and build with environment variables passed from build args
ARG VITE_API_URL=http://localhost:10000
ARG VITE_RAVENSIGHT_API_URL=http://localhost:10000/api/ravensight
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_RAVENSIGHT_API_URL=${VITE_RAVENSIGHT_API_URL}

COPY wiseravenshare.client/ ./
RUN npm run build


# ==========================================
# Stage 2: Build the Backend (.NET API)
# ==========================================
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS server-build
WORKDIR /src

# Copy project file to cache layers for dotnet restore
COPY Wiseravenshare.Server/*.csproj ./Wiseravenshare.Server/
RUN dotnet restore Wiseravenshare.Server/Wiseravenshare.Server.csproj -p:DisableSpaProject=true

# Copy the rest of the backend files
COPY Wiseravenshare.Server/ ./Wiseravenshare.Server/
RUN dotnet publish Wiseravenshare.Server/Wiseravenshare.Server.csproj \
    -c Release \
    -o /app/publish \
    -p:DisableSpaProject=true


# ==========================================
# Stage 3: Final Production Runtime
# ==========================================
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS final
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache tzdata curl icu-libs

# Set environment variables
ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:10000/health || exit 1

# Copy compiled backend
COPY --from=server-build /app/publish ./

# Copy compiled frontend into wwwroot for .NET to serve as static files
COPY --from=client-build /build/client/dist ./wwwroot

# Start the application
ENTRYPOINT ["dotnet", "Wiseravenshare.Server.dll"]
