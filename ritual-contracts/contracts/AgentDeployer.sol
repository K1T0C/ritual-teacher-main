// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITEEServiceRegistry {
    function pickServiceByCapability(
        uint8 capability,
        bool checkValidity,
        uint256 seed,
        uint256 maxProbes
    ) external view returns (address teeAddress, bool found);
}

interface IRitualWallet {
    function deposit(uint256 lockDuration) external payable;
}

// Официальные типы данных для прекомпилятора Ritual LLM (0x0802)
library RitualTypes {
    struct Message {
        string role;
        string content;
    }

    struct KeyReference {
        string platform;
        string path;
        string keyRef;
    }

    struct LLMCallRequest {
        address executor;
        bytes[] images;
        uint256 maxTokens;
        bytes[] stop;
        bytes responseFormat;
        string messagesJson; 
        string model;
        int256 frequencyPenalty;
        string logitBias;
        bool logprobs;
        int256 topLogprobs;
        string n;
        string presencePenalty;
        uint256 seed;
        bool stream;
        int256 streamOptions;
        string subchannel;
        bytes tools;
        int256 topP;
        string user;
        string errors;
        bool hasError;
        int256 temperature;
        bytes toolChoice;
        bytes ParallelToolCalls;
        int256 timeout;
        int256 maxRetries;
        string service;
        bool useCache;
        KeyReference keyRef;
    }
}

contract AgentDeployer {
    address public constant LLM_PRECOMPILE = 0x0000000000000000000000000000000000000802;
    address public constant RITUAL_WALLET = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;
    address public constant TEE_REGISTRY = 0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F;
    string public constant MODEL = "zai-org/GLM-4.7-FP8";

    uint8 public constant CAPABILITY_LLM = 1;

    address public owner;
    address public payoutWallet;
    uint256 public serviceFee;

    enum ActionType {
        Check,
        Humanize,
        TrainDiagnostic,
        TrainPrompting,
        TrainAction,
        Doctor
    }

    event ServiceFeeUpdated(uint256 newFee);
    event PayoutWalletUpdated(address newWallet);
    event TextProcessed(
        address indexed requester,
        ActionType indexed action,
        bool hasError,
        bytes completionData,
        string errorMessage
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _payoutWallet, uint256 _serviceFee) {
        require(_payoutWallet != address(0), "Invalid payout wallet");
        owner = msg.sender;
        payoutWallet = _payoutWallet;
        serviceFee = _serviceFee;
    }

    receive() external payable {}

    function setServiceFee(uint256 _serviceFee) external onlyOwner {
        serviceFee = _serviceFee;
        emit ServiceFeeUpdated(_serviceFee);
    }

    function setPayoutWallet(address _payoutWallet) external onlyOwner {
        require(_payoutWallet != address(0), "Invalid payout wallet");
        payoutWallet = _payoutWallet;
        emit PayoutWalletUpdated(_payoutWallet);
    }

    function depositInferenceFees() external payable onlyOwner {
        IRitualWallet(RITUAL_WALLET).deposit{value: msg.value}(5000);
    }

    function withdrawFees() external onlyOwner {
        (bool ok, ) = owner.call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    function processText(
        ActionType action,
        string calldata messagesJson,
        int256 temperature
    ) external payable returns (bool hasError, bytes memory completionData) {
        require(msg.value >= serviceFee, "Insufficient service fee");

        (bool feeSent, ) = payoutWallet.call{value: serviceFee}("");
        require(feeSent, "Fee transfer failed");

        uint256 excess = msg.value - serviceFee;
        if (excess > 0) {
            (bool refunded, ) = msg.sender.call{value: excess}("");
            require(refunded, "Refund failed");
        }

        address executor = _pickExecutor();
        bytes memory input = _encodeLLMRequest(executor, messagesJson, temperature);

        (bool success, bytes memory result) = LLM_PRECOMPILE.call(input);
        require(success, "LLM precompile call failed");

        (, bytes memory actualOutput) = abi.decode(result, (bytes, bytes));

        string memory errorMsg;
        bytes memory modelMeta;
        string memory platform;
        string memory path;
        string memory keyRef;
        (hasError, completionData, modelMeta, errorMsg, platform, path, keyRef) = abi.decode(
            actualOutput,
            (bool, bytes, bytes, string, string, string, string)
        );

        emit TextProcessed(msg.sender, action, hasError, completionData, errorMsg);
    }

    function _pickExecutor() internal view returns (address executor) {
        uint256 seed = uint256(
            keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender))
        );
        bool found;
        (executor, found) = ITEEServiceRegistry(TEE_REGISTRY).pickServiceByCapability(
            CAPABILITY_LLM,
            true,
            seed,
            8
        );
        require(found, "No LLM executor available");
    }

    // Безопасное кодирование структуры по официальному стандарту Ritual Chain
    function _encodeLLMRequest(
        address executor,
        string memory messagesJson,
        int256 temperature
    ) internal pure returns (bytes memory) {
        RitualTypes.LLMCallRequest memory req;
        req.executor = executor;
        req.images = new bytes[](0);
        req.maxTokens = 4096;
        req.stop = new bytes[](0);
        req.responseFormat = "";
        req.messagesJson = messagesJson;
        req.model = MODEL;
        req.frequencyPenalty = 0;
        req.logitBias = "";
        req.logprobs = false;
        req.topLogprobs = -1;
        req.n = "1";
        req.presencePenalty = "0";
        req.seed = 1;
        req.stream = false;
        req.streamOptions = -1;
        req.subchannel = "medium";
        req.tools = "";
        req.topP = -1;
        req.user = "";
        req.errors = "";
        req.hasError = false;
        req.temperature = temperature;
        req.toolChoice = "";
        req.ParallelToolCalls = "";
        req.timeout = -1;
        req.maxRetries = 1000;
        req.service = "auto";
        req.useCache = false;
        req.keyRef = RitualTypes.KeyReference("", "", "");

        return abi.encode(req);
    }
}