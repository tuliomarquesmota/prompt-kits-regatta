// Testes da saudação. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingName } from "./greeting.ts";

test("usa o primeiro nome salvo na conta", () => {
  assert.equal(greetingName({ name: "  Túlio Marques " }, "x@y.com"), "Túlio");
});

test("sem nome salvo, usa o email antes do @", () => {
  assert.equal(greetingName({}, "tuliof.marques@gmail.com"), "Tuliof");
  assert.equal(greetingName(undefined, "ADRIANO@saglobal.co.uk"), "Adriano");
  assert.equal(greetingName(undefined, "joao_silva22@x.com"), "Joao");
  assert.equal(greetingName(undefined, undefined), "");
});
