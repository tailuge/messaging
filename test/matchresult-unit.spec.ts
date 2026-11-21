// @ts-nocheck — the suite has no @types/node, matching the other unit specs.
import fs from "fs";
import path from "path";

// docker/matchresult.njs runs inside NJS, where `ngx` is a global and imports are
// resolved by njs. The handler only leans on `redis`/`redisPipeline`/
// `netBucket` and `geoForRequest`, so the module body is evaluated over stubs and
// the logic is exercised directly — no container, and no KV writes.
function loadMatchResult(options: any = {}): any {
  const file = path.resolve(process.cwd(), "docker/matchresult.njs");
  const source = fs
    .readFileSync(file, "utf-8")
    .replace(/^import .*;$/gm, "")
    .replace(/export default \{[\s\S]*?\};/, "");
  expect(source).not.toContain("export default");

  const calls: any[][] = [];
  const upstash = {
    netBucket: () => {},
    redis: async (...args: any[]) => {
      calls.push(args);
      return options.redisResult === undefined ? null : options.redisResult;
    },
    redisPipeline: async (commands: any[]) => {
      calls.push(["PIPELINE", commands]);
      return [];
    },
  };
  const nchanMeta = {
    geoForRequest: async () => options.geo || { country: "XX", city: "" },
  };
  const ngx = { log: () => {}, ERR: "err" };

  const mod = new Function(
    "ngx",
    "require",
    "upstash",
    "nchanMeta",
    `${source}
     return { matchResult, buildRecord, planWrites, planRatings, readRating, uid, WRITES_ENABLED };`
  )(ngx, () => {
    throw new Error("require is not available in this test");
  }, upstash, nchanMeta);

  return { mod, calls };
}

function rating(overrides: any = {}): string {
  return JSON.stringify({
    rating: 1500,
    rd: 350,
    volatility: 0.06,
    lastUpdated: 0,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    ...overrides,
  });
}

function fakeRequest(text: unknown, headers: any = {}) {
  const answered: Array<{ status: number; payload: string }> = [];
  return {
    uri: "/api/match-results",
    method: "POST",
    requestText: typeof text === "string" ? text : JSON.stringify(text),
    headersIn: headers,
    headersOut: {},
    return: (status: number, payload: string) => {
      answered.push({ status, payload });
    },
    answered,
  };
}

describe("matchresult Elo maths", () => {
  test("the winner gains exactly what the loser loses", () => {
    const { mod } = loadMatchResult();

    const plan = mod.planRatings(rating({ rating: 1600 }), rating({ rating: 1500 }), 1795195347032);

    // 1 / (1 + 10 ** (-100/400)) = 0.64, so K * (1 - expected) rounds to 12.
    expect(plan.delta).toBe(12);
    expect(plan.winnerAfter).toBe(1612);
    expect(plan.loserAfter).toBe(1488);
    expect(plan.winnerAfter - plan.winnerBefore).toBe(plan.loserBefore - plan.loserAfter);
  });

  test("the pair stays zero-sum at an even rating", () => {
    const { mod } = loadMatchResult();

    const plan = mod.planRatings(rating(), rating(), 1);

    expect(plan.delta).toBe(16);
    expect(plan.winnerAfter + plan.loserAfter).toBe(3000);
  });

  test("an upset moves the winner by close to K", () => {
    const { mod } = loadMatchResult();

    const plan = mod.planRatings(rating({ rating: 1500 }), rating({ rating: 2000 }), 1);

    expect(plan.delta).toBe(30);
    expect(plan.winnerAfter).toBe(1530);
    expect(plan.loserAfter).toBe(1970);
  });

  test("a heavy favourite gains nothing for the expected win", () => {
    const { mod } = loadMatchResult();

    const plan = mod.planRatings(rating({ rating: 2400 }), rating({ rating: 1500 }), 1);

    expect(plan.delta).toBe(0);
    expect(plan.winnerAfter).toBe(2400);
    expect(plan.loserAfter).toBe(1500);
  });

  test("unknown players start at 1500", () => {
    const { mod } = loadMatchResult();

    const plan = mod.planRatings(null, undefined, 1);

    expect(plan.winnerBefore).toBe(1500);
    expect(plan.loserBefore).toBe(1500);
  });

  test("an existing float rating is the base, rounded once", () => {
    const { mod } = loadMatchResult();

    const plan = mod.planRatings(rating({ rating: 1459.9306734024146 }), rating({ rating: 1700 }), 1);

    expect(plan.winnerBefore).toBe(1460);
    expect(Number.isInteger(plan.winnerAfter)).toBe(true);
    expect(Number.isInteger(plan.loserAfter)).toBe(true);
  });

  test("the written rating keeps all seven keys, with rd and volatility zero", () => {
    const { mod } = loadMatchResult();
    const now = 1795195347032;

    const plan = mod.planRatings(rating({ rating: 1600 }), rating({ rating: 1500 }), now);
    const winner = JSON.parse(plan.winnerJson);
    const loser = JSON.parse(plan.loserJson);

    expect(Object.keys(winner).sort()).toEqual(
      ["rating", "rd", "volatility", "lastUpdated", "gamesPlayed", "wins", "losses"].sort()
    );
    expect(winner.rd).toBe(0);
    expect(winner.volatility).toBe(0);
    // One timestamp for the result, so both players agree on when it happened.
    expect(winner.lastUpdated).toBe(now);
    expect(loser.lastUpdated).toBe(now);
  });

  test("counters move as the scoreboard moved them", () => {
    const { mod } = loadMatchResult();

    const plan = mod.planRatings(
      rating({ gamesPlayed: 10, wins: 7, losses: 3 }),
      rating({ gamesPlayed: 4, wins: 1, losses: 3 }),
      1
    );
    const winner = JSON.parse(plan.winnerJson);
    const loser = JSON.parse(plan.loserJson);

    expect(winner.gamesPlayed).toBe(11);
    expect(winner.wins).toBe(8);
    expect(winner.losses).toBe(3);
    expect(loser.gamesPlayed).toBe(5);
    expect(loser.wins).toBe(1);
    expect(loser.losses).toBe(4);
  });

  test("an unreadable stored value falls back to a fresh player", () => {
    const { mod } = loadMatchResult();

    expect(mod.readRating("{not json").rating).toBe(1500);
    expect(mod.readRating(JSON.stringify({ rating: "1600" })).rating).toBe(1600);
  });
});

describe("matchresult record building", () => {
  test("replayData is split off, never stored", async () => {
    const { mod } = loadMatchResult();

    const record = await mod.buildRecord(
      {},
      { winner: "A", winnerScore: 5, replayData: "blob", club: "x" },
      "blob"
    );

    expect(record.replayData).toBeUndefined();
    expect(record.hasReplay).toBe(true);
    expect(record.club).toBe("x");
    expect(record.id).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof record.timestamp).toBe("number");
  });

  test("hasReplay is set only when a blob was stored", async () => {
    const { mod } = loadMatchResult();

    const record = await mod.buildRecord({}, { winner: "A", replayData: "" }, "");

    expect(record.hasReplay).toBeUndefined();
  });

  test("ruleType defaults to nineball only when absent", async () => {
    const { mod } = loadMatchResult();

    expect((await mod.buildRecord({}, { winner: "A" }, "")).ruleType).toBe("nineball");
  });

  test("any ruleType is stored verbatim", async () => {
    const { mod } = loadMatchResult();

    for (const ruleType of ["reveal", "fourball", "NineBall", "", "not-a-game-" + "✈"]) {
      const record = await mod.buildRecord({}, { winner: "A", ruleType }, "");
      expect(record.ruleType).toBe(ruleType);
    }
  });

  test("geo is stored when known and omitted on the XX sentinel", async () => {
    const unknown = loadMatchResult();
    const known = loadMatchResult({ geo: { country: "GB", city: "London" } });

    const unknownRecord = await unknown.mod.buildRecord({}, { winner: "A" }, "");
    const knownRecord = await known.mod.buildRecord({}, { winner: "A" }, "");

    expect(unknownRecord.locationCountry).toBeUndefined();
    expect(unknownRecord.locationCity).toBeUndefined();
    expect(knownRecord.locationCountry).toBe("GB");
    expect(knownRecord.locationCity).toBe("London");
  });

  test("uid is eight hex characters, the scoreboard's shape", () => {
    const { mod } = loadMatchResult();

    for (let i = 0; i < 20; i += 1) expect(mod.uid()).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("matchresult writes", () => {
  const payload = {
    winner: "Lukey",
    winnerId: "Luke-er7b",
    winnerScore: 25,
    ruleType: "threecushion",
    bot: false,
    loser: "anf2",
    loserId: "anf2-z15h",
    loserScore: 1,
    version: "261120.16",
    replayData: "blob",
  };

  test("the handler sends the planned command list as one pipeline", async () => {
    const { mod, calls } = loadMatchResult({
      redisResult: [rating({ rating: 2118 }), rating({ rating: 1460 })],
    });
    const r = fakeRequest(payload);

    await mod.matchResult(r);

    expect(mod.WRITES_ENABLED).toBe(true);
    // One read for the Elo maths, then one pipeline carrying every write.
    expect(calls.map((call) => call[0])).toEqual(["HMGET", "PIPELINE"]);
    const commands = calls[1][1];
    expect(commands.map((command: any[]) => command[0])).toEqual([
      "SET",
      "ZADD",
      "ZREMRANGEBYRANK",
      "HSET",
      "HSET",
      "HSET",
      "HSET",
    ]);
    expect(r.answered[0].status).toBe(201);
  });

  test("the read still runs, so the Elo maths sees live ratings", async () => {
    const { mod, calls } = loadMatchResult({
      redisResult: [rating({ rating: 2118 }), rating({ rating: 1460 })],
    });

    await mod.matchResult(fakeRequest(payload));

    const reads = calls.filter((call) => call[0] === "HMGET");
    expect(reads).toEqual([["HMGET", "elo:threecushion", "Lukey", "anf2"]]);
  });

  test("it answers 201 with the record it built", async () => {
    const { mod } = loadMatchResult({
      redisResult: [rating({ rating: 2118 }), rating({ rating: 1460 })],
      geo: { country: "GB", city: "London" },
    });
    const r = fakeRequest(payload);

    await mod.matchResult(r);

    expect(r.answered).toHaveLength(1);
    expect(r.answered[0].status).toBe(201);
    const body = JSON.parse(r.answered[0].payload);
    expect(body.winner).toBe("Lukey");
    expect(body.loser).toBe("anf2");
    expect(body.ruleType).toBe("threecushion");
    expect(body.replayData).toBeUndefined();
    expect(body.hasReplay).toBe(true);
    expect(body.locationCountry).toBe("GB");
    expect(body.locationCity).toBe("London");
    expect(body.id).toMatch(/^[0-9a-f]{8}$/);
  });

  test("a solo upload plans no rating writes", async () => {
    const { mod, calls } = loadMatchResult();
    const solo = { winner: "A", winnerScore: 9, ruleType: "nineball" };

    const r = fakeRequest(solo);
    await mod.matchResult(r);

    // No loser, so no HMGET and no HSET in the plan.
    expect(calls.filter((call) => call[0] === "HMGET")).toHaveLength(0);
    expect(JSON.parse(r.answered[0].payload).loser).toBeUndefined();

    const record = await mod.buildRecord({}, solo, "");
    const verbs = (await mod.planWrites(record, "")).map((command: any[]) => command[0]);
    expect(verbs).toEqual(["ZADD", "ZREMRANGEBYRANK"]);
  });

  test("the planned command list is complete", async () => {
    const { mod } = loadMatchResult({
      redisResult: [rating({ rating: 2118 }), rating({ rating: 1460 })],
    });
    const record = await mod.buildRecord({}, payload, payload.replayData);

    const commands = await mod.planWrites(record, payload.replayData);
    const verbs = commands.map((command: any[]) => command[0]);

    expect(verbs).toEqual(["SET", "ZADD", "ZREMRANGEBYRANK", "HSET", "HSET", "HSET", "HSET"]);
    expect(commands[0][1]).toBe("match_replay:" + record.id);
    expect(commands[0][4]).toBe(432000);
    expect(commands[1][1]).toBe("match_results");
    expect(commands[1][2]).toBe(record.timestamp);
    expect(commands[2][2]).toBe(0);
    expect(commands[2][3]).toBe(-33);
    // elo-history is a hash: field is the UTC date, value the integer rating.
    expect(commands[5][1]).toBe("elo-history:threecushion:Lukey");
    expect(commands[5][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isInteger(Number(commands[5][3]))).toBe(true);
    // HSET elo:<ruleType> carries the rating JSON with a fresh epoch-ms stamp.
    expect(commands[3][1]).toBe("elo:threecushion");
    expect(JSON.parse(commands[3][3]).lastUpdated).toBe(record.timestamp);
  });

  test("an upload without a replay plans no SET", async () => {
    const { mod } = loadMatchResult();
    const record = await mod.buildRecord({}, { winner: "A", winnerScore: 1 }, "");

    const commands = await mod.planWrites(record, "");

    expect(commands.map((command: any[]) => command[0])).not.toContain("SET");
  });
});
