import type { PresenceMessage, ChallengeMessage, TableMessage } from "./types";
export type Subscription = {
    stop: () => void;
};
export declare class NchanClient {
    private server;
    constructor(server: string);
    private getWsUrl;
    private getHttpUrl;
    private publish;
    publishPresence(message: Omit<PresenceMessage, "messageType">): Promise<Response>;
    publishChallenge(message: Omit<ChallengeMessage, "messageType">): Promise<Response>;
    publishTable<T>(tableId: string, message: Omit<TableMessage<T>, "senderId">, senderId: string): Promise<Response>;
    subscribePresence(onMessage: (data: string) => void): Subscription;
    subscribeTable(tableId: string, onMessage: (data: string) => void): Subscription;
    private subscribe;
}
