// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract CallbackConsumer {
    address public immutable registry;

    modifier onlyRegistry() {
        require(msg.sender == registry, "Only registry can call");
        _;
    }

    constructor(address _registry) {
        registry = _registry;
    }

    function _requestInference(bytes memory input, uint32 subscriptionId) internal returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, input, subscriptionId)));
    }

    function _receiveInference(uint256 requestId, bytes memory inference, bytes memory proof) internal virtual;

    function rawReceiveInference(uint256 requestId, bytes calldata inference, bytes calldata proof) external onlyRegistry {
        _receiveInference(requestId, inference, proof);
    }
}