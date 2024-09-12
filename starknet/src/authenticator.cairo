use starknet::{ContractAddress, EthAddress, Store, SyscallResult};
use starknet::SyscallResultTrait;

#[starknet::interface]
trait IAuthenticator<TContractState> {
    fn foo(ref self: TContractState, a: felt252) -> felt252;
}

#[starknet::contract]
mod Authenticator {
    use super::IAuthenticator;
    use starknet::{ContractAddress, EthAddress};
    use super::Strategy;

    #[storage]
    struct Storage {
        _commits: LegacyMap::<(felt252, EthAddress), bool>
    }

    #[l1_handler]
    fn commit(
        ref self: ContractState, from_address: felt252, sender_address: felt252, hash: felt252
    ) {
        let sender_address = sender_address.try_into().unwrap();
        assert(self._commits.read((hash, sender_address)) == false, 'Commit already exists');
        self._commits.write((hash, sender_address), true);
    }

    #[abi(embed_v0)]
    impl Authenticator of IAuthenticator<ContractState> {
        fn foo(ref self: ContractState, a: felt252) -> felt252 {
            return a;
        }
    }
}

/// A strategy.
#[derive(Clone, Drop, Option)]
struct Strategy {
    /// The strategy address.
    address: ContractAddress,
    /// The strategy parameters.
    params: Array<felt252>,
}
