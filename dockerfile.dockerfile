# backend/Dockerfile.prod
# Multi-stage production build for .NET 8

# ============================================
# Stage 1: Build
# ============================================
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj files
COPY ["Wiseravenshare.API/Wiseravenshare.API.csproj", "Wiseravenshare.API/"]
COPY ["Wiseravenshare.Core/Wiseravenshare.Core.csproj", "Wiseravenshare.Core/"]
COPY ["Wiseravenshare.Application/Wiseravenshare.Application.csproj", "Wiseravenshare.Application/"]
COPY ["Wiseravenshare.Infrastructure/Wiseravenshare.Infrastructure.csproj", "Wiseravenshare.Infrastructure/"]
COPY ["Wiseravenshare.Shared/Wiseravenshare.Shared.csproj", "Wiseravenshare.Shared/"]

# Restore dependencies
RUN dotnet restore "Wiseravenshare.API/Wiseravenshare.API.csproj"

# Copy source
COPY . .

# Build
WORKDIR "/src/Wiseravenshare.API"
RUN dotnet build "Wiseravenshare.API.csproj" -c Release -o /app/build

# ============================================
# Stage 2: Publish
# ============================================
FROM build AS publish
RUN dotnet publish "Wiseravenshare.API.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ============================================
# Stage 3: Runtime
# ============================================
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Install tools and dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Set timezone
ENV TZ=UTC

# Create non-root user
RUN groupadd -r wiseraven && useradd -r -g wiseraven wiseraven && \
    mkdir -p /app/Logs /app/MediaStorage && \
    chown -R wiseraven:wiseraven /app

# Copy published files
COPY --from=publish /app/publish .

# Copy certificates if present
COPY --chown=wiseraven:wiseraven certs/* /https/ 2>/dev/null || true

# Switch to non-root user
USER wiseraven

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Environment variables
ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_USE_POLLING_FILE_WATCHER=0

EXPOSE 5000
EXPOSE 5001

ENTRYPOINT ["dotnet", "Wiseravenshare.API.dll"]