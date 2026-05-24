const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// Загружаем переменные строго из папки ritual-contracts
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const PROVIDER_URL = process.env.RPC_URL || "https://rpc.ritualfoundation.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const AGENT_URL = process.env.AGENT_URL || "http://localhost:3000";

// ABI нашего смарт-контракта
const ABI = [
    "event ValidationRequested(uint256 indexed requestId, address indexed requester, uint8 dataType, string dataPayload)",
    "function fulfillValidation(uint256 _requestId, bool _isAI, uint256 _aiProbability, string _verdict) external"
];

async function main() {
    if (!PRIVATE_KEY || !CONTRACT_ADDRESS) {
        console.error("❌ Ошибка: проверьте PRIVATE_KEY и CONTRACT_ADDRESS в вашем .env файле.");
        process.exit(1);
    }

    // Подключаемся к Ritual Chain напрямую
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL, undefined, {
        staticNetwork: true
    });

    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    console.log(`\n==================================================`);
    console.log(`📡 [СЛУШАТЕЛЬ RITUAL] Успешно запущен.`);
    console.log(`📍 RPC Сети:  ${PROVIDER_URL}`);
    console.log(`📍 Контракт:  ${CONTRACT_ADDRESS}`);
    console.log(`==================================================\n`);

    // Начинаем мониторинг с текущего блока Ritual Chain
    let lastCheckedBlock;
    try {
        lastCheckedBlock = await provider.getBlockNumber();
        console.log(`🔄 Стартуем мониторинг с блока №${lastCheckedBlock}`);
    } catch (err) {
        console.error("❌ Не удалось получить номер последнего блока от Ritual RPC:", err.message);
        process.exit(1);
    }

    // Запускаем бесконечный цикл опроса (Polling) каждые 4 секунды
    setInterval(async () => {
        try {
            const currentBlock = await provider.getBlockNumber();
            
            if (currentBlock > lastCheckedBlock) {
                const events = await contract.queryFilter(
                    "ValidationRequested", 
                    lastCheckedBlock + 1, 
                    currentBlock
                );

                for (const event of events) {
                    const { requestId, requester, dataType, dataPayload } = event.args;
                    console.log(`\n📥 [НОВОЕ СОБЫТИЕ RITUAL] Запрос #${requestId.toString()} от ${requester}`);
                    await processEvent(contract, requestId, dataType, dataPayload);
                }

                lastCheckedBlock = currentBlock;
            }
        } catch (err) {
            console.error("⚠️ [ОШИБКА ПОЛЛИНГА] Ошибка при проверке новых блоков, повторяем через 4с...");
        }
    }, 4000); 
}

async function processEvent(contract, requestId, dataType, dataPayload) {
    let isAI = false;
    let aiProbability = 0;
    let verdict = "ERROR";

    try {
        if (dataType === 0) {
            console.log(`📝 Тип: Текст. Анализируем: "${dataPayload.substring(0, 50)}..."`);
            const response = await axios.post(`${AGENT_URL}/api/check-ai`, { text: dataPayload });
            
            isAI = response.data.isAI;
            aiProbability = Math.round(response.data.aiProbability);
            verdict = response.data.verdict;
        } 
        else if (dataType === 1) {
            console.log(`📁 Тип: Файл. Ссылка/Хеш: ${dataPayload}`);
            const tempFilePath = path.join(__dirname, `temp_${requestId.toString()}.dat`);
            const writer = fs.createWriteStream(tempFilePath);

            const fileResponse = await axios({
                url: dataPayload,
                method: 'GET',
                responseType: 'stream'
            });

            fileResponse.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const form = new FormData();
            form.append('media', fs.createReadStream(tempFilePath), { filename: `file_${requestId.toString()}` });

            const agentResponse = await axios.post(`${AGENT_URL}/api/check-file`, form, { headers: form.getHeaders() });
            
            isAI = agentResponse.data.isAI;
            aiProbability = Math.round(agentResponse.data.aiProbability);
            verdict = agentResponse.data.verdict;

            fs.unlinkSync(tempFilePath);
        }

        console.log(`🤖 [ИИ-АГЕНТ ВЕРДИКТ] AI: ${isAI}, Вероятность: ${aiProbability}%, Статус: ${verdict}`);
        console.log(`📤 [BLOCKCHAIN] Отправляем транзакцию fulfillValidation в Ritual Chain...`);
        
        const tx = await contract.fulfillValidation(requestId, isAI, aiProbability, verdict);
        console.log(`⏳ Ждем подтверждения транзакции в Ritual Chain. Хеш: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ [УСПЕХ] Запрос #${requestId.toString()} успешно записан в блокчейн!`);

    } catch (error) {
        console.error(`❌ Ошибка при обработке запроса #${requestId.toString()}:`, error.message);
    }
}

main().catch((error) => {
    console.error("Критическая ошибка слушателя:", error);
});