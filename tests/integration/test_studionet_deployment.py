from gltest import get_contract_factory


CONTRACT_ADDRESS = "0xE1926EdBeBC1B848b477F86b3B310B8bde9792F6"
EXPECTED_ADMIN = "0x797d3b25fb2cca0ff93f60df1910267f3822d655"
EXPECTED_RELAYER = "0x7f07ab481dd8b57085d7c9e0c97c6126ee7faaec"


def deployed_contract():
    factory = get_contract_factory(contract_file_path="LandmarkHunt.py")
    return factory.build_contract(CONTRACT_ADDRESS)


def normalized_address(value):
    encoded = str(value).lower()
    if encoded.startswith("addr#"):
        return f"0x{encoded[5:]}"
    return encoded


def test_deployed_policy_matches_release():
    policy = deployed_contract().get_policy().call()

    assert policy["policy_version"] == "find-the-landmark.consensus-game.v3"
    assert normalized_address(policy["admin"]) == EXPECTED_ADMIN
    assert normalized_address(policy["relayer"]) == EXPECTED_RELAYER
    assert policy["max_image_bytes"] == 8 * 1024 * 1024
    assert policy["quick_pick_consensus"] is True
    assert policy["quiz_consensus"] is True
    assert policy["proposal_audit_consensus"] is True
    assert policy["daily_runs"] is True


def test_seeded_hunts_are_live_and_daily():
    contract = deployed_contract()

    colosseum = contract.get_hunt(args=["hunt-colosseum-001"]).call()
    tower_bridge = contract.get_hunt(args=["hunt-tower-bridge-001"]).call()
    status = contract.get_hunt_status(args=["hunt-colosseum-001", "route-2099-01-01"]).call()

    assert colosseum["landmark_name"] == "The Colosseum"
    assert colosseum["reward_xp"] == 250
    assert tower_bridge["landmark_name"] == "Tower Bridge"
    assert tower_bridge["reward_xp"] == 250
    assert status["has_winner"] is False


def test_seeded_quick_picks_match_the_release():
    contract = deployed_contract()

    taj = contract.get_quick_pick(args=["quick-taj-001"]).call()
    angkor = contract.get_quick_pick(args=["quick-angkor-001"]).call()

    assert [taj["option_a"], taj["option_b"], taj["option_c"], taj["option_d"]] == [
        "Humayun's Tomb", "Taj Mahal", "Lotus Temple", "Hawa Mahal"
    ]
    assert angkor["option_c"] == "Angkor Wat"
    assert taj["reward_xp"] == angkor["reward_xp"] == 100


def test_seeded_quiz_is_live():
    quiz = deployed_contract().get_quiz(args=["quiz-jordan-001"]).call()

    assert quiz["question"] == "Which landmark is in Jordan?"
    assert quiz["option_a"] == "Petra"
    assert quiz["reward_xp"] == 75
