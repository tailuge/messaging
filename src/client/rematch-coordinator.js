
export class RematchCoordinator {
    constructor(info) { this.info = info; }
    get opponentId()   { return this.info.opponentId; }
    get ruleType()     { return this.info.ruleType; }
    get rematchParam() { return encodeURIComponent(JSON.stringify(this.info)); }

    shouldChallenge(myId) {
        // Deterministically decide who sends the challenge to avoid simultaneous offers.
        // If nextTurnId is set, that person should challenge.
        // Otherwise, use userId as a tie-breaker.
        if (this.info.nextTurnId) {
            return this.info.nextTurnId === myId;
        }
        return myId < this.opponentId;
    }

    async sendChallenge(lobby) {
        return lobby.challenge(this.opponentId, this.ruleType, this.info, this.info.options);
    }

    shouldAutoAccept(msg) {
        return msg.type === 'offer' && msg.challengerId === this.opponentId;
    }
}
