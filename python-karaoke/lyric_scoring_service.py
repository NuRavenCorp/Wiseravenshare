import os
import re
from typing import List, Optional, Literal

from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel, Field


app = FastAPI(title="Lyric Scoring Service", version="1.0.0")

_TOKEN = (os.getenv("LYRIC_SCORER_TOKEN") or "").strip()
_WORD_RE = re.compile(r"[a-z0-9]+(?:'[a-z0-9]+)?")
_CONTRACTIONS = {
    "can't": ["can", "not"],
    "won't": ["will", "not"],
    "don't": ["do", "not"],
    "didn't": ["did", "not"],
    "isn't": ["is", "not"],
    "aren't": ["are", "not"],
    "i'm": ["i", "am"],
    "it's": ["it", "is"],
    "you're": ["you", "are"],
    "we're": ["we", "are"],
    "they're": ["they", "are"],
    "i've": ["i", "have"],
    "you've": ["you", "have"],
    "we've": ["we", "have"],
    "they've": ["they", "have"],
    "i'll": ["i", "will"],
    "you'll": ["you", "will"],
    "we'll": ["we", "will"],
    "they'll": ["they", "will"],
    "shouldn't": ["should", "not"],
    "wouldn't": ["would", "not"],
    "couldn't": ["could", "not"],
}


class TranscriptTurn(BaseModel):
    turn_order: int
    transcript: str = ""
    end_of_turn: bool = True


class ScoreRequest(BaseModel):
    performance_id: str
    reference_lyrics: str
    turns: List[TranscriptTurn] = Field(default_factory=list)
    extra_word_cost: float = Field(default=1.0, ge=0.0, le=5.0)


class AlignmentRow(BaseModel):
    reference: Optional[str] = None
    recognized: Optional[str] = None
    operation: Literal["match", "substitute", "missing", "extra"]


class ScoreResponse(BaseModel):
    performance_id: str
    score: float
    reference_word_count: int
    recognized_word_count: int
    matches: int
    substitutions: int
    missing: int
    extras: int
    alignment: List[AlignmentRow]


def _verify_token(authorization: Optional[str] = Header(default=None)) -> None:
    if not _TOKEN:
        raise HTTPException(status_code=503, detail="LYRIC_SCORER_TOKEN is not configured.")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    token = authorization.split(" ", 1)[1].strip()
    if token != _TOKEN:
        raise HTTPException(status_code=401, detail="Invalid bearer token.")


def _tokenize(text: str) -> List[str]:
    words = []
    for raw in _WORD_RE.findall((text or "").lower()):
        expanded = _CONTRACTIONS.get(raw)
        if expanded:
            words.extend(expanded)
        else:
            words.append(raw)
    return words


def _align(reference: List[str], recognized: List[str], extra_word_cost: float) -> tuple[List[AlignmentRow], int, int, int, int]:
    n = len(reference)
    m = len(recognized)
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    back = [[""] * (m + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        dp[i][0] = i
        back[i][0] = "missing"
    for j in range(1, m + 1):
        dp[0][j] = j * extra_word_cost
        back[0][j] = "extra"

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            is_match = reference[i - 1] == recognized[j - 1]
            match_cost = dp[i - 1][j - 1] + (0.0 if is_match else 1.0)
            missing_cost = dp[i - 1][j] + 1.0
            extra_cost = dp[i][j - 1] + extra_word_cost
            best = min(match_cost, missing_cost, extra_cost)
            dp[i][j] = best
            if best == match_cost:
                back[i][j] = "match" if is_match else "substitute"
            elif best == missing_cost:
                back[i][j] = "missing"
            else:
                back[i][j] = "extra"

    i, j = n, m
    rows: List[AlignmentRow] = []
    matched = substituted = missing = extra = 0
    while i > 0 or j > 0:
        op = back[i][j] if i >= 0 and j >= 0 else ""
        if i > 0 and j > 0 and op in {"match", "substitute"}:
            rows.append(
                AlignmentRow(
                    reference=reference[i - 1],
                    recognized=recognized[j - 1],
                    operation=op,
                )
            )
            if op == "match":
                matched += 1
            else:
                substituted += 1
            i -= 1
            j -= 1
        elif i > 0 and (j == 0 or op == "missing"):
            rows.append(
                AlignmentRow(
                    reference=reference[i - 1],
                    recognized=None,
                    operation="missing",
                )
            )
            missing += 1
            i -= 1
        else:
            rows.append(
                AlignmentRow(
                    reference=None,
                    recognized=recognized[j - 1],
                    operation="extra",
                )
            )
            extra += 1
            j -= 1

    rows.reverse()
    return rows, matched, substituted, missing, extra


@app.get("/health")
def health() -> dict:
    return {"ok": True}


def _score_impl(request: ScoreRequest) -> ScoreResponse:
    ordered_turns = sorted(
        (turn for turn in request.turns if turn.end_of_turn),
        key=lambda turn: turn.turn_order,
    )
    recognized_text = " ".join(turn.transcript for turn in ordered_turns if turn.transcript.strip())
    reference_words = _tokenize(request.reference_lyrics)
    recognized_words = _tokenize(recognized_text)

    alignment, matched, substituted, missing, extra = _align(
        reference_words,
        recognized_words,
        request.extra_word_cost,
    )

    denominator = max(1, len(reference_words))
    penalty = substituted + missing + (extra * request.extra_word_cost)
    score_value = max(0.0, 1.0 - (penalty / denominator)) * 100.0
    score = round(score_value, 2)

    return ScoreResponse(
        performance_id=request.performance_id,
        score=score,
        reference_word_count=len(reference_words),
        recognized_word_count=len(recognized_words),
        matches=matched,
        substitutions=substituted,
        missing=missing,
        extras=extra,
        alignment=alignment,
    )


@app.post("/score", response_model=ScoreResponse)
def score(request: ScoreRequest, _: None = Depends(_verify_token)) -> ScoreResponse:
    return _score_impl(request)


@app.post("/v1/score", response_model=ScoreResponse)
def score_v1(request: ScoreRequest, _: None = Depends(_verify_token)) -> ScoreResponse:
    return _score_impl(request)
