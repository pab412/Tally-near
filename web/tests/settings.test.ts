import { KeyPair } from "near-api-js";
import { afterEach, describe, expect, it } from "vitest";
import { setting } from "@/lib/settings";
import { signerSetup } from "@/lib/sign";

const ACCOUNT = "attester.testnet";
const CONTRACT = "proof.attester.testnet";
const KEY = KeyPair.fromRandom("ed25519");
const PUBLIC = KEY.getPublicKey().toString();

/** NEAR's node, faked: what it answers when asked about the key. */
const node = (answer: object) => {
  const asked: unknown[] = [];
  const fake = (async (_url: string, init: RequestInit) => {
    asked.push(JSON.parse(String(init.body)));
    return Response.json(answer);
  }) as unknown as typeof fetch;
  return { fake, asked };
};
const ask = (key: string | undefined, f: typeof fetch) => signerSetup({ account: ACCOUNT, key, contractId: CONTRACT, rpcUrl: "https://rpc.example", fetch: f });
const functionCall = (receiver: string, methods: string[], allowance: string | null = "250000000000000000000000") => ({
  result: { permission: { FunctionCall: { allowance, receiver_id: receiver, method_names: methods } } },
});

describe("the server's settings", () => {
  afterEach(() => {
    delete process.env.TEST_SETTING;
  });

  it("takes a value pasted with a stray space or line break as meant, and a blank one as unset", () => {
    process.env.TEST_SETTING = ` ${KEY.toString()}\n`;
    expect(setting("TEST_SETTING")).toBe(KEY.toString());
    process.env.TEST_SETTING = " \n";
    expect(setting("TEST_SETTING")).toBeUndefined();
    delete process.env.TEST_SETTING;
    expect(setting("TEST_SETTING")).toBeUndefined();
  });
});

describe("whether the site's key can sign Tally's checks", () => {
  it("says a key the account still holds, for record on the registry, can record, with its allowance left", async () => {
    const { fake, asked } = node(functionCall(CONTRACT, ["record"]));
    expect(await ask(KEY.toString(), fake)).toEqual({ account: ACCOUNT, publicKey: PUBLIC, onNear: "can record", allowance: 0.25 });
    expect(asked).toEqual([{ jsonrpc: "2.0", id: "tally", method: "query", params: { request_type: "view_access_key", finality: "final", account_id: ACCOUNT, public_key: PUBLIC } }]);
  });

  it("says when the account no longer holds the key, as after the key is taken off", async () => {
    const { fake } = node({ result: { error: `access key ${PUBLIC} does not exist while viewing` } });
    expect((await ask(KEY.toString(), fake)).onNear).toBe("not on the account");
  });

  it("says when the key is for another contract or another method", async () => {
    expect((await ask(KEY.toString(), node(functionCall("card.attester.testnet", ["mint", "recheck"])).fake)).onNear).toBe("can't call record on the registry");
    expect((await ask(KEY.toString(), node(functionCall(CONTRACT, ["other"])).fake)).onNear).toBe("can't call record on the registry");
    expect((await ask(KEY.toString(), node({ result: { permission: "FullAccess" } }).fake)).onNear).toBe("can record");
  });

  it("says when the setting isn't a NEAR key, or NEAR can't be read, and never shows the key", async () => {
    const { fake, asked } = node({});
    expect(await ask("ed25519:not-a-key", fake)).toEqual({ account: ACCOUNT, publicKey: null, onNear: "not a NEAR key", allowance: null });
    expect(asked).toEqual([]);
    const down = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    const result = await ask(KEY.toString(), down);
    expect(result.onNear).toBe("NEAR not read");
    expect(JSON.stringify(result)).not.toContain(KEY.toString().slice(8));
    expect(await ask(undefined, fake)).toEqual({ account: ACCOUNT, publicKey: null, onNear: null, allowance: null });
  });
});
