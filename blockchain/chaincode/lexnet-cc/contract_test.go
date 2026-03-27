package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-chaincode-go/shimtest"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-protos-go/ledger/queryresult"
	peer "github.com/hyperledger/fabric-protos-go/peer"
)

var txCounter uint64

type historyCapableStub struct {
	shim.ChaincodeStubInterface
	historyByKey map[string][]*queryresult.KeyModification
}

func (s *historyCapableStub) GetHistoryForKey(key string) (shim.HistoryQueryIteratorInterface, error) {
	history, ok := s.historyByKey[key]
	if !ok {
		history = []*queryresult.KeyModification{}
	}

	return &mockHistoryIterator{entries: history}, nil
}

type mockHistoryIterator struct {
	entries []*queryresult.KeyModification
	index   int
}

func (it *mockHistoryIterator) HasNext() bool {
	return it.index < len(it.entries)
}

func (it *mockHistoryIterator) Next() (*queryresult.KeyModification, error) {
	if !it.HasNext() {
		return nil, fmt.Errorf("no more history entries")
	}

	entry := it.entries[it.index]
	it.index++
	return entry, nil
}

func (it *mockHistoryIterator) Close() error {
	return nil
}

type historyTxContext struct {
	contractapi.TransactionContextInterface
	stub shim.ChaincodeStubInterface
}

func (c *historyTxContext) GetStub() shim.ChaincodeStubInterface {
	return c.stub
}

func nextTxID() string {
	return fmt.Sprintf("tx-%d", atomic.AddUint64(&txCounter, 1))
}

func newLexNetMockStub(t *testing.T) *shimtest.MockStub {
	t.Helper()

	cc, err := contractapi.NewChaincode(&LexNetContract{})
	if err != nil {
		t.Fatalf("failed to create chaincode: %v", err)
	}

	return shimtest.NewMockStub("lexnet-cc", cc)
}

func invoke(stub *shimtest.MockStub, function string, args ...string) peer.Response {
	invocation := make([][]byte, 0, len(args)+1)
	invocation = append(invocation, []byte(function))
	for _, arg := range args {
		invocation = append(invocation, []byte(arg))
	}

	resp := stub.MockInvoke(nextTxID(), invocation)
	if resp.Status == int32(shim.OK) {
		return resp
	}

	// Contract API transactions can also be addressed as ContractName:Function.
	prefixed := make([][]byte, 0, len(args)+1)
	prefixed = append(prefixed, []byte("LexNetContract:"+function))
	for _, arg := range args {
		prefixed = append(prefixed, []byte(arg))
	}

	prefixedResp := stub.MockInvoke(nextTxID(), prefixed)
	if prefixedResp.Status == int32(shim.OK) {
		return prefixedResp
	}

	return resp
}

func requireOK(t *testing.T, resp peer.Response, context string) {
	t.Helper()

	if resp.Status != int32(shim.OK) {
		t.Fatalf("%s failed with status=%d message=%s", context, resp.Status, resp.Message)
	}
}

func requireErrorContains(t *testing.T, resp peer.Response, want string) {
	t.Helper()

	if resp.Status == int32(shim.OK) {
		t.Fatalf("expected failure containing %q, got success payload=%s", want, string(resp.Payload))
	}
	if !strings.Contains(resp.Message, want) {
		t.Fatalf("expected error containing %q, got %q", want, resp.Message)
	}
}

func decodeDocument(t *testing.T, payload []byte) DocumentRecord {
	t.Helper()

	var record DocumentRecord
	if err := json.Unmarshal(payload, &record); err != nil {
		t.Fatalf("failed to unmarshal document payload: %v", err)
	}

	return record
}

func decodeDocuments(t *testing.T, payload []byte) []DocumentRecord {
	t.Helper()

	var records []DocumentRecord
	if err := json.Unmarshal(payload, &records); err != nil {
		t.Fatalf("failed to unmarshal document list payload: %v", err)
	}

	return records
}

func mustStoreDocument(t *testing.T, stub *shimtest.MockStub, docHash string, ownerID string) {
	t.Helper()

	resp := invoke(
		stub,
		"StoreDocument",
		docHash,
		"cid-"+docHash,
		ownerID,
		"device-01",
		"1710500000",
		"SALE_DEED",
		`{"docType":"SALE_DEED","ownerId":"`+ownerID+`"}`,
	)
	requireOK(t, resp, "StoreDocument")
}

func TestStoreAndGetDocumentSuccess(t *testing.T) {
	stub := newLexNetMockStub(t)
	mustStoreDocument(t, stub, "hash-001", "owner-A")

	resp := invoke(stub, "GetDocument", "hash-001")
	requireOK(t, resp, "GetDocument")

	doc := decodeDocument(t, resp.Payload)
	if doc.DocHash != "hash-001" {
		t.Fatalf("unexpected doc hash: %s", doc.DocHash)
	}
	if doc.OwnerID != "owner-A" {
		t.Fatalf("unexpected owner: %s", doc.OwnerID)
	}
	if doc.ActiveDispute {
		t.Fatal("expected no active dispute")
	}
	if doc.CreatedAt == "" {
		t.Fatal("expected createdAt to be populated")
	}
}

func TestStoreDocumentRejectsDuplicate(t *testing.T) {
	stub := newLexNetMockStub(t)
	mustStoreDocument(t, stub, "hash-dup", "owner-A")

	resp := invoke(
		stub,
		"StoreDocument",
		"hash-dup",
		"cid-dup",
		"owner-A",
		"device-01",
		"1710500000",
		"SALE_DEED",
		`{"docType":"SALE_DEED"}`,
	)
	requireErrorContains(t, resp, "document already exists")
}

func TestStoreDocumentRejectsEmptyDocHash(t *testing.T) {
	stub := newLexNetMockStub(t)

	resp := invoke(
		stub,
		"StoreDocument",
		"",
		"cid-empty",
		"owner-A",
		"device-01",
		"1710500000",
		"SALE_DEED",
		`{"docType":"SALE_DEED"}`,
	)
	requireErrorContains(t, resp, "docHash must not be empty")
}

func TestStoreDocumentRejectsInvalidMetadata(t *testing.T) {
	stub := newLexNetMockStub(t)

	resp := invoke(
		stub,
		"StoreDocument",
		"hash-bad-meta",
		"cid-bad-meta",
		"owner-A",
		"device-01",
		"1710500000",
		"SALE_DEED",
		`{"docType":123}`,
	)
	requireErrorContains(t, resp, "metadata must be valid JSON object")
}

func TestTransferDocumentSuccessUpdatesOwnerIndex(t *testing.T) {
	stub := newLexNetMockStub(t)
	mustStoreDocument(t, stub, "hash-transfer-ok", "owner-old")

	transferResp := invoke(stub, "TransferDocument", "hash-transfer-ok", "owner-new")
	requireOK(t, transferResp, "TransferDocument")

	oldOwnerResp := invoke(stub, "GetDocumentsByOwner", "owner-old")
	requireOK(t, oldOwnerResp, "GetDocumentsByOwner(old)")
	oldOwnerDocs := decodeDocuments(t, oldOwnerResp.Payload)
	if len(oldOwnerDocs) != 0 {
		t.Fatalf("expected old owner to have 0 docs, got %d", len(oldOwnerDocs))
	}

	newOwnerResp := invoke(stub, "GetDocumentsByOwner", "owner-new")
	requireOK(t, newOwnerResp, "GetDocumentsByOwner(new)")
	newOwnerDocs := decodeDocuments(t, newOwnerResp.Payload)
	if len(newOwnerDocs) != 1 {
		t.Fatalf("expected new owner to have 1 doc, got %d", len(newOwnerDocs))
	}
	if newOwnerDocs[0].DocHash != "hash-transfer-ok" {
		t.Fatalf("unexpected doc hash in new owner index: %s", newOwnerDocs[0].DocHash)
	}
	if newOwnerDocs[0].OwnerID != "owner-new" {
		t.Fatalf("expected owner-new, got %s", newOwnerDocs[0].OwnerID)
	}
}

func TestTransferBlockedWhenDisputeActive(t *testing.T) {
	stub := newLexNetMockStub(t)
	mustStoreDocument(t, stub, "hash-transfer-blocked", "owner-A")

	addResp := invoke(stub, "AddDispute", "hash-transfer-blocked", "CASE-100", "clerk")
	requireOK(t, addResp, "AddDispute")

	transferResp := invoke(stub, "TransferDocument", "hash-transfer-blocked", "owner-B")
	requireErrorContains(t, transferResp, "active dispute")
}

func TestAddDisputeSetsDocumentFlagAndRecord(t *testing.T) {
	stub := newLexNetMockStub(t)
	mustStoreDocument(t, stub, "hash-dispute-add", "owner-A")

	resp := invoke(stub, "AddDispute", "hash-dispute-add", "CASE-200", "registrar")
	requireOK(t, resp, "AddDispute")

	getResp := invoke(stub, "GetDocument", "hash-dispute-add")
	requireOK(t, getResp, "GetDocument")
	doc := decodeDocument(t, getResp.Payload)
	if !doc.ActiveDispute {
		t.Fatal("expected ActiveDispute to be true")
	}
	if doc.DisputeCaseID != "CASE-200" {
		t.Fatalf("unexpected dispute case id: %s", doc.DisputeCaseID)
	}

	disputeKey := disputeStateKey("CASE-200", "hash-dispute-add")
	state, err := stub.GetState(disputeKey)
	if err != nil {
		t.Fatalf("failed to read dispute state: %v", err)
	}
	if len(state) == 0 {
		t.Fatal("expected dispute state to be present")
	}

	var dispute DisputeRecord
	if err := json.Unmarshal(state, &dispute); err != nil {
		t.Fatalf("failed to unmarshal dispute state: %v", err)
	}
	if dispute.Resolved {
		t.Fatal("expected dispute to be unresolved")
	}
}

func TestAddDisputeRejectsWhenAlreadyActive(t *testing.T) {
	stub := newLexNetMockStub(t)
	mustStoreDocument(t, stub, "hash-dispute-dup", "owner-A")

	first := invoke(stub, "AddDispute", "hash-dispute-dup", "CASE-201", "clerk")
	requireOK(t, first, "AddDispute(first)")

	second := invoke(stub, "AddDispute", "hash-dispute-dup", "CASE-202", "clerk")
	requireErrorContains(t, second, "already has active dispute")
}

func TestResolveDisputeLifecycleSuccess(t *testing.T) {
	stub := newLexNetMockStub(t)
	mustStoreDocument(t, stub, "hash-dispute-resolve", "owner-A")

	addResp := invoke(stub, "AddDispute", "hash-dispute-resolve", "CASE-300", "clerk")
	requireOK(t, addResp, "AddDispute")

	resolveResp := invoke(stub, "ResolveDispute", "hash-dispute-resolve", "CASE-300")
	requireOK(t, resolveResp, "ResolveDispute")

	getResp := invoke(stub, "GetDocument", "hash-dispute-resolve")
	requireOK(t, getResp, "GetDocument")
	doc := decodeDocument(t, getResp.Payload)
	if doc.ActiveDispute {
		t.Fatal("expected ActiveDispute to be false after resolve")
	}
	if doc.DisputeCaseID != "" {
		t.Fatalf("expected empty dispute case id, got %s", doc.DisputeCaseID)
	}

	disputeState, err := stub.GetState(disputeStateKey("CASE-300", "hash-dispute-resolve"))
	if err != nil {
		t.Fatalf("failed reading dispute state: %v", err)
	}
	if len(disputeState) == 0 {
		t.Fatal("expected dispute state to exist")
	}

	var dispute DisputeRecord
	if err := json.Unmarshal(disputeState, &dispute); err != nil {
		t.Fatalf("failed to decode dispute state: %v", err)
	}
	if !dispute.Resolved {
		t.Fatal("expected dispute to be marked resolved")
	}
	if dispute.ResolvedAt == "" {
		t.Fatal("expected dispute resolved timestamp")
	}
}

func TestGetDocumentHistoryIncludesRevisions(t *testing.T) {
	baseStub := newLexNetMockStub(t)
	historyStub := &historyCapableStub{
		ChaincodeStubInterface: baseStub,
		historyByKey: map[string][]*queryresult.KeyModification{
			documentStateKey("hash-history"): {
				{TxId: "tx-history-1", Value: []byte(`{"ownerId":"owner-A"}`)},
				{TxId: "tx-history-2", Value: []byte(`{"ownerId":"owner-B"}`)},
				{TxId: "tx-history-3", Value: []byte(`{"ownerId":"owner-C"}`)},
			},
		},
	}

	ctx := &historyTxContext{stub: historyStub}
	history, err := (&LexNetContract{}).GetDocumentHistory(ctx, "hash-history")
	if err != nil {
		t.Fatalf("GetDocumentHistory failed: %v", err)
	}

	if len(history) < 3 {
		t.Fatalf("expected at least 3 history entries, got %d", len(history))
	}

	owners := make([]string, 0, len(history))
	for _, item := range history {
		owners = append(owners, item.OwnerID)
	}
	sort.Strings(owners)
	joined := strings.Join(owners, ",")
	for _, expectedOwner := range []string{"owner-A", "owner-B", "owner-C"} {
		if !strings.Contains(joined, expectedOwner) {
			t.Fatalf("expected owner %s in history owners=%s", expectedOwner, joined)
		}
	}
}

func TestGetDocumentsByOwnerReturnsMatchingDocuments(t *testing.T) {
	stub := newLexNetMockStub(t)
	mustStoreDocument(t, stub, "hash-owner-a-1", "owner-A")
	mustStoreDocument(t, stub, "hash-owner-a-2", "owner-A")
	mustStoreDocument(t, stub, "hash-owner-b-1", "owner-B")

	resp := invoke(stub, "GetDocumentsByOwner", "owner-A")
	requireOK(t, resp, "GetDocumentsByOwner")
	docs := decodeDocuments(t, resp.Payload)
	if len(docs) != 2 {
		t.Fatalf("expected 2 docs for owner-A, got %d", len(docs))
	}

	hashes := []string{docs[0].DocHash, docs[1].DocHash}
	sort.Strings(hashes)
	if hashes[0] != "hash-owner-a-1" || hashes[1] != "hash-owner-a-2" {
		t.Fatalf("unexpected owner-A docs: %v", hashes)
	}
}

func TestVerifyDocumentReturnsNotFoundAndExists(t *testing.T) {
	stub := newLexNetMockStub(t)

	notFound := invoke(stub, "VerifyDocument", "hash-missing")
	requireOK(t, notFound, "VerifyDocument(not-found)")
	if string(notFound.Payload) != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND, got %s", string(notFound.Payload))
	}

	mustStoreDocument(t, stub, "hash-present", "owner-A")

	exists := invoke(stub, "VerifyDocument", "hash-present")
	requireOK(t, exists, "VerifyDocument(exists)")
	if string(exists.Payload) != "EXISTS" {
		t.Fatalf("expected EXISTS, got %s", string(exists.Payload))
	}
}
