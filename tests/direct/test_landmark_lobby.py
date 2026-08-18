import hashlib
import json
from pathlib import Path

from gltest.direct.sdk_loader import setup_sdk_paths


IMAGE_BYTES = b"direct-mode-landmark-image-placeholder-with-enough-bytes" * 4
IMAGE_HASH = hashlib.sha256(IMAGE_BYTES).hexdigest()
PLAYER_ONE = hashlib.sha256(b"player-one").hexdigest()
PLAYER_TWO = hashlib.sha256(b"player-two").hexdigest()
OUTSIDER = hashlib.sha256(b"outsider").hexdigest()
EVIDENCE_URL = "https://images.example.test/taj-mahal.jpg"


PLAN = [
    {
        "kind": "identify",
        "challenge_id": "quick-taj-001",
        "question": "Name this landmark.",
        "options": ["Humayun's Tomb", "Taj Mahal", "Lotus Temple", "Hawa Mahal"],
        "duration_ms": 20_000,
        "reward_xp": 100,
        "speed_bonus": 50,
    },
    {
        "kind": "quiz",
        "challenge_id": "quiz-jordan-001",
        "question": "Which landmark is in Jordan?",
        "options": ["Petra", "Machu Picchu", "Angkor Wat", "Moai of Rapa Nui"],
        "duration_ms": 25_000,
        "reward_xp": 75,
        "speed_bonus": 25,
    },
    {
        "kind": "quiz",
        "challenge_id": "quiz-strait-001",
        "question": "Which strait sits below the Golden Gate Bridge?",
        "options": ["Bering Strait", "Golden Gate Strait", "Bosporus", "Strait of Gibraltar"],
        "duration_ms": 25_000,
        "reward_xp": 75,
        "speed_bonus": 25,
    },
]


def as_address(value):
    from genlayer.py.types import Address

    return Address(value) if isinstance(value, bytes) else value


def deploy_contract(direct_vm, direct_deploy, admin, relayer=None):
    setup_sdk_paths(Path("contracts/LandmarkLobby.py"), "v0.2.16")
    relayer = relayer or admin
    direct_vm.sender = as_address(admin)
    return direct_deploy(
        "contracts/LandmarkLobby.py",
        as_address(admin),
        as_address(relayer),
    )


def register(contract, game_id="game-one", roster=None):
    return contract.register_game(
        game_id,
        json.dumps(roster or [PLAYER_ONE, PLAYER_TWO]),
        json.dumps(PLAN),
    )


def mock_image(direct_vm):
    direct_vm.mock_web(r".*images\.example\.test/.*", {"status": 200, "body": IMAGE_BYTES})


def mock_identify(direct_vm, correct_index=1, confident=True):
    direct_vm.mock_llm(
        r".*judging one multiplayer Find the Landmark image round.*",
        json.dumps({"correct_index": correct_index, "confident": confident}),
    )


def mock_identify_audit(direct_vm, proposal_valid=True):
    direct_vm.mock_llm(
        r".*Independently verify a proposed answer for a landmark image.*",
        json.dumps({"proposal_valid": proposal_valid}),
    )


def mock_quiz(direct_vm, correct_index=0, confident=True):
    direct_vm.mock_llm(
        r".*Answer one multiplayer Find the Landmark geography quiz independently.*",
        json.dumps({"correct_index": correct_index, "confident": confident}),
    )


def settle_image(contract, answers=None):
    return contract.settle_round(
        "game-one",
        0,
        json.dumps(
            answers
            or [
                {"player_hash": PLAYER_ONE, "choice_index": 1, "elapsed_ms": 0},
                {"player_hash": PLAYER_TWO, "choice_index": 0, "elapsed_ms": 10_000},
            ]
        ),
        EVIDENCE_URL,
        IMAGE_HASH,
    )


def test_policy_is_lobby_scoped(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    policy = contract.get_policy()

    assert policy["max_players"] == 50
    assert policy["scoring_scope"] == "per_game_only"
    assert policy["batch_round_settlement"] is True


def test_relayer_registers_game_and_plan_hashes(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    created = register(contract)
    stored = contract.get_game("game-one")

    assert created["player_count"] == 2
    assert created["round_count"] == 3
    assert stored["plan_sha256"] == created["plan_sha256"]


def test_only_relayer_can_register_or_settle(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice, direct_bob)

    with direct_vm.expect_revert("Only the configured game relayer can register games"):
        register(contract)

    direct_vm.sender = as_address(direct_bob)
    register(contract)
    direct_vm.sender = as_address(direct_alice)
    with direct_vm.expect_revert("Only the configured game relayer can settle rounds"):
        settle_image(contract)


def test_roster_rejects_duplicates(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)

    with direct_vm.expect_revert("Roster contains a duplicate player"):
        register(contract, roster=[PLAYER_ONE, PLAYER_ONE])


def test_image_round_scores_the_whole_lobby_once(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract)
    mock_image(direct_vm)
    mock_identify(direct_vm)

    result = settle_image(contract)

    assert result["correct_index"] == 1
    assert result["scores"][0]["awarded_xp"] == 150
    assert result["scores"][1]["awarded_xp"] == 0
    assert contract.get_score("game-one", PLAYER_ONE) == 150
    assert contract.get_score("game-one", PLAYER_TWO) == 0
    assert contract.get_leaderboard("game-one")[0]["player_hash"] == PLAYER_ONE
    assert contract.has_round_result("game-one", 0) is True

    with direct_vm.expect_revert("already been settled"):
        settle_image(contract)


def test_image_validator_audits_the_shared_answer(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract)
    mock_image(direct_vm)
    mock_identify(direct_vm)
    settle_image(contract)

    direct_vm.clear_mocks()
    mock_image(direct_vm)
    mock_identify_audit(direct_vm, True)
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    mock_image(direct_vm)
    mock_identify_audit(direct_vm, False)
    assert direct_vm.run_validator() is False


def test_quiz_round_adds_only_per_game_xp(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract)
    mock_image(direct_vm)
    mock_identify(direct_vm)
    settle_image(contract)
    direct_vm.clear_mocks()
    mock_quiz(direct_vm)

    result = contract.settle_round(
        "game-one",
        1,
        json.dumps(
            [
                {"player_hash": PLAYER_ONE, "choice_index": 0, "elapsed_ms": 12_500},
                {"player_hash": PLAYER_TWO, "choice_index": 2, "elapsed_ms": 1_000},
            ]
        ),
        "",
        "",
    )

    assert result["scores"][0]["awarded_xp"] == 87
    assert contract.get_score("game-one", PLAYER_ONE) == 237
    assert contract.get_score("game-one", PLAYER_TWO) == 0


def test_answers_must_come_from_registered_players(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract)
    mock_image(direct_vm)
    mock_identify(direct_vm)

    with direct_vm.expect_revert("outside the roster"):
        settle_image(
            contract,
            [{"player_hash": OUTSIDER, "choice_index": 1, "elapsed_ms": 2_000}],
        )


def test_scores_reset_in_every_new_game(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract)
    mock_image(direct_vm)
    mock_identify(direct_vm)
    settle_image(contract)
    register(contract, game_id="game-two")

    assert contract.get_score("game-one", PLAYER_ONE) == 150
    assert contract.get_score("game-two", PLAYER_ONE) == 0
