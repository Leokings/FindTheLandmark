import hashlib
import json
import re
from pathlib import Path

from gltest.direct.sdk_loader import setup_sdk_paths


IMAGE_BYTES = b"direct-mode-landmark-image-placeholder-with-enough-bytes" * 4
IMAGE_HASH = hashlib.sha256(IMAGE_BYTES).hexdigest()
EVIDENCE_URL = "https://images.example.test/taj-mahal.jpg"
DOCS_BYTES = b"The Calling LLMs guide documents gl.nondet.exec_prompt as the prompt function."
DOCS_HASH = hashlib.sha256(DOCS_BYTES).hexdigest()
DOCS_URL = (
    "https://raw.githubusercontent.com/genlayerlabs/genlayer-docs/"
    "9699f3900dd697689090f6595f5c14b4f0a60fdf/pages/developers/"
    "intelligent-contracts/features/calling-llms.mdx"
)
UNESCO_BYTES = b"Petra is a World Heritage property in Jordan."
UNESCO_URL = (
    "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records"
    "?where=id_no%3D326&limit=1"
)
SALT_ONE = "11" * 32
SALT_TWO = "22" * 32
GAME_START = "2026-08-21T10:01:00Z"


PLAN = [
    {
        "kind": "identify",
        "challenge_id": "quick-taj-001",
        "question": "Name this landmark.",
        "options": ["Humayun's Tomb", "Taj Mahal", "Lotus Temple", "Hawa Mahal"],
        "duration_ms": 20_000,
        "reward_xp": 100,
        "speed_bonus": 50,
        "source_label": "",
        "source_url": "",
        "source_sha256": "",
        "evidence_url": EVIDENCE_URL,
        "evidence_sha256": IMAGE_HASH,
    },
    {
        "kind": "quiz",
        "challenge_id": "quiz-jordan-001",
        "question": "Which landmark is in Jordan?",
        "options": ["Petra", "Machu Picchu", "Angkor Wat", "Moai of Rapa Nui"],
        "duration_ms": 25_000,
        "reward_xp": 75,
        "speed_bonus": 25,
        "source_label": "UNESCO World Heritage Centre - Petra",
        "source_url": UNESCO_URL,
        "source_sha256": "",
        "evidence_url": "",
        "evidence_sha256": "",
    },
    {
        "kind": "quiz",
        "challenge_id": "genlayer-exec-prompt-001",
        "question": "Which GenLayer function sends a prompt to an LLM?",
        "options": [
            "gl.nondet.web.get()",
            "gl.nondet.exec_prompt()",
            "gl.vm.run_nondet_unsafe()",
            "gl.public.write",
        ],
        "duration_ms": 25_000,
        "reward_xp": 75,
        "speed_bonus": 25,
        "source_label": "GenLayer Docs - Calling LLMs",
        "source_url": DOCS_URL,
        "source_sha256": DOCS_HASH,
        "evidence_url": "",
        "evidence_sha256": "",
    },
]


def as_address(value):
    from genlayer.py.types import Address

    return Address(value) if isinstance(value, bytes) else value


def address_text(value):
    return str(as_address(value)).lower()


def commitment(game_id, round_index, player_address, choice_index, salt):
    preimage = f"ftl:v4:{game_id}:{round_index}:{player_address}:{choice_index}:{salt}"
    return hashlib.sha256(preimage.encode("utf-8")).hexdigest()


def deploy_contract(direct_vm, direct_deploy, admin, relayer=None):
    setup_sdk_paths(Path("contracts/LandmarkLobby.py"), "v0.2.16")
    relayer = relayer or admin
    direct_vm.sender = as_address(admin)
    direct_vm.warp("2026-08-21T10:00:00Z")
    return direct_deploy(
        "contracts/LandmarkLobby.py",
        as_address(admin),
        as_address(relayer),
    )


def register(contract, players, game_id="game-one", plan=None):
    return contract.register_game(
        game_id,
        json.dumps([address_text(player) for player in players]),
        json.dumps(plan or PLAN),
    )


def commit(contract, direct_vm, sender, round_index, choice_index, salt, when):
    direct_vm.sender = as_address(sender)
    direct_vm.warp(when)
    player = address_text(sender)
    digest = commitment("game-one", round_index, player, choice_index, salt)
    return contract.commit_answer("game-one", round_index, digest)


def reveal_batch(contract, direct_vm, relayer, round_index, rows, when):
    direct_vm.sender = as_address(relayer)
    direct_vm.warp(when)
    return contract.reveal_answers("game-one", round_index, json.dumps(rows))


def mock_image(direct_vm):
    direct_vm.mock_web(r".*images\.example\.test/.*", {"status": 200, "body": IMAGE_BYTES})


def mock_source(direct_vm, url, body):
    direct_vm.mock_web(re.escape(url), {"status": 200, "body": body})


def mock_pick(direct_vm, correct_index):
    direct_vm.mock_llm(
        r".*Answer one multiplayer Find the Landmark factual quiz independently.*",
        json.dumps({"correct_index": correct_index, "confident": True}),
    )


def mock_pick_audit(direct_vm, proposal_valid=True):
    direct_vm.mock_llm(
        r".*Independently verify a proposed factual quiz answer.*",
        json.dumps({"proposal_valid": proposal_valid}),
    )


def mock_identify(direct_vm, correct_index=1):
    direct_vm.mock_llm(
        r".*judging one multiplayer Find the Landmark image round.*",
        json.dumps({"correct_index": correct_index, "confident": True}),
    )


def test_policy_uses_signed_commits_and_transaction_time(direct_vm, direct_deploy, direct_alice):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    policy = contract.get_policy()

    assert policy["policy_version"] == "find-the-landmark.lobby-game.v4"
    assert policy["answer_authentication"] == "direct_eoa_commitment"
    assert policy["timing_source"] == "genlayer_transaction_timestamp"
    assert policy["reveal_mode"] == "relayer_batch_with_player_fallback"
    assert policy["finalization"] == "permissionless_idempotent"
    assert policy["quiz_sources"] == "validator_fetched_allowlisted"


def test_registration_schedules_every_round_from_transaction_time(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    created = register(contract, [direct_alice, direct_bob])
    first = contract.get_round_window("game-one", 0)
    second = contract.get_round_window("game-one", 1)

    assert created["start_ms"] == 1_787_306_460_000
    assert first["commit_deadline_ms"] - first["start_ms"] == 20_000
    assert second["start_ms"] - first["commit_deadline_ms"] == 5_000
    assert second["reveal_deadline_ms"] - second["commit_deadline_ms"] == 120_000


def test_only_relayer_can_register(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice, direct_bob)

    with direct_vm.expect_revert("Only the configured game relayer can register games"):
        register(contract, [direct_alice, direct_bob])

    direct_vm.sender = as_address(direct_bob)
    register(contract, [direct_alice, direct_bob])


def test_quizzes_require_allowlisted_authoritative_sources(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    invalid_plan = json.loads(json.dumps(PLAN))
    invalid_plan[1]["source_url"] = "https://example.com/petra"

    with direct_vm.expect_revert("allowlisted authoritative source"):
        register(contract, [direct_alice, direct_bob], plan=invalid_plan)


def test_genlayer_source_requires_commit_and_hash(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    invalid_plan = json.loads(json.dumps(PLAN))
    invalid_plan[2]["source_sha256"] = ""

    with direct_vm.expect_revert("require a pinned hash"):
        register(contract, [direct_alice, direct_bob], plan=invalid_plan)


def test_only_rostered_signer_can_commit_and_commit_is_idempotent(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract, [direct_alice, direct_bob])

    with direct_vm.expect_revert("Only a registered player"):
        commit(contract, direct_vm, direct_charlie, 0, 1, SALT_ONE, "2026-08-21T10:01:02Z")

    first = commit(contract, direct_vm, direct_alice, 0, 1, SALT_ONE, "2026-08-21T10:01:02Z")
    duplicate = commit(contract, direct_vm, direct_alice, 0, 1, SALT_ONE, "2026-08-21T10:01:03Z")
    assert first["duplicate"] is False
    assert duplicate["duplicate"] is True
    assert duplicate["committed_at_ms"] == first["committed_at_ms"]

    with direct_vm.expect_revert("already committed another answer"):
        commit(contract, direct_vm, direct_alice, 0, 0, SALT_TWO, "2026-08-21T10:01:04Z")


def test_commit_window_uses_transaction_timestamp(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract, [direct_alice, direct_bob])

    with direct_vm.expect_revert("has not started"):
        commit(contract, direct_vm, direct_alice, 0, 1, SALT_ONE, "2026-08-21T10:00:59Z")
    with direct_vm.expect_revert("round is closed"):
        commit(contract, direct_vm, direct_alice, 0, 1, SALT_ONE, "2026-08-21T10:01:21Z")


def test_omitted_player_can_reveal_directly(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract, [direct_alice, direct_bob])
    commit(contract, direct_vm, direct_alice, 0, 1, SALT_ONE, "2026-08-21T10:01:02Z")
    commit(contract, direct_vm, direct_bob, 0, 1, SALT_TWO, "2026-08-21T10:01:10Z")

    reveal_batch(
        contract,
        direct_vm,
        direct_alice,
        0,
        [{"player_address": address_text(direct_alice), "choice_index": 1, "salt": SALT_ONE}],
        "2026-08-21T10:01:21Z",
    )
    assert contract.get_answer_state("game-one", 0, address_text(direct_bob))["revealed"] is False

    direct_vm.sender = as_address(direct_bob)
    direct_vm.warp("2026-08-21T10:01:30Z")
    recovered = contract.reveal_answer("game-one", 0, 1, SALT_TWO)
    assert recovered["revealed"] is True
    assert contract.get_answer_state("game-one", 0, address_text(direct_bob))["revealed"] is True


def test_bad_reveal_cannot_change_signed_commitment(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract, [direct_alice, direct_bob])
    commit(contract, direct_vm, direct_alice, 0, 1, SALT_ONE, "2026-08-21T10:01:02Z")

    result = reveal_batch(
        contract,
        direct_vm,
        direct_alice,
        0,
        [{"player_address": address_text(direct_alice), "choice_index": 0, "salt": SALT_ONE}],
        "2026-08-21T10:01:21Z",
    )
    assert result["newly_revealed"] == 0
    assert contract.get_answer_state("game-one", 0, address_text(direct_alice))["revealed"] is False

    direct_vm.sender = as_address(direct_alice)
    with direct_vm.expect_revert("does not match the signed commitment"):
        contract.reveal_answer("game-one", 0, 0, SALT_ONE)


def test_speed_xp_comes_from_commit_transaction_timestamp_and_finalize_is_idempotent(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract, [direct_alice, direct_bob])
    commit(contract, direct_vm, direct_alice, 0, 1, SALT_ONE, "2026-08-21T10:01:02Z")
    commit(contract, direct_vm, direct_bob, 0, 1, SALT_TWO, "2026-08-21T10:01:10Z")
    reveal_batch(
        contract,
        direct_vm,
        direct_alice,
        0,
        [
            {"player_address": address_text(direct_alice), "choice_index": 1, "salt": SALT_ONE},
            {"player_address": address_text(direct_bob), "choice_index": 1, "salt": SALT_TWO},
        ],
        "2026-08-21T10:01:21Z",
    )
    mock_image(direct_vm)
    mock_identify(direct_vm)
    direct_vm.sender = as_address(direct_bob)
    direct_vm.warp("2026-08-21T10:03:21Z")
    result = contract.finalize_round("game-one", 0)

    scores = {row["player_address"]: row for row in result["scores"]}
    assert scores[address_text(direct_alice)]["elapsed_ms"] == 2_000
    assert scores[address_text(direct_alice)]["awarded_xp"] == 145
    assert scores[address_text(direct_bob)]["elapsed_ms"] == 10_000
    assert scores[address_text(direct_bob)]["awarded_xp"] == 125

    direct_vm.sender = as_address(direct_alice)
    again = contract.finalize_round("game-one", 0)
    assert again == result
    assert contract.get_score("game-one", address_text(direct_alice)) == 145


def test_anyone_can_finalize_but_not_before_reveal_deadline(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract, [direct_alice, direct_bob])
    direct_vm.sender = as_address(direct_bob)
    direct_vm.warp("2026-08-21T10:03:19Z")
    with direct_vm.expect_revert("not ready to finalize"):
        contract.finalize_round("game-one", 0)


def test_quiz_is_fetched_from_authoritative_source_by_leader_and_validator(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    register(contract, [direct_alice, direct_bob])
    commit(contract, direct_vm, direct_alice, 2, 1, SALT_ONE, "2026-08-21T10:01:57Z")
    reveal_batch(
        contract,
        direct_vm,
        direct_alice,
        2,
        [{"player_address": address_text(direct_alice), "choice_index": 1, "salt": SALT_ONE}],
        "2026-08-21T10:02:21Z",
    )
    mock_source(direct_vm, DOCS_URL, DOCS_BYTES)
    mock_pick(direct_vm, 1)
    direct_vm.warp("2026-08-21T10:04:21Z")
    result = contract.finalize_round("game-one", 2)
    assert result["source_sha256"] == DOCS_HASH
    assert result["scores"][0]["awarded_xp"] > 75

    direct_vm.clear_mocks()
    mock_source(direct_vm, DOCS_URL, DOCS_BYTES)
    mock_pick_audit(direct_vm)
    assert direct_vm.run_validator() is True


def test_fifty_signed_players_can_commit_reveal_and_score_once(
    direct_vm, direct_deploy, direct_alice
):
    contract = deploy_contract(direct_vm, direct_deploy, direct_alice)
    from genlayer.py.types import Address

    players = [Address(f"0x{index + 1:040x}") for index in range(50)]
    register(contract, players)
    reveals = []
    for index, player in enumerate(players):
        salt = f"{index + 1:064x}"
        commit(contract, direct_vm, player, 0, 1, salt, "2026-08-21T10:01:05Z")
        reveals.append({"player_address": address_text(player), "choice_index": 1, "salt": salt})
    reveal_batch(
        contract, direct_vm, direct_alice, 0, reveals, "2026-08-21T10:01:21Z"
    )
    mock_image(direct_vm)
    mock_identify(direct_vm)
    direct_vm.warp("2026-08-21T10:03:21Z")
    result = contract.finalize_round("game-one", 0)

    assert len(result["scores"]) == 50
    assert all(row["awarded_xp"] == 137 for row in result["scores"])
    assert len(contract.get_leaderboard("game-one")) == 50
