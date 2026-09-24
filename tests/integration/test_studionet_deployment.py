from gltest import get_contract_factory


CONTRACT_ADDRESS = "0x677388E350bef8FdfD41f8F8Dc13c558175f3C7F"


def deployed_contract():
    factory = get_contract_factory(contract_file_path="LandmarkLobby.py")
    return factory.build_contract(CONTRACT_ADDRESS)


def test_deployed_lobby_policy_matches_release():
    policy = deployed_contract().get_policy().call()

    assert policy == {
        "policy_version": "find-the-landmark.lobby-game.v4.3",
        "max_players": 8,
        "max_rounds": 12,
        "start_delay_ms": 180_000,
        "scoring_scope": "per_game_only",
        "validator_consensus": True,
        "settlement_mode": "per_round",
        "answer_authentication": "direct_eoa_commitment",
        "timing_source": "genlayer_transaction_timestamp",
        "reveal_mode": "relayer_batch_with_player_fallback",
        "finalization": "permissionless_idempotent",
        "quiz_sources": "validator_fetched_allowlisted",
    }
