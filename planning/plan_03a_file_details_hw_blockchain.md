# Section 3A — File-by-File Details: Firmware, Hardware Bridge, Blockchain

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## Firmware (`firmware/`)

### `Src/main.c`
- **Purpose**: System initialisation and main super-loop
- **Functions**:
  - `int main(void)` — HAL_Init, SystemClock_Config, MX_GPIO_Init, MX_USART2_UART_Init (57600 baud), MX_I2C1_Init (400kHz), fp_init(), oled_init(). Super-loop: oled_print("Place finger"), fp_capture() → fp_match() → if match: build AuthPacket, compute CRC-16, send_auth_packet(), receive_ack(), buzzer_success/fail + oled feedback. Loops with 500ms HAL_Delay between scans.
  - `void SystemClock_Config(void)` — 180MHz HSE config for F446RE
  - `void Error_Handler(void)` — infinite loop with buzzer_fail()
- **Dependencies**: HAL library (stm32f4xx_hal.h), all custom headers
- **Edge cases**: UART timeout (500ms) → retry 3x before showing "COMM ERROR". Fingerprint sensor not responding → oled_print("SENSOR ERR"), infinite retry with 2s delay. Buffer overflow protection on UART RX.

### `Src/fingerprint.c`
- **Purpose**: R307 fingerprint sensor driver over UART1
- **Functions**:
  - `HAL_StatusTypeDef fp_init(UART_HandleTypeDef *huart)` — Send handshake command 0xEF01, verify ACK 0x00
  - `HAL_StatusTypeDef fp_capture(void)` — Send GenImg (0x01), wait for finger present, timeout 10s
  - `HAL_StatusTypeDef fp_match(uint16_t *score)` — Send Search (0x04), return match score in `score` pointer
  - `HAL_StatusTypeDef fp_get_score(uint16_t *score)` — Direct score read from last match
- **Dependencies**: `stm32f4xx_hal_uart.h`
- **Edge cases**: No finger placed within 10s → return HAL_TIMEOUT. Sensor reports no match → score=0, return HAL_OK (let main.c decide threshold). Corrupted response → retry once.

### `Src/oled.c`
- **Purpose**: SSD1306 128×64 OLED display driver over I2C1
- **Functions**:
  - `void oled_init(I2C_HandleTypeDef *hi2c)` — Init sequence: display off, set mux ratio, set display offset, set start line, segment remap, COM scan direction, set COM pins, set contrast 0x7F, display on
  - `void oled_clear(void)` — Zero entire frame buffer, flush to display
  - `void oled_print(const char *text)` — Write string starting at current cursor, wrap at 21 chars/line, 8 lines max
  - `void oled_print_line(uint8_t line, const char *text)` — Write to specific line (0-7)
- **Dependencies**: `stm32f4xx_hal_i2c.h`, 5×7 font lookup table (const array in oled.c)
- **Edge cases**: I2C NACK → retry 3x, then show nothing (fail silent). String longer than 21 chars → truncate with "…"

### `Src/uart_comm.c`
- **Purpose**: Build and send 16-byte auth packet, receive 1-byte ACK
- **Structs**:
  ```c
  typedef struct {
    uint8_t  device_id[4];   // Fixed per device, stored in flash
    uint16_t finger_score;   // From fp_match()
    uint64_t timestamp;      // HAL_GetTick() as Unix-epoch proxy
    uint16_t crc16;          // CRC-16/CCITT of first 14 bytes
  } __attribute__((packed)) AuthPacket;
  ```
- **Functions**:
  - `void send_auth_packet(UART_HandleTypeDef *huart, uint16_t score)` — Fills AuthPacket, computes CRC, HAL_UART_Transmit with 500ms timeout
  - `uint8_t receive_ack(UART_HandleTypeDef *huart)` — HAL_UART_Receive 1 byte, 2s timeout, returns 0x01 (success) or 0xFF (fail) or 0x00 (timeout)
- **Edge cases**: UART TX timeout → return without ACK wait. ACK timeout → return 0x00. Byte order: little-endian (ARM default).

### `Src/buzzer.c` / `Src/crc16.c`
- `buzzer_success()` — 2× 100ms beep, 100ms gap. `buzzer_fail()` — 1× 500ms beep.
- `uint16_t crc16_ccitt(const uint8_t *data, uint16_t len)` — Lookup table CRC-16/CCITT (poly 0x1021, init 0xFFFF). Identical algorithm in Python bridge for validation.

---

## Hardware Bridge (`hardware-bridge/`)

### `src/bridge.py`
- **Purpose**: Main loop — continuously reads UART, validates, generates JWT, POSTs to API, sends ACK
- **Functions**:
  - `def main() -> None` — Opens serial port, infinite loop calling `process_one_packet()`
  - `def process_one_packet(ser: serial.Serial, api_url: str, jwt_secret: str) -> bool` — Read 16 bytes → parse → validate CRC → check score ≥ 60 → check timestamp freshness ≤ 30s → generate JWT → POST to API → send ACK byte → return success
- **Imports**: `uart_reader`, `packet_parser`, `crc16`, `jwt_generator`, `api_client`, `config`
- **Env vars**: `SERIAL_PORT`, `BAUD_RATE`, `JWT_SECRET`, `API_URL`
- **Edge cases**: Serial port not found → log error, retry every 5s. Read timeout → skip, continue loop. API unreachable → send 0xFF ACK, log warning. Keyboard interrupt → close port, exit gracefully.

### `src/uart_reader.py`
- **Function**: `def read_packet(ser: serial.Serial, timeout: float = 2.0) -> Optional[bytes]` — Reads exactly 16 bytes. Returns None on timeout. Flushes input buffer before read.
- **Edge cases**: Partial read (< 16 bytes within timeout) → discard, return None.

### `src/crc16.py`
- **Function**: `def compute_crc16(data: bytes) -> int` — CRC-16/CCITT (poly=0x1021, init=0xFFFF). Must produce identical results to firmware `crc16.c`.
- **Function**: `def validate_crc16(packet: bytes) -> bool` — Extracts last 2 bytes as CRC, computes CRC on first 14 bytes, compares.

### `src/packet_parser.py`
- **Dataclass**: `ParsedPacket(device_id: bytes, finger_score: int, timestamp: int, crc16: int)`
- **Function**: `def parse_packet(raw: bytes) -> ParsedPacket` — `struct.unpack('<4sHQH', raw)`, returns ParsedPacket
- **Function**: `def validate_packet(pkt: ParsedPacket) -> Tuple[bool, str]` — Checks: CRC valid, score ≥ 60, timestamp within 30s of `time.time()`. Returns (valid, error_message).
- **Edge cases**: Timestamp from STM32 may be relative (HAL_GetTick) — bridge uses a calibration offset set at startup.

### `src/jwt_generator.py`
- **Function**: `def generate_hardware_jwt(device_id: str, finger_score: int, secret: str) -> str` — Creates JWT with payload `{device_id, finger_score, iat, exp: iat+300, iss: "lexnet-bridge"}`, signs with HS256.
- **Imports**: `jwt` (PyJWT)

### `src/api_client.py`
- **Function**: `def post_hardware_auth(api_url: str, token: str) -> Tuple[bool, int]` — POST to `{api_url}/api/auth/hardware` with `Authorization: Bearer {token}`. Returns (success, status_code). Timeout: 5s.
- **Edge cases**: Connection refused → return (False, 0). HTTP 401 → return (False, 401). HTTP 5xx → return (False, status).

### `simulator/stm32_simulator.py`
- **Purpose**: Sends fake 16-byte packets over a virtual serial port pair for development without real hardware
- **Function**: `def simulate(port: str, interval: float = 3.0) -> None` — Generates valid packets with random scores (50-100), correct CRC, current timestamp. Sends every `interval` seconds. Optionally injects bad CRC or low score packets for testing.
- **Dependency**: `pyserial` — use `socat` on Linux or `com0com` on Windows to create virtual port pairs.

> [!TIP]
> **Stuck mitigation**: If students have trouble with virtual serial ports on Windows, use TCP sockets instead. Change `uart_reader.py` to accept a `--tcp` flag that reads from `localhost:9600` instead of a COM port.

---

## Blockchain (`blockchain/`)

### `chaincode/lexnet-cc/models.go`
- **Purpose**: Data structures stored on the Fabric ledger
```go
type DocumentRecord struct {
    DocHash       string            `json:"docHash"`
    IpfsCID       string            `json:"ipfsCID"`
    OwnerID       string            `json:"ownerId"`
    DeviceID      string            `json:"deviceId"`
    Timestamp     string            `json:"timestamp"`     // ISO 8601
    DocType       string            `json:"docType"`       // "sale_deed" | "court_order" | "land_record"
    Metadata      map[string]string `json:"metadata"`
    ActiveDispute bool              `json:"activeDispute"`
    DisputeCaseID string            `json:"disputeCaseId"` // empty if no dispute
    RiskScore     float64           `json:"riskScore"`     // 0-100, updated by NLP
    CreatedAt     string            `json:"createdAt"`
}

type DisputeRecord struct {
    CaseID    string `json:"caseId"`
    DocHash   string `json:"docHash"`
    FiledBy   string `json:"filedBy"`
    FiledAt   string `json:"filedAt"`
    Resolved  bool   `json:"resolved"`
    ResolvedAt string `json:"resolvedAt"`
}
```

### `chaincode/lexnet-cc/main.go`
- **Purpose**: Chaincode entry point
```go
func main() {
    cc, err := contractapi.NewChaincode(&LexNetContract{})
    // handle err
    if err := cc.Start(); err != nil {
        log.Fatalf("Error starting chaincode: %v", err)
    }
}
```

### `chaincode/lexnet-cc/contract.go`
- **Purpose**: All 8 smart contract functions
- **Struct**: `type LexNetContract struct { contractapi.Contract }`
- **Functions** (all return `error`):

| Function | Signature | Logic |
|----------|-----------|-------|
| `StoreDocument` | `(ctx, docHash, ipfsCID, ownerID, deviceID, timestamp, docType string, metadata map[string]string) error` | Check docHash not already on ledger → create DocumentRecord → PutState. Error if duplicate. |
| `GetDocument` | `(ctx, docHash string) (*DocumentRecord, error)` | GetState → unmarshal → return. Error if not found. |
| `GetDocumentHistory` | `(ctx, docHash string) ([]DocumentRecord, error)` | GetHistoryForKey → iterate → return slice. |
| `TransferDocument` | `(ctx, docHash, newOwnerID string) error` | GetState → check activeDispute==false → update ownerID → PutState. Error if disputed. |
| `AddDispute` | `(ctx, docHash, caseID, filedBy string) error` | GetDocument → set activeDispute=true, disputeCaseID=caseID → PutState. Also store DisputeRecord under composite key. |
| `ResolveDispute` | `(ctx, docHash, caseID string) error` | Get DisputeRecord → set resolved=true → clear activeDispute on DocumentRecord → PutState both. |
| `GetDocumentsByOwner` | `(ctx, ownerID string) ([]DocumentRecord, error)` | GetStateByPartialCompositeKey("owner~docHash") → collect results. Requires composite key index. |
| `VerifyDocument` | `(ctx, docHash string) (string, error)` | GetState → if nil return "NOT_FOUND" → if exists return "EXISTS". (Hash comparison done by Node.js backend, not chaincode.) |

- **Edge cases per function documented inline**: Concurrent writes (Fabric MVCC handles), empty strings rejected, JSON unmarshal errors wrapped.

### `chaincode/lexnet-cc/contract_test.go`
- Uses `shimtest.NewMockStub` or `contractapi` mock framework
- Tests: Store+Get round trip, duplicate store rejection, transfer blocked by dispute, dispute lifecycle, history returns multiple versions, owner query returns correct subset, verify returns correct status for each case.

### `network/configtx.yaml`
- 2 orgs: `GovtOrg` (officials), `VerifierOrg` (public verification nodes)
- 1 channel: `lexnet-channel`
- Endorsement policy: `AND('GovtOrg.member')` for writes, any member for reads
- Block cutting: BatchTimeout=2s, MaxMessageCount=10

### `network/scripts/setup-network.sh`
- Steps: generate crypto → create genesis block → start containers → create channel → join peers → package chaincode → install → approve → commit → invoke Init
- Uses `peer` CLI commands

> [!WARNING]
> **Stuck mitigation — Hyperledger Fabric**: Fabric's local setup is the #1 blocker for students. Mitigation: Use the official `test-network` from `fabric-samples` as a starting point. Copy its docker-compose and scripts, then modify `configtx.yaml` for LexNet orgs. Do NOT try to build a Fabric network from scratch.
