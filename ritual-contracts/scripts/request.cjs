const { ethers } = require("ethers");

async function main() {
  const RPC_URL = "https://rpc.ritualfoundation.org";
  const PRIVATE_KEY = "d270ffa001aea4a04004509a5c7d553321301704e8947547677b5827a76f817d";
  const CONTRACT_ADDRESS = "0xac39E56e9eF34aE94CDb304dcc223534546f3323";

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // Минимальный ABI для вызова функции нашего контракта
  const abi = [
    "function requestValidation(string calldata text) external returns (uint256)"
  ];

  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  console.log("Отправляем запрос на валидацию текста в контракт...");
  
  // Текст, который мы хотим проверить на ИИ
  const textToTest = "This is a completely human written text for testing purposes.";
  
  const tx = await contract.requestValidation(textToTest);
  console.log(`Транзакция отправлена! Хэш: ${tx.hash}`);
  
  await tx.wait();
  console.log("Транзакция успешно подтверждена в Ritual Chain!");
}

main().catch((error) => {
  console.error("Ошибка при отправке запроса:", error);
  process.exitCode = 1;
});