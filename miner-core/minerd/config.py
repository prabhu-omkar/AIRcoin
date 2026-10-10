"""Runtime configuration: environment variables, optional miner-core/.env, repo paths."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)

MINER_CORE = Path(__file__).resolve().parent.parent
REPO_ROOT = MINER_CORE.parent
CONTRACTS = REPO_ROOT / "contracts-schema"

EPOCH_MS = 60_000


def _load_dotenv(path: Path) -> None:
    """Minimal .env reader: KEY=VALUE lines, existing environment wins."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass
class Registration:
    """This miner's entry in the sticker/miner registry (read-only for B)."""

    miner_id: str
    sticker_ids: list[int]
    lat: float
    lon: float
    geofence_m: float
    device_address: str | None = None


@dataclass
class Config:
    miner_id: str = "miner-001"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    validator_url: str = "http://127.0.0.1:3001"
    chain_rpc_url: str = "http://127.0.0.1:8545"
    controller_port: int = 8090
    scenario: str = "clean_morning"
    gps_source: str = "gpsd"
    vision_source: str = "mqtt"
    private_key: str | None = None
    catalogue_path: Path = CONTRACTS / "data" / "species-catalogue.json"
    overlay_path: Path = MINER_CORE / "config" / "coefficients-v0.json"
    registry_path: Path = CONTRACTS / "examples" / "valid" / "registry.json"
    seed_data_path: Path = REPO_ROOT / "chain-market" / "contracts" / "seed-data.json"
    var_dir: Path = MINER_CORE / "var"
    extra: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> "Config":
        _load_dotenv(MINER_CORE / ".env")
        c = cls(
            miner_id=_env("MINER_ID", cls.miner_id),
            mqtt_host=_env("MQTT_HOST", cls.mqtt_host),
            mqtt_port=int(_env("MQTT_PORT", str(cls.mqtt_port))),
            validator_url=_env("VALIDATOR_URL", cls.validator_url).rstrip("/"),
            chain_rpc_url=_env("CHAIN_RPC_URL", cls.chain_rpc_url).rstrip("/"),
            controller_port=int(_env("CONTROLLER_PORT", str(cls.controller_port))),
            scenario=_env("SCENARIO", cls.scenario),
            gps_source=_env("GPS_SOURCE", cls.gps_source),
            vision_source=_env("VISION_SOURCE", cls.vision_source),
            private_key=os.environ.get("MINER_PRIVATE_KEY") or None,
        )
        for name, attr in [("CATALOGUE_PATH", "catalogue_path"), ("COEFFICIENT_OVERLAY", "overlay_path"),
                           ("REGISTRY_PATH", "registry_path"), ("SEED_DATA_PATH", "seed_data_path"),
                           ("MINER_VAR_DIR", "var_dir")]:
            if os.environ.get(name):
                setattr(c, attr, Path(os.environ[name]))
        return c

    @property
    def db_path(self) -> Path:
        return self.var_dir / "minerd.sqlite"

    def registration(self) -> Registration:
        """Sticker set and registered location for this miner, from the shared registry."""
        miners = json.loads(self.registry_path.read_text(encoding="utf-8"))["miners"]
        for m in miners:
            if m["miner_id"] == self.miner_id:
                loc = m["location"]
                return Registration(
                    miner_id=m["miner_id"],
                    sticker_ids=sorted(m["sticker_ids"]),
                    lat=loc["lat"],
                    lon=loc["lon"],
                    geofence_m=loc.get("geofence_m", 50),
                    device_address=self._seed_miner().get("deviceAddress") or m.get("device_address"),
                )
        raise SystemExit(f"miner {self.miner_id} is not in {self.registry_path}")

    def _seed_miner(self) -> dict:
        if not self.seed_data_path.exists():
            return {}
        seed = json.loads(self.seed_data_path.read_text(encoding="utf-8"))
        return seed.get("miners", {}).get(self.miner_id, {})

    def device_key(self) -> str:
        """Device private key: env, then var/device-key.hex, then the local-chain demo key."""
        if self.private_key:
            return self.private_key
        key_file = self.var_dir / "device-key.hex"
        if key_file.exists():
            return key_file.read_text(encoding="utf-8").strip()
        demo = self._seed_miner().get("devicePrivateKey")
        if demo:
            log.warning("using the demo device key for %s from %s", self.miner_id, self.seed_data_path)
            return demo
        raise SystemExit("no device key: set MINER_PRIVATE_KEY or run `python -m minerd keygen`")
