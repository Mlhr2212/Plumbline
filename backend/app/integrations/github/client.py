"""Minimal GitHub PR client for reconciliation proposals.

Creates a branch, commits generated review artifacts, and opens a pull
request. The token comes exclusively from the ``PLUMBLINE_GITHUB_TOKEN``
environment variable; nothing is ever logged.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Optional

import httpx

API = "https://api.github.com"


class GitHubIntegrationError(Exception):
    pass


@dataclass
class PullRequestResult:
    url: str
    number: int


class GitHubClient:
    def __init__(self, token: str, repository: str, base_branch: str = "main",
                 client: Optional[httpx.Client] = None):
        if not token or not repository:
            raise GitHubIntegrationError(
                "GitHub integration not configured "
                "(PLUMBLINE_GITHUB_TOKEN / PLUMBLINE_GITHUB_REPOSITORY).")
        self._repo = repository
        self._base = base_branch
        self._http = client or httpx.Client(
            base_url=API,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=15.0,
        )

    def _request(self, method: str, path: str, **kw):
        resp = self._http.request(method, path, **kw)
        if resp.status_code >= 400:
            raise GitHubIntegrationError(
                f"GitHub {method} {path} failed: {resp.status_code}")
        return resp.json()

    def create_pr(self, branch: str, title: str, body: str,
                  files: dict[str, str]) -> PullRequestResult:
        base_ref = self._request("GET", f"/repos/{self._repo}/git/ref/heads/{self._base}")
        base_sha = base_ref["object"]["sha"]

        try:
            self._request("POST", f"/repos/{self._repo}/git/refs",
                          json={"ref": f"refs/heads/{branch}", "sha": base_sha})
        except GitHubIntegrationError:
            pass  # branch may already exist; proceed to update files on it

        for path, content in files.items():
            existing_sha = None
            try:
                cur = self._request(
                    "GET", f"/repos/{self._repo}/contents/{path}?ref={branch}")
                existing_sha = cur.get("sha")
            except GitHubIntegrationError:
                pass
            payload = {
                "message": f"plumbline: reconciliation artifacts {path}",
                "content": base64.b64encode(content.encode()).decode(),
                "branch": branch,
            }
            if existing_sha:
                payload["sha"] = existing_sha
            self._request("PUT", f"/repos/{self._repo}/contents/{path}", json=payload)

        pr = self._request("POST", f"/repos/{self._repo}/pulls", json={
            "title": title, "head": branch, "base": self._base, "body": body,
        })
        return PullRequestResult(url=pr["html_url"], number=pr["number"])
