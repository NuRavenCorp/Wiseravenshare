import argparse
import html
import os
import shutil
from pathlib import Path

import assemblyai as aai


COLORS = ["#ff5d8f", "#57c7ff"]


def vtt_time(ms: int) -> str:
    hours, remainder = divmod(max(0, ms), 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"


def escape_vtt(text: str) -> str:
    return html.escape(text, quote=False)


def group_channel_words(words, limit=7, gap_ms=700):
    groups, current = [], []
    for word in words:
        if current and (
            len(current) >= limit or word.start - current[-1].end >= gap_ms
        ):
            groups.append(current)
            current = []
        current.append(word)
        if word.text.rstrip().endswith((".", "!", "?")):
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def export_vtt(groups, names):
    cues = []
    for channel, lines in groups.items():
        singer = names.get(channel, f"Channel {channel}")
        for line in lines:
            body = " ".join(
                f"<{vtt_time(word.start)}>{escape_vtt(word.text)}"
                for word in line
            )
            cues.append((line[0].start, line[-1].end, singer, body))

    cues.sort(key=lambda cue: (cue[0], cue[1]))
    output = ["WEBVTT", "Kind: captions", "Language: und", ""]
    for number, (start, end, singer, body) in enumerate(cues, 1):
        output += [
            str(number),
            f"{vtt_time(start)} --> {vtt_time(max(end, start + 100))}",
            f"<v {escape_vtt(singer)}>{body}",
            "",
        ]
    return "\n".join(output)


def player_html(audio_name):
    safe_audio = html.escape(audio_name, quote=True)
    return f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stereo Duet Karaoke</title>
<style>
body{{margin:0;height:100vh;display:grid;grid-template-rows:auto auto 1fr;
background:#0c0d12;color:#666;font:700 30px/1.4 system-ui}}
audio{{width:min(900px,90%);margin:22px auto 8px}}
#status{{text-align:center;font:14px system-ui;color:#aaa}}
#lyrics{{overflow:auto;padding:35vh 6vw;scroll-behavior:smooth}}
.group{{width:min(1100px,100%);margin:24px auto;display:grid;gap:12px}}
.group.duet{{grid-template-columns:repeat(2,minmax(0,1fr));padding:14px;
border:1px solid #ffffff20;border-radius:18px;background:#ffffff08}}
.line{{--color:#aaa;text-align:center;padding:12px;border-left:5px solid var(--color);
border-radius:12px;background:#11131b;opacity:.5;cursor:pointer}}
.line.active{{opacity:1;box-shadow:0 0 22px var(--color)}}
.singer{{display:block;color:var(--color);font-size:.42em;letter-spacing:.12em}}
.word{{display:inline-block;position:relative;margin-right:.28em;cursor:pointer}}
.fill{{position:absolute;inset:0;width:0;overflow:hidden;white-space:nowrap;
color:var(--color);text-shadow:0 0 12px var(--color);pointer-events:none}}
@media(max-width:700px){{.group.duet{{grid-template-columns:1fr}}}}
</style>
<audio id="audio" controls src="{safe_audio}"></audio>
<div id="status">Loading stereo captions…</div>
<main id="lyrics"></main>
<script>
const COLORS={COLORS!r};
const audio=document.querySelector("audio");
const root=document.querySelector("#lyrics");
const status=document.querySelector("#status");

function time(s){{
 const p=s.split(":").map(Number);
 return (p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1])*1000;
}}
function decode(s){{
 const e=document.createElement("textarea");e.innerHTML=s;return e.value;
}}
function parseVtt(source){{
 const blocks=source.replace(/\\r/g,"").split(/\\n{{2,}}/).slice(1), cues=[];
 for(const block of blocks){{
  const rows=block.split("\\n").filter(Boolean);
  const ti=rows.findIndex(r=>r.includes("-->")); if(ti<0)continue;
  const m=rows[ti].match(/([\\d:.]+)\\s+-->\\s+([\\d:.]+)/); if(!m)continue;
  const start=time(m[1]),end=time(m[2]),payload=rows.slice(ti+1).join(" ");
  const voice=payload.match(/^<v\\s+([^>]+)>/i);
  const singer=decode(voice?.[1]||"Unknown");
  const text=voice?payload.slice(voice[0].length):payload;
  const markers=[...text.matchAll(/<(\\d{{2}}:\\d{{2}}:\\d{{2}}\\.\\d{{3}})>/g)];
  const words=markers.map((marker,i)=>{{
   const a=marker.index+marker[0].length,b=markers[i+1]?.index??text.length;
   return {{text:decode(text.slice(a,b).replace(/<[^>]+>/g,"").trim()),
    start:time(marker[1]),end:markers[i+1]?time(markers[i+1][1]):end}};
  }}).filter(w=>w.text);
  cues.push({{id:cues.length,start,end,singer,words}});
 }}
 return cues.sort((a,b)=>a.start-b.start);
}}
function overlapGroups(cues){{
 const groups=[];let group=[],end=-1;
 for(const cue of cues){{
  if(group.length&&cue.start>=end){{groups.push(group);group=[];end=-1}}
  group.push(cue);end=Math.max(end,cue.end);
 }}
 if(group.length)groups.push(group);return groups;
}}
function seek(ms){{audio.currentTime=ms/1000;audio.play().catch(()=>{{}})}}

fetch("lyrics-word-timed.vtt",{{cache:"no-store"}}).then(r=>{{
 if(!r.ok)throw Error(`VTT load failed (${{r.status}})`);return r.text();
}}).then(source=>{{
 const cues=parseVtt(source), singers=[...new Set(cues.map(c=>c.singer))];
 const color=new Map(singers.map((s,i)=>[s,COLORS[i]||
  `hsl(${{(i*137)%360}} 85% 68%)`]));
 const groups=overlapGroups(cues);

 groups.forEach(group=>{{
  const box=document.createElement("section");
  box.className="group"+(group.length>1?" duet":"");
  group.forEach(cue=>{{
   const row=document.createElement("div");row.className="line";
   row.dataset.cue=cue.id;row.style.setProperty("--color",color.get(cue.singer));
   row.onclick=e=>{{if(!e.target.closest(".word"))seek(cue.start)}};
   const label=document.createElement("span");label.className="singer";
   label.textContent=cue.singer;row.append(label);
   cue.words.forEach((word,wi)=>{{
    const span=document.createElement("span");span.className="word";
    span.textContent=word.text;span.onclick=e=>{{e.stopPropagation();seek(word.start)}};
    const fill=document.createElement("span");fill.className="fill";
    fill.textContent=word.text;fill.dataset.word=`${{cue.id}}-${{wi}}`;
    span.append(fill);row.append(span);
   }});
   box.append(row);
  }});
  root.append(box);
 }});
 status.textContent=`Loaded ${{cues.length}} cues from ${{singers.length}} channels`;

 function animate(){{
  const now=audio.currentTime*1000;
  cues.forEach(cue=>{{
   document.querySelector(`[data-cue="${{cue.id}}"]`)
    ?.classList.toggle("active",now>=cue.start&&now<=cue.end);
   cue.words.forEach((word,wi)=>{{
    const p=Math.max(0,Math.min(1,(now-word.start)/Math.max(1,word.end-word.start)));
    const fill=document.querySelector(`[data-word="${{cue.id}}-${{wi}}"]`);
    if(fill)fill.style.width=`${{p*100}}%`;
   }});
  }});
  requestAnimationFrame(animate);
 }}
 animate();
}}).catch(error=>status.textContent=error.message+"; serve this folder over HTTP.");
</script>
</html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path, help="Stereo audio file")
    parser.add_argument("--left", default="Singer Left")
    parser.add_argument("--right", default="Singer Right")
    parser.add_argument("--output", type=Path, default=Path("karaoke_output"))
    parser.add_argument("--words-per-line", type=int, default=7)
    args = parser.parse_args()

    api_key = os.environ.get("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise RuntimeError("Set ASSEMBLYAI_API_KEY")

    source = args.audio.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)

    args.output.mkdir(parents=True, exist_ok=True)
    audio_copy = args.output / source.name
    if source != audio_copy.resolve():
        shutil.copy2(source, audio_copy)

    config = aai.TranscriptionConfig(
        speech_models=["universal-3-5-pro", "universal-2"],
        language_detection=True,
        multichannel=True,
        prompt="A stereo duet recording with one singer isolated per channel.",
    )
    transcript = aai.Transcriber(api_key=api_key).transcribe(
        source, config=config, poll_timeout=1800
    )
    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(transcript.error)
    if transcript.audio_channels != 2:
        raise RuntimeError(
            f"Expected stereo audio; detected {transcript.audio_channels} channel(s)"
        )

    by_channel = {1: [], 2: []}
    for word in transcript.words or []:
        channel = int(word.speaker)
        if channel in by_channel:
            by_channel[channel].append(word)

    groups = {
        channel: group_channel_words(words, args.words_per_line)
        for channel, words in by_channel.items()
    }
    names = {1: args.left, 2: args.right}

    (args.output / "lyrics-word-timed.vtt").write_text(
        export_vtt(groups, names), encoding="utf-8"
    )
    (args.output / "karaoke.html").write_text(
        player_html(audio_copy.name), encoding="utf-8"
    )
    print(f"Wrote stereo duet karaoke to {args.output}")


if __name__ == "__main__":
    main()
