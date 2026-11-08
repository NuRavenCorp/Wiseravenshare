"""
karaoke_word_highlight.py — AssemblyAI karaoke extractor with word-level timing,
VTT captions, click-to-seek HTML player, and keyboard accessibility.

Outputs:
  lyrics.txt               plain text transcript
  lyrics.lrc               LRC (line-level timestamps)
  lyrics-word-timed.vtt    WebVTT with per-word timestamps for native caption tracks
  karaoke_lines.json       word-level JSON for the web player
  karaoke.html             standalone player with word-fill + click-to-seek

Usage:
    export ASSEMBLYAI_API_KEY=your_key
    python tools/karaoke_word_highlight.py path/to/song.mp3 --output ./out
    python tools/karaoke_word_highlight.py https://example.com/song.mp3

Requirements:
    pip install assemblyai
"""

import argparse
import html
import json
import os
import shutil
from pathlib import Path
from urllib.parse import urlparse

import assemblyai as aai


def lrc_time(ms: int) -> str:
    minutes, remainder = divmod(ms, 60_000)
    return f"[{minutes:02d}:{remainder / 1000:05.2f}]"


def vtt_time(ms: int) -> str:
    hours, remainder = divmod(max(0, ms), 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"


def group_words(words, limit=7, max_gap_ms=700):
    """Group words into lines by count, silence gap, or sentence punctuation."""
    lines, current = [], []
    for word in words:
        if current and (
            len(current) >= limit
            or word.start - current[-1].end >= max_gap_ms
        ):
            lines.append(current)
            current = []
        current.append(word)
        if word.text.rstrip().endswith((".", "!", "?")):
            lines.append(current)
            current = []
    if current:
        lines.append(current)
    return lines


def export_word_timed_vtt(lines) -> str:
    cues = ["WEBVTT", "Kind: captions", "Language: und", ""]
    for cue_number, line in enumerate(lines, start=1):
        cue_end = max(line[-1].end, line[0].start + 100)
        timed_words = " ".join(
            f"<{vtt_time(word.start)}>{word.text}" for word in line
        )
        cues.extend([
            str(cue_number),
            f"{vtt_time(line[0].start)} --> {vtt_time(cue_end)}",
            timed_words,
            "",
        ])
    return "\n".join(cues)


def main():
    parser = argparse.ArgumentParser(
        description="Generate karaoke LRC + VTT + word-fill HTML from a song via AssemblyAI."
    )
    parser.add_argument("audio", help="Local audio path or public URL")
    parser.add_argument("--output", default="karaoke_output")
    parser.add_argument("--words-per-line", type=int, default=7)
    args = parser.parse_args()

    api_key = os.environ.get("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise RuntimeError("Set ASSEMBLYAI_API_KEY in your environment")

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    is_url = urlparse(args.audio).scheme in {"http", "https"}
    if is_url:
        audio_source = args.audio
        transcription_source = args.audio
    else:
        source = Path(args.audio).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(source)
        destination = output / source.name
        if source != destination.resolve():
            shutil.copy2(source, destination)
        audio_source = destination.name
        transcription_source = source

    config = aai.TranscriptionConfig(
        speech_models=["universal-3-5-pro", "universal-2"],
        language_detection=True,
        prompt="A commercially recorded song with sung lyrics.",
    )
    transcript = aai.Transcriber(api_key=api_key).transcribe(
        transcription_source, config=config, poll_timeout=1800
    )
    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(transcript.error)

    words = transcript.words or []
    if not words:
        raise RuntimeError("The transcript did not contain timed words")

    lines = group_words(words, max(1, args.words_per_line))
    karaoke_lines = [
        {
            "start": line[0].start,
            "end": line[-1].end,
            "words": [
                {"text": word.text, "start": word.start, "end": word.end}
                for word in line
            ],
        }
        for line in lines
    ]

    (output / "lyrics.txt").write_text(transcript.text or "", encoding="utf-8")
    (output / "lyrics.lrc").write_text(
        "\n".join(
            f"{lrc_time(line[0].start)}" + " ".join(w.text for w in line)
            for line in lines
        ) + "\n",
        encoding="utf-8",
    )
    (output / "lyrics-word-timed.vtt").write_text(
        export_word_timed_vtt(lines), encoding="utf-8"
    )
    (output / "karaoke_lines.json").write_text(
        json.dumps(karaoke_lines, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    data = json.dumps(karaoke_lines, ensure_ascii=False).replace("</", "<\\/")
    safe_src = html.escape(audio_source, quote=True)

    page = f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Karaoke</title>
<style>
  body {{
    margin:0; height:100vh; display:grid;
    grid-template-rows:auto 1fr; background:#0c0d12;
    color:#777; font:700 32px/1.45 system-ui;
  }}
  audio {{ width:min(900px,90%); margin:24px auto; }}
  #lyrics {{
    overflow:auto; text-align:center;
    padding:35vh 8vw; scroll-behavior:smooth;
  }}
  .line {{
    margin:22px 0; cursor:pointer;
    transition:transform .2s, color .2s;
  }}
  .line:hover {{ color:#999; }}
  .line.active {{ color:#aaa; transform:scale(1.05); }}
  .word {{
    display:inline-block; position:relative;
    margin-right:.28em; color:#555;
    cursor:pointer; border-radius:.2em;
  }}
  .word:hover, .word:focus-visible {{
    color:#a995ff; outline:2px solid #8c6cff; outline-offset:4px;
  }}
  .fill {{
    position:absolute; inset:0; width:0;
    overflow:hidden; color:#fff; white-space:nowrap;
    pointer-events:none; text-shadow:0 0 12px #8c6cff;
  }}
</style>
<audio id="audio" controls preload="metadata" src="{safe_src}"></audio>
<main id="lyrics" aria-label="Clickable karaoke lyrics"></main>
<script>
const lines = {data};
const audio = document.querySelector("#audio");
const root  = document.querySelector("#lyrics");

function seek(ms) {{
  audio.currentTime = Math.max(0, ms / 1000);
  audio.play().catch(() => {{}});
}}

for (const [li, line] of lines.entries()) {{
  const row = document.createElement("div");
  row.className = "line";
  row.dataset.index = li;
  row.title = "Seek to this line";
  row.addEventListener("click", e => {{
    if (!e.target.closest(".word")) seek(line.start);
  }});

  for (const [wi, word] of line.words.entries()) {{
    const span = document.createElement("span");
    span.className = "word";
    span.textContent = word.text;
    span.tabIndex = 0;
    span.setAttribute("role", "button");
    span.setAttribute("aria-label", `Seek to ${{word.text}}`);
    span.title = `${{(word.start / 1000).toFixed(2)}}s`;
    span.addEventListener("click", e => {{ e.stopPropagation(); seek(word.start); }});
    span.addEventListener("keydown", e => {{
      if (e.key === "Enter" || e.key === " ") {{ e.preventDefault(); seek(word.start); }}
    }});

    const fill = document.createElement("span");
    fill.className = "fill";
    fill.textContent = word.text;
    fill.dataset.word = `${{li}}-${{wi}}`;
    span.appendChild(fill);
    row.appendChild(span);
  }}
  root.appendChild(row);
}}

let activeLine = -1;
function render() {{
  const now = audio.currentTime * 1000;
  let next = -1;
  lines.forEach((line, li) => {{
    if (now >= line.start && now <= line.end + 500) next = li;
    line.words.forEach((word, wi) => {{
      const dur  = Math.max(1, word.end - word.start);
      const prog = Math.max(0, Math.min(1, (now - word.start) / dur));
      document.querySelector(`[data-word="${{li}}-${{wi}}"]`).style.width = `${{prog * 100}}%`;
    }});
  }});
  if (next !== activeLine) {{
    document.querySelectorAll(".line").forEach(el => el.classList.remove("active"));
    if (next >= 0) {{
      const el = document.querySelector(`[data-index="${{next}}"]`);
      el.classList.add("active");
      el.scrollIntoView({{ block:"center", behavior:"smooth" }});
    }}
    activeLine = next;
  }}
  requestAnimationFrame(render);
}}
requestAnimationFrame(render);
</script>
</html>"""

    (output / "karaoke.html").write_text(page, encoding="utf-8")
    print(f"Wrote {output / 'lyrics-word-timed.vtt'}")
    print(f"Open {output / 'karaoke.html'} in a browser")


if __name__ == "__main__":
    main()
