import { Lobby } from "../src/lobby";
import { NchanClient } from "../src/nchanclient";
import { PresenceMessage, ChatMessage } from "../src/types";

jest.mock("../src/nchanclient");

describe("Lobby Chat Unit Tests", () => {
  let lobby: Lobby;
  let mockNchan: jest.Mocked<NchanClient>;
  const currentUser: PresenceMessage = {
    messageType: "presence",
    type: "join",
    userId: "user-a",
    userName: "Alice",
  };

  beforeEach(() => {
    mockNchan = new NchanClient("http://localhost") as any;
    lobby = new Lobby(mockNchan, currentUser);
  });

  it("should call publishChat with correct parameters", async () => {
    await lobby.sendChat("user-b", "Hello there!");

    expect(mockNchan.publishChat).toHaveBeenCalledWith({
      senderId: "user-a",
      recipientId: "user-b",
      text: "Hello there!",
    });
  });

  it("should notify listeners when a chat message for the current user is received", () => {
    const callback = jest.fn();
    lobby.onChat(callback);

    const chatMsg: ChatMessage = {
      messageType: "chat",
      senderId: "user-b",
      recipientId: "user-a",
      text: "Direct message",
      meta: { ts: 12345, ua: "ua", ip: "1.1.1.1", origin: "orig", method: "POST", country: "US" },
    };

    // Simulate incoming message
    (lobby as any).handleIncomingMessage(JSON.stringify(chatMsg));

    expect(callback).toHaveBeenCalledWith(chatMsg);
  });

  it("should NOT notify listeners when a chat message for another user is received", () => {
    const callback = jest.fn();
    lobby.onChat(callback);

    const chatMsg: ChatMessage = {
      messageType: "chat",
      senderId: "user-b",
      recipientId: "user-c",
      text: "Message for someone else",
      meta: { ts: 12345, ua: "ua", ip: "1.1.1.1", origin: "orig", method: "POST", country: "US" },
    };

    // Simulate incoming message
    (lobby as any).handleIncomingMessage(JSON.stringify(chatMsg));

    expect(callback).not.toHaveBeenCalled();
  });
});
