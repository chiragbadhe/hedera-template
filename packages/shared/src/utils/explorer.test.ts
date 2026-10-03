import { describe, expect, it } from "vitest";
import { hashscanUrl, mirrorTokenUrl, mirrorTopicMessagesUrl, mirrorTransactionUrl } from "./explorer";

describe("hashscanUrl", () => {
  it("builds a link per target on testnet", () => {
    expect(hashscanUrl("testnet", "transaction", "0.0.5000002@1787525955.000000000")).toBe(
      "https://hashscan.io/testnet/transaction/0.0.5000002%401787525955.000000000",
    );
    expect(hashscanUrl("testnet", "contract", "0xabc")).toBe("https://hashscan.io/testnet/contract/0xabc");
    expect(hashscanUrl("testnet", "topic", "0.0.5000009")).toBe("https://hashscan.io/testnet/topic/0.0.5000009");
    expect(hashscanUrl("testnet", "token", "0.0.5000001")).toBe("https://hashscan.io/testnet/token/0.0.5000001");
  });

  it("uses the mainnet explorer for mainnet", () => {
    expect(hashscanUrl("mainnet", "account", "0.0.2")).toBe("https://hashscan.io/mainnet/account/0.0.2");
  });

  it("maps the EVM 'address' target onto HashScan's 'account' path", () => {
    expect(hashscanUrl("testnet", "address", "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729")).toBe(
      "https://hashscan.io/testnet/account/0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
    );
  });

  it("returns null for localnode, which has no public explorer", () => {
    // Rendering a dead link would be worse than rendering no link.
    expect(hashscanUrl("localnode", "transaction", "0.0.2@1.1")).toBeNull();
  });

  it("returns null for a blank id", () => {
    expect(hashscanUrl("testnet", "account", "   ")).toBeNull();
  });
});

describe("mirror node urls", () => {
  it("builds transaction, topic and token endpoints", () => {
    expect(mirrorTransactionUrl("testnet", "0.0.5000002@1787525955.000000000")).toBe(
      "https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.5000002%401787525955.000000000",
    );
    expect(mirrorTopicMessagesUrl("testnet", "0.0.5000009")).toBe(
      "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.5000009/messages",
    );
    expect(mirrorTokenUrl("mainnet", "0.0.1234")).toBe("https://mainnet.mirrornode.hedera.com/api/v1/tokens/0.0.1234");
  });

  it("keeps the mainnet host distinct from testnet", () => {
    expect(mirrorTokenUrl("mainnet", "0.0.1234")).not.toBe(mirrorTokenUrl("testnet", "0.0.1234"));
  });
});
