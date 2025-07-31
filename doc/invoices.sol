// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SecureInvoiceVault {
    struct Invoice {
        bytes32 id;
        address sender;
        address receiver;
        bytes encryptedData; // e.g., AES/ECIES encrypted JSON
        uint256 totalAmount; 
        uint256 paidAmount;
        bool paid;
        bool accepted; 
        uint256 timestamp;
    }

    mapping(bytes32 => Invoice) private invoices; 
    mapping(address => bytes32[]) private sentInvoices;
    mapping(address => bytes32[]) private receivedInvoices;

    // Limit to prevent spam/DoS 
    uint256 constant MAX_INVOICES_PER_ADDRESS = 100;

    event InvoiceCreated(bytes32 id, address indexed sender, address indexed receiver);
    event InvoiceAccepted(bytes32 id, address indexed receiver);
    event InvoiceRejected(bytes32 id, address indexed receiver);
    event InvoicePaid(bytes32 id, address indexed payer, uint256 amount);

    modifier onlySenderOrReceiver(bytes32 id) {
        Invoice storage invoice = invoices[id];
        require(msg.sender == invoice.sender || msg.sender == invoice.receiver, "Access denied");
        _;
    }

    modifier onlyReceiver(bytes32 id) {
        Invoice storage invoice = invoices[id];
        require(msg.sender == invoice.receiver, "Not receiver");
        _;
    }

    function createInvoice(address receiver, bytes calldata encryptedData, uint256 totalAmount) external {
        require(receiver != address(0), "Receiver required");
        require(receivedInvoices[receiver].length < MAX_INVOICES_PER_ADDRESS, "Receiver invoice limit reached");
        require(sentInvoices[msg.sender].length < MAX_INVOICES_PER_ADDRESS, "Sender invoice limit reached");

        bytes32 id = keccak256(abi.encode(msg.sender, receiver, block.timestamp, encryptedData));

        invoices[id] = Invoice({
            id: id,
            sender: msg.sender,
            receiver: receiver,
            encryptedData: encryptedData,
            totalAmount: totalAmount,
            paidAmount: 0,
            paid: false,
            accepted: false, 
            timestamp: block.timestamp
        });

        sentInvoices[msg.sender].push(id);
        receivedInvoices[receiver].push(id);

        emit InvoiceCreated(id, msg.sender, receiver);
    }

    // Receiver must accept the invoice before paying
    function acceptInvoice(bytes32 id) external onlyReceiver(id) {
        Invoice storage invoice = invoices[id];
        require(!invoice.accepted, "Already accepted");
        require(!invoice.paid, "Already paid");

        invoice.accepted = true;
        emit InvoiceAccepted(id, msg.sender);
    }

    // Receiver can reject unwanted invoices to remove from list and prevent spam
    function rejectInvoice(bytes32 id) external onlyReceiver(id) {
        Invoice storage invoice = invoices[id];
        require(!invoice.accepted, "Cannot reject accepted invoice");
        require(!invoice.paid, "Cannot reject paid invoice");

        // Remove from receivedInvoices
        bytes32[] storage recvList = receivedInvoices[msg.sender];
        for (uint256 i = 0; i < recvList.length; i++) {
            if (recvList[i] == id) {
                recvList[i] = recvList[recvList.length - 1];
                recvList.pop();
                break;
            }
        }

        // Delete the invoice struct to save storage (refund gas)
        delete invoices[id];

        emit InvoiceRejected(id, msg.sender);
    }

    function payInvoice(bytes32 id) external payable onlyReceiver(id) {
        Invoice storage invoice = invoices[id];
        require(invoice.accepted, "Invoice not accepted");
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

    function getReceivedInvoices() external view returns (bytes32[] memory) {
        return receivedInvoices[msg.sender];
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

    function getInvoicesForReceiver(uint256 start, uint256 count) external view returns (Invoice[] memory) {
        bytes32[] memory recvIds = receivedInvoices[msg.sender];
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

    function getInvoice(bytes32 id) external view onlySenderOrReceiver(id) returns (Invoice memory) {
        return invoices[id];
    }
}