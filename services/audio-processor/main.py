"""Audio compatibility conversion for browser playback."""

import subprocess

import imageio_ffmpeg
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response

app = FastAPI(title="WiseRavenShare Audio Compatibility")
MAX_UPLOAD_BYTES = 500 * 1024 * 1024


@app.get("/health")
async def health():
    return {"status": "ok", "service": "audio-processor"}


@app.post("/browser-compatible")
async def browser_compatible(file: UploadFile = File(...)):
    source = await file.read(MAX_UPLOAD_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="The audio file is empty.")
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio files must be 500 MB or smaller.")

    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0", "-vn", "-codec:a", "libmp3lame", "-b:a", "192k",
        "-f", "mp3", "pipe:1",
    ]
    try:
        result = subprocess.run(command, input=source, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=240, check=False)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Audio conversion timed out.") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Audio converter is unavailable.") from exc

    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode("utf-8", errors="replace")[-1000:]
        raise HTTPException(status_code=422, detail=detail or "This audio file could not be converted.")
    return Response(content=result.stdout, media_type="audio/mpeg",
                    headers={"Cache-Control": "private, no-store"})
