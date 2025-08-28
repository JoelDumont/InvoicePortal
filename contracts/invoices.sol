// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract SecureInvoiceVault {
    struct Invoice {
        bytes32 id;
        address sender;
        bytes32 receiverKey;
        bytes encryptedData;
        bytes32 hash;
    }

    mapping(bytes32 => Invoice) private invoices;
    mapping(address => bytes32[]) private sentInvoices;
    mapping(bytes32 => bytes32[]) private receivedInvoices;

    event InvoiceCreated(bytes32 id, address indexed sender, bytes32 indexed receiverKey);

    function createInvoice(
        bytes32 receiverKey,
        bytes calldata encryptedData,
        bytes32 hash
    ) external {
        require(receiverKey != bytes32(0), "Receiver key required");
        require(hash != bytes32(0), "Hash required");

        bytes32 id = keccak256(abi.encode(msg.sender, receiverKey, encryptedData));

        invoices[id] = Invoice({
            id: id,
            sender: msg.sender,
            receiverKey: receiverKey,
            encryptedData: encryptedData,
            hash: hash
        });

        sentInvoices[msg.sender].push(id);
        receivedInvoices[receiverKey].push(id);

        emit InvoiceCreated(id, msg.sender, receiverKey);
    }

    function getSentInvoices() external view returns (bytes32[] memory) {
        return sentInvoices[msg.sender];
    }

    function getReceivedInvoices(bytes32 receiverKey) external view returns (bytes32[] memory) {
        return receivedInvoices[receiverKey];
    }

    function getInvoicesForSender(uint256 start, uint256 count) external view returns (Invoice[] memory) {
        bytes32[] memory sentIds = sentInvoices[msg.sender];
        uint256 length = sentIds.length;
        if (start >= length) return new Invoice[](0);

        uint256 end = start + count;
        if (end > length) end = length;

        Invoice[] memory result = new Invoice[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = invoices[sentIds[i]];
        }
        return result;
    }

    function getInvoicesForReceiver(bytes32 receiverKey, uint256 start, uint256 count) external view returns (Invoice[] memory) {
        bytes32[] memory recvIds = receivedInvoices[receiverKey];
        uint256 length = recvIds.length;
        if (start >= length) return new Invoice[](0);

        uint256 end = start + count;
        if (end > length) end = length;

        Invoice[] memory result = new Invoice[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = invoices[recvIds[i]];
        }
        return result;
    }

    function getInvoice(bytes32 id) external view returns (Invoice memory) {
        return invoices[id];
    }
}