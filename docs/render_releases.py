"""Формирует историю опубликованных релизов только для сборки Pages."""

import argparse
from datetime import date
import json
import os
from pathlib import Path
import re
from urllib.request import Request, urlopen


VERSION = re.compile(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
DOCS = Path(__file__).resolve().parent


def fetch_releases(repository, token):
    for page in range(1, 101):
        url = f"https://api.github.com/repos/{repository}/releases?per_page=100&page={page}"
        request = Request(url, headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        })
        with urlopen(request, timeout=20) as response:
            batch = json.load(response)
        yield from batch
        if len(batch) < 100:
            return
    raise ValueError("Превышен лимит страниц истории релизов")


def render(releases, repository, expected_tag="", output=DOCS):
    published = {}
    for release in releases:
        tag = release.get("tag_name", "")
        match = VERSION.fullmatch(tag)
        if not match or release.get("draft") or release.get("prerelease") or not release.get("published_at"):
            continue
        published[tag] = (tuple(map(int, match.groups())),
                          date.fromisoformat(release["published_at"][:10]),
                          (release.get("body") or "").strip())
    if expected_tag and expected_tag not in published:
        raise ValueError(f"Официальный релиз {expected_tag} ещё не опубликован")
    tags = sorted(published, key=lambda tag: published[tag][0], reverse=True)
    for folder, title, current, missing, archive in (
        (output, "Что нового", "Последний официальный выпуск", "Описание выпуска недоступно.", "Все выпуски"),
        (output / "en", "What's New", "Latest official release", "Release notes are unavailable.", "All releases"),
    ):
        folder.mkdir(parents=True, exist_ok=True)
        releases_url = f"https://github.com/{repository}/releases"
        lines = [f"# {title}", "", f"{current}: **{tags[0]}**." if tags else missing,
                 "", f"[{archive}]({releases_url})", ""]
        for tag in tags:
            _, published_at, notes = published[tag]
            lines.extend([f"## {tag}", "", f"[GitHub Release]({releases_url}/tag/{tag}) · {published_at}", ""])
            if notes:
                # Текст релиза сохраняется без исполнения HTML и расширений Markdown.
                fence = "`" * max(3, max(map(len, re.findall(r"`+", notes)), default=0) + 1)
                lines.extend([fence, notes, fence, ""])
            else:
                lines.extend([missing, ""])
        (folder / "whats-new.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--output", type=Path, default=DOCS)
    args = parser.parse_args()
    repo = os.environ.get("GITHUB_REPOSITORY", "Egorich88/odyssey-kafka")
    releases = json.loads(args.fixture.read_text(encoding="utf-8")) if args.fixture else fetch_releases(repo, os.environ["GH_TOKEN"])
    render(releases, repo, os.environ.get("RELEASE_TAG", ""), args.output)
