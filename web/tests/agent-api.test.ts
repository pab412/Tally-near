import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANSWER_FIELDS, ERRORS, GUARD_METHODS, PAID_METHODS, READ_METHODS, WALLET_CODE, readArgs } from "@/lib/agent-api";
import { CHECK_CONTRACT_ID, CONTRACT_ID, RPC_URL, curlFor, viewRequest } from "@/lib/near";

const source = {
  proof: readFileSync("../contracts/proof/src/lib.rs", "utf8"),
  check: readFileSync("../contracts/check/src/lib.rs", "utf8"),
};
const guard = readFileSync("../contracts/guard/src/lib.rs", "utf8");
const types = readFileSync("../contracts/types/src/lib.rs", "utf8");
const FP = "ab".repeat(32);

describe("the For AI agents page's developer half", () => {
  it("only lists read methods the contracts have", () => {
    expect(READ_METHODS.map((m) => m.method)).toEqual(["get", "history", "cards", "terms"]);
    // `get` is declared without `pub`, in the trait the other contracts call the registry through
    for (const { contract, method } of READ_METHODS) expect(source[contract], method).toMatch(new RegExp(`\\bfn ${method}\\(&self`));
  });

  it("asks about a card only where the method takes one", () => {
    const [get, , cards] = READ_METHODS;
    expect(readArgs(get, FP)).toEqual({ fingerprint: FP });
    expect(readArgs(cards, FP)).toEqual({});
    for (const m of READ_METHODS) {
      const takesOne = new RegExp(`\\bfn ${m.method}\\(&self, fingerprint: String\\)`).test(source[m.contract]);
      expect(m.takesFingerprint, m.method).toBe(takesOne);
    }
  });

  it("only lists paid check methods the contract has, with the arguments it takes", () => {
    for (const { call, method } of PAID_METHODS) {
      expect(source.check, method).toMatch(new RegExp(`pub fn ${method}\\(&(mut )?self`));
      const takes = call.slice(call.indexOf("(") + 1, -1);
      if (takes) expect(source.check, call).toMatch(new RegExp(`pub fn ${method}\\(&(mut )?self, ${takes}: `));
      else expect(source.check, call).toMatch(new RegExp(`pub fn ${method}\\(&(mut )?self\\)`));
    }
  });

  it("names every field of what a check answers, and no other", () => {
    const answer = source.check.slice(source.check.indexOf("pub struct Answer {"), source.check.indexOf("pub struct Terms {"));
    const fields = [...answer.matchAll(/^\s+pub (\w+):/gm)].map((m) => m[1]);
    expect(ANSWER_FIELDS.map((f) => f.field)).toEqual(fields);
  });

  it("quotes each refusal in the contract's own words", () => {
    expect(ERRORS.length).toBeGreaterThan(5);
    for (const { contract, says } of ERRORS) expect(source[contract], says).toContain(`"${says}"`);
  });
});

describe("the For AI agents page's wallet builders part", () => {
  it("only lists guard wallet methods the contract has, with the arguments it takes", () => {
    for (const { call, method } of GUARD_METHODS) {
      const takes = call.slice(call.indexOf("(") + 1, -1).split(", ").filter(Boolean);
      const declared = new RegExp(`pub fn ${method}\\(&(mut )?self(, [^)]*)?\\)`).exec(guard)?.[0] ?? "";
      expect(declared, method).not.toBe("");
      expect([...declared.matchAll(/(\w+): /g)].map((m) => m[1]), call).toEqual(takes);
    }
  });

  it("shows code that uses the names the contracts really have", () => {
    for (const name of ["decide", "proof_registry", "Decision", "Record"]) {
      expect(WALLET_CODE, name).toContain(name);
      expect(types, name).toMatch(new RegExp(`pub (fn|enum|struct|trait) ${name}\\b|ext_contract\\(${name}\\)`));
    }
    for (const arm of ["Decision::Allow", "Decision::Warn", "Decision::Block"]) expect(WALLET_CODE).toContain(arm);
    // the same call the guard makes: ask the registry, then decide in a callback only the contract can call
    for (const line of ["proof_registry::ext(self.registry.clone())", ".get(fingerprint.clone())", "#[private]", "pub fn on_asked("]) {
      expect(WALLET_CODE, line).toContain(line);
      expect(guard, line).toContain(line);
    }
  });
});

describe("the call a developer copies", () => {
  it("is the request the site itself sends, as one curl command", () => {
    const curl = curlFor("get", { fingerprint: FP }, CONTRACT_ID);
    expect(curl.startsWith(`curl -s ${RPC_URL} `)).toBe(true);
    const body = JSON.parse(curl.slice(curl.indexOf("-d '") + 4, -1));
    expect(body).toEqual(viewRequest("get", { fingerprint: FP }, CONTRACT_ID));
    expect(JSON.parse(atob(body.params.args_base64))).toEqual({ fingerprint: FP });
  });

  it("goes to the contract the method lives on", () => {
    const terms = READ_METHODS.find((m) => m.method === "terms")!;
    const body = JSON.parse(curlFor(terms.method, readArgs(terms, FP), CHECK_CONTRACT_ID).split("-d '")[1].slice(0, -1));
    expect(body.params).toMatchObject({ account_id: CHECK_CONTRACT_ID, method_name: "terms" });
    expect(JSON.parse(atob(body.params.args_base64))).toEqual({});
  });
});
