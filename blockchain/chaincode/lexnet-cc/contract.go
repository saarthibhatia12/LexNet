package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

const (
	docKeyPrefix      = "DOC_"
	disputeKeyPrefix  = "DISPUTE_"
	ownerDocIndexName = "owner~docHash"
)

// LexNetContract is the contract root; transaction functions are added in BC3.
type LexNetContract struct {
	contractapi.Contract
}

func (c *LexNetContract) StoreDocument(
	ctx contractapi.TransactionContextInterface,
	docHash string,
	ipfsCID string,
	ownerID string,
	deviceID string,
	timestamp string,
	docType string,
	metadataJSON string,
) error {
	if err := validateRequired("docHash", docHash); err != nil {
		return err
	}
	if err := validateRequired("ipfsCID", ipfsCID); err != nil {
		return err
	}
	if err := validateRequired("ownerID", ownerID); err != nil {
		return err
	}
	if err := validateRequired("deviceID", deviceID); err != nil {
		return err
	}
	if err := validateRequired("timestamp", timestamp); err != nil {
		return err
	}
	if err := validateRequired("docType", docType); err != nil {
		return err
	}

	docKey := documentStateKey(docHash)
	existing, err := ctx.GetStub().GetState(docKey)
	if err != nil {
		return fmt.Errorf("failed to read existing state for %s: %w", docHash, err)
	}
	if existing != nil {
		return fmt.Errorf("document already exists: %s", docHash)
	}

	metadata, err := parseMetadataJSON(metadataJSON)
	if err != nil {
		return err
	}

	createdAt, err := txTimeRFC3339(ctx)
	if err != nil {
		return err
	}

	record := DocumentRecord{
		DocHash:       docHash,
		IPFSCID:       ipfsCID,
		OwnerID:       ownerID,
		DeviceID:      deviceID,
		Timestamp:     timestamp,
		DocType:       docType,
		Metadata:      metadata,
		ActiveDispute: false,
		DisputeCaseID: "",
		RiskScore:     0,
		CreatedAt:     createdAt,
	}

	if err := putDocumentRecord(ctx, &record); err != nil {
		return err
	}

	ownerDocKey, err := ctx.GetStub().CreateCompositeKey(ownerDocIndexName, []string{ownerID, docHash})
	if err != nil {
		return fmt.Errorf("failed to create owner index key for %s: %w", docHash, err)
	}
	if err := ctx.GetStub().PutState(ownerDocKey, []byte{0}); err != nil {
		return fmt.Errorf("failed to persist owner index for %s: %w", docHash, err)
	}

	return nil
}

func (c *LexNetContract) GetDocument(ctx contractapi.TransactionContextInterface, docHash string) (*DocumentRecord, error) {
	if err := validateRequired("docHash", docHash); err != nil {
		return nil, err
	}

	record, err := getDocumentRecord(ctx, docHash)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return nil, fmt.Errorf("document not found: %s", docHash)
	}

	return record, nil
}

func (c *LexNetContract) GetDocumentHistory(ctx contractapi.TransactionContextInterface, docHash string) ([]DocumentRecord, error) {
	if err := validateRequired("docHash", docHash); err != nil {
		return nil, err
	}

	iter, err := ctx.GetStub().GetHistoryForKey(documentStateKey(docHash))
	if err != nil {
		return nil, fmt.Errorf("failed to get history for %s: %w", docHash, err)
	}
	defer iter.Close()

	history := make([]DocumentRecord, 0)
	for iter.HasNext() {
		mod, nextErr := iter.Next()
		if nextErr != nil {
			return nil, fmt.Errorf("failed to iterate history for %s: %w", docHash, nextErr)
		}

		if mod.IsDelete || len(mod.Value) == 0 {
			continue
		}

		var record DocumentRecord
		if unmarshalErr := json.Unmarshal(mod.Value, &record); unmarshalErr != nil {
			return nil, fmt.Errorf("failed to decode historical document for %s: %w", docHash, unmarshalErr)
		}

		history = append(history, record)
	}

	return history, nil
}

func (c *LexNetContract) TransferDocument(ctx contractapi.TransactionContextInterface, docHash string, newOwnerID string) error {
	if err := validateRequired("docHash", docHash); err != nil {
		return err
	}
	if err := validateRequired("newOwnerID", newOwnerID); err != nil {
		return err
	}

	record, err := c.GetDocument(ctx, docHash)
	if err != nil {
		return err
	}
	if record.ActiveDispute {
		return fmt.Errorf("document has active dispute and cannot be transferred: %s", docHash)
	}

	oldOwner := record.OwnerID
	record.OwnerID = newOwnerID

	if err := putDocumentRecord(ctx, record); err != nil {
		return err
	}

	oldOwnerKey, err := ctx.GetStub().CreateCompositeKey(ownerDocIndexName, []string{oldOwner, docHash})
	if err != nil {
		return fmt.Errorf("failed to create old owner index key for %s: %w", docHash, err)
	}
	if err := ctx.GetStub().DelState(oldOwnerKey); err != nil {
		return fmt.Errorf("failed to delete old owner index for %s: %w", docHash, err)
	}

	newOwnerKey, err := ctx.GetStub().CreateCompositeKey(ownerDocIndexName, []string{newOwnerID, docHash})
	if err != nil {
		return fmt.Errorf("failed to create new owner index key for %s: %w", docHash, err)
	}
	if err := ctx.GetStub().PutState(newOwnerKey, []byte{0}); err != nil {
		return fmt.Errorf("failed to persist new owner index for %s: %w", docHash, err)
	}

	return nil
}

func (c *LexNetContract) AddDispute(ctx contractapi.TransactionContextInterface, docHash string, caseID string, filedBy string) error {
	if err := validateRequired("docHash", docHash); err != nil {
		return err
	}
	if err := validateRequired("caseID", caseID); err != nil {
		return err
	}
	if err := validateRequired("filedBy", filedBy); err != nil {
		return err
	}

	record, err := c.GetDocument(ctx, docHash)
	if err != nil {
		return err
	}
	if record.ActiveDispute {
		return fmt.Errorf("document already has active dispute: %s", docHash)
	}

	disputeKey := disputeStateKey(caseID, docHash)
	existing, err := ctx.GetStub().GetState(disputeKey)
	if err != nil {
		return fmt.Errorf("failed to read dispute state for %s: %w", disputeKey, err)
	}
	if existing != nil {
		return fmt.Errorf("dispute already exists for case %s and document %s", caseID, docHash)
	}

	filedAt, err := txTimeRFC3339(ctx)
	if err != nil {
		return err
	}

	dispute := DisputeRecord{
		CaseID:     caseID,
		DocHash:    docHash,
		FiledBy:    filedBy,
		FiledAt:    filedAt,
		Resolved:   false,
		ResolvedAt: "",
	}

	disputeBytes, err := json.Marshal(dispute)
	if err != nil {
		return fmt.Errorf("failed to marshal dispute for %s: %w", disputeKey, err)
	}
	if err := ctx.GetStub().PutState(disputeKey, disputeBytes); err != nil {
		return fmt.Errorf("failed to persist dispute state for %s: %w", disputeKey, err)
	}

	record.ActiveDispute = true
	record.DisputeCaseID = caseID
	if err := putDocumentRecord(ctx, record); err != nil {
		return err
	}

	return nil
}

func (c *LexNetContract) ResolveDispute(ctx contractapi.TransactionContextInterface, docHash string, caseID string) error {
	if err := validateRequired("docHash", docHash); err != nil {
		return err
	}
	if err := validateRequired("caseID", caseID); err != nil {
		return err
	}

	disputeKey := disputeStateKey(caseID, docHash)
	disputeBytes, err := ctx.GetStub().GetState(disputeKey)
	if err != nil {
		return fmt.Errorf("failed to read dispute state for %s: %w", disputeKey, err)
	}
	if disputeBytes == nil {
		return fmt.Errorf("dispute not found for case %s and document %s", caseID, docHash)
	}

	var dispute DisputeRecord
	if err := json.Unmarshal(disputeBytes, &dispute); err != nil {
		return fmt.Errorf("failed to decode dispute state for %s: %w", disputeKey, err)
	}
	if dispute.Resolved {
		return fmt.Errorf("dispute already resolved for case %s and document %s", caseID, docHash)
	}

	resolvedAt, err := txTimeRFC3339(ctx)
	if err != nil {
		return err
	}

	dispute.Resolved = true
	dispute.ResolvedAt = resolvedAt

	updatedDisputeBytes, err := json.Marshal(dispute)
	if err != nil {
		return fmt.Errorf("failed to marshal updated dispute for %s: %w", disputeKey, err)
	}
	if err := ctx.GetStub().PutState(disputeKey, updatedDisputeBytes); err != nil {
		return fmt.Errorf("failed to persist updated dispute for %s: %w", disputeKey, err)
	}

	record, err := c.GetDocument(ctx, docHash)
	if err != nil {
		return err
	}

	if record.DisputeCaseID != "" && record.DisputeCaseID != caseID {
		return fmt.Errorf("document %s is linked to dispute case %s, not %s", docHash, record.DisputeCaseID, caseID)
	}

	record.ActiveDispute = false
	record.DisputeCaseID = ""
	if err := putDocumentRecord(ctx, record); err != nil {
		return err
	}

	return nil
}

func (c *LexNetContract) GetDocumentsByOwner(ctx contractapi.TransactionContextInterface, ownerID string) ([]DocumentRecord, error) {
	if err := validateRequired("ownerID", ownerID); err != nil {
		return nil, err
	}

	iter, err := ctx.GetStub().GetStateByPartialCompositeKey(ownerDocIndexName, []string{ownerID})
	if err != nil {
		return nil, fmt.Errorf("failed to query owner index for %s: %w", ownerID, err)
	}
	defer iter.Close()

	documents := make([]DocumentRecord, 0)
	for iter.HasNext() {
		kv, nextErr := iter.Next()
		if nextErr != nil {
			return nil, fmt.Errorf("failed to iterate owner index for %s: %w", ownerID, nextErr)
		}

		_, attrs, splitErr := ctx.GetStub().SplitCompositeKey(kv.Key)
		if splitErr != nil {
			return nil, fmt.Errorf("failed to decode owner index key %s: %w", kv.Key, splitErr)
		}
		if len(attrs) != 2 {
			return nil, fmt.Errorf("invalid owner index key attributes for %s", kv.Key)
		}

		docHash := attrs[1]
		record, getErr := c.GetDocument(ctx, docHash)
		if getErr != nil {
			return nil, getErr
		}

		documents = append(documents, *record)
	}

	return documents, nil
}

func (c *LexNetContract) VerifyDocument(ctx contractapi.TransactionContextInterface, docHash string) (string, error) {
	if err := validateRequired("docHash", docHash); err != nil {
		return "", err
	}

	state, err := ctx.GetStub().GetState(documentStateKey(docHash))
	if err != nil {
		return "", fmt.Errorf("failed to verify document state for %s: %w", docHash, err)
	}
	if state == nil {
		return "NOT_FOUND", nil
	}

	return "EXISTS", nil
}

func validateRequired(field string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s must not be empty", field)
	}
	return nil
}

func parseMetadataJSON(metadataJSON string) (map[string]string, error) {
	trimmed := strings.TrimSpace(metadataJSON)
	if trimmed == "" {
		return map[string]string{}, nil
	}

	metadata := make(map[string]string)
	if err := json.Unmarshal([]byte(trimmed), &metadata); err != nil {
		return nil, fmt.Errorf("metadata must be valid JSON object with string values: %w", err)
	}

	return metadata, nil
}

func txTimeRFC3339(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("failed to read transaction timestamp: %w", err)
	}

	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339), nil
}

func documentStateKey(docHash string) string {
	return docKeyPrefix + docHash
}

func disputeStateKey(caseID string, docHash string) string {
	return disputeKeyPrefix + caseID + "_" + docHash
}

func getDocumentRecord(ctx contractapi.TransactionContextInterface, docHash string) (*DocumentRecord, error) {
	state, err := ctx.GetStub().GetState(documentStateKey(docHash))
	if err != nil {
		return nil, fmt.Errorf("failed to read document state for %s: %w", docHash, err)
	}
	if state == nil {
		return nil, nil
	}

	var record DocumentRecord
	if err := json.Unmarshal(state, &record); err != nil {
		return nil, fmt.Errorf("failed to decode document state for %s: %w", docHash, err)
	}

	return &record, nil
}

func putDocumentRecord(ctx contractapi.TransactionContextInterface, record *DocumentRecord) error {
	encoded, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal document record for %s: %w", record.DocHash, err)
	}

	if err := ctx.GetStub().PutState(documentStateKey(record.DocHash), encoded); err != nil {
		return fmt.Errorf("failed to persist document record for %s: %w", record.DocHash, err)
	}

	return nil
}
