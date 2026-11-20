sing System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
namespace WiseRavenShare.Journalism
{
    // =========================================================================
    // DIGITALOCEAN SPACES (S3-COMPATIBLE) STORAGE SERVICE
    // =========================================================================
    // DigitalOcean Spaces uses the AWS S3-compatible protocol.
    // In .NET, AWSSDK.S3 is used with ServiceURL pointed to your DO region endpoint:
    // e.g. https://nyc3.digitaloceanspaces.com, https://sfo3.digitaloceanspaces.com
    // =========================================================================
    public class DigitalOceanSpacesService
    {
        private readonly IAmazonS3 _spacesClient;
        private readonly string _spaceName;
        private readonly string _region;
        private readonly string _cdnBaseUrl;
        private readonly ILogger<DigitalOceanSpacesService> _logger;
        public DigitalOceanSpacesService(IConfiguration config, ILogger<DigitalOceanSpacesService> logger)
        {
            _logger = logger;
            _spaceName = config["DigitalOcean:Spaces:SpaceName"]
                         ?? config["Spaces:BucketName"]
                         ?? throw new ArgumentNullException("DigitalOcean:Spaces:SpaceName missing");
            _region = config["DigitalOcean:Spaces:Region"] ?? "nyc3";
            // DigitalOcean regional endpoint
            var serviceUrl = config["DigitalOcean:Spaces:ServiceUrl"]
                             ?? $"https://{_region}.digitaloceanspaces.com";
            // DigitalOcean built-in CDN endpoint (or custom domain)
            _cdnBaseUrl = (config["DigitalOcean:Spaces:CdnBaseUrl"]
                          ?? $"https://{_spaceName}.{_region}.cdn.digitaloceanspaces.com").TrimEnd('/');
            var accessKey = config["DigitalOcean:Spaces:AccessKey"] ?? config["Spaces:AccessKey"]!;
            var secretKey = config["DigitalOcean:Spaces:SecretKey"] ?? config["Spaces:SecretKey"]!;