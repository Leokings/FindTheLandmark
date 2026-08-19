from gltest import get_contract_factory


CONTRACT_ADDRESS = "0x198b1027F8eF524BEC3DA10a021b728FD071D7DB"


def deployed_contract():
    factory = get_contract_factory(contract_file_path="LandmarkLobby.py")
    return factory.build_contract(CONTRACT_ADDRESS)


def test_deployed_lobby_policy_matches_release():
    policy = deployed_contract().get_policy().call()

    assert policy == {
        "policy_version": "find-the-landmark.lobby-game.v3",
        "max_players": 50,
        "max_rounds": 12,
        "scoring_scope": "per_game_only",
        "validator_consensus": True,
        "settlement_mode": "per_round",
        "evidence_precommitted": True,
    }
