from gltest import get_contract_factory


CONTRACT_ADDRESS = "0x61C8B24da6DfB8A4C3eCb035C199114f284677eD"


def deployed_contract():
    factory = get_contract_factory(contract_file_path="LandmarkLobby.py")
    return factory.build_contract(CONTRACT_ADDRESS)


def test_deployed_lobby_policy_matches_release():
    policy = deployed_contract().get_policy().call()

    assert policy == {
        "policy_version": "find-the-landmark.lobby-game.v2",
        "max_players": 50,
        "max_rounds": 12,
        "scoring_scope": "per_game_only",
        "validator_consensus": True,
        "batch_round_settlement": True,
    }
