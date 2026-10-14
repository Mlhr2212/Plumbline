"""IaC execution-layer abstraction.

PlumbLine treats Terraform (or OpenTofu) strictly as an external executable —
the low-level provider refresh and plan generation belong to the IaC engine.
Everything PlumbLine builds sits AFTER ``terraform show -json``.

The engine is selected with ``PLUMBLINE_IAC_ENGINE`` ("terraform" default,
"tofu" for OpenTofu). Commands are executed as argument lists — never shell
strings — so no user input is ever interpolated into a command line.

Note: OpenTofu support is interface-compatible but UNTESTED until validated
against a real ``tofu`` binary; it is not claimed as a supported feature.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol, Sequence, runtime_checkable


class IaCError(Exception):
    pass


@dataclass
class PlanResult:
    """Outcome of ``<engine> plan -detailed-exitcode``.

    exit_code: 0 = clean plan, 1 = engine error, 2 = plan has changes.
    Exit code 2 is a successful plan WITH changes — never a failure.
    """
    exit_code: int
    plan_file: Path
    stdout: str = ""
    stderr: str = ""

    @property
    def ok(self) -> bool:
        return self.exit_code in (0, 2)

    @property
    def has_changes(self) -> bool:
        return self.exit_code == 2


@runtime_checkable
class IaCRunner(Protocol):
    """Engine-agnostic IaC interface consumed by PlumbLine."""

    def get_version(self) -> str: ...
    def validate(self, workdir: Path) -> bool: ...
    def run_plan(self, workdir: Path, out: str = "tfplan",
                 extra_args: Sequence[str] = ()) -> PlanResult: ...
    def get_plan_json(self, workdir: Path, plan_file: str = "tfplan") -> dict: ...


class CliRunner:
    """Shared CLI implementation for terraform/tofu-compatible engines."""

    def __init__(self, binary: str):
        self.binary = binary

    def _check(self) -> None:
        if shutil.which(self.binary) is None:
            raise IaCError(f"IaC engine {self.binary!r} not found on PATH")

    def _run(self, args: Sequence[str], workdir: Path) -> subprocess.CompletedProcess:
        self._check()
        return subprocess.run(
            [self.binary, *args], cwd=workdir,
            capture_output=True, text=True, timeout=1800, check=False,
        )

    def get_version(self) -> str:
        self._check()
        proc = self._run(["version", "-json"], Path("."))
        try:
            return json.loads(proc.stdout)[
                "terraform_version" if self.binary == "terraform" else "tofu_version"]
        except (ValueError, KeyError):
            proc = self._run(["version"], Path("."))
            return proc.stdout.splitlines()[0] if proc.stdout else "unknown"

    def validate(self, workdir: Path) -> bool:
        return self._run(["validate", "-no-color"], workdir).returncode == 0

    def run_plan(self, workdir: Path, out: str = "tfplan",
                 extra_args: Sequence[str] = ()) -> PlanResult:
        proc = self._run(
            ["plan", "-detailed-exitcode", "-out", out, "-no-color", *extra_args],
            workdir)
        return PlanResult(exit_code=proc.returncode, plan_file=workdir / out,
                          stdout=proc.stdout, stderr=proc.stderr)

    def get_plan_json(self, workdir: Path, plan_file: str = "tfplan") -> dict:
        proc = self._run(["show", "-json", plan_file], workdir)
        if proc.returncode != 0:
            raise IaCError(f"{self.binary} show -json failed: {proc.stderr.strip()}")
        return json.loads(proc.stdout)


class TerraformRunner(CliRunner):
    def __init__(self, binary: str = "terraform"):
        super().__init__(binary)


class TofuRunner(CliRunner):
    def __init__(self, binary: str = "tofu"):
        super().__init__(binary)


_ENGINES = {"terraform": TerraformRunner, "tofu": TofuRunner}


def get_runner(engine: str = "terraform") -> IaCRunner:
    cls = _ENGINES.get(engine.lower())
    if cls is None:
        raise IaCError(f"unknown IaC engine {engine!r}; expected one of "
                       f"{sorted(_ENGINES)}")
    return cls()
