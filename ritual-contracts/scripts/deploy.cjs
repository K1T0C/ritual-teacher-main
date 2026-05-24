const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Функция для рекурсивного поиска файла в папке
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
  const RITUAL_REGISTRY = "0x0000000000000000000000000000000000000000"; 
  const RPC_URL = "https://rpc.ritualfoundation.org";
  const PRIVATE_KEY = "d270ffa001aea4a04004509a5c7d553321301704e8947547677b5827a76f817d";

  console.log("=== НАЧАЛО ДЕПЛОЯ В RITUAL CHAIN ===");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Используем кошелек: ${wallet.address}`);

  // Ищем файл AIValidatorConsumer.json по всей папке artifacts
  const artifactsDir = path.join(__dirname, "../artifacts");
  if (!fs.existsSync(artifactsDir)) {
    throw new Error("Папка artifacts не найдена. Запусти 'npx hardhat compile' сначала.");
  }

  const artifactPath = findArtifact(artifactsDir, "AIValidatorConsumer.json");
  
  if (!artifactPath) {
    throw new Error("Файл AIValidatorConsumer.json не найден в папке artifacts. Убедись, что контракт скомпилирован.");
  }

  console.log(`Файл артефактов найден: ${artifactPath}`);
  const contractArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(
    contractArtifact.abi,
    contractArtifact.bytecode,
    wallet
  );

  console.log("Отправляем транзакцию деплоя...");
  
  const contract = await factory.deploy(RITUAL_REGISTRY);
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log("====================================");
  console.log("🚀 КОНТРАКТ УСПЕШНО РАЗВЕРНУТ В RITUAL CHAIN!");
  console.log(`Адрес контракта: ${address}`);
  console.log("====================================");
}

main().catch((error) => {
  console.error("Произошла ошибка при деплое:", error);
  process.exitCode = 1;
});