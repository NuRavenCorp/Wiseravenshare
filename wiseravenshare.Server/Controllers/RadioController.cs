using Microsoft.AspNetCore.Mvc;

namespace Wiseravenshare.Server.Controllers
{
    public class RadioChannel
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string StreamUrl { get; set; } = "";
        public bool IsLive { get; set; } = true;
        public string Category { get; set; } = "";
        public string Genre { get; set; } = "";
        public string Codec { get; set; } = "";
        public int Bitrate { get; set; }
    }

    [ApiController]
    [Route("api/radio")]
    public class RadioController : ControllerBase
    {
        private static readonly List<RadioChannel> _channels = new()
        {
            // Talk & News
            new RadioChannel { Id = "bbc-world-service", Name = "BBC World Service", StreamUrl = "https://stream.live.vc.bbcmedia.co.uk/v0_1/bbc_world_service", IsLive = true, Category = "talk-news", Genre = "News, World, Talk", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "bbc-radio-4-fm", Name = "BBC Radio 4 FM", StreamUrl = "https://stream.live.vc.bbcmedia.co.uk/v0_1/bbc_radio_fourfm", IsLive = true, Category = "talk-news", Genre = "Talk, News, Culture", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "bbc-radio-5-live", Name = "BBC Radio 5 Live", StreamUrl = "https://stream.live.vc.bbcmedia.co.uk/v0_1/bbc_radio_five_live", IsLive = true, Category = "talk-news", Genre = "News, Sport, Talk", Codec = "MP3", Bitrate = 128 },

            // Chill & Ambient
            new RadioChannel { Id = "somafm-groove-salad", Name = "SomaFM Groove Salad", StreamUrl = "https://ice1.somafm.com/groovesalad-128-mp3", IsLive = true, Category = "chill", Genre = "Ambient, Chill", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-drone-zone", Name = "SomaFM Drone Zone", StreamUrl = "https://ice1.somafm.com/dronezone-128-mp3", IsLive = true, Category = "chill", Genre = "Drone, Ambient", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-lush", Name = "SomaFM Lush", StreamUrl = "https://ice1.somafm.com/lush-128-mp3", IsLive = true, Category = "chill", Genre = "Vocals, Chill", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-space-station", Name = "SomaFM Space Station", StreamUrl = "https://ice1.somafm.com/spacestation-128-mp3", IsLive = true, Category = "chill", Genre = "Space, Ambient", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-deep-space-one", Name = "SomaFM Deep Space One", StreamUrl = "https://ice1.somafm.com/deepspaceone-128-mp3", IsLive = true, Category = "chill", Genre = "Deep Space, Ambient", Codec = "MP3", Bitrate = 128 },

            // Eclectic & Indie
            new RadioChannel { Id = "radio-paradise", Name = "Radio Paradise", StreamUrl = "https://stream.radioparadise.com/aac-320", IsLive = true, Category = "eclectic", Genre = "Eclectic, Indie", Codec = "AAC", Bitrate = 320 },
            new RadioChannel { Id = "bbc-radio-6-music", Name = "BBC Radio 6 Music", StreamUrl = "https://stream.live.vc.bbcmedia.co.uk/v0_1/bbc_6music", IsLive = true, Category = "eclectic", Genre = "Alternative, Indie", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-indie-pop-rocks", Name = "SomaFM Indie Pop Rocks", StreamUrl = "https://ice1.somafm.com/indiepop-128-mp3", IsLive = true, Category = "eclectic", Genre = "Indie, Pop", Codec = "MP3", Bitrate = 128 },

            // Jazz, Soul & Reggae
            new RadioChannel { Id = "jazz24", Name = "Jazz24", StreamUrl = "https://live.amperwave.net/manifest/jazz24-aac-64.m3u8", IsLive = true, Category = "jazz-soul", Genre = "Jazz", Codec = "AAC", Bitrate = 64 },
            new RadioChannel { Id = "somafm-secret-agent", Name = "SomaFM Secret Agent", StreamUrl = "https://ice1.somafm.com/secretagent-128-mp3", IsLive = true, Category = "jazz-soul", Genre = "Lounge, Jazz", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-heavyweight-reggae", Name = "SomaFM Heavyweight Reggae", StreamUrl = "https://ice1.somafm.com/reggae-128-mp3", IsLive = true, Category = "jazz-soul", Genre = "Reggae, Dub", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-suburbs-of-goa", Name = "SomaFM Suburbs of Goa", StreamUrl = "https://ice1.somafm.com/suburbsofgoa-128-mp3", IsLive = true, Category = "jazz-soul", Genre = "World, Goa", Codec = "MP3", Bitrate = 128 },

            // Electronic & Beats
            new RadioChannel { Id = "somafm-underground-80s", Name = "SomaFM Underground 80s", StreamUrl = "https://ice1.somafm.com/u80s-128-mp3", IsLive = true, Category = "electronic", Genre = "80s, Electronic", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-beat-blender", Name = "SomaFM Beat Blender", StreamUrl = "https://ice1.somafm.com/beatblender-128-mp3", IsLive = true, Category = "electronic", Genre = "Downtempo, Electronic", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-defcon-radio", Name = "SomaFM DEF CON Radio", StreamUrl = "https://ice1.somafm.com/defcon-128-mp3", IsLive = true, Category = "electronic", Genre = "Electronic, Hacker", Codec = "MP3", Bitrate = 128 },
            new RadioChannel { Id = "somafm-sonic-universe", Name = "SomaFM Sonic Universe", StreamUrl = "https://ice1.somafm.com/sonicuniverse-128-mp3", IsLive = true, Category = "electronic", Genre = "Jazz, Electronic", Codec = "MP3", Bitrate = 128 },
        };

        [HttpGet("channels")]
        public IActionResult GetChannels()
        {
            return Ok(_channels);
        }

        [HttpGet("channels/{id}")]
        public IActionResult GetChannel(string id)
        {
            var channel = _channels.FirstOrDefault(c => c.Id == id);
            if (channel == null)
                return NotFound(new { message = $"Channel '{id}' not found." });
            return Ok(channel);
        }
    }
}
