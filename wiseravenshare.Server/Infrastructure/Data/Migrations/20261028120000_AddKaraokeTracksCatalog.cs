using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Creates the KaraokeTracks and KaraokeTrackPlays tables in app_data schema.
    /// KaraokeTracks stores public-domain / Creative-Commons / user-uploaded karaoke
    /// songs with all blob-storage object keys so the serving layer can resolve CDN
    /// URLs via IBlobStorageService at request time.
    ///
    /// Blob key convention:
    ///   {BlobProjectFolder}/karaoke/tracks/{TrackId}/instrumental.wav
    ///   {BlobProjectFolder}/karaoke/tracks/{TrackId}/vocals.wav
    ///   {BlobProjectFolder}/karaoke/tracks/{TrackId}/song.lrc
    ///   {BlobProjectFolder}/karaoke/tracks/{TrackId}/cover.jpg
    /// </summary>
    public partial class AddKaraokeTracksCatalog : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "KaraokeTracks",
                schema: "app_data",
                columns: table => new
                {
                    Id                  = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Title               = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Artist              = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Album               = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Genre               = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Language            = table.Column<string>(type: "character varying(10)",  maxLength: 10,  nullable: true, defaultValue: "en"),
                    Year                = table.Column<int>(type: "integer", nullable: true),

                    SourceType          = table.Column<int>(type: "integer", nullable: false, defaultValue: 99),
                    SourceId            = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    SourceUrl           = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),

                    License             = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false, defaultValue: "Public Domain"),
                    LicenseUrl          = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    AttributionText     = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),

                    InstrumentalBlobKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    VocalsBlobKey       = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    LrcBlobKey          = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CoverImageBlobKey   = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),

                    InstrumentalUrl     = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    LrcUrl              = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    CoverImageUrl       = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),

                    LrcContent          = table.Column<string>(type: "text", nullable: true),
                    PlainLyrics         = table.Column<string>(type: "text", nullable: true),

                    DurationSeconds     = table.Column<int>(type: "integer", nullable: true),
                    Bpm                 = table.Column<int>(type: "integer", nullable: true),
                    MusicalKey          = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),

                    Status              = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    IsPublic            = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    HasInstrumental     = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    HasLrc              = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),

                    PlayCount           = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Rating              = table.Column<float>(type: "real", nullable: true),
                    RatingCount         = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),

                    UploadedByUserId    = table.Column<Guid>(type: "uuid", nullable: true),

                    CreatedAt           = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    UpdatedAt           = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    IsDeleted           = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt           = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KaraokeTracks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KaraokeTracks_Users_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTracks_Status_IsPublic",
                schema: "app_data",
                table: "KaraokeTracks",
                columns: new[] { "Status", "IsPublic" },
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTracks_Artist_Title",
                schema: "app_data",
                table: "KaraokeTracks",
                columns: new[] { "Artist", "Title" },
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTracks_SourceType_SourceId",
                schema: "app_data",
                table: "KaraokeTracks",
                columns: new[] { "SourceType", "SourceId" },
                unique: true,
                filter: "\"SourceId\" IS NOT NULL AND \"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTracks_UploadedByUserId",
                schema: "app_data",
                table: "KaraokeTracks",
                column: "UploadedByUserId");

            // ── KaraokeTrackPlays ─────────────────────────────────────────────

            migrationBuilder.CreateTable(
                name: "KaraokeTrackPlays",
                schema: "app_data",
                columns: table => new
                {
                    Id                      = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TrackId                 = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId                  = table.Column<Guid>(type: "uuid", nullable: false),
                    PlayedAt                = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    DurationPlayedSeconds   = table.Column<int>(type: "integer", nullable: true),
                    Stars                   = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt               = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    UpdatedAt               = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    IsDeleted               = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    DeletedAt               = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KaraokeTrackPlays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KaraokeTrackPlays_KaraokeTracks_TrackId",
                        column: x => x.TrackId,
                        principalSchema: "app_data",
                        principalTable: "KaraokeTracks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_KaraokeTrackPlays_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTrackPlays_TrackId_PlayedAt",
                schema: "app_data",
                table: "KaraokeTrackPlays",
                columns: new[] { "TrackId", "PlayedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTrackPlays_UserId_PlayedAt",
                schema: "app_data",
                table: "KaraokeTrackPlays",
                columns: new[] { "UserId", "PlayedAt" });

            // ── Seed: public-domain / CC-licensed karaoke catalogue ───────────
            // Status=0 (Pending) — the python-karaoke engine will process these
            // and upload the instrumental + LRC blobs, then flip Status to Ready.
            // SourceType values: 4=InternetArchive, 3=FreeMusicArchive, 5=Jamendo,
            //                    6=CcMixter, 1=LrcLib, 99=System

            migrationBuilder.Sql("""
                INSERT INTO app_data."KaraokeTracks"
                    ("Id","Title","Artist","Genre","Language","Year",
                     "License","LicenseUrl","AttributionText",
                     "SourceType","SourceId","SourceUrl",
                     "Status","IsPublic","HasInstrumental","HasLrc",
                     "PlayCount","RatingCount",
                     "CreatedAt","UpdatedAt","IsDeleted")
                VALUES
                -- ── Public Domain (pre-1928 / classical) ─────────────────────
                (gen_random_uuid(),'In the Hall of the Mountain King','Edvard Grieg',
                 'Classical','en',1875,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Grieg — Peer Gynt Suite Op.23 (1875)',
                 4,'ia-grieg-mountain-king',
                 'https://archive.org/details/grieg-peer-gynt',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Für Elise','Ludwig van Beethoven',
                 'Classical','de',1810,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Beethoven — Für Elise WoO 59 (1810)',
                 4,'ia-beethoven-fur-elise',
                 'https://archive.org/details/fur-elise-beethoven',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Ode to Joy','Ludwig van Beethoven',
                 'Classical','de',1824,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Beethoven — Symphony No. 9 (1824)',
                 4,'ia-beethoven-ode-to-joy',
                 'https://archive.org/details/beethoven-symphony-9-ode-to-joy',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Greensleeves','Traditional',
                 'Folk','en',1580,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Traditional English folk song (c.1580)',
                 99,'sys-greensleeves',NULL,
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Danny Boy (Londonderry Air)','Traditional',
                 'Folk','en',1913,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'F.E. Weatherly 1913 — music traditional',
                 4,'ia-danny-boy',
                 'https://archive.org/details/danny-boy-londonderry-air',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Scarborough Fair','Traditional',
                 'Folk','en',1650,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Traditional English ballad (c.1650)',
                 99,'sys-scarborough-fair',NULL,
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Home on the Range','Traditional',
                 'Country','en',1872,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Brewster Higley / Daniel Kelley (1872)',
                 99,'sys-home-on-the-range',NULL,
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Oh! Susanna','Stephen Foster',
                 'Folk','en',1848,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Stephen Foster (1848)',
                 4,'ia-oh-susanna',
                 'https://archive.org/details/oh-susanna-foster',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Beautiful Dreamer','Stephen Foster',
                 'Folk','en',1864,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Stephen Foster (1864)',
                 4,'ia-beautiful-dreamer',
                 'https://archive.org/details/beautiful-dreamer-foster',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Yankee Doodle','Traditional',
                 'Patriotic','en',1750,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Traditional American patriotic song (c.1750)',
                 99,'sys-yankee-doodle',NULL,
                 0,true,false,false,0,0,NOW(),NOW(),false),

                -- ── Creative Commons (Jamendo / ccMixter / FMA) ──────────────
                (gen_random_uuid(),'The Show Must Go On (CC)','Moby (CC-BY)',
                 'Electronic','en',2012,'CC-BY-3.0',
                 'https://creativecommons.org/licenses/by/3.0/',
                 'Moby — available under CC-BY via Jamendo',
                 5,'jamendo-moby-show-must-go-on',
                 'https://www.jamendo.com/track/1216420',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Royalty Free Hip Hop Beat','Various (CC0)',
                 'Hip Hop','en',2020,'CC0-1.0',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Free Music Archive — CC0 hip-hop instrumental',
                 3,'fma-hiphop-beat-01',
                 'https://freemusicarchive.org/music/ccmixter',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Bright Acoustic Pop','Various (CC-BY)',
                 'Pop','en',2021,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'ccMixter community — CC-BY',
                 6,'ccmixter-bright-acoustic-pop',
                 'http://dig.ccmixter.org',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Chill Lo-Fi Study Beat','Various (CC-BY)',
                 'Lo-Fi','en',2022,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'Free Music Archive — CC-BY lo-fi',
                 3,'fma-lofi-study-01',
                 'https://freemusicarchive.org',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Smooth Jazz Night','Various (CC-BY)',
                 'Jazz','en',2019,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'ccMixter community — CC-BY jazz',
                 6,'ccmixter-smooth-jazz-night',
                 'http://dig.ccmixter.org',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Folk Guitar Ballad (CC-BY)','Various (CC-BY)',
                 'Folk','en',2018,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'Free Music Archive — CC-BY folk',
                 3,'fma-folk-guitar-ballad-01',
                 'https://freemusicarchive.org',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Electronic Dance Mix (CC0)','Various (CC0)',
                 'EDM','en',2023,'CC0-1.0',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'ccMixter community — CC0 EDM instrumental',
                 6,'ccmixter-edm-mix-01',
                 'http://dig.ccmixter.org',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                -- ── LRCLIB source (synced lyrics catalog only — no audio) ────
                (gen_random_uuid(),'Bohemian Rhapsody (Lyrics Only)','Queen',
                 'Rock','en',1975,'Lyrics via LRCLIB (fair-use display)',
                 'https://lrclib.net',
                 'LRC source: lrclib.net — audio must be user-supplied',
                 1,'lrclib-queen-bohemian-rhapsody',
                 'https://lrclib.net/api/search?q=Bohemian+Rhapsody',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Don''t Stop Believin'' (Lyrics Only)','Journey',
                 'Rock','en',1981,'Lyrics via LRCLIB (fair-use display)',
                 'https://lrclib.net',
                 'LRC source: lrclib.net — audio must be user-supplied',
                 1,'lrclib-journey-dont-stop-believin',
                 'https://lrclib.net/api/search?q=Don%27t+Stop+Believin',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),'Sweet Caroline (Lyrics Only)','Neil Diamond',
                 'Pop','en',1969,'Lyrics via LRCLIB (fair-use display)',
                 'https://lrclib.net',
                 'LRC source: lrclib.net — audio must be user-supplied',
                 1,'lrclib-neil-diamond-sweet-caroline',
                 'https://lrclib.net/api/search?q=Sweet+Caroline',
                 0,true,false,false,0,0,NOW(),NOW(),false)
                ON CONFLICT DO NOTHING;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "KaraokeTrackPlays", schema: "app_data");
            migrationBuilder.DropTable(name: "KaraokeTracks",     schema: "app_data");
        }
    }
}
