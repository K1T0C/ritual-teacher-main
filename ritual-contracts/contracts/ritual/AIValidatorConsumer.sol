// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AIValidator {
    address public owner;

    enum DataType { TEXT, FILE_HASH }

    struct ValidationRequest {
        address requester;
        DataType dataType;
        string dataPayload; // Сам текст или CID/хеш файла
        bool isProcessed;
        bool isAI;
        uint256 aiProbability;
        string verdict;
    }

    mapping(uint256 => ValidationRequest) public requests;
    uint256 public nextRequestId;

    event ValidationRequested(
        uint256 indexed requestId,
        address indexed requester,
        DataType dataType,
        string dataPayload
    );

    event ValidationFulfilled(
        uint256 indexed requestId,
        bool isAI,
        uint256 aiProbability,
        string verdict
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Запрос на валидацию ТЕКСТА
    function requestTextValidation(string calldata _text) external returns (uint256) {
        uint256 requestId = nextRequestId++;
        requests[requestId] = ValidationRequest({
            requester: msg.sender,
            dataType: DataType.TEXT,
            dataPayload: _text,
            isProcessed: false,
            isAI: false,
            aiProbability: 0,
            verdict: ""
        });

        emit ValidationRequested(requestId, msg.sender, DataType.TEXT, _text);
        return requestId;
    }

    // Запрос на валидацию ФАЙЛА (передается хеш файла или ссылка на IPFS/Arweave)
    function requestFileValidation(string calldata _fileHash) external returns (uint256) {
        uint256 requestId = nextRequestId++;
        requests[requestId] = ValidationRequest({
            requester: msg.sender,
            dataType: DataType.FILE_HASH,
            dataPayload: _fileHash,
            isProcessed: false,
            isAI: false,
            aiProbability: 0,
            verdict: ""
        });

        emit ValidationRequested(requestId, msg.sender, DataType.FILE_HASH, _fileHash);
        return requestId;
    }

    // Функция, которую вызывает наш ИИ-агент (Оракул) для записи результата
    function fulfillValidation(
        uint256 _requestId,
        bool _isAI,
        uint256 _aiProbability,
        string calldata _verdict
    ) external onlyOwner {
        ValidationRequest storage req = requests[_requestId];
        require(!req.isProcessed, "Request already processed");

        req.isProcessed = true;
        req.isAI = _isAI;
        req.aiProbability = _aiProbability;
        req.verdict = _verdict;

        emit ValidationFulfilled(_requestId, _isAI, _aiProbability, _verdict);
    }
}