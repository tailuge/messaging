/**
 * Type guards
 */
export function isPresenceMessage(msg) {
    return msg?.messageType === "presence";
}
export function isChallengeMessage(msg) {
    return msg?.messageType === "challenge";
}
/**
 * Helper to parse incoming Nchan JSON strings
 */
export function parseMessage(data) {
    if (!data || data.trim() === "")
        return null;
    try {
        return JSON.parse(data);
    }
    catch (e) {
        console.error("Failed to parse Nchan message:", e);
        return null;
    }
}
//# sourceMappingURL=types.js.map