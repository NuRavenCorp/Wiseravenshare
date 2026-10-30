import os
from pathlib import Path

import assemblyai as aai

DEFAULT_AUDIO_DIR = Path("audio")
DEFAULT_OUTPUT_DIR = Path("transcripts")
SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".mp4", ".webm"}

# Add names or unusual words the model should recognize accurately.
KEYTERMS = []  # Example: ["Chappell Roan", "H-O-T-T-O-G-O"]


def main() -> None:
    api_key = os.getenv("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise RuntimeError("Set ASSEMBLYAI_API_KEY in your environment.")

    audio_dir = Path(os.getenv("ASSEMBLYAI_AUDIO_DIR", str(DEFAULT_AUDIO_DIR)))
    output_dir = Path(os.getenv("ASSEMBLYAI_TRANSCRIPTS_DIR", str(DEFAULT_OUTPUT_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)
    audio_dir.mkdir(parents=True, exist_ok=True)

    config = aai.TranscriptionConfig(
        speech_models=["universal-3-5-pro", "universal-2"],
        language_detection=True,
        keyterms_prompt=KEYTERMS or None,
    )
    transcriber = aai.Transcriber(api_key=api_key)

    audio_files = [
        path for path in audio_dir.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    audio_files.sort(key=lambda p: p.name.lower())

    if not audio_files:
        raise RuntimeError(f"No supported audio files found in {audio_dir.resolve()}")

    for audio_file in audio_files:
        print(f"Transcribing {audio_file.name}...")
        transcript = transcriber.transcribe(
            str(audio_file),
            config=config,
            poll_timeout=1800,
        )

        if transcript.status == aai.TranscriptStatus.error:
            print(f"  Failed: {transcript.error}")
            continue

        output_file = output_dir / f"{audio_file.stem}.txt"
        output_file.write_text(transcript.text or "", encoding="utf-8")
        print(f"  Saved {output_file}")

    print("Finished.")


if __name__ == "__main__":
    main()
