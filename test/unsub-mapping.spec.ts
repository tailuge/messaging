import WebSocket from "ws";
import { startContainer, stopContainer, getServer, wait } from "./utils";
import { NchanClient } from "../src/nchanclient";
import { MessagingClient } from "../src/messagingclient";

describe("Unsub Mapping Diagnostic", () => {
  beforeAll(async () => {
    await startContainer();
  }, 60000);

  afterAll(async () => {
    await stopContainer();
  });

  async function getStats() {
    const srv = getServer();
    const res = await fetch("http://" + srv + "/api/stats");
    return res.json();
  }

  it("should populate sub_info and sub_to_user after subscribe + join", async () => {
    const srv = getServer();
    const uniqueId = "diag-user-" + Date.now();

    // Step 0: Baseline
    const before = await getStats();
    console.log("\n=== BEFORE any connection ===");
    console.log("sub_info:", JSON.stringify(before.sub_info));
    console.log("sub_to_user:", JSON.stringify(before.sub_to_user));
    console.log("user_counts:", JSON.stringify(before.user_counts));
    console.log("system_stats:", JSON.stringify(before.system_stats));

    // Step 1: Open a raw WebSocket subscriber (triggers presence_sub callback)
    const wsUrl = "ws://" + srv + "/subscribe/presence/lobby";
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      ws.on("open", () => {
        console.log("\n=== WebSocket opened ===");
        resolve(undefined);
      });
      ws.on("error", reject);
    });

    // Small delay to let the subscribe callback fire
    await wait(500);

    // Step 2: Check if sub_info was populated by the subscribe callback
    const afterSub = await getStats();
    console.log("\n=== AFTER WebSocket subscribe (before any publish) ===");
    console.log("sub_info keys:", Object.keys(afterSub.sub_info || {}));
    console.log("sub_info:", JSON.stringify(afterSub.sub_info, null, 2));
    console.log("sub_to_user:", JSON.stringify(afterSub.sub_to_user));
    console.log("system_stats:", JSON.stringify(afterSub.system_stats));

    // Step 3: Publish a join message via HTTP POST
    const client = new NchanClient(srv);
    await client.publishPresence({
      type: "join",
      userId: uniqueId,
      userName: "DiagUser",
    });

    console.log("\n=== AFTER publishPresence join ===");

    // Small delay for the publish to be processed
    await wait(500);

    // Step 4: Check if sub_to_user was populated by the join handler
    const afterJoin = await getStats();
    console.log("sub_info keys:", Object.keys(afterJoin.sub_info || {}));
    console.log("sub_info:", JSON.stringify(afterJoin.sub_info, null, 2));
    console.log("sub_to_user:", JSON.stringify(afterJoin.sub_to_user, null, 2));
    console.log("user_counts:", JSON.stringify(afterJoin.user_counts));
    console.log("system_stats:", JSON.stringify(afterJoin.system_stats));

    // Step 5: Correlate
    var subInfoEntries = Object.entries(afterJoin.sub_info || {});
    var subToUserEntries = Object.entries(afterJoin.sub_to_user || {});

    console.log("\n=== ANALYSIS ===");
    console.log("sub_info has " + subInfoEntries.length + " entries");
    console.log("sub_to_user has " + subToUserEntries.length + " entries");

    if (subInfoEntries.length === 0) {
      console.log("PROBLEM: sub_info is EMPTY — presence_sub callback either:");
      console.log("  1. Never fired (nchan_subscribe_request not working?)");
      console.log("  2. r.variables.nchan_subscriber_id is undefined/empty");
      console.log("  3. ngx.shared.sub_info.set() failed silently");
    } else if (subToUserEntries.length === 0) {
      console.log("PROBLEM: sub_info has entries but sub_to_user is EMPTY:");
      console.log("  1. Fingerprint mismatch between subscribe IP/UA and publish IP/UA");
      console.log("  2. sub_info.keys() returned empty during publish (timing?)");
      console.log("  3. The join code block was never reached");
      for (var i = 0; i < subInfoEntries.length; i++) {
        console.log("  sub_info[" + subInfoEntries[i][0] + "] = \"" + subInfoEntries[i][1] + "\"");
      }
    } else {
      console.log("SUCCESS: Both sub_info and sub_to_user have entries!");
      for (var j = 0; j < subToUserEntries.length; j++) {
        console.log("  sub_to_user[" + subToUserEntries[j][0] + "] = \"" + subToUserEntries[j][1] + "\"");
      }
    }

    ws.close();
  });

  it("should test nchan_subscriber_id via raw WebSocket upgrade headers", async () => {
    var srv = getServer();
    var wsUrl = "ws://" + srv + "/subscribe/presence/lobby";
    var ws = new WebSocket(wsUrl);

    await new Promise(function (resolve, reject) {
      ws.on("upgrade", function (response) {
        console.log("\n=== WebSocket upgrade response headers ===");
        var hdrs = response.headers || {};
        var keys = Object.keys(hdrs);
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (key.toLowerCase().indexOf("subscriber") !== -1 || key.toLowerCase().indexOf("nchan") !== -1) {
            console.log("  " + key + ": " + hdrs[key]);
          }
        }
        console.log("  All response headers:", JSON.stringify(hdrs, null, 2));
        resolve(undefined);
      });
      ws.on("open", function () {
        console.log("\n=== WebSocket opened (upgrade event may have already fired) ===");
        resolve(undefined);
      });
      ws.on("error", reject);
    });

    ws.close();
  });

  it("should show sub_info/sub_to_user during active MessagingClient connection", async () => {
    var srv = getServer();
    var uniqueId = "msgclient-diag-" + Date.now();
    var client = new MessagingClient({ baseUrl: srv });

    await client.joinLobby({
      messageType: "presence",
      type: "join",
      userId: uniqueId,
      userName: "MsgClientDiagUser",
    });

    await wait(1000);

    var stats = await getStats();

    console.log("\n=== MessagingClient joinLobby — shared dict state ===");
    console.log("sub_info:", JSON.stringify(stats.sub_info, null, 2));
    console.log("sub_to_user:", JSON.stringify(stats.sub_to_user, null, 2));
    console.log("user_counts:", JSON.stringify(stats.user_counts));
    console.log("system_stats:", JSON.stringify(stats.system_stats));

    if (stats.njs_logs && stats.njs_logs.length > 0) {
      console.log("\n=== NJS Error Logs ===");
      for (var i = 0; i < stats.njs_logs.length; i++) {
        console.log("  " + stats.njs_logs[i]);
      }
    }

    await client.stop();

    await wait(500);
    var afterStop = await getStats();
    console.log("\n=== After client.stop() ===");
    console.log("sub_info:", JSON.stringify(afterStop.sub_info));
    console.log("sub_to_user:", JSON.stringify(afterStop.sub_to_user));
    console.log("user_counts:", JSON.stringify(afterStop.user_counts));
    console.log("system_stats:", JSON.stringify(afterStop.system_stats));
  });
});
