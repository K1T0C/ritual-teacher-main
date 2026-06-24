const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

function findArtifact(dir, filename) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const found = findArtifact(filePath, filename);
      if (found) return found;
    } else if (file === filename) {
      return filePath;
    }
  }
  return null;
}

async function main() {
  const RPC_URL = process.env.RITUAL_RPC_URL ?? "https://rpc.ritualfoundation.org";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const PAYOUT_WALLET = process.env.PAYOUT_WALLET;
  const SERVICE_FEE_RIT = process.env.SERVICE_FEE_RIT ?? "0.002";

  if (!PRIVATE_KEY) throw new Error("Set PRIVATE_KEY in environment");
  if (!PAYOUT_WALLET) throw new Error("Set PAYOUT_WALLET in environment");

  console.log("=== DEPLOY AgentDeployer to Ritual Chain (1979) ===");

  const provider = new ethers.JsonRpcProvider(RPC_URL, 1979);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Payout wallet: ${PAYOUT_WALLET}`);

  const artifactsDir = path.join(__dirname, "../artifacts");
  const artifactPath = findArtifact(artifactsDir, "AgentDeployer.json");
  if (!artifactPath) {
    throw new Error("AgentDeployer.json not found. Run: npx hardhat compile");
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const serviceFee = ethers.parseEther(SERVICE_FEE_RIT);

  const contract = await factory.deploy(PAYOUT_WALLET, serviceFee);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("====================================");
  console.log("AgentDeployer deployed:", address);
  console.log("Set AGENT_DEPLOYER_ADDRESS in .env");
  console.log("Then fund RitualWallet via depositInferenceFees() (~0.5 RIT)");
  console.log("====================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
