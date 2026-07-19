# See https://aka.ms/customizecontainer to learn how to customize your debug container and how Visual Studio uses this Dockerfile to build your images for faster debugging.

# This stage is used when running from VS in fast mode (Default for Debug configuration)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081


# This stage is used to build the service project
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS with-node
RUN apt-get update
RUN apt-get install curl
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash
RUN apt-get -y install nodejs


FROM with-node AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["WiseRavenShare.Server/WiseRavenShare.Server.csproj", "WiseRavenShare.Server/"]
COPY ["wiseravenshare.client/wiseravenshare.client.esproj", "wiseravenshare.client/"]
RUN dotnet restore "./WiseRavenShare.Server/WiseRavenShare.Server.csproj"
COPY . .
WORKDIR "/src/WiseRavenShare.Server"
RUN dotnet build "./WiseRavenShare.Server.csproj" -c $BUILD_CONFIGURATION -o /app/build

# Copy csproj files and restore dependencies
COPY ["Wiseravenshare.Server.API/Wiseravenshare.Server.API.csproj", "Wiseravenshare.Server.API/"]
COPY ["Wiseravenshare.Server.Core/Wiseravenshare.Server.Core.csproj", "Wiseravenshare.Server.Core/"]
COPY ["Wiseravenshare.Server.Application/Wiseravenshare.Server.Application.csproj", "Wiseravenshare.Server.Application/"]
COPY ["Wiseravenshare.Server.Infrastructure/Wiseravenshare.Server.Infrastructure.csproj", "Wiseravenshare.Server.Infrastructure/"]
COPY ["Wiseravenshare.Server.Shared/Wiseravenshare.Server.Shared.csproj", "Wiseravenshare.Server.Shared/"]
RUN dotnet restore "Wiseravenshare.Server.API/Wiseravenshare.Server.API.csproj"


# This stage is used to publish the service project to be copied to the final stage
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./WiseRavenShare.Server.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# This stage is used in production or when running from VS in regular mode (Default when not using the Debug configuration)
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "WiseRavenShare.Server.dll"]
