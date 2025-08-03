// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SecureInvoiceVault {
    struct Invoice {
        bytes32 id;
        address sender;
        bytes32 receiverKey; // X25519 public key for encryption
        bytes encryptedData; // e.g., AES/ECIES encrypted JSON
        uint256 totalAmount;
        uint256 paidAmount;
        bool paid;
        uint256 timestamp;
    }

    mapping(bytes32 => Invoice) private invoices;
    mapping(address => bytes32[]) private sentInvoices;
    mapping(bytes32 => bytes32[]) private receivedInvoices; // Keyed by receiverKey

    // Limit to prevent spam/DoS
    uint256 constant MAX_INVOICES_PER_ADDRESS = 100;

    event InvoiceCreated(bytes32 id, address indexed sender, bytes32 indexed receiverKey);
    event InvoicePaid(bytes32 id, address indexed payer, uint256 amount);

    function createInvoice(
        bytes32 receiverKey,
        bytes calldata encryptedData,
        uint256 totalAmount
    ) external {
        require(receiverKey != bytes32(0), "Receiver key required");
        require(receivedInvoices[receiverKey].length < MAX_INVOICES_PER_ADDRESS, "Receiver invoice limit reached");
        require(sentInvoices[msg.sender].length < MAX_INVOICES_PER_ADDRESS, "Sender invoice limit reached");

        bytes32 id = keccak256(abi.encode(msg.sender, receiverKey, block.timestamp, encryptedData));

        invoices[id] = Invoice({
            id: id,
            sender: msg.sender,
            receiverKey: receiverKey,
            encryptedData: encryptedData,
            totalAmount: totalAmount,
            paidAmount: 0,
            paid: false,
            timestamp: block.timestamp
        });

        sentInvoices[msg.sender].push(id);
        receivedInvoices[receiverKey].push(id);

        emit InvoiceCreated(id, msg.sender, receiverKey);
    }

    // Anyone can pay
    function payInvoice(bytes32 id) external payable {
        Invoice storage invoice = invoices[id];
        require(!invoice.paid, "Already paid");
        require(msg.value > 0, "Payment required");

        uint256 remaining = invoice.totalAmount - invoice.paidAmount;
        require(msg.value <= remaining, "Overpayment not allowed");

        invoice.paidAmount += msg.value;

        payable(invoice.sender).transfer(msg.value);

        if (invoice.paidAmount >= invoice.totalAmount) {
            invoice.paid = true;
        }

        emit InvoicePaid(id, msg.sender, msg.value);
    }

    function getSentInvoices() external view returns (bytes32[] memory) {
        return sentInvoices[msg.sender];
    }

    // Public: Anyone can query invoices for a key (lists are public, data encrypted)
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

    // Public: Anyone can query invoices for a key
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

    // Public: Anyone can view (data encrypted)
    function getInvoice(bytes32 id) external view returns (Invoice memory) {
        return invoices[id];
    }
}