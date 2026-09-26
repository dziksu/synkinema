"""Bounded public-only downloads. FFmpeg never receives a remote URL or playlist."""

import asyncio
import hashlib
import html
import ipaddress
import json
import math
import re
import socket
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

from ..storage import now
from .contracts import MediaSource, SteamGame, SteamMovie

MAX_BYTES = 512 * 1024**2
MEDIA_FORMATS = "mov,matroska,wav,mp3,aac,ogg,flac,png_pipe,jpeg_pipe,webp_pipe,mpegts"


def public_url(url):
    p = urlsplit(url)
    if p.scheme not in ("https", "http") or not p.hostname or p.username or p.password or p.fragment:
        raise ValueError("Only public HTTP(S) URLs without credentials/fragments are supported")
    if p.port not in (None, 80, 443):
        raise ValueError("Only standard HTTP(S) ports are supported")
    return p


async def resolve_public(url):
    p = public_url(url)
    rows = await asyncio.get_running_loop().getaddrinfo(
        p.hostname, p.port or (443 if p.scheme == "https" else 80), type=socket.SOCK_STREAM
    )
    addresses = list(dict.fromkeys(row[4][0] for row in rows))
    if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):
        raise ValueError("Private, loopback, link-local and reserved network destinations are blocked")
    return addresses[0]


async def download(url, path=None, limit=MAX_BYTES, tick=None, resolved=None):
    """Resolve, validate and PIN the connection IP on every redirect; preserve TLS SNI."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=15), trust_env=False) as client:
        for _ in range(6):
            host = public_url(url).hostname
            ip = await resolve_public(url)
            target = httpx.URL(url).copy_with(host=ip)
            request = client.build_request(
                "GET",
                target,
                headers={"Host": urlsplit(url).netloc, "User-Agent": "Synkinema/1 media-production"},
                extensions={"sni_hostname": host},
            )
            response = await client.send(request, stream=True)
            try:
                if response.status_code in (301, 302, 303, 307, 308):
                    url = urljoin(url, response.headers["location"])
                    continue
                response.raise_for_status()
                if int(response.headers.get("content-length", "0")) > limit:
                    raise ValueError("Remote file exceeds the download byte limit")
                size = 0
                chunks = []
                sink = path.open("wb") if path else None
                try:
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > limit:
                            raise ValueError("Remote file exceeds the download byte limit")
                        if sink:
                            sink.write(chunk)
                        else:
                            chunks.append(chunk)
                        if tick:
                            await tick()
                finally:
                    if sink:
                        sink.close()
                if resolved is not None:
                    resolved.append(url)
                return b"".join(chunks) if not path else size
            finally:
                await response.aclose()
    raise ValueError("Too many remote redirects")


def variants(body, base):
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    choices = []
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF:"):
            match = re.search(r"RESOLUTION=(\d+)x(\d+)", line)
            if match and i + 1 < len(lines) and not lines[i + 1].startswith("#"):
                choices.append((int(match[1]), int(match[2]), urljoin(base, lines[i + 1])))
    return choices


def segments(body, base):
    if "#EXT-X-ENDLIST" not in body:
        raise ValueError("Only finite HLS VOD playlists are supported; live streams are not imported")
    if "#EXT-X-BYTERANGE" in body or "#EXT-X-I-FRAMES-ONLY" in body:
        raise ValueError("HLS byte ranges / iframe-only playlists are unsupported")
    entries, init, time, duration = [], None, 0.0, None
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("#EXT-X-KEY:") and "METHOD=NONE" not in line:
            raise ValueError("Encrypted/DRM media is unsupported")
        if line.startswith("#EXT-X-MAP:"):
            if "BYTERANGE=" in line:
                raise ValueError("HLS byte ranges are unsupported")
            match = re.search(r'URI="([^"]+)"', line)
            if not match:
                raise ValueError("Invalid HLS initialization map")
            new = urljoin(base, match[1])
            if init and init != new:
                raise ValueError("Changing HLS initialization maps are unsupported")
            init = new
        elif line.startswith("#EXTINF:"):
            duration = float(line.split(":", 1)[1].split(",")[0])
            if not math.isfinite(duration) or duration <= 0:
                raise ValueError("Invalid HLS segment duration")
        elif line and not line.startswith("#"):
            if duration is None:
                raise ValueError("Missing HLS segment duration")
            entries.append((round(time * 1000), round((time + duration) * 1000), urljoin(base, line)))
            time += duration
            duration = None
    if not entries or len(entries) > 4000:
        raise ValueError("HLS must contain 1–4000 media segments")
    return init, entries


async def import_source(source: MediaSource, work: Path, run, tick):
    suffix = Path(urlsplit(source.url).path).suffix.lower()
    hls = suffix == ".m3u8"
    output = work / "import.mp4"
    if hls:
        url = source.url
        resolved = []
        body = (await download(url, limit=2 * 1024**2, resolved=resolved)).decode()
        url = resolved[-1]
        choices = variants(body, url)
        if choices:
            candidates = [c for c in choices if c[1] <= source.max_height]
            if not candidates:
                raise ValueError("No HLS rendition within max_height; choose a higher limit")
            _, _, url = max(candidates, key=lambda x: x[0] * x[1])
            body = (await download(url, limit=2 * 1024**2, resolved=resolved)).decode()
            url = resolved[-1]
        init, entries = segments(body, url)
        length = entries[-1][1]
        end = source.to_ms or min(length, source.from_ms + 120_000)
        if source.from_ms >= length or end > length:
            # Report the measured length so a caller can correct the interval in one step.
            raise ValueError(
                f"Requested interval {source.from_ms}–{end} ms exceeds the HLS source duration of {length} ms; "
                f"choose to_ms ≤ {length}, or omit to_ms to import to the end (at most 120 s)"
            )
        selected = [e for e in entries if e[0] < end and e[1] > source.from_ms]
        raw = work / "source.bin"
        total = 0
        with raw.open("wb") as out:
            urls = ([init] if init else []) + [e[2] for e in selected]
            for i, segment_url in enumerate(urls):
                await tick(f"Downloading segment {i + 1}/{len(urls)}", i / len(urls))
                # Every nested URL, including maps and redirects, goes through the same public-only transport.
                data = await download(
                    segment_url, limit=min(64 * 1024**2, MAX_BYTES - total), tick=lambda: tick()
                )
                total += len(data)
                out.write(data)
        offset = source.from_ms - selected[0][0]
        await run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                MEDIA_FORMATS,
                "-threads",
                "2",
                "-ss",
                str(offset / 1000),
                "-i",
                str(raw),
                "-t",
                str((end - source.from_ms) / 1000),
                "-map",
                "0:v:0",
                *(["-map", "0:a:0?", "-c:a", "aac"] if source.include_audio else ["-an"]),
                "-c:v",
                "libx264",
                "-vf",
                f"scale=-2:'min(ih,{source.max_height})'",
                "-threads",
                "2",
                "-preset",
                "veryfast",
                "-crf",
                "16",
                "-movflags",
                "+faststart",
                "-y",
                str(output),
            ]
        )
    else:
        ext = Path(source.filename).suffix.lower()
        if ext not in {
            ".mp4",
            ".mov",
            ".mkv",
            ".webm",
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".wav",
            ".mp3",
            ".m4a",
            ".ogg",
            ".flac",
        }:
            raise ValueError("filename must have a supported media extension")
        raw = work / ("download" + ext)
        await download(source.url, raw, tick=lambda: tick())
        # Reject local/remote playlists before any decoder can follow their references.
        metadata = json.loads(
            await run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-format_whitelist",
                    MEDIA_FORMATS,
                    "-show_format",
                    "-show_streams",
                    "-of",
                    "json",
                    str(raw),
                ]
            )
        )
        video = next((s for s in metadata["streams"] if s["codec_type"] == "video"), None)
        audio = any(s["codec_type"] == "audio" for s in metadata["streams"])
        image = ext in {".png", ".jpg", ".jpeg", ".webp"}
        duration = round(float(metadata.get("format", {}).get("duration", 0)) * 1000)
        if (source.from_ms or source.to_ms) and (
            image or not duration or source.from_ms >= duration or (source.to_ms and source.to_ms > duration)
        ):
            raise ValueError("Requested interval exceeds source duration or targets a still image")
        if (
            source.from_ms
            or source.to_ms
            or (
                video
                and not image
                and ((audio and not source.include_audio) or video["height"] > source.max_height)
            )
        ):
            if not video:
                output = work / "import.wav"
            await run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-format_whitelist",
                    MEDIA_FORMATS,
                    "-ss",
                    str(source.from_ms / 1000),
                    "-i",
                    str(raw),
                    *(
                        ["-t", str((source.to_ms - source.from_ms) / 1000)]
                        if source.to_ms
                        else ["-t", "600"]
                        if source.from_ms
                        else []
                    ),
                    *(
                        [
                            "-map",
                            "0:v:0",
                            "-c:v",
                            "libx264",
                            "-vf",
                            f"scale=-2:'min(ih,{source.max_height})'",
                            "-preset",
                            "veryfast",
                            "-crf",
                            "16",
                            "-movflags",
                            "+faststart",
                            *(["-map", "0:a:0?", "-c:a", "aac"] if source.include_audio else ["-an"]),
                        ]
                        if video
                        else ["-map", "0:a:0", "-c:a", "pcm_s16le"]
                    ),
                    "-threads",
                    "2",
                    "-y",
                    str(output),
                ]
            )
        else:
            output = raw
    return output


class SearchParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.title = [], None, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and "search_result_row" in a.get("class", "").split():
            match = re.search(r"/app/(\d+)", a.get("href", ""))
            self.row = {"app_id": int(match[1]), "url": a["href"], "name": ""} if match else None
        if self.row is not None and tag == "span" and "title" in a.get("class", "").split():
            self.title = True

    def handle_data(self, data):
        if self.row is not None and self.title:
            self.row["name"] += data

    def handle_endtag(self, tag):
        if tag == "span":
            self.title = False
        if tag == "a" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


async def search_steam(request):
    params = {
        "term": request.query,
        "sort_by": "Released_DESC" if request.sort == "release_date" else "",
        "category1": 998,
        "infinite": 1,
        "count": request.count,
        "start": request.start,
        "ignore_preferences": 1,
        "l": "english",
    }
    if request.sort in ("most_wishlisted", "popular"):
        params["filter"] = "popularwishlist" if request.sort == "most_wishlisted" else "topsellers"
    if request.coming_soon and "filter" not in params:
        params["filter"] = "comingsoon"
    if request.tag_ids:
        params["tags"] = ",".join(map(str, request.tag_ids))
    query = httpx.QueryParams(params)
    source = f"https://store.steampowered.com/search/?{query}"
    raw = await download(f"https://store.steampowered.com/search/results/?{query}", limit=3 * 1024**2)
    data = json.loads(raw)
    if not data.get("success") or "results_html" not in data:
        raise ValueError("Steam search returned an unsupported response; no candidate list was inferred")
    p = SearchParser()
    p.feed(data.get("results_html", ""))
    return {
        "fetched_at": now(),
        "source": source,
        "candidates": p.rows[: request.count],
        "total_count": data.get("total_count"),
        "next_start": request.start + request.count,
        "sort": request.sort,
        "coming_soon": request.coming_soon or request.sort == "most_wishlisted",
        "note": "Steam storefront order within these filters, not worldwide anticipation or numeric wishlist/follower counts. popular uses Steam Top Sellers, a sales signal. Verify release state and descriptions with get_steam_games; games absent from Steam require other official sources.",
    }


def movie_url(value):
    """Steam has returned both direct strings and quality-keyed media objects."""
    if isinstance(value, dict):
        return next(
            (movie_url(value.get(k)) for k in ("max", "1080", "720", "480") if movie_url(value.get(k))), None
        )
    if isinstance(value, str) and value.startswith(("https://", "http://")):
        return value
    return None


def trailer_sources(game, selection):
    movie = next((m for m in game.movies if m.id == selection.movie_id), None)
    if movie is None:
        raise ValueError(
            f"Steam app {game.app_id}: movie {selection.movie_id} is absent from fresh metadata ({game.fetched_at}); available movie IDs: {[m.id for m in game.movies]}. Refresh get_steam_games and select an available trailer."
        )
    urls = list(dict.fromkeys(u for u in (movie.mp4_url, movie.webm_url, movie.hls_url) if u))
    if not urls:
        raise ValueError(
            f"Steam app {game.app_id}, movie {movie.id}: fresh metadata ({game.fetched_at}) contains no MP4, WebM or HLS URL. Metadata may have changed since discovery; refresh get_steam_games or select another trailer."
        )
    return [
        MediaSource(
            url=url,
            filename=f"{game.name} - {movie.name}.mp4",
            source=f"{game.url} | movie {movie.id}: {movie.name}",
            license="Official promotional footage; copyright remains with "
            + ", ".join(game.developers + game.publishers)
            + ". No open license or endorsement is implied.",
            tags=["steam", "official-trailer", str(game.app_id)],
            from_ms=selection.from_ms,
            to_ms=selection.to_ms,
            max_height=selection.max_height,
        )
        for url in urls
    ]


def appdetails_record(body, app_id):
    """Select the requested app from an appdetails response.

    Steam can key the record by an internal ID instead of the requested one
    (observed: appids=2085540 answered under "4129390", whose data still says
    steam_appid 2085540). Accept a single re-keyed record only when its own
    steam_appid confirms the requested game; never substitute another game.
    """
    if str(app_id) in body:
        return body[str(app_id)]
    if len(body) == 1:
        ((key, record),) = body.items()
        record = record if isinstance(record, dict) else {}
        data = record.get("data") or {}
        if record.get("success") and data.get("steam_appid") == app_id:
            return record
        if record.get("success"):
            raise ValueError(
                f"Steam answered app {app_id} with a record for app {data.get('steam_appid')} (key {key}); refusing to substitute a different game"
            )
    return {}


async def steam_game(app_id):
    url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=english"
    raw = await download(url, limit=5 * 1024**2)
    payload = appdetails_record(json.loads(raw), app_id)
    if not payload.get("success"):
        raise ValueError(f"Steam has no available metadata for app {app_id}")
    data = payload["data"]
    movies = [
        SteamMovie(
            id=x["id"],
            name=x["name"],
            thumbnail=x.get("thumbnail"),
            hls_url=movie_url(x.get("hls_h264")) or movie_url(x.get("hls")),
            mp4_url=movie_url(x.get("mp4")),
            webm_url=movie_url(x.get("webm")),
        )
        for x in data.get("movies", [])
    ]
    return SteamGame(
        app_id=app_id,
        name=data["name"],
        url=f"https://store.steampowered.com/app/{app_id}/",
        fetched_at=now(),
        metadata_sha256=hashlib.sha256(raw).hexdigest(),
        release_date=data.get("release_date", {}).get("date", ""),
        coming_soon=data.get("release_date", {}).get("coming_soon", True),
        description=html.unescape(re.sub("<[^>]+>", " ", data.get("about_the_game", ""))),
        developers=data.get("developers", []),
        publishers=data.get("publishers", []),
        categories=[x["description"] for x in data.get("categories", [])],
        genres=[x["description"] for x in data.get("genres", [])],
        movies=movies,
    ), raw
