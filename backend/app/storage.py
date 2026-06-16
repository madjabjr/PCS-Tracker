import os
import struct
import zlib
from pathlib import Path
from typing import Generator

from fastapi import UploadFile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

from .config import settings

# v2 file format:
#   [4 bytes]  magic = b'PCSE'
#   [1 byte]   version = 0x02
#   [1 byte]   compressed flag: 0x01 = gzip, 0x00 = none
#   [N chunks] each: 4-byte payload length (BE) | 12-byte nonce | ciphertext+tag
#   [4 bytes]  EOF sentinel = 0x00000000

_MAGIC = b"PCSE"
_VERSION = b"\x02"
_CHUNK_SIZE = 64 * 1024  # 64 KB plaintext per chunk

# File types that are already internally compressed — skip GZIP step
_PRECOMPRESSED_EXTS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif",
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v",
    ".mp3", ".aac", ".flac", ".ogg", ".wav",
    ".zip", ".gz", ".bz2", ".xz", ".7z", ".rar",
    ".docx", ".xlsx", ".pptx",
}
_PRECOMPRESSED_MIME_PREFIXES = ("image/", "video/", "audio/")
_PRECOMPRESSED_MIMES = {
    "application/zip",
    "application/gzip",
    "application/x-7z-compressed",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


class FileTooLargeError(Exception):
    pass


def should_compress(filename: str, content_type: str | None) -> bool:
    """Returns False for formats that are already highly compressed."""
    ext = Path(filename).suffix.lower() if filename else ""
    if ext in _PRECOMPRESSED_EXTS:
        return False
    ct = (content_type or "").lower()
    if ct.startswith(_PRECOMPRESSED_MIME_PREFIXES):
        return False
    if ct in _PRECOMPRESSED_MIMES:
        return False
    return True


def _derive_key() -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"pcs-tracker-doc-v2",
    )
    return hkdf.derive(settings.secret_key.encode())


def _write_chunk(f, aesgcm: AESGCM, plaintext: bytes) -> None:
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    f.write(struct.pack(">I", len(ciphertext)))
    f.write(nonce)
    f.write(ciphertext)


async def compress_encrypt_write(
    file: UploadFile,
    output_path: Path,
    compress: bool,
    max_bytes: int | None = None,
) -> int:
    """
    Streams file through optional GZIP compression then AES-256-GCM encryption,
    writing the v2 format to output_path. Returns original (pre-compression) byte count.
    Raises FileTooLargeError if the upload exceeds max_bytes.
    Cleans up the partial output file on any error.
    """
    key = _derive_key()
    aesgcm = AESGCM(key)
    compressor = (
        zlib.compressobj(zlib.Z_DEFAULT_COMPRESSION, zlib.DEFLATED, 31)
        if compress
        else None
    )
    buf = bytearray()
    original_size = 0

    try:
        with open(output_path, "wb") as f:
            f.write(_MAGIC)
            f.write(_VERSION)
            f.write(b"\x01" if compress else b"\x00")

            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                original_size += len(chunk)
                if max_bytes is not None and original_size > max_bytes:
                    raise FileTooLargeError()
                buf.extend(compressor.compress(chunk) if compress else chunk)

                while len(buf) >= _CHUNK_SIZE:
                    _write_chunk(f, aesgcm, bytes(buf[:_CHUNK_SIZE]))
                    del buf[:_CHUNK_SIZE]

            if compress:
                buf.extend(compressor.flush())
            if buf:
                _write_chunk(f, aesgcm, bytes(buf))

            f.write(struct.pack(">I", 0))  # EOF sentinel
    except Exception:
        output_path.unlink(missing_ok=True)
        raise

    return original_size


def decrypt_decompress_stream(path: Path) -> Generator[bytes, None, None]:
    """
    Synchronous generator that reads a v2 encrypted file, decrypts each
    AES-256-GCM chunk, and optionally decompresses GZIP. Yields plaintext bytes.
    FastAPI's StreamingResponse accepts sync generators and runs them off the
    async event loop automatically.
    """
    key = _derive_key()
    aesgcm = AESGCM(key)

    with open(path, "rb") as f:
        magic = f.read(4)
        if magic != _MAGIC:
            raise ValueError("File is not in v2 encrypted format")
        f.read(1)  # version byte — reserved for future use
        compressed = f.read(1) == b"\x01"

        decompressor = zlib.decompressobj(31) if compressed else None

        while True:
            length_bytes = f.read(4)
            if len(length_bytes) < 4:
                break
            length = struct.unpack(">I", length_bytes)[0]
            if length == 0:
                break

            nonce = f.read(12)
            ciphertext = f.read(length)
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)

            if decompressor:
                yield decompressor.decompress(plaintext)
            else:
                yield plaintext

        if decompressor:
            tail = decompressor.flush()
            if tail:
                yield tail


def is_v2_format(path: Path) -> bool:
    """Returns True if the file was written by this module (v2 format)."""
    try:
        with open(path, "rb") as f:
            return f.read(4) == _MAGIC
    except OSError:
        return False
