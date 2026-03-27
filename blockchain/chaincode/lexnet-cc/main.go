package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&LexNetContract{})
	if err != nil {
		log.Fatalf("failed to create LexNet chaincode: %v", err)
	}

	if err := cc.Start(); err != nil {
		log.Fatalf("failed to start LexNet chaincode: %v", err)
	}
}
