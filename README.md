# Run

First run `yarn install`
On a second monitor, run an L1 node on `127.0.0.1:8545`

Then, run the test: 
`yarn hardhat test --network localhost`


The test will error with "0x... is not deployed".

This is because the test does this:
1. In the first test, deploy a `starknetCommit` on L1, as well as an `authenticator` on L2. Commit on L1, flush (will send the message to L2). Everything works perfectly.
2. In the second test, start by restarting thde starknet devnet. Re-deploy the `authenticator` on L2. Commit on L1, flush. This will error, because calling `flush` will load the message from test `1`.

I believe in an ideal world we would not be loading the messages from test `1` because they were sent *before* we re-started the L2 devnet. I don't know if it's something possible or not, but I just find this behaviour non-intuitive.

If we wanted to have the test working, we would need to either 1) re-deploy the starknetCommit on L1 or 2) load L1 from a dump file everytime we reset L2.