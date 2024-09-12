import { expect } from "chai";
import { poseidonHashMany } from 'micro-starknet';
import { RpcProvider as StarknetRpcProvider, Account as StarknetAccount, Contract as StarknetContract, CallData, cairo, shortString, selector, CairoCustomEnum } from 'starknet';
import { Devnet as StarknetDevnet, DevnetProvider as StarknetDevnetProvider } from 'starknet-devnet';
import { ethers } from "hardhat";
import { Contract as EthContract } from 'ethers';
import path from 'path';
import fs from 'fs/promises';

describe("Starknet Commit", function () {
  const eth_network = "http://127.0.0.1:8545";
  let starknetDevnet: StarknetDevnet;
  let starknetDevnetProvider: StarknetDevnetProvider;
  let mockMessagingContractAddress: string;
  let starknetCommit: EthContract;
  let starknetAccount: StarknetAccount;
  let provider: StarknetRpcProvider;

  const ADDRESS = "0x34ba56f92265f0868c57d3fe72ecab144fc96f97954bbbc4252cef8e8a979ba"
  const PRIVATE_KEY = "0xb137668388dbe9acdfa3bc734cc2c469"

  it('comits a message on L1', async () => {
    // poseidon(0x1)
    const commit = `0x${poseidonHashMany([0x1].map((v) => BigInt(v))).toString(16)}`;
    console.log(commit);

    const devnetConfig = {
      args: ["--seed", "42", "--lite-mode", "--host", "127.0.0.1", "--port", "5050"],
    };
    console.log("Spawning devnet...");
    starknetDevnet = await StarknetDevnet.spawnInstalled(devnetConfig); // TODO: should be a new rather than spawninstalled
    starknetDevnetProvider = new StarknetDevnetProvider();
    console.log("Devnet spawned!");

    provider = new StarknetRpcProvider({ nodeUrl: starknetDevnet.provider.url });

    // Account used for deployments
    starknetAccount = new StarknetAccount(provider, ADDRESS, PRIVATE_KEY);

    console.log("Loading L1 Messaging Contract");
    const messagingLoadResponse = await starknetDevnetProvider.postman.loadL1MessagingContract(eth_network);
    mockMessagingContractAddress = messagingLoadResponse.messaging_contract_address;
    console.log("Mock messaging contract: ", mockMessagingContractAddress);

    console.log("Deploying Starknet Commit contract to L1");
    const starknetCommitFactory = await ethers.getContractFactory('StarknetCommit');
    starknetCommit = await starknetCommitFactory.deploy(mockMessagingContractAddress);
    console.log("Starknet Commit contract deployed to L1: ", await starknetCommit.getAddress());

    console.log("Deploying Authenticator...");
    const { sierraCode: auth_sierra, casmCode: auth_casm } = await getCompiledCode('ex_Authenticator');
    const auth_response = await starknetAccount.declareAndDeploy({ contract: auth_sierra, casm: auth_casm });
    let authenticator = new StarknetContract(auth_sierra.abi, auth_response.deploy.contract_address, provider);
    console.log("Authenticator deployed: ", authenticator.address);

    authenticator.connect(starknetAccount);

    console.log("Committing...");
    await starknetCommit.commit(authenticator.address, commit, { value: 18485000000000 });
    console.log("Committed!");

    // Checking that the L1 -> L2 message has been propagated
    console.log("Flushing messages...");
    expect((await starknetDevnetProvider.postman.flush()).messages_to_l2).to.have.a.lengthOf(1);
    console.log("Messages flushed!");
  });

  it('commits a second message on L1', async () => {
    // Restart the devnet to clear the previous message
    await starknetDevnet.provider.restart();

    // Load the L1 Messaging Contract (deployed already on L1 Node which hasn't been reset)
    await starknetDevnetProvider.postman.loadL1MessagingContract(eth_network, mockMessagingContractAddress);

    console.log("Deploying Authenticator...");
    const { sierraCode: auth_sierra, casmCode: auth_casm } = await getCompiledCode('ex_Authenticator');
    // const auth_calldata = CallData.compile({ starknet_commit_address: await starknetCommit.getAddress() });
    const auth_response = await starknetAccount.declareAndDeploy({ contract: auth_sierra, casm: auth_casm });
    let authenticator = new StarknetContract(auth_sierra.abi, auth_response.deploy.contract_address, provider);
    console.log("Authenticator deployed: ", authenticator.address);

    // The same exact commit as `poseidon(0x1)`
    const commit = `0x${poseidonHashMany([0x1].map((v) => BigInt(v))).toString(16)}`;
    console.log(commit);

    await starknetCommit.commit(authenticator.address, commit, { value: 18485000000000 });

    // Checking that the L1 -> L2 message has been propagated. Should be `1` message but due to how `flush` will look at ALL
    // the logs of the previous messages, it will return `2` messages.
    // Due to the fact that the "authenticator" from the previous test has not been deployed on the current network, the "flush"
    // will error with "0x..." is not deployed.
    console.log("Flushing messages...");
    expect((await starknetDevnetProvider.postman.flush()).messages_to_l2).to.have.a.lengthOf(1);
    console.log("Messages flushed!");
  });
});

// Helper function to get the sierra and casm code of a contract
export async function getCompiledCode(filename: string) {
  const sierraFilePath = path.join(
    __dirname,
    `../starknet/target/dev/${filename}.contract_class.json`,
  );
  const casmFilePath = path.join(
    __dirname,
    `../starknet/target/dev/${filename}.compiled_contract_class.json`,
  );

  const code = [sierraFilePath, casmFilePath].map(async (filePath) => {
    const file = await fs.readFile(filePath);
    return JSON.parse(file.toString("ascii"));
  });

  const [sierraCode, casmCode] = await Promise.all(code);

  return {
    sierraCode,
    casmCode,
  };
}
