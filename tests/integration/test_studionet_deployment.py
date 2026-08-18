from gltest import get_contract_factory


CONTRACT_ADDRESS = "0xE14e50069F700F4C72ca9d59c1eb950b04342b7a"
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

    assert policy["policy_version"] == "find-the-landmark.photo-hunt.v1"
    assert normalized_address(policy["admin"]) == EXPECTED_ADMIN
    assert normalized_address(policy["relayer"]) == EXPECTED_RELAYER
    assert policy["max_image_bytes"] == 8 * 1024 * 1024


def test_seeded_hunts_are_live_and_unclaimed():
    contract = deployed_contract()

    colosseum = contract.get_hunt(args=["hunt-colosseum-001"]).call()
    eiffel = contract.get_hunt(args=["hunt-eiffel-001"]).call()

    assert colosseum["landmark_name"] == "The Colosseum"
    assert colosseum["reward_xp"] == 250
    assert colosseum["has_winner"] is False
    assert eiffel["landmark_name"] == "The Eiffel Tower"
    assert eiffel["reward_xp"] == 250
    assert eiffel["has_winner"] is False
