package main

// DocumentRecord is the canonical document state stored on the ledger.
type DocumentRecord struct {
	DocHash       string            `json:"docHash"`
	IPFSCID       string            `json:"ipfsCID"`
	OwnerID       string            `json:"ownerId"`
	DeviceID      string            `json:"deviceId"`
	Timestamp     string            `json:"timestamp"`
	DocType       string            `json:"docType"`
	Metadata      map[string]string `json:"metadata"`
	ActiveDispute bool              `json:"activeDispute"`
	DisputeCaseID string            `json:"disputeCaseId"`
	RiskScore     float64           `json:"riskScore"`
	CreatedAt     string            `json:"createdAt"`
}

// DisputeRecord tracks dispute lifecycle details against a document hash.
type DisputeRecord struct {
	CaseID     string `json:"caseId"`
	DocHash    string `json:"docHash"`
	FiledBy    string `json:"filedBy"`
	FiledAt    string `json:"filedAt"`
	Resolved   bool   `json:"resolved"`
	ResolvedAt string `json:"resolvedAt"`
}
