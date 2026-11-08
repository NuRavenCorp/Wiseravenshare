"""
karaoke_transcribe.py — standalone AssemblyAI karaoke lyrics extractor.

Usage:
    export ASSEMBLYAI_API_KEY=your_key
    python tools/karaoke_transcribe.py path/to/song.mp3 --output ./out
    python tools/karaoke_transcribe.py https://example.com/song.mp3

Output:
    <output>/lyrics.txt   — plain text transcript
    <output>/lyrics.lrc   — timestamped LRC file for karaoke display

Requirements:
    pip install assemblyai

The same parameters are used by the server-side C# controller so output
is consistent between the CLI tool and the karaoke web app.
"""

import argparse
import os
from pathlib import Path

import assemblyai as aai


def lrc_timestamp(milliseconds: int) -> str:
    minutes, remainder = divmod(milliseconds, 60_000)
    seconds = remainder / 1_000
    return f"[{minutes:02d}:{seconds:05.2f}]"


def transcribe(audio: str, words_per_line: int = 7) -> tuple[str, str]:
    """
    Transcribe *audio* (local path or public URL) and return
    (plain_text, lrc_text).
    """
    api_key = os.environ.get("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise RuntimeError("Set ASSEMBLYAI_API_KEY in your environment")

    config = aai.TranscriptionConfig(
        speech_models=["universal-3-5-pro", "universal-2"],
        language_detection=True,
        format_text=True,
        prompt="A commercially recorded song with sung lyrics.",
    )

    transcript = aai.Transcriber(api_key=api_key).transcribe(
        audio, config=config, poll_timeout=1800
    )
    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(transcript.error)

    plain = transcript.text or ""

    words = transcript.words or []
    lines = []
    size = max(1, words_per_line)
    for index in range(0, len(words), size):
        group = words[index : index + size]
        text = " ".join(word.text for word in group)
        lines.append(f"{lrc_timestamp(group[0].start)}{text}")

    lrc = "\n".join(lines) + ("\n" if lines else "")
    return plain, lrc


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Transcribe a song and produce LRC karaoke lyrics via AssemblyAI."
    )
    parser.add_argument("audio", help="Local audio path or public URL")
    parser.add_argument(
        "--output",
        default="karaoke_output",
        help="Output directory (default: karaoke_output)",
    )
    parser.add_argument(
        "--words-per-line",
        type=int,
        default=7,
        help="Words grouped per LRC line (default: 7)",
    )
    args = parser.parse_args()

    plain, lrc = transcribe(args.audio, args.words_per_line)

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "lyrics.txt").write_text(plain, encoding="utf-8")
    (output / "lyrics.lrc").write_text(lrc, encoding="utf-8")

    print(f"Wrote {output / 'lyrics.txt'} and {output / 'lyrics.lrc'}")


if __name__ == "__main__":
    main()
