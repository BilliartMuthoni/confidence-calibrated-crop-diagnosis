"""Safe intake of farmer-supplied images.

Everything here treats the upload as hostile input. The defences, and what each
one is for:

  streaming size cap  -- an attacker must not be able to exhaust memory by
                         sending a file larger than we ever intended to hold.
  magic-byte sniffing -- the multipart Content-Type header is chosen by the
                         client and cannot be trusted.
  pixel-count limit   -- a small compressed file can declare enormous dimensions
                         ("decompression bomb") and blow up memory on decode.
  decode + re-encode  -- destroys anything hidden alongside the image data:
                         polyglot HTML/SVG payloads, appended archives, and all
                         EXIF metadata (which on a phone photo includes the GPS
                         coordinates of the farm).
"""

import io
import os
import uuid

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from PIL.Image import DecompressionBombError

from app.core.config import settings

MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB on the wire
MAX_PIXELS = 40_000_000  # ~40 MP decoded
MAX_DIMENSION = 2048  # longest edge kept after re-encoding
CHUNK_SIZE = 64 * 1024

# Leading bytes for the formats we accept. The client's Content-Type is ignored.
MAGIC_SIGNATURES = (
    b"\xff\xd8\xff",  # JPEG
    b"\x89PNG\r\n\x1a\n",  # PNG
    b"RIFF",  # WebP (RIFF....WEBP)
)

# Refuse to decode absurd images rather than trusting Pillow's default.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def _read_within_limit(upload: UploadFile) -> bytes:
    """Read the upload in chunks, aborting as soon as it exceeds the cap."""
    buffer = bytearray()
    while True:
        chunk = upload.file.read(CHUNK_SIZE)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Image is too large (maximum 8 MB)",
            )
    if not buffer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty",
        )
    return bytes(buffer)


def _looks_like_image(data: bytes) -> bool:
    if data.startswith(b"RIFF"):
        return data[8:12] == b"WEBP"
    return any(data.startswith(sig) for sig in MAGIC_SIGNATURES)


def save_clean_image(upload: UploadFile) -> str:
    """Validate, sanitise and store an uploaded image. Returns the stored path."""
    data = _read_within_limit(upload)

    if not _looks_like_image(data):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That file is not a JPEG, PNG or WebP image",
        )

    try:
        # verify() checks structural integrity but consumes the object,
        # so the image is opened a second time for the actual work.
        Image.open(io.BytesIO(data)).verify()
        image = Image.open(io.BytesIO(data))
        image.load()
    except DecompressionBombError:
        # Small file declaring enormous dimensions -- reject before it costs us memory.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That image's dimensions are too large to process",
        )
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That image could not be read. Try taking the photo again.",
        )

    # Phones store "which way up" in EXIF rather than rotating the pixels. Apply it
    # before the EXIF is dropped below, or portrait photos are kept sideways.
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:  # damaged EXIF: keep the photo as stored rather than refuse it
        pass

    # Re-encode into a fresh RGB JPEG. Nothing from the original container
    # survives this step -- no EXIF, no appended payload, no alternate stream.
    image = image.convert("RGB")
    image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))

    os.makedirs(settings.upload_dir, exist_ok=True)
    # Generated name: the client's filename never influences the path.
    filename = f"{uuid.uuid4().hex}.jpg"
    path = os.path.join(settings.upload_dir, filename)
    image.save(path, format="JPEG", quality=85, optimize=True)

    return path
