import hashlib
import json
from pathlib import Path

from gltest.direct.sdk_loader import setup_sdk_paths


IMAGE_BYTES = b"direct-mode-landmark-image-placeholder-with-enough-bytes" * 4
IMAGE_HASH = hashlib.sha256(IMAGE_BYTES).hexdigest()
USER_HASH = hashlib.sha256(b"explorer-one").hexdigest()
SECOND_USER_HASH = hashlib.sha256(b"explorer-two").hexdigest()
EVIDENCE_URL = "https://images.example.test/colosseum.jpg"


def as_address(value):
    from genlayer.py.types import Address

    return Address(value) if isinstance(value, bytes) else value


def deploy_contract(direct_vm, direct_deploy, owner):
    setup_sdk_paths(Path("contracts/LandmarkHunt.py"), "v0.2.16")
    direct_vm.sender = as_address(owner)
    return direct_deploy("contracts/LandmarkHunt.py", as_address(owner))


def create_colosseum(contract):
    return contract.create_hunt(
        "hunt-colosseum-001",
        "The Colosseum",
        "Rome, Italy",
        "Show the real exterior with its recognizable rows of arches.",
        250,
    )


def mock_evidence(direct_vm):
    direct_vm.mock_web(r".*images\.example\.test/.*", {"status": 200, "body": IMAGE_BYTES})


def mock_verdict(direct_vm, **overrides):
    verdict = {
        "target_match": True,
        "clearly_visible": True,
        "real_photo": True,
        "safe": True,
    }
    verdict.update(overrides)
    direct_vm.mock_llm(r".*judging one Find the Landmark photo-hunt submission.*", json.dumps(verdict))


def submit(contract, submission_id="submission-one", user_hash=USER_HASH):
    return contract.verify_photo(
        submission_id,
        user_hash,
        "hunt-colosseum-001",
        EVIDENCE_URL,
        IMAGE_HASH,
    )


def test_owner_creates_hunt(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    created = create_colosseum(contract)

    assert created["landmark_name"] == "The Colosseum"
    assert created["reward_xp"] == 250
    assert contract.get_hunt("hunt-colosseum-001")["has_winner"] is False


def test_non_owner_cannot_create_hunt(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob

    with direct_vm.expect_revert("Only the configured game relayer can create hunts"):
        create_colosseum(contract)


def test_clear_matching_photo_wins_and_is_stored(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm)

    result = submit(contract)

    assert result["accepted"] is True
    assert result["winner"] is True
    assert result["reward_xp"] == 250
    assert contract.get_result("submission-one")["accepted"] is True
    winner = contract.get_winner("hunt-colosseum-001")
    assert winner["user_id_hash"] == USER_HASH
    assert winner["reward_xp"] == 250


def test_wrong_landmark_is_rejected_without_winner(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, target_match=False)

    result = submit(contract)

    assert result["accepted"] is False
    assert result["winner"] is False
    assert result["reward_xp"] == 0
    assert contract.get_hunt("hunt-colosseum-001")["has_winner"] is False


def test_second_submission_cannot_replace_first_winner(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm)
    submit(contract)

    with direct_vm.expect_revert("That hunt already has a winner"):
        submit(contract, "submission-two", SECOND_USER_HASH)

    assert contract.get_winner("hunt-colosseum-001")["user_id_hash"] == USER_HASH


def test_evidence_hash_must_match(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)
    mock_evidence(direct_vm)

    with direct_vm.expect_revert("Evidence hash does not match"):
        contract.verify_photo(
            "bad-hash-submission",
            USER_HASH,
            "hunt-colosseum-001",
            EVIDENCE_URL,
            "0" * 64,
        )


def test_local_network_url_is_rejected(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)

    with direct_vm.expect_revert("must not target a local network"):
        contract.verify_photo(
            "local-url-submission",
            USER_HASH,
            "hunt-colosseum-001",
            "https://127.0.0.1/private.jpg",
            IMAGE_HASH,
        )
