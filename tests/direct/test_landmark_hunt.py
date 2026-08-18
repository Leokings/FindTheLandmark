import hashlib
import json
from pathlib import Path

from gltest.direct.sdk_loader import setup_sdk_paths


IMAGE_BYTES = b"direct-mode-landmark-image-placeholder-with-enough-bytes" * 4
IMAGE_HASH = hashlib.sha256(IMAGE_BYTES).hexdigest()
USER_HASH = hashlib.sha256(b"explorer-one").hexdigest()
SECOND_USER_HASH = hashlib.sha256(b"explorer-two").hexdigest()
EVIDENCE_URL = "https://images.example.test/colosseum.jpg"
RUN_ID = "route-2026-08-18"
SECOND_RUN_ID = "route-2026-08-19"


def as_address(value):
    from genlayer.py.types import Address

    return Address(value) if isinstance(value, bytes) else value


def deploy_contract(direct_vm, direct_deploy, admin, relayer=None):
    setup_sdk_paths(Path("contracts/LandmarkHunt.py"), "v0.2.16")
    relayer = relayer or admin
    direct_vm.sender = as_address(admin)
    return direct_deploy(
        "contracts/LandmarkHunt.py",
        as_address(admin),
        as_address(relayer),
    )


def create_colosseum(contract):
    return contract.create_hunt(
        "hunt-colosseum-001",
        "The Colosseum",
        "Rome, Italy",
        "Show the real exterior with its recognizable rows of arches.",
        250,
    )


def create_taj_pick(contract):
    return contract.create_quick_pick(
        "quick-taj-001",
        "Humayun's Tomb",
        "Taj Mahal",
        "Lotus Temple",
        "Hawa Mahal",
        100,
    )


def create_jordan_quiz(contract):
    return contract.create_quiz(
        "quiz-jordan-001",
        "Which landmark is in Jordan?",
        "Petra",
        "Machu Picchu",
        "Angkor Wat",
        "Moai of Rapa Nui",
        75,
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


def mock_pick_verdict(direct_vm, correct_index=1, confident=True):
    direct_vm.mock_llm(
        r".*judging one Find the Landmark multiple-choice round.*",
        json.dumps({"correct_index": correct_index, "confident": confident}),
    )


def mock_pick_audit(direct_vm, proposal_valid=True):
    direct_vm.mock_llm(
        r".*independently verifying a proposed answer for one Find the Landmark image round.*",
        json.dumps({"proposal_valid": proposal_valid}),
    )


def mock_quiz_answer(direct_vm, correct_index=0, confident=True):
    direct_vm.mock_llm(
        r".*Answer one Find the Landmark geography quiz independently.*",
        json.dumps({"correct_index": correct_index, "confident": confident}),
    )


def mock_quiz_audit(direct_vm, proposal_valid=True):
    direct_vm.mock_llm(
        r".*Independently verify a proposed answer for one Find the Landmark geography quiz.*",
        json.dumps({"proposal_valid": proposal_valid}),
    )


def submit(contract, submission_id="submission-one", user_hash=USER_HASH, run_id=RUN_ID):
    return contract.verify_photo(
        submission_id,
        user_hash,
        "hunt-colosseum-001",
        run_id,
        EVIDENCE_URL,
        IMAGE_HASH,
    )


def submit_pick(contract, choice_index=1, submission_id="pick-submission-one", user_hash=USER_HASH, run_id=RUN_ID):
    return contract.verify_pick(
        submission_id,
        user_hash,
        "quick-taj-001",
        run_id,
        choice_index,
        EVIDENCE_URL,
        IMAGE_HASH,
    )


def submit_quiz(contract, choice_index=0, submission_id="quiz-submission-one", user_hash=USER_HASH, run_id=RUN_ID):
    return contract.verify_quiz(
        submission_id,
        user_hash,
        "quiz-jordan-001",
        run_id,
        choice_index,
    )


def test_owner_creates_hunt(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    created = create_colosseum(contract)

    assert created["landmark_name"] == "The Colosseum"
    assert created["reward_xp"] == 250
    assert contract.get_hunt_status("hunt-colosseum-001", RUN_ID)["has_winner"] is False


def test_non_owner_cannot_create_hunt(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob

    with direct_vm.expect_revert("Only the configured game admin can create hunts"):
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
    assert contract.has_result("submission-one") is True
    winner = contract.get_winner("hunt-colosseum-001", RUN_ID)
    assert winner["user_id_hash"] == USER_HASH
    assert winner["reward_xp"] == 250
    assert winner["run_id"] == RUN_ID


def test_wrong_landmark_is_rejected_without_winner(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, target_match=False)

    result = submit(contract)

    assert result["accepted"] is False
    assert result["winner"] is False
    assert result["reward_xp"] == 0
    assert contract.get_hunt_status("hunt-colosseum-001", RUN_ID)["has_winner"] is False


def test_second_submission_cannot_replace_first_winner(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm)
    submit(contract)

    with direct_vm.expect_revert("That hunt already has a winner"):
        submit(contract, "submission-two", SECOND_USER_HASH)

    assert contract.get_winner("hunt-colosseum-001", RUN_ID)["user_id_hash"] == USER_HASH


def test_photo_hunt_has_a_fresh_winner_slot_each_run(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm)

    submit(contract)
    submit(contract, "submission-next-run", SECOND_USER_HASH, SECOND_RUN_ID)

    assert contract.get_hunt_status("hunt-colosseum-001", RUN_ID)["has_winner"] is True
    assert contract.get_hunt_status("hunt-colosseum-001", SECOND_RUN_ID)["has_winner"] is True


def test_evidence_hash_must_match(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_colosseum(contract)
    mock_evidence(direct_vm)

    with direct_vm.expect_revert("Evidence hash does not match"):
        contract.verify_photo(
            "bad-hash-submission",
            USER_HASH,
            "hunt-colosseum-001",
            RUN_ID,
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
            RUN_ID,
            "https://127.0.0.1/private.jpg",
            IMAGE_HASH,
        )


def test_only_relayer_can_submit_proofs(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice, direct_bob)
    create_colosseum(contract)

    with direct_vm.expect_revert("Only the configured game relayer can submit proofs"):
        submit(contract)


def test_owner_creates_quick_pick(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    created = create_taj_pick(contract)

    assert created["option_b"] == "Taj Mahal"
    assert created["reward_xp"] == 100
    assert contract.get_quick_pick("quick-taj-001")["option_d"] == "Hawa Mahal"


def test_non_owner_cannot_create_quick_pick(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob

    with direct_vm.expect_revert("Only the configured game admin can create quick picks"):
        create_taj_pick(contract)


def test_correct_quick_pick_is_accepted(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_taj_pick(contract)
    mock_evidence(direct_vm)
    mock_pick_verdict(direct_vm)

    result = submit_pick(contract)

    assert result["kind"] == "quick_pick"
    assert result["accepted"] is True
    assert result["reward_xp"] == 100
    assert result["correct_index"] == 1
    assert result["run_id"] == RUN_ID


def test_quick_pick_validator_independently_audits_the_proposal(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_taj_pick(contract)
    mock_evidence(direct_vm)
    mock_pick_verdict(direct_vm)
    submit_pick(contract)

    direct_vm.clear_mocks()
    mock_evidence(direct_vm)
    mock_pick_audit(direct_vm, True)
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    mock_evidence(direct_vm)
    mock_pick_audit(direct_vm, False)
    assert direct_vm.run_validator() is False


def test_wrong_quick_pick_is_rejected(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_taj_pick(contract)
    mock_evidence(direct_vm)
    mock_pick_verdict(direct_vm)

    result = submit_pick(contract, choice_index=0)

    assert result["accepted"] is False
    assert result["reward_xp"] == 0


def test_player_only_gets_one_quick_pick_attempt(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_taj_pick(contract)
    mock_evidence(direct_vm)
    mock_pick_verdict(direct_vm)
    submit_pick(contract)

    with direct_vm.expect_revert("already answered"):
        submit_pick(contract, submission_id="pick-submission-two")

    second_run = submit_pick(
        contract,
        submission_id="pick-submission-next-run",
        run_id=SECOND_RUN_ID,
    )
    assert second_run["accepted"] is True


def test_only_relayer_can_submit_quick_pick(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice, direct_bob)
    create_taj_pick(contract)

    with direct_vm.expect_revert("Only the configured game relayer can submit picks"):
        submit_pick(contract)


def test_owner_creates_quiz(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    created = create_jordan_quiz(contract)

    assert created["question"] == "Which landmark is in Jordan?"
    assert created["reward_xp"] == 75
    assert contract.get_quiz("quiz-jordan-001")["option_a"] == "Petra"


def test_correct_quiz_answer_is_consensus_scored(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_jordan_quiz(contract)
    mock_quiz_answer(direct_vm)

    result = submit_quiz(contract)

    assert result["kind"] == "landmark_quiz"
    assert result["accepted"] is True
    assert result["reward_xp"] == 75
    assert result["correct_index"] == 0

    direct_vm.clear_mocks()
    mock_quiz_audit(direct_vm, True)
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    mock_quiz_audit(direct_vm, False)
    assert direct_vm.run_validator() is False


def test_wrong_quiz_answer_gets_no_xp(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_jordan_quiz(contract)
    mock_quiz_answer(direct_vm)

    result = submit_quiz(contract, choice_index=2)

    assert result["accepted"] is False
    assert result["reward_xp"] == 0


def test_quiz_attempts_reset_for_a_new_daily_run(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    create_jordan_quiz(contract)
    mock_quiz_answer(direct_vm)
    submit_quiz(contract)

    with direct_vm.expect_revert("already answered"):
        submit_quiz(contract, submission_id="quiz-submission-two")

    result = submit_quiz(
        contract,
        submission_id="quiz-submission-next-run",
        run_id=SECOND_RUN_ID,
    )
    assert result["accepted"] is True
