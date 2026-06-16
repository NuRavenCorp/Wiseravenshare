# See https://aka.ms/customizecontainer to learn how to customize your debug container and how Visual Studio uses this Dockerfile to build your images for faster debugging.

# This stage is used when running from VS in fast mode (Default for Debug configuration)
FROM ubuntu:24.04 AS base
WORKDIR /app
EXPOSE 10000

RUN apt-get update \
	&& apt-get install -y wget ca-certificates \
	&& wget https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb \
	&& dpkg -i /tmp/packages-microsoft-prod.deb \
	&& rm /tmp/packages-microsoft-prod.deb \
	&& apt-get update \
	&& apt-get install -y aspnetcore-runtime-10.0 \
	&& rm -rf /var/lib/apt/lists/*


# This stage is used to build the service project
FROM ubuntu:24.04 AS with-node
RUN apt-get update \
	&& apt-get install -y wget curl ca-certificates gnupg \
	&& wget https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb \
	&& dpkg -i /tmp/packages-microsoft-prod.deb \
	&& rm /tmp/packages-microsoft-prod.deb \
	&& apt-get update \
	&& apt-get install -y dotnet-sdk-10.0 \
	&& curl -sL https://deb.nodesource.com/setup_20.x | bash - \
	&& apt-get install -y nodejs \
	&& rm -rf /var/lib/apt/lists/*


FROM with-node AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["Wiseravenshare.Server/Wiseravenshare.Server.csproj", "Wiseravenshare.Server/"]
COPY ["wiseravenshare.client/wiseravenshare.client.esproj", "wiseravenshare.client/"]
RUN dotnet restore "./Wiseravenshare.Server/Wiseravenshare.Server.csproj"
COPY . .
WORKDIR "/src/Wiseravenshare.Server"
RUN dotnet build "./Wiseravenshare.Server.csproj" -c $BUILD_CONFIGURATION -o /app/build

# This stage is used to publish the service project to be copied to the final stage
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./Wiseravenshare.Server.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# This stage is used in production or when running from VS in regular mode (Default when not using the Debug configuration)
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Wiseravenshare.Server.dll"]
