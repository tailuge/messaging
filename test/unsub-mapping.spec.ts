import WebSocket from "ws";
import { startContainer, stopContainer, getServer, wait } from "./utils";
import { NchanClient } from "../src/nchanclient";
import { MessagingClient } from "../src/messagingclient";

describe("Unsub Mapping Diagnostic", () => {
  beforeAll(async () => {
    await startContainer();
  }, 20000);

  afterAll(async () => {
    await stopContainer();
  });

  async function getStats() {
    const srv = getServer();
    const res = await fetch("http://" + srv + "/api/stats");
    return res.json();
  }


  it("should test nchan_subscriber_id via raw WebSocket upgrade headers", async () => {
    var srv = getServer();
    var wsUrl = "ws://" + srv + "/subscribe/presence/lobby";
    var ws = new WebSocket(wsUrl);

    await new Promise(function (resolve, reject) {
      ws.on("upgrade", function (response) {
        var hdrs = response.headers || {};
        var keys = Object.keys(hdrs);
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (key.toLowerCase().indexOf("subscriber") !== -1 || key.toLowerCase().indexOf("nchan") !== -1) {
            console.log("  " + key + ": " + hdrs[key]);
          }
        }
        resolve(undefined);
      });
      ws.on("open", function () {
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

    if (stats.njs_logs && stats.njs_logs.length > 0) {
      console.log("\n=== NJS Error Logs ===");
      for (var i = 0; i < stats.njs_logs.length; i++) {
        console.log("  " + stats.njs_logs[i]);
      }
    }

    await client.stop();

    await wait(500);
    var afterStop = await getStats();
  });
});
