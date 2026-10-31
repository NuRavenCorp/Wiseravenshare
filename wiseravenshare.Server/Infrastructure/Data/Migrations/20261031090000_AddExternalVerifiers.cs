using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations;

/// <inheritdoc />
public partial class AddExternalVerifiers : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "external_verifiers",
            schema: "app_data",
            columns: table => new
            {
                id              = table.Column<string>(type: "text", nullable: false),
                name            = table.Column<string>(type: "text", nullable: false),
                endpoint_template = table.Column<string>(type: "text", nullable: false),
                fetch_type      = table.Column<string>(type: "text", nullable: false, defaultValue: "stub"),
                api_key_env_var = table.Column<string>(type: "text", nullable: true),
                weight          = table.Column<decimal>(type: "numeric", nullable: false, defaultValue: 0.10m),
                is_enabled      = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                score_json_path = table.Column<string>(type: "text", nullable: true),
                notes           = table.Column<string>(type: "text", nullable: true),
                created_at      = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "NOW()"),
                updated_at      = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "NOW()")
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_external_verifiers", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_external_verifiers_is_enabled",
            schema: "app_data",
            table: "external_verifiers",
            column: "is_enabled");

        // ── Seed well-known fact-checkers as stubs ─────────────────────────
        // All start as "stub" (no live call) with low weight so they contribute
        // a neutral 0.50 baseline. Admins activate them and set endpoint + fetch_type
        // once API keys are configured.
        migrationBuilder.InsertData(
            schema: "app_data",
            table: "external_verifiers",
            columns: ["id", "name", "endpoint_template", "fetch_type", "weight", "is_enabled", "notes"],
            values: new object[,]
            {
                { "politifact",   "PolitiFact",       "https://www.politifact.com/search/?q={query}",                   "stub", 0.12m, true,  "PolitiFact Truth-O-Meter ratings. Set fetch_type=rss and configure endpoint when API available." },
                { "factcheck",    "FactCheck.org",    "https://www.factcheck.org/search/#gsc.q={query}",               "stub", 0.12m, true,  "FactCheck.org analysis. Stub pending RSS integration." },
                { "snopes",       "Snopes",           "https://www.snopes.com/?s={query}",                             "stub", 0.10m, true,  "Snopes fact-check archive. Stub pending scrape integration." },
                { "ap-fact",      "AP Fact Check",    "https://apnews.com/hub/ap-fact-check?q={query}",                "rss",  0.12m, true,  "Associated Press Fact Check RSS feed — no API key needed." },
                { "reuters-fact", "Reuters Fact Check","https://www.reuters.com/fact-check/",                          "stub", 0.10m, true,  "Reuters Fact Check. Stub — enable with REST integration." },
                { "fullfact",     "Full Fact",        "https://fullfact.org/search/?q={query}",                        "stub", 0.08m, true,  "UK-based independent fact-checking organisation." },
                { "afp-fact",     "AFP Fact Check",   "https://factcheck.afp.com/?s={query}",                         "stub", 0.08m, true,  "Agence France-Presse global fact-checking network." },
                { "wrs-amateurs", "WRS-Amateurs",     "/api/news/bulletin?topic={query}&limit=5",                      "rest_json", 0.08m, true, "WiseRavenShare amateur journalism reports — internal source." },
                { "mediabias",    "Media Bias/Fact Check", "https://mediabiasfactcheck.com/?s={query}",               "stub", 0.06m, false, "Source credibility database. Disabled by default." },
                { "climate-feed", "Climate Feedback", "https://climatefeedback.org/?s={query}",                       "stub", 0.06m, false, "Science-specific climate claim verification. Domain: climate/environment." },
            });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "external_verifiers", schema: "app_data");
    }
}
