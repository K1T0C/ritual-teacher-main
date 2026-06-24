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

/// @title AgentDeployer
/// @notice Accepts a service fee, then runs Ritual LLM precompile (0x0802) inference in the same tx.
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

    /// @notice Owner deposits native RIT into RitualWallet to cover async LLM executor fees.
    function depositInferenceFees() external payable onlyOwner {
        IRitualWallet(RITUAL_WALLET).deposit{value: msg.value}(5000);
    }

    function withdrawFees() external onlyOwner {
        (bool ok, ) = owner.call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    /// @param action Used for analytics/events; prompts are supplied in messagesJson by the client.
    /// @param messagesJson OpenAI-style JSON array built off-chain.
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

    function _encodeLLMRequest(
        address executor,
        string memory messagesJson,
        int256 temperature
    ) internal pure returns (bytes memory) {
        return
            abi.encode(
                executor,
                new bytes[](0),
                uint256(300),
                new bytes[](0),
                bytes(""),
                messagesJson,
                MODEL,
                int256(0),
                "",
                false,
                int256(4096),
                "",
                "",
                uint256(1),
                true,
                int256(0),
                "medium",
                bytes(""),
                int256(-1),
                "auto",
                "",
                false,
                temperature,
                bytes(""),
                bytes(""),
                int256(-1),
                int256(1000),
                "",
                false,
                abi.encode("", "", "")
            );
    }
}
