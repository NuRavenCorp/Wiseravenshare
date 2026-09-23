from pathlib import Path

from wiseravenshare.server.core.storage import (
    LocalStorage,
    read_block,
    read_file_in_blocks,
    write_block,
    write_file_in_blocks,
)


def test_write_and_read_blocks(tmp_path: Path):
    target = tmp_path / "demo.bin"
    payload = [b"hello ", b"world", "!"]

    written = write_file_in_blocks(target, payload, block_size=5)
    assert written == target

    blocks = read_file_in_blocks(target, block_size=5)
    assert b"".join(blocks) == b"hello world!"

    chunk = read_block(target, offset=6, block_size=5)
    assert chunk == b"world"

    end = write_block(target, b"planet", offset=6)
    assert end == 12
    assert target.read_bytes() == b"hello planet"


def test_persistence_helpers_have_clear_purviews(tmp_path: Path):
    storage = LocalStorage(str(tmp_path / "media"), "https://cdn.example.test")

    assert storage.write_text("notes/hello.txt", "hello world") == str(tmp_path / "media" / "notes" / "hello.txt")
    assert storage.read_text("notes/hello.txt") == "hello world"
    assert storage.exists("notes/hello.txt") is True

    source = tmp_path / "source.txt"
    source.write_text("copied", encoding="utf-8")
    assert storage.copy_from("notes/copied.txt", source) == str(tmp_path / "media" / "notes" / "copied.txt")
    assert storage.read_text("notes/copied.txt") == "copied"

    target = tmp_path / "target.txt"
    assert storage.copy_to("notes/copied.txt", target) == target
    assert target.read_text(encoding="utf-8") == "copied"

    assert storage.delete("notes/copied.txt") is True
    assert storage.exists("notes/copied.txt") is False
