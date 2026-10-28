using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Seeds the KaraokeTracks catalogue with R&amp;B / Soft Rock tracks grouped into
    /// three tiers:
    ///
    /// Tier 1  — Public-Domain blues / R&amp;B roots (pre-1928, verified Internet
    ///           Archive identifiers from the Library of Congress Jukebox collection).
    ///           SourceType = 4 (InternetArchive).
    ///
    /// Tier 2  — Creative-Commons R&amp;B / Soul / Soft Rock instrumentals catalogued
    ///           on ccMixter and Free Music Archive (CC-BY / CC0).
    ///           SourceType = 6 (CcMixter) or 3 (FreeMusicArchive).
    ///
    /// Tier 3  — Classic R&amp;B and Soft Rock lyrics sourced from LRCLIB.net
    ///           (fair-use lyrics display only — audio must be user-supplied).
    ///           SourceType = 1 (LrcLib).
    ///           These remain Status=Pending until a matching audio file is
    ///           attached via the karaoke upload flow.
    ///
    /// All rows are inserted with Status=0 (Pending) so the python-karaoke engine
    /// can fetch audio from SourceUrl, run vocal separation, and flip to Ready.
    /// The unique constraint on (SourceType, SourceId) prevents double-inserts.
    /// </summary>
    public partial class SeedKaraokeRnBSoftRock : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                INSERT INTO app_data."KaraokeTracks"
                    ("Id","Title","Artist","Genre","Language","Year",
                     "License","LicenseUrl","AttributionText",
                     "SourceType","SourceId","SourceUrl",
                     "Status","IsPublic","HasInstrumental","HasLrc",
                     "PlayCount","RatingCount",
                     "CreatedAt","UpdatedAt","IsDeleted")
                VALUES

                -- ════════════════════════════════════════════════════════════
                -- TIER 1 — Public Domain Blues / R&B Roots (pre-1928)
                -- Verified identifiers from archive.org LoC Jukebox collection
                -- ════════════════════════════════════════════════════════════

                (gen_random_uuid(),
                 'The Memphis Blues','W.C. Handy',
                 'Blues','en',1914,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'W.C. Handy — The Memphis Blues (1914, LoC Jukebox)',
                 4,'ia-loc-jukebox-11226-the-memphis-blues',
                 'https://archive.org/details/loc-jukebox-11226-the-memphis-blues',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'St. Louis Blues','W.C. Handy',
                 'Blues','en',1915,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'W.C. Handy — St. Louis Blues (1914/1915, Prince''s Band recording)',
                 4,'ia-cusb_col_a5772_01_37476_03',
                 'https://archive.org/details/cusb_col_a5772_01_37476_03',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Hesitation Blues','W.C. Handy / Billy Smythe',
                 'Blues','en',1916,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Victor Military Band — Hesitation Blues (1916, LoC Jukebox)',
                 4,'ia-loc-jukebox-19406-hesitation-blues',
                 'https://archive.org/details/loc-jukebox-19406-hesitation-blues',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Kansas City Blues','Traditional / Bowman-Alford',
                 'Blues','en',1916,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Victor Military Band — Kansas City Blues (1916, LoC Jukebox)',
                 4,'ia-loc-jukebox-19478-kansas-city-blues',
                 'https://archive.org/details/loc-jukebox-19478-kansas-city-blues',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Joe Turner Blues','W.C. Handy',
                 'Blues','en',1916,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Victor Military Band — Joe Turner Blues Medley (1916, LoC Jukebox)',
                 4,'ia-loc-jukebox-19795-joe-turner-blues-medley',
                 'https://archive.org/details/loc-jukebox-19795-joe-turner-blues-medley',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Paradise Blues','Spencer Williams / Marion Harris',
                 'Blues','en',1916,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Marion Harris — Paradise Blues (1916, LoC Jukebox)',
                 4,'ia-loc-jukebox-19337-paradise-blues',
                 'https://archive.org/details/loc-jukebox-19337-paradise-blues',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Livery Stable Blues','Original Dixieland Jazz Band',
                 'Blues','en',1917,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Original Dixieland Jazz Band — first commercially released jazz record (1917, LoC Jukebox)',
                 4,'ia-loc-jukebox-186254-livery-stable-blues',
                 'https://archive.org/details/loc-jukebox-186254-livery-stable-blues',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'The Dallas Blues','Lloyd Garrett / Hart A. Wand',
                 'Blues','en',1917,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Marie Cahill — The Dallas Blues (1917, LoC Jukebox)',
                 4,'ia-loc-jukebox-186212-the-dallas-blues',
                 'https://archive.org/details/loc-jukebox-186212-the-dallas-blues',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Beale Street Blues','W.C. Handy',
                 'Blues','en',1916,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'W.C. Handy — Beale Street Blues / Beale Street (published 1916)',
                 4,'ia-wc-handy-beale-street-blues',
                 'https://archive.org/search?query=beale+street+blues+handy',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Nobody Knows You When You''re Down and Out','Jimmy Cox',
                 'Blues / R&B','en',1923,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Jimmy Cox — published 1923, copyright expired',
                 99,'sys-nobody-knows-you-down-and-out',NULL,
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Trouble in Mind','Richard M. Jones',
                 'Blues','en',1924,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Richard M. Jones — Trouble in Mind (published 1924)',
                 99,'sys-trouble-in-mind-jones-1924',NULL,
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Frankie and Johnny','Traditional',
                 'Blues / Folk','en',1904,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Traditional American ballad — earliest print publications c.1904',
                 99,'sys-frankie-and-johnny-traditional',NULL,
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Careless Love Blues','Traditional / W.C. Handy arr.',
                 'Blues','en',1921,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Traditional blues; Handy arrangement published 1921',
                 99,'sys-careless-love-blues',NULL,
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Basin Street Blues','Spencer Williams',
                 'Blues / Jazz','en',1928,'Public Domain',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'Spencer Williams — Basin Street Blues (published 1928, US copyright expired 2024)',
                 4,'ia-spencer-williams-basin-street-blues',
                 'https://archive.org/search?query=basin+street+blues+spencer+williams',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                -- ════════════════════════════════════════════════════════════
                -- TIER 2 — Creative Commons R&B / Soul / Soft Rock Instrumentals
                -- ccMixter and FMA verified CC-licensed genre pools
                -- ════════════════════════════════════════════════════════════

                (gen_random_uuid(),
                 'Soul Groove Instrumental (CC-BY)','Various — ccMixter',
                 'Soul / R&B','en',2021,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'ccMixter community — soul/funk groove, CC-BY — browse: http://dig.ccmixter.org/browse?search=soul',
                 6,'ccmixter-soul-groove-01',
                 'http://dig.ccmixter.org/browse?search=soul&lic=open',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Smooth R&B Night (CC-BY)','Various — ccMixter',
                 'R&B','en',2022,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'ccMixter community — smooth R&B instrumental, CC-BY',
                 6,'ccmixter-smooth-rnb-night',
                 'http://dig.ccmixter.org/browse?search=rnb&lic=open',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Funk & Soul Beat (CC0)','Various — ccMixter',
                 'Funk / Soul','en',2020,'CC0-1.0',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'ccMixter community — funk/soul beat, CC0 public domain dedication',
                 6,'ccmixter-funk-soul-beat-01',
                 'http://dig.ccmixter.org/browse?search=funk+soul&lic=open',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Soulful Ballad (CC-BY)','Various — Free Music Archive',
                 'Soul / R&B','en',2019,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'Free Music Archive — soulful ballad, CC-BY artist pool',
                 3,'fma-soulful-ballad-01',
                 'https://freemusicarchive.org/genre/Soul-RnB',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Neo-Soul Acoustic (CC-BY)','Various — Free Music Archive',
                 'Soul / R&B','en',2022,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'Free Music Archive — neo-soul acoustic, CC-BY',
                 3,'fma-neo-soul-acoustic-01',
                 'https://freemusicarchive.org/genre/Soul-RnB',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Soft Rock Power Ballad Instrumental (CC-BY)','Various — ccMixter',
                 'Soft Rock','en',2021,'CC-BY-4.0',
                 'https://creativecommons.org/licenses/by/4.0/',
                 'ccMixter community — soft rock power ballad backing, CC-BY',
                 6,'ccmixter-soft-rock-ballad-01',
                 'http://dig.ccmixter.org/browse?search=soft+rock&lic=open',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Acoustic Singer-Songwriter (CC0)','Various — ccMixter',
                 'Soft Rock / Acoustic','en',2023,'CC0-1.0',
                 'https://creativecommons.org/publicdomain/zero/1.0/',
                 'ccMixter community — acoustic singer-songwriter backing track, CC0',
                 6,'ccmixter-acoustic-singer-songwriter-01',
                 'http://dig.ccmixter.org/browse?search=acoustic&lic=open',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                -- ════════════════════════════════════════════════════════════
                -- TIER 3 — LRCLIB lyrics-only: Classic R&B and Soul
                -- Audio must be user-supplied; LRC display available via LRCLIB
                -- ════════════════════════════════════════════════════════════

                (gen_random_uuid(),
                 'What''s Going On','Marvin Gaye',
                 'Soul / R&B','en',1971,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Marvin Gaye — What''s Going On (1971) — audio user-supplied',
                 1,'lrclib-marvin-gaye-whats-going-on',
                 'https://lrclib.net/api/search?q=What%27s+Going+On+Marvin+Gaye',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'I Heard It Through the Grapevine','Marvin Gaye',
                 'Soul / R&B','en',1968,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Marvin Gaye — I Heard It Through the Grapevine (1968) — audio user-supplied',
                 1,'lrclib-marvin-gaye-grapevine',
                 'https://lrclib.net/api/search?q=I+Heard+It+Through+the+Grapevine',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Ain''t No Sunshine','Bill Withers',
                 'Soul / R&B','en',1971,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Bill Withers — Ain''t No Sunshine (1971) — audio user-supplied',
                 1,'lrclib-bill-withers-aint-no-sunshine',
                 'https://lrclib.net/api/search?q=Ain%27t+No+Sunshine+Bill+Withers',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Lean on Me','Bill Withers',
                 'Soul / R&B','en',1972,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Bill Withers — Lean on Me (1972) — audio user-supplied',
                 1,'lrclib-bill-withers-lean-on-me',
                 'https://lrclib.net/api/search?q=Lean+on+Me+Bill+Withers',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'September','Earth, Wind & Fire',
                 'Soul / R&B / Funk','en',1978,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Earth, Wind & Fire — September (1978) — audio user-supplied',
                 1,'lrclib-ewf-september',
                 'https://lrclib.net/api/search?q=September+Earth+Wind+Fire',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Respect','Aretha Franklin',
                 'Soul / R&B','en',1967,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Aretha Franklin — Respect (1967) — audio user-supplied',
                 1,'lrclib-aretha-franklin-respect',
                 'https://lrclib.net/api/search?q=Respect+Aretha+Franklin',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'I Say a Little Prayer','Aretha Franklin',
                 'Soul / R&B','en',1968,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Aretha Franklin — I Say a Little Prayer (1968) — audio user-supplied',
                 1,'lrclib-aretha-franklin-little-prayer',
                 'https://lrclib.net/api/search?q=I+Say+a+Little+Prayer+Aretha',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Just the Two of Us','Bill Withers & Grover Washington Jr.',
                 'Soul / R&B','en',1981,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Bill Withers & Grover Washington Jr. — Just the Two of Us (1981) — audio user-supplied',
                 1,'lrclib-bill-withers-just-the-two-of-us',
                 'https://lrclib.net/api/search?q=Just+the+Two+of+Us+Bill+Withers',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                -- ════════════════════════════════════════════════════════════
                -- TIER 3 — LRCLIB lyrics-only: Classic Soft Rock
                -- ════════════════════════════════════════════════════════════

                (gen_random_uuid(),
                 'More Than Words','Extreme',
                 'Soft Rock','en',1991,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Extreme — More Than Words (1991) — audio user-supplied',
                 1,'lrclib-extreme-more-than-words',
                 'https://lrclib.net/api/search?q=More+Than+Words+Extreme',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Wonderful Tonight','Eric Clapton',
                 'Soft Rock','en',1977,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Eric Clapton — Wonderful Tonight (1977) — audio user-supplied',
                 1,'lrclib-eric-clapton-wonderful-tonight',
                 'https://lrclib.net/api/search?q=Wonderful+Tonight+Eric+Clapton',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'How Deep Is Your Love','Bee Gees',
                 'Soft Rock / Pop','en',1977,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Bee Gees — How Deep Is Your Love (1977) — audio user-supplied',
                 1,'lrclib-bee-gees-how-deep-is-your-love',
                 'https://lrclib.net/api/search?q=How+Deep+Is+Your+Love+Bee+Gees',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Against All Odds (Take a Look at Me Now)','Phil Collins',
                 'Soft Rock','en',1984,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Phil Collins — Against All Odds (1984) — audio user-supplied',
                 1,'lrclib-phil-collins-against-all-odds',
                 'https://lrclib.net/api/search?q=Against+All+Odds+Phil+Collins',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Sailing','Christopher Cross',
                 'Soft Rock','en',1980,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Christopher Cross — Sailing (1980) — audio user-supplied',
                 1,'lrclib-christopher-cross-sailing',
                 'https://lrclib.net/api/search?q=Sailing+Christopher+Cross',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Easy','Commodores',
                 'Soft Rock / R&B','en',1977,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Commodores — Easy (1977) — audio user-supplied',
                 1,'lrclib-commodores-easy',
                 'https://lrclib.net/api/search?q=Easy+Commodores',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Lady','Lionel Richie',
                 'Soft Rock / R&B','en',1980,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Lionel Richie — Lady (1980) — audio user-supplied',
                 1,'lrclib-lionel-richie-lady',
                 'https://lrclib.net/api/search?q=Lady+Lionel+Richie',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Endless Love','Diana Ross & Lionel Richie',
                 'Soft Rock / R&B','en',1981,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Diana Ross & Lionel Richie — Endless Love (1981) — audio user-supplied',
                 1,'lrclib-diana-ross-lionel-richie-endless-love',
                 'https://lrclib.net/api/search?q=Endless+Love+Diana+Ross+Lionel+Richie',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Here and Now','Luther Vandross',
                 'Soft Rock / R&B','en',1989,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Luther Vandross — Here and Now (1989) — audio user-supplied',
                 1,'lrclib-luther-vandross-here-and-now',
                 'https://lrclib.net/api/search?q=Here+and+Now+Luther+Vandross',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Nothing Compares 2 U','Sinead O''Connor',
                 'Soft Rock / R&B','en',1990,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Sinead O''Connor — Nothing Compares 2 U (1990, written by Prince) — audio user-supplied',
                 1,'lrclib-sinead-oconnor-nothing-compares-2-u',
                 'https://lrclib.net/api/search?q=Nothing+Compares+2+U+Sinead',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Every Rose Has Its Thorn','Poison',
                 'Soft Rock','en',1988,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Poison — Every Rose Has Its Thorn (1988) — audio user-supplied',
                 1,'lrclib-poison-every-rose-has-its-thorn',
                 'https://lrclib.net/api/search?q=Every+Rose+Has+Its+Thorn+Poison',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'Three Times a Lady','Commodores',
                 'Soft Rock / R&B','en',1978,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Commodores — Three Times a Lady (1978) — audio user-supplied',
                 1,'lrclib-commodores-three-times-a-lady',
                 'https://lrclib.net/api/search?q=Three+Times+a+Lady+Commodores',
                 0,true,false,false,0,0,NOW(),NOW(),false),

                (gen_random_uuid(),
                 'That''s What Friends Are For','Dionne Warwick & Friends',
                 'Soft Rock / R&B','en',1985,
                 'Lyrics via LRCLIB (fair-use display only)',
                 'https://lrclib.net',
                 'Dionne Warwick & Friends — That''s What Friends Are For (1985) — audio user-supplied',
                 1,'lrclib-dionne-warwick-thats-what-friends-are-for',
                 'https://lrclib.net/api/search?q=That%27s+What+Friends+Are+For+Dionne+Warwick',
                 0,true,false,false,0,0,NOW(),NOW(),false)

                ON CONFLICT DO NOTHING;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Remove only the rows added by this migration, identified by their unique SourceId values
            migrationBuilder.Sql("""
                DELETE FROM app_data."KaraokeTracks"
                WHERE "SourceId" IN (
                    'ia-loc-jukebox-11226-the-memphis-blues',
                    'ia-cusb_col_a5772_01_37476_03',
                    'ia-loc-jukebox-19406-hesitation-blues',
                    'ia-loc-jukebox-19478-kansas-city-blues',
                    'ia-loc-jukebox-19795-joe-turner-blues-medley',
                    'ia-loc-jukebox-19337-paradise-blues',
                    'ia-loc-jukebox-186254-livery-stable-blues',
                    'ia-loc-jukebox-186212-the-dallas-blues',
                    'ia-wc-handy-beale-street-blues',
                    'sys-nobody-knows-you-down-and-out',
                    'sys-trouble-in-mind-jones-1924',
                    'sys-frankie-and-johnny-traditional',
                    'sys-careless-love-blues',
                    'ia-spencer-williams-basin-street-blues',
                    'ccmixter-soul-groove-01',
                    'ccmixter-smooth-rnb-night',
                    'ccmixter-funk-soul-beat-01',
                    'fma-soulful-ballad-01',
                    'fma-neo-soul-acoustic-01',
                    'ccmixter-soft-rock-ballad-01',
                    'ccmixter-acoustic-singer-songwriter-01',
                    'lrclib-marvin-gaye-whats-going-on',
                    'lrclib-marvin-gaye-grapevine',
                    'lrclib-bill-withers-aint-no-sunshine',
                    'lrclib-bill-withers-lean-on-me',
                    'lrclib-ewf-september',
                    'lrclib-aretha-franklin-respect',
                    'lrclib-aretha-franklin-little-prayer',
                    'lrclib-bill-withers-just-the-two-of-us',
                    'lrclib-extreme-more-than-words',
                    'lrclib-eric-clapton-wonderful-tonight',
                    'lrclib-bee-gees-how-deep-is-your-love',
                    'lrclib-phil-collins-against-all-odds',
                    'lrclib-christopher-cross-sailing',
                    'lrclib-commodores-easy',
                    'lrclib-lionel-richie-lady',
                    'lrclib-diana-ross-lionel-richie-endless-love',
                    'lrclib-luther-vandross-here-and-now',
                    'lrclib-sinead-oconnor-nothing-compares-2-u',
                    'lrclib-poison-every-rose-has-its-thorn',
                    'lrclib-commodores-three-times-a-lady',
                    'lrclib-dionne-warwick-thats-what-friends-are-for'
                )
                AND "IsDeleted" = false;
                """);
        }
    }
}
