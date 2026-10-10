import json

import httpx

from minerd.uplink import UplinkQueue


def _docs(attestation):
    return {"epoch": attestation["epoch"], "v": 1}, attestation


def test_network_failure_stays_queued(tmp_path, attestation, monkeypatch):
    def offline(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx, "post", offline)
    epoch_doc, att = _docs(attestation)
    queue = UplinkQueue(tmp_path / "queue.sqlite", "http://validator")
    assert queue.enqueue(att, epoch_doc)
    assert queue.flush_once()
    assert queue.queued_count() == 1
    assert queue.online is False


def test_success_is_removed_from_pending_count(tmp_path, attestation, monkeypatch):
    response = {
        "v": 1,
        "miner_id": attestation["miner_id"],
        "epoch": attestation["epoch"],
        "status": "accepted",
        "tx_hash": "0x" + "ab" * 32,
        "amount": attestation["amount"],
    }
    request = httpx.Request("POST", "http://validator/v1/attestations")

    def accepted(*args, **kwargs):
        return httpx.Response(200, request=request, json=response)

    monkeypatch.setattr(httpx, "post", accepted)
    seen = []
    epoch_doc, att = _docs(attestation)
    queue = UplinkQueue(tmp_path / "queue.sqlite", "http://validator", lambda doc, status: seen.append(status))
    queue.enqueue(att, epoch_doc)
    assert queue.flush_once()
    assert queue.queued_count() == 0
    assert queue.online is True
    assert seen[-1]["status"] == "accepted"


def test_epoch_messages_rebuild_persisted_final_status(tmp_path, attestation, monkeypatch):
    response = {
        "v": 1, "miner_id": attestation["miner_id"], "epoch": attestation["epoch"],
        "status": "accepted", "tx_hash": "0x" + "cd" * 32, "amount": attestation["amount"],
    }
    request = httpx.Request("POST", "http://validator/v1/attestations")
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: httpx.Response(200, request=request, json=response)
    )
    epoch_doc, att = _docs(attestation)
    queue = UplinkQueue(tmp_path / "queue.sqlite", "http://validator")
    queue.enqueue(att, epoch_doc)
    queue.flush_once()

    replay = queue.epoch_messages()
    assert replay[0]["attestation"]["status"] == "accepted"
    assert replay[0]["attestation"]["tx_hash"] == response["tx_hash"]
    assert replay[0]["attestation"]["evidence_hash"] == attestation["evidence_hash"]
