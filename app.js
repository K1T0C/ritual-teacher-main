// Ritual Teacher — browser client for Ritual Chain (1979) + AgentDeployer + LLM precompile 0x0802

const RITUAL_CHAIN_ID = 1979;
const RITUAL_CHAIN_HEX = '0x7BB';
const RITUAL_RPC_URL = 'https://rpc.ritualfoundation.org';

// ЖЁСТКО ЗАШИВАЕМ АДРЕС ТВОЕГО УСПЕШНОГО ДЕПЛОЯ
let AGENT_DEPLOYER_ADDRESS = '0x7a7636ac94a68Ba0C7061c3ab2c8773F867d448D';
const SERVICE_FEE_WEI = '0x71AFD498D0000'; // 0.002 RIT

const AGENT_DEPLOYER_ABI = [
    'function processText(uint8 action, string messagesJson, int256 temperature) payable returns (bool hasError, bytes completionData)',
    'event TextProcessed(address indexed requester, uint8 indexed action, bool hasError, bytes completionData, string errorMessage)',
];

const ACTION_ENUM = {
    check: 0,
    humanize: 1,
    'train-diagnostic': 2,
    'train-prompting': 3,
    'train-action': 4,
    doctor: 5,
};

async function loadRitualConfig() {
    try {
        const res = await fetch('/api/ritual/config');
        if (!res.ok) return;
        const cfg = await res.json();
        if (cfg.agentDeployer && cfg.agentDeployer !== '0x0000000000000000000000000000000000000000') {
            AGENT_DEPLOYER_ADDRESS = cfg.agentDeployer;
        }
    } catch (err) {
        console.warn('Ritual config unavailable:', err);
    }
}

async function ensureRitualNetwork(ethereum) {
    const chainId = await ethereum.request({ method: 'eth_chainId' });
    if (chainId === RITUAL_CHAIN_HEX) return;

    try {
        await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: RITUAL_CHAIN_HEX }],
        });
    } catch (switchError) {
        if (switchError.code !== 4902) throw switchError;
        await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
                chainId: RITUAL_CHAIN_HEX,
                chainName: 'Ritual',
                nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
                rpcUrls: [RITUAL_RPC_URL],
                blockExplorerUrls: ['https://explorer.ritualfoundation.org'],
            }],
        });
    }
}

async function buildMessagesPayload(action, text) {
    const res = await fetch('/api/ritual/build-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text }),
    });
    if (!res.ok) {
        throw new Error('Failed to build Ritual LLM messages');
    }
    return res.json();
}

async function decodeRitualReceipt(txHash) {
    for (let attempt = 0; attempt < 24; attempt++) {
        const res = await fetch('/api/ritual/decode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txHash }),
        });
        const data = await res.json();
        if (res.ok && data.result) return data.result;
        await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error('Ritual LLM result not ready. Check the tx on explorer and retry decode.');
}

async function callAgentDeployer(action, text) {
    if (typeof window.ethereum === 'undefined') {
        throw new Error('Install MetaMask to use Ritual Academy.');
    }

    if (
        !AGENT_DEPLOYER_ADDRESS ||
        AGENT_DEPLOYER_ADDRESS === '0x0000000000000000000000000000000000000000'
    ) {
        throw new Error('Deploy AgentDeployer.sol and set AGENT_DEPLOYER_ADDRESS in .env');
    }

    await ensureRitualNetwork(window.ethereum);

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const account = accounts[0];
    const { messagesJson, temperature, actionEnum } = await buildMessagesPayload(action, text);

    // Используем встроенный интерфейс ethers для кодирования транзакции
    const iface = new ethers.utils.Interface(AGENT_DEPLOYER_ABI);
    const data = iface.encodeFunctionData('processText', [
        actionEnum ?? ACTION_ENUM[action] ?? ACTION_ENUM.doctor,
        messagesJson,
        temperature,
    ]);

    const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
            from: account,
            to: AGENT_DEPLOYER_ADDRESS,
            data,
            value: SERVICE_FEE_WEI,
            gas: '0x2DC6C0', // 3,000,000
        }],
    });

    return decodeRitualReceipt(txHash);
}

async function handleProcess(action) {
    const inputId = action === 'check' ? 'checkTextInput' : 'humanizeTextInput';
    const userInput = document.getElementById(inputId)?.value;
    if (!userInput) {
        if (typeof addLog === 'function') addLog('Error: Input field is empty');
        return;
    }

    if (typeof addLog === 'function') {
        addLog(`Initiating ${action.toUpperCase()} via Ritual LLM (0x0802)...`);
    }

    try {
        const aiResult = await callAgentDeployer(action, userInput);

        if (action === 'humanize') {
            const resPanel = document.getElementById('humanResultPanel');
            const resText = document.getElementById('humanResultText');
            resPanel?.classList.remove('d-none');
            if (resText) resText.innerText = aiResult;
        } else {
            const label = document.getElementById('checkResultLabel');
            if (label) label.innerText = `Report: ${aiResult}`;
        }

        if (typeof addLog === 'function') addLog('Execution success via Ritual Chain');
    } catch (error) {
        console.error(error);
        if (typeof addLog === 'function') addLog(`Error: ${error.message}`);
        alert(error.message || 'Ritual transaction failed');
    }
}

async function handleDiagnosis(actionType) {
    const errorLog = document.getElementById('error-input')?.value;
    if (!errorLog) {
        alert('Сначала вставьте текст!');
        return;
    }

    const resultDiv = document.getElementById('doctor-result');
    const resultText = document.getElementById('doctor-text');
    if (resultText) resultText.innerText = 'Ожидание оплаты и Ritual LLM...';
    if (resultDiv) resultDiv.style.display = 'block';

    try {
        const diagnosis = await callAgentDeployer(actionType || 'doctor', errorLog);
        if (resultText) resultText.innerText = diagnosis;
    } catch (error) {
        console.error(error);
        alert('Для работы ассистента нужно подтвердить транзакцию в сети Ritual (Chain ID 1979).');
        if (resultText) resultText.innerText = `Ошибка: ${error.message}`;
    }
}

async function payAndCure() {
    const logs = document.getElementById('nodeLogs')?.value;
    if (!logs) {
        alert('Please paste your node logs first!');
        return;
    }

    const payButton = document.getElementById('payButton');
    if (payButton) {
        payButton.innerText = 'WAITING FOR RITUAL TX...';
        payButton.disabled = true;
    }

    const resultDiv = document.getElementById('diagnosisResult');
    const doctorReply = document.getElementById('doctorReply');
    if (resultDiv) resultDiv.classList.remove('d-none');
    if (doctorReply) doctorReply.innerHTML = '<span class="text-info">Ritual LLM is analyzing logs...</span>';

    try {
        const reply = await callAgentDeployer('doctor', logs);
        if (doctorReply) doctorReply.innerHTML = `<div class="text-success">${reply}</div>`;
        if (payButton) payButton.innerText = 'TREATMENT COMPLETE';
    } catch (error) {
        console.error(error);
        if (doctorReply) {
            doctorReply.innerHTML = `<span class="text-danger">Error: ${error.message}</span>`;
        }
        if (payButton) {
            payButton.innerText = 'PAY AND CURE';
            payButton.disabled = false;
        }
        alert(error.message || 'Transaction failed or canceled.');
    }
}

loadRitualConfig();